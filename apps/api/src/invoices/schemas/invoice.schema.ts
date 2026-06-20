import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { InvoiceItem } from './invoice-item.schema';


export type InvoiceDocument = HydratedDocument<Invoice>;

export type InvoiceStatus = 'draft' | 'saved' | 'delivered' | 'cancelled';

@Schema({ timestamps: true, toJSON: { virtuals: true, versionKey: false }, toObject: { virtuals: true } })
export class Invoice {
  @Prop({ required: true, unique: true, index: true })
  invNo: number;

  @Prop({ required: true, trim: true })
  order: string;

  @Prop({ required: true, trim: true, index: true })
  storeCode: string;

  @Prop({ required: true, trim: true })
  short: string;

  @Prop({ required: true })
  seq: number;

  @Prop({ required: true, trim: true })
  market: string;

  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ required: true, trim: true, index: true })
  dateIso: string;

  @Prop({ required: true, default: false })
  manual: boolean;

  @Prop({ type: [InvoiceItem], default: [] })
  lines: InvoiceItem[];

  @Prop({ required: true })
  sumCost: number;

  @Prop({ required: true })
  sumVat: number;

  @Prop({ required: true })
  sumTotal: number;

  @Prop({ required: true })
  sumQty: number;

  @Prop({ enum: ['draft', 'saved', 'delivered', 'cancelled'], default: 'draft', index: true })
  status: InvoiceStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  updatedBy?: string;

  /** Original dateIso before rescheduling (set when delivery date is changed during restore) */
  @Prop({ trim: true })
  originalDateIso?: string;

  /** Mandatory comment when un-delivering */
  @Prop({ trim: true })
  undeliverComment?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  undeliveredBy?: string;

  @Prop()
  undeliveredAt?: Date;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

// Compound index for analytics queries filtering by date + status
InvoiceSchema.index({ dateIso: 1, status: 1 });
// Compound index for dispatch/schedule store lookups
InvoiceSchema.index({ storeCode: 1, dateIso: 1 });
