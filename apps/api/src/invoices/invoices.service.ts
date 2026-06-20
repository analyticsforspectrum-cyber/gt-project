import { Injectable, NotFoundException } from '@nestjs/common';
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

  async list() {
    return this.invoiceModel.find().sort({ dateIso: -1, invNo: 1 }).exec();
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
      invoice.lines = dto.lines.map((line) => ({
        ...line,
        cost: Math.round(line.qty * line.price * 100) / 100,
        vat: Math.round(line.qty * line.price * 0.12 * 100) / 100,
        total: Math.round(line.qty * line.price * 1.12 * 100) / 100
      }));
      invoice.sumCost = Math.round(invoice.lines.reduce((sum, line) => sum + line.cost, 0) * 100) / 100;
      invoice.sumVat = Math.round(invoice.lines.reduce((sum, line) => sum + line.vat, 0) * 100) / 100;
      invoice.sumTotal = Math.round((invoice.sumCost + invoice.sumVat) * 100) / 100;
      invoice.sumQty = invoice.lines.reduce((sum, line) => sum + line.qty, 0);
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
    await Promise.all(
      invoices.map((invoice) => {
        const { invNo, order, storeCode, short, seq, market, label, address, dateIso, manual, lines, sumCost, sumVat, sumTotal, sumQty } = invoice;
        return this.invoiceModel.updateOne(
          { invNo },
          {
            // Data fields always refreshed so re-generate picks up SAP changes
            $set: { order, storeCode, short, seq, market, label, address, dateIso, manual, lines, sumCost, sumVat, sumTotal, sumQty, updatedBy: user.id },
            // Status and createdBy only written on first insert (preserves manual status changes)
            $setOnInsert: { status: 'delivered', createdBy: user.id }
          },
          { upsert: true }
        ).exec();
      })
    );
  }

  async generate(dto: GenerateInvoicesDto, user: PublicUser) {
    const rows = this.engine.parseSap(dto.sapRaw);
    await this.catalogService.rememberOrderPrices(rows);
    const catalog = await this.catalogService.list();
    const invoices = this.engine.buildInvoices(rows, catalog, dto.startId, dto.dateIso);
    await this.persistInvoices(invoices, user);
    // Re-fetch from DB so returned invoices have actual status (e.g., 'delivered')
    const savedInvoices = await this.invoiceModel
      .find({ invNo: { $in: invoices.map((i) => i.invNo) } })
      .lean()
      .exec();
    const invoicesWithStatus = invoices.map((inv) => {
      const db = savedInvoices.find((d) => d.invNo === inv.invNo);
      return db ? { ...inv, status: db.status } : { ...inv, status: 'saved' as const };
    });
    const snapshot = this.engine.snapshot({
      invoiceDate: dto.dateIso,
      startId: dto.startId,
      sapRaw: dto.sapRaw,
      catalog,
      invoices
    });
    const session = await this.sessionsService.save(
      {
        invoiceDate: dto.dateIso,
        invoiceCount: invoices.length,
        sumTotal: invoices.reduce((sum, invoice) => sum + invoice.sumTotal, 0),
        snapshot
      },
      user
    );
    return { rows: rows.length, invoices: invoicesWithStatus, catalog, snapshot, session };
  }

  async softDelete(invNo: number, user: PublicUser) {
    const invoice = await this.findOne(invNo);
    invoice.status = 'cancelled';
    invoice.updatedBy = user.id;
    await invoice.save();
    return invoice;
  }

  async restore(invNo: number, user: PublicUser) {
    return this.setStatus(invNo, 'saved', user);
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
    // C2: compute maxNo and seq from DB — never trust client-provided existingInvoices
    const [latestInvoice, sameStoreInvoices] = await Promise.all([
      this.invoiceModel.findOne({}, { invNo: 1 }).sort({ invNo: -1 }).lean().exec(),
      this.invoiceModel.find({ storeCode: dto.storeCode }, { invNo: 1, storeCode: 1 }).lean().exec(),
    ]);
    const safeStartId = Math.max(latestInvoice?.invNo ?? 0, dto.startId);
    const invoice = this.engine.buildManualInvoice(catalog, {
      ...dto,
      startId: safeStartId,
      existingInvoices: sameStoreInvoices as any, // only invNo+storeCode needed for seq
    });
    await this.persistInvoices([invoice], user);
    return { invoice, catalog };
  }
}
