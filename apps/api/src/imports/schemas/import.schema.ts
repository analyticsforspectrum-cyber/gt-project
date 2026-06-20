import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ImportDocument = HydratedDocument<ImportRecord>;

export type ImportStatus = 'pending' | 'completed' | 'failed';

@Schema({ timestamps: true, toJSON: { virtuals: true, versionKey: false }, toObject: { virtuals: true } })
export class ImportRecord {
  @Prop({ required: true, trim: true })
  fileName: string;

  @Prop({ required: true, trim: true })
  userId: string;

  @Prop({ required: true })
  importedRecords: number;

  @Prop({ required: true })
  errors: number;

  @Prop({ type: [Object], default: [] })
  errorDetails: Record<string, unknown>[];

  @Prop({ enum: ['pending', 'completed', 'failed'], default: 'pending' })
  status: ImportStatus;
}

export const ImportSchema = SchemaFactory.createForClass(ImportRecord);
