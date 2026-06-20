import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { PublicUser } from '../users/users.types';
import { UploadVazvratDto } from './dto/upload-vazvrat.dto';
import { Vazvrat, VazvratDocument } from './schemas/vazvrat.schema';

@Injectable()
export class VazvratService {
  constructor(
    @InjectModel(Vazvrat.name) private readonly vazvratModel: Model<VazvratDocument>,
    @InjectConnection() private readonly connection: Connection
  ) {}

  /** Save records — replace all records for the dates present in the upload */
  async upload(dto: UploadVazvratDto, user: PublicUser) {
    const dates = [...new Set(dto.records.map((r) => r.date))];

    // ─── Detect within-upload duplicates: key = orderNo + sapCode + qty ───
    // orderNo is the unique delivery identifier (e.g. "4703436025 - 800701702")
    // Same orderNo + sapCode + qty appearing twice = 100% duplicate row
    const keyCount: Record<string, number> = {};
    for (const r of dto.records) {
      const k = `${r.orderNo ?? ''}|${r.sapCode}|${r.qty}`;
      keyCount[k] = (keyCount[k] ?? 0) + 1;
    }
    const duplicateKeys = Object.entries(keyCount)
      .filter(([, count]) => count > 1)
      .map(([key, count]) => ({ key, count }));

    // Delete existing records for these dates (idempotent re-upload)
    await this.vazvratModel.deleteMany({ date: { $in: dates } }).exec();

    const docs = dto.records.map((r) => ({
      ...r,
      uploadedBy: new Types.ObjectId(user.id)
    }));

    await this.vazvratModel.insertMany(docs);
    return {
      ok: true,
      inserted: docs.length,
      dates,
      duplicates: duplicateKeys.length,          // count of duplicate keys
      duplicateDetails: duplicateKeys.slice(0, 10), // first 10 for logging
    };
  }

  async query(from: string, to: string) {
    return this.vazvratModel
      .find({ date: { $gte: from, $lte: to } })
      .lean()
      .exec();
  }

  async dates() {
    return this.vazvratModel.distinct('date').exec();
  }

  /** Aggregate invoice lines + vazvrat by SKU for a date range */
  async analytics(from: string, to: string) {
    // 1. Invoice lines aggregated by sku
    const invoicePipeline = [
      { $match: { dateIso: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } } },
      { $unwind: '$lines' },
      { $match: { 'lines.qty': { $gt: 0 } } },
      {
        $group: {
          _id: '$lines.sku',
          name: { $first: '$lines.name' },
          berilganQty: { $sum: '$lines.qty' },
          berilganSum: { $sum: '$lines.total' },
        }
      }
    ];
    const invoiceRows = await this.connection.collection('invoices').aggregate(invoicePipeline).toArray();

    // 2. Vazvrat aggregated by sapCode
    const vazvratPipeline = [
      { $match: { date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: '$sapCode',
          name: { $first: '$productName' },
          vazvratQty: { $sum: '$qty' },
          vazvratSum: { $sum: '$totalWithVat' },
        }
      }
    ];
    const vazvratRows = await this.vazvratModel.aggregate(vazvratPipeline).exec();

    // 3. Merge by sku
    const map: Record<string, {
      sku: string; name: string;
      berilganQty: number; berilganSum: number;
      vazvratQty: number; vazvratSum: number;
    }> = {};

    for (const r of invoiceRows) {
      map[r._id] = { sku: r._id, name: r.name, berilganQty: r.berilganQty, berilganSum: r.berilganSum, vazvratQty: 0, vazvratSum: 0 };
    }
    for (const r of vazvratRows) {
      if (!map[r._id]) map[r._id] = { sku: r._id, name: r.name, berilganQty: 0, berilganSum: 0, vazvratQty: 0, vazvratSum: 0 };
      map[r._id].vazvratQty += r.vazvratQty;
      map[r._id].vazvratSum += r.vazvratSum;
    }

    return Object.values(map).sort((a, b) => (b.berilganSum - b.vazvratSum) - (a.berilganSum - a.vazvratSum));
  }
}
