import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private readonly auditModel: Model<AuditLogDocument>) {}

  // Explicit return type: the inferred lean type is too large for TS to serialize (TS7056).
  async list(): Promise<(AuditLog & { id: string })[]> {
    // `.lean()` skips hydration for this read-only list; re-attach the `id` virtual
    // the web client keys audit rows on (lean drops virtuals).
    const docs = await this.auditModel.find().sort({ createdAt: -1 }).limit(500).lean().exec();
    return docs.map((doc) => ({ ...doc, id: String(doc._id) })) as unknown as (AuditLog & { id: string })[];
  }

  async create(input: {
    userId: string;
    userName: string;
    action: AuditLog['action'];
    entity: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    ipAddress: string;
  }): Promise<AuditLog> {
    return this.auditModel.create(input);
  }
}
