import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

// autoIndex is disabled in production — the unique index on `sku` must be created
// manually after deduplication (or is already present from a prior migration).
// In development (NODE_ENV !== 'production') Mongoose will still auto-create it.
const isProduction = process.env.NODE_ENV === 'production';

@Schema({
  timestamps: true,
  toJSON: { virtuals: true, versionKey: false },
  toObject: { virtuals: true },
  autoIndex: !isProduction,
})
export class Product {
  @Prop({ required: true, trim: true, index: true, unique: true })
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
