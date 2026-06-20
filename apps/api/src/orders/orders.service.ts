import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order, OrderDocument, OrderStatus } from './schemas/order.schema';

@Injectable()
export class OrdersService {
  constructor(@InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>) {}

  private static escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async list(filters?: { dateFrom?: string; dateTo?: string; customer?: string; status?: string }): Promise<Order[]> {
    const query: Record<string, unknown> = {};
    // Escape regex metacharacters so user input can't inject a pattern (ReDoS / `.*` enumeration).
    if (filters?.customer) query.customer = { $regex: OrdersService.escapeRegex(filters.customer), $options: 'i' };
    if (filters?.status) query.status = filters.status;
    if (filters?.dateFrom || filters?.dateTo) {
      query.deliveryDate = {};
      if (filters.dateFrom) (query.deliveryDate as Record<string, string>).$gte = filters.dateFrom;
      if (filters.dateTo) (query.deliveryDate as Record<string, string>).$lte = filters.dateTo;
    }
    return this.orderModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<Order> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async create(dto: CreateOrderDto, userId: string): Promise<Order> {
    const items = dto.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      qty: item.qty,
      price: item.price,
      total: Math.round(item.qty * item.price * 100) / 100
    }));
    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
    const totalAmount = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
    return this.orderModel.create({
      customer: dto.customer,
      deliveryDate: dto.deliveryDate,
      status: 'new' as OrderStatus,
      items,
      totalQty,
      totalAmount,
      notes: dto.notes || '',
      createdBy: userId,
      updatedBy: userId
    });
  }

  async update(id: string, dto: UpdateOrderDto, userId: string): Promise<Order> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) throw new NotFoundException('Order not found');
    if (dto.customer !== undefined) order.customer = dto.customer;
    if (dto.deliveryDate !== undefined) order.deliveryDate = dto.deliveryDate;
    if (dto.status !== undefined) order.status = dto.status as OrderStatus;
    if (dto.notes !== undefined) order.notes = dto.notes;
    if (dto.items !== undefined) {
      order.items = dto.items.map((item) => ({
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        qty: item.qty,
        price: item.price,
        total: Math.round(item.qty * item.price * 100) / 100
      }));
      order.totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);
      order.totalAmount = Math.round(order.items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
    }
    order.updatedBy = userId;
    await order.save();
    return order;
  }
}
