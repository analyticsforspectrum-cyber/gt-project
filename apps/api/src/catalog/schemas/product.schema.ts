import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ timestamps: true, toJSON: { virtuals: true, versionKey: false }, toObject: { virtuals: true } })
export class Product {
  @Prop({ required: true, trim: true, index: true })
  sku: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, default: 'шт' })
  unit: string;

  @Prop({ required: true, min: 0, default: 0 })
  price: number;

  @Prop({ required: true, default: 0 })
  sortOrder: number;

  @Prop({ trim: true, default: '' })
  category: string;

  @Prop({ required: true, default: 0, min: 0 })
  currentStock: number;

  @Prop({ required: true, default: 0, min: 0 })
  minStock: number;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
