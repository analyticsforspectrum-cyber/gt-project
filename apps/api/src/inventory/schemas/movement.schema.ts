import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InventoryMovementDocument = HydratedDocument<InventoryMovement>;

@Schema({ timestamps: true, toJSON: { virtuals: true, versionKey: false }, toObject: { virtuals: true } })
export class InventoryMovement {
  @Prop({ required: true, index: true })
  dateIso: string;

  @Prop({ required: true, trim: true, index: true })
  productSku: string;

  @Prop({ required: true, trim: true })
  movementType: 'import' | 'invoice' | 'manual_adjustment' | 'order_fulfillment';

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true, trim: true })
  reference: string;
}

export const InventoryMovementSchema = SchemaFactory.createForClass(InventoryMovement);
