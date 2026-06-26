import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CatalogProduct, SapOrderRow } from '../common/types/invoice.types';
import { DEFAULT_CATALOG } from './default-catalog';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { Product, ProductDocument } from './schemas/product.schema';

@Injectable()
export class CatalogService implements OnModuleInit {
  constructor(@InjectModel(Product.name) private readonly productModel: Model<ProductDocument>) {}

  async onModuleInit(): Promise<void> {
    // Pre-check: detect duplicate SKUs in the DB before attempting the unique index upsert.
    // Duplicates would cause an E11000 crash if autoIndex fires on a replica set or dev instance.
    const dupes = await this.productModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$sku', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]).exec();
    if (dupes.length > 0) {
      const skus = dupes.map(d => d._id).join(', ');
      throw new Error(`[CatalogService] Duplicate SKUs in DB — deduplicate before startup: ${skus}`);
    }

    // Seeding rules:
    //   $set   → name, unit, category, sortOrder  (DEFAULT_CATALOG is authoritative; order changes take effect on deploy)
    //   $setOnInsert → sku, price, currentStock, minStock  (user-managed; never overwritten by a deploy)
    await Promise.all(
      DEFAULT_CATALOG.map((p, i) =>
        this.productModel.updateOne(
          { sku: p.sku },
          {
            $set: { name: p.name, unit: p.unit, category: p.category ?? '', sortOrder: i },
            $setOnInsert: { sku: p.sku, price: p.price, currentStock: 0, minStock: 0 },
          },
          { upsert: true }
        )
      )
    );
  }

  async list(): Promise<CatalogProduct[]> {
    const products = await this.productModel.find().sort({ sortOrder: 1, createdAt: 1 }).exec();
    return products.map((product) => this.toCatalogProduct(product));
  }

  async create(dto: CreateProductDto): Promise<CatalogProduct> {
    const count = await this.productModel.countDocuments().exec();
    const product = await this.productModel.create({
      sku: dto.sku,
      name: dto.name,
      unit: dto.unit || 'шт',
      price: dto.price,
      sortOrder: count,
      category: dto.category || '',
      currentStock: dto.currentStock ?? 0,
      minStock: dto.minStock ?? 0
    });
    return this.toCatalogProduct(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<CatalogProduct> {
    const product = await this.productModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!product) throw new NotFoundException('Product not found');
    return this.toCatalogProduct(product);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const product = await this.productModel.findByIdAndDelete(id).exec();
    if (!product) throw new NotFoundException('Product not found');
    return { ok: true };
  }

  async reset(): Promise<CatalogProduct[]> {
    await this.productModel.deleteMany({}).exec();
    await this.productModel.insertMany(
      DEFAULT_CATALOG.map((product, sortOrder) => ({ ...product, sortOrder }))
    );
    return this.list();
  }

  async rememberOrderPrices(rows: SapOrderRow[]): Promise<void> {
    const latest = new Map<string, number>();
    for (const row of rows) {
      if (row.sku && row.price > 0) latest.set(row.sku, row.price);
    }
    if (!latest.size) return;
    // Single round-trip instead of one updateOne per SKU.
    await this.productModel.bulkWrite(
      [...latest.entries()].map(([sku, price]) => ({
        updateOne: { filter: { sku }, update: { $set: { price } } }
      }))
    );
  }

  toCatalogProduct(product: ProductDocument): CatalogProduct {
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      price: product.price,
      category: (product as any).category ?? '',
      currentStock: (product as any).currentStock ?? 0,
      minStock: (product as any).minStock ?? 0
    };
  }
}
