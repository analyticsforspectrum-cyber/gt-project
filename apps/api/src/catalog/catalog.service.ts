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
    const count = await this.productModel.countDocuments().exec();
    if (count === 0) {
      await this.productModel.insertMany(
        DEFAULT_CATALOG.map((product, sortOrder) => ({ ...product, sortOrder }))
      );
    }
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
