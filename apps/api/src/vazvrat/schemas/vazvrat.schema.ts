import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type VazvratDocument = HydratedDocument<Vazvrat>;

@Schema({ timestamps: true, toJSON: { virtuals: true, versionKey: false }, toObject: { virtuals: true } })
export class Vazvrat {
  @Prop({ required: true, index: true })
  date: string; // YYYY-MM-DD

  @Prop({ required: true, index: true })
  marketCode: string; // K149, K165 ...

  @Prop({ required: true })
  marketName: string;

  @Prop({ required: true, index: true })
  sapCode: string; // 117010102-00063 ...

  @Prop({ required: true })
  productName: string;

  @Prop({ required: true })
  qty: number;

  @Prop({ required: true })
  pricePerUnit: number;

  @Prop({ required: true })
  totalWithVat: number;

  @Prop({ default: '' })
  orderNo: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  uploadedBy?: Types.ObjectId;
}

export const VazvratSchema = SchemaFactory.createForClass(Vazvrat);

// compound index for fast range queries
VazvratSchema.index({ date: 1, marketCode: 1, sapCode: 1 });
