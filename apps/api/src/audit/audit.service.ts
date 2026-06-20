import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private readonly auditModel: Model<AuditLogDocument>) {}

  async list(): Promise<AuditLog[]> {
    return this.auditModel.find().sort({ createdAt: -1 }).exec();
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
