import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ImportRecord, ImportDocument } from './schemas/import.schema';

@Injectable()
export class ImportsService {
  constructor(@InjectModel(ImportRecord.name) private readonly importModel: Model<ImportDocument>) {}

  async list(): Promise<ImportRecord[]> {
    return this.importModel.find().sort({ createdAt: -1 }).exec();
  }

  async create(input: {
    fileName: string;
    userId: string;
    importedRecords: number;
    errors: number;
    errorDetails?: Record<string, unknown>[];
    status?: 'pending' | 'completed' | 'failed';
  }): Promise<ImportRecord> {
    return this.importModel.create({
      ...input,
      errorDetails: input.errorDetails || [],
      status: input.status || 'completed'
    });
  }
}
