import { Prop, Schema } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class InvoiceItem {
  @Prop({ required: true })
  sku: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  unit: string;

  @Prop({ required: true })
  qty: number;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  cost: number;

  @Prop({ required: true })
  vat: number;

  @Prop({ required: true })
  total: number;

  @Prop({ default: 0 })
  init: number;
}

export type InvoiceItemDocument = InvoiceItem & Document;
