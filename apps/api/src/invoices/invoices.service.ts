import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CatalogService } from '../catalog/catalog.service';
import { PublicUser } from '../users/users.types';
import { SessionsService } from '../sessions/sessions.service';
import { GenerateInvoicesDto } from './dto/generate-invoices.dto';
import { ManualInvoiceDto } from './dto/manual-invoice.dto';
import { InvoiceEngineService } from './invoice-engine.service';
import { Invoice as InvoiceDocumentClass, InvoiceDocument, InvoiceStatus } from './schemas/invoice.schema';
import type { Invoice as InvoiceType } from '../common/types/invoice.types';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly sessionsService: SessionsService,
    private readonly engine: InvoiceEngineService,
    @InjectModel(InvoiceDocumentClass.name) private readonly invoiceModel: Model<InvoiceDocument>
  ) {}

  async list(dateIso?: string, page = 1, limit = 200) {
    const filter: Record<string, unknown> = dateIso ? { dateIso, status: { $ne: 'cancelled' } } : { status: { $ne: 'cancelled' } };
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.invoiceModel.find(filter).sort({ dateIso: -1, invNo: 1 }).skip(skip).limit(limit).exec(),
      this.invoiceModel.countDocuments(filter)
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async listCancelled() {
    return this.invoiceModel
      .find({ status: 'cancelled' })
      .sort({ dateIso: -1, invNo: -1 })
      .lean()
      .exec();
  }

  async findOne(invNo: number) {
    const invoice = await this.invoiceModel.findOne({ invNo }).exec();
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async update(invNo: number, dto: Partial<InvoiceType> & { status?: InvoiceStatus }, user: PublicUser) {
    const invoice = await this.findOne(invNo);
    if (dto.order !== undefined) invoice.order = dto.order;
    if (dto.storeCode !== undefined) invoice.storeCode = dto.storeCode;
    if (dto.short !== undefined) invoice.short = dto.short;
    if (dto.seq !== undefined) invoice.seq = dto.seq;
    if (dto.market !== undefined) invoice.market = dto.market;
    if (dto.label !== undefined) invoice.label = dto.label;
    if (dto.address !== undefined) invoice.address = dto.address;
    if (dto.dateIso !== undefined && dto.dateIso !== invoice.dateIso) {
      // Save original date for analytics adjustment (rescheduled delivery)
      if (!invoice.originalDateIso) invoice.originalDateIso = invoice.dateIso;
      invoice.dateIso = dto.dateIso;
    }
    if (dto.manual !== undefined) invoice.manual = dto.manual;
    if (dto.lines !== undefined) {
      // Route through the engine so edits round cost/vat/total identically to generation.
      invoice.lines = dto.lines.map((line) => this.engine.buildLineFromInput(line));
      const totals = this.engine.recompute({ lines: invoice.lines } as InvoiceType);
      invoice.sumCost = totals.sumCost;
      invoice.sumVat = totals.sumVat;
      invoice.sumTotal = totals.sumTotal;
      invoice.sumQty = totals.sumQty;
    }
    if (dto.status !== undefined) invoice.status = dto.status;
    invoice.updatedBy = user.id;
    await invoice.save({ validateModifiedOnly: true });
    return invoice;
  }

  async updateStatus(invNo: number, status: InvoiceDocument['status'], user: PublicUser) {
    const invoice = await this.findOne(invNo);
    invoice.status = status;
    invoice.updatedBy = user.id;
    await invoice.save({ validateModifiedOnly: true });
    return invoice;
  }

  async persistInvoices(invoices: InvoiceType[], user: PublicUser) {
    if (!invoices.length) return;
    // Never silently overwrite the financial data of an invoice that was
    // explicitly cancelled — a re-generate must not resurrect its line totals.
    const existing = await this.invoiceModel
      .find({ invNo: { $in: invoices.map((i) => i.invNo) } }, { invNo: 1, status: 1 })
      .lean()
      .exec();
    const cancelled = new Set(existing.filter((e) => e.status === 'cancelled').map((e) => e.invNo));

    const ops = invoices
      .filter((invoice) => !cancelled.has(invoice.invNo))
      .map((invoice) => {
        const { invNo, order, storeCode, short, seq, market, label, address, dateIso, manual, lines, sumCost, sumVat, sumTotal, sumQty } = invoice;
        return {
          updateOne: {
            filter: { invNo },
            update: {
              // Data fields always refreshed so re-generate picks up SAP changes
              $set: { order, storeCode, short, seq, market, label, address, dateIso, manual, lines, sumCost, sumVat, sumTotal, sumQty, updatedBy: user.id },
              // New invoices start as 'delivered' — user turns OFF if needed.
              $setOnInsert: { status: 'delivered', createdBy: user.id }
            },
            upsert: true
          }
        };
      });

    // Single round-trip instead of one updateOne per invoice.
    if (ops.length) await this.invoiceModel.bulkWrite(ops as never, { ordered: false });
  }

  async generate(dto: GenerateInvoicesDto, user: PublicUser) {
    const rows = this.engine.parseSap(dto.sapRaw);
    await this.catalogService.rememberOrderPrices(rows);
    const catalog = await this.catalogService.list();
    const invoices = this.engine.buildInvoices(rows, catalog, dto.startId, dto.dateIso);
    await this.persistInvoices(invoices, user);
    // Re-fetch from DB so returned invoices have actual status (e.g., 'delivered')
    const savedInvoices = await this.invoiceModel
      .find({ invNo: { $in: invoices.map((i) => i.invNo) } }, { invNo: 1, status: 1 })
      .lean()
      .exec();
    const statusByInvNo = new Map(savedInvoices.map((d) => [d.invNo, d.status]));
    const invoicesWithStatus = invoices.map((inv) => ({
      ...inv,
      status: statusByInvNo.get(inv.invNo) ?? ('saved' as const)
    }));
    const snapshot = this.engine.snapshot({
      invoiceDate: dto.dateIso,
      startId: dto.startId,
      sapRaw: dto.sapRaw,
      catalog,
      invoices
    });
    // Sessiya faqat skipSession=false (yoki ko'rsatilmagan) bo'lganda saqlanadi
    let session = null;
    if (!dto.skipSession) {
      session = await this.sessionsService.save(
        {
          invoiceDate: dto.dateIso,
          invoiceCount: invoices.length,
          sumTotal: invoices.reduce((sum, invoice) => sum + invoice.sumTotal, 0),
          snapshot
        },
        user
      );
    }
    return { rows: rows.length, invoices: invoicesWithStatus, catalog, snapshot, session };
  }

  async softDelete(invNo: number, user: PublicUser) {
    const result = await this.invoiceModel.findOneAndUpdate(
      { invNo },
      { $set: { status: 'cancelled', updatedBy: user.id } },
      { new: true }
    ).lean().exec();
    if (!result) throw new NotFoundException('Invoice not found');
    return result;
  }

  async restore(invNo: number, user: PublicUser) {
    return this.setStatus(invNo, 'saved', user);
  }

  async hardDelete(invNo: number) {
    const result = await this.invoiceModel.deleteOne({ invNo }).exec();
    if (!result.deletedCount) throw new NotFoundException('Invoice not found');
    return { ok: true };
  }

  async setStatus(invNo: number, status: 'draft' | 'saved' | 'delivered' | 'cancelled', user: PublicUser) {
    const result = await this.invoiceModel.findOneAndUpdate(
      { invNo },
      { $set: { status, updatedBy: user.id } },
      { new: true }
    ).lean().exec();
    if (!result) throw new NotFoundException('Invoice not found');
    return result;
  }

  async undeliver(invNo: number, comment: string, user: PublicUser) {
    const result = await this.invoiceModel.findOneAndUpdate(
      { invNo },
      {
        $set: {
          status: 'saved',
          updatedBy: user.id,
          undeliverComment: comment,
          undeliveredBy: user.id,
          undeliveredAt: new Date(),
        }
      },
      { new: true }
    ).lean().exec();
    if (!result) throw new NotFoundException('Invoice not found');
    return result;
  }

  async manual(dto: ManualInvoiceDto, user: PublicUser) {
    const catalog = await this.catalogService.list();
    // Never trust client-provided existingInvoices — only invNo+storeCode are needed for seq.
    const sameStoreInvoices = await this.invoiceModel
      .find({ storeCode: dto.storeCode }, { invNo: 1, storeCode: 1 })
      .lean()
      .exec();

    // Allocate the invoice number atomically: recompute the next number from the
    // current DB max and insert. The unique index on invNo rejects a colliding
    // concurrent insert, on which we retry with a freshly-read max. This prevents
    // two concurrent requests from silently overwriting each other's invoice.
    for (let attempt = 0; attempt < 5; attempt++) {
      const latestInvoice = await this.invoiceModel
        .findOne({}, { invNo: 1 })
        .sort({ invNo: -1 })
        .lean()
        .exec();
      const safeStartId = Math.max(latestInvoice?.invNo ?? 0, dto.startId);
      const invoice = this.engine.buildManualInvoice(catalog, {
        ...dto,
        startId: safeStartId,
        existingInvoices: sameStoreInvoices as any,
      });
      try {
        await this.invoiceModel.create({
          ...invoice,
          status: 'delivered',
          createdBy: user.id,
          updatedBy: user.id,
        });
        return { invoice, catalog };
      } catch (err) {
        // 11000 = duplicate key on invNo → another request took this number; retry.
        if ((err as { code?: number }).code === 11000 && attempt < 4) continue;
        console.error('[manual invoice error]', err);
        throw err;
      }
    }
    throw new ConflictException('Could not allocate a unique invoice number, please retry');
  }
}
