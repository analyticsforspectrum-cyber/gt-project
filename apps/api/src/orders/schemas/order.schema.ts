import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { OrderItem } from './order-item.schema';


export type OrderDocument = HydratedDocument<Order>;

export type OrderStatus = 'new' | 'in_production' | 'delivered' | 'cancelled';

@Schema({ timestamps: true, toJSON: { virtuals: true, versionKey: false }, toObject: { virtuals: true } })
export class Order {
  @Prop({ required: true, trim: true, index: true })
  customer: string;

  @Prop({ required: true, trim: true })
  deliveryDate: string;

  @Prop({ required: true, trim: true, index: true })
  status: OrderStatus;

  @Prop({ type: [OrderItem], default: [] })
  items: OrderItem[];

  @Prop({ required: true })
  totalQty: number;

  @Prop({ required: true })
  totalAmount: number;

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  updatedBy?: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

// Analytics/dashboard filter & sort on these fields on every request.
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ deliveryDate: 1 });
OrderSchema.index({ status: 1, createdAt: -1 });
