import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RequisitesDocument = HydratedDocument<Requisites>;

@Schema({ _id: false })
export class SupplierRequisites {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  addr: string;

  @Prop({ required: true })
  inn: string;

  @Prop({ required: true })
  vat: string;
}

@Schema({ _id: false })
export class ReceiverRequisites {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  inn: string;

  @Prop({ required: true })
  vat: string;
}

@Schema({ timestamps: true })
export class Requisites {
  @Prop({ required: true, unique: true, default: 'default' })
  key: string;

  @Prop({ type: SupplierRequisites, required: true })
  supplier: SupplierRequisites;

  @Prop({ type: ReceiverRequisites, required: true })
  receiver: ReceiverRequisites;

  @Prop({ required: true })
  contract: string;
}

export const RequisitesSchema = SchemaFactory.createForClass(Requisites);
