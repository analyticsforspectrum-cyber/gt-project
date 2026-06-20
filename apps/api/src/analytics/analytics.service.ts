import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { InventoryMovement, InventoryMovementDocument } from '../inventory/schemas/movement.schema';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function startOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function startOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(InventoryMovement.name) private readonly movementModel: Model<InventoryMovementDocument>
  ) {}

  async dashboard() {
    const today = todayIso();
    const weekStart = startOfWeek();
    const monthStart = startOfMonth();

    const [
      ordersToday, invoicesToday, ordersDeliveredToday, ordersPendingToday,
      ordersThisWeek, ordersThisMonth,
      revenueToday, revenueWeek, revenueMonth
    ] = await Promise.all([
      this.orderModel.countDocuments({ createdAt: { $gte: new Date(today) } }),
      this.invoiceModel.countDocuments({ dateIso: today }),
      this.orderModel.countDocuments({ status: 'delivered', updatedAt: { $gte: new Date(today) } }),
      this.orderModel.countDocuments({ status: { $in: ['new', 'in_production'] } }),
      this.orderModel.countDocuments({ createdAt: { $gte: new Date(weekStart) } }),
      this.orderModel.countDocuments({ createdAt: { $gte: new Date(monthStart) } }),
      this.invoiceModel.aggregate([
        { $match: { dateIso: today } },
        { $group: { _id: null, total: { $sum: '$sumTotal' }, qty: { $sum: '$sumQty' } } }
      ]),
      this.invoiceModel.aggregate([
        { $match: { dateIso: { $gte: weekStart } } },
        { $group: { _id: null, total: { $sum: '$sumTotal' }, qty: { $sum: '$sumQty' } } }
      ]),
      this.invoiceModel.aggregate([
        { $match: { dateIso: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$sumTotal' }, qty: { $sum: '$sumQty' } } }
      ])
    ]);

    return {
      daily: {
        ordersCount: ordersToday,
        invoicesCount: invoicesToday,
        ordersDelivered: ordersDeliveredToday,
        ordersPending: ordersPendingToday,
        revenue: revenueToday[0]?.total ?? 0,
        productsIssued: revenueToday[0]?.qty ?? 0
      },
      weekly: {
        ordersCount: ordersThisWeek,
        revenue: revenueWeek[0]?.total ?? 0,
        productsIssued: revenueWeek[0]?.qty ?? 0
      },
      monthly: {
        ordersCount: ordersThisMonth,
        revenue: revenueMonth[0]?.total ?? 0,
        productsIssued: revenueMonth[0]?.qty ?? 0
      }
    };
  }

  async productAnalytics(dateFrom?: string, dateTo?: string) {
    const matchInvoice: Record<string, unknown> = {};
    if (dateFrom || dateTo) {
      matchInvoice.dateIso = {};
      if (dateFrom) (matchInvoice.dateIso as Record<string, string>).$gte = dateFrom;
      if (dateTo) (matchInvoice.dateIso as Record<string, string>).$lte = dateTo;
    }

    const matchOrder: Record<string, unknown> = {};
    if (dateFrom || dateTo) {
      matchOrder.deliveryDate = {};
      if (dateFrom) (matchOrder.deliveryDate as Record<string, string>).$gte = dateFrom;
      if (dateTo) (matchOrder.deliveryDate as Record<string, string>).$lte = dateTo;
    }

    const [invoiceLines, orderItems] = await Promise.all([
      this.invoiceModel.aggregate([
        { $match: matchInvoice },
        { $unwind: '$lines' },
        { $match: { 'lines.qty': { $gt: 0 } } },
        { $group: { _id: '$lines.sku', name: { $first: '$lines.name' }, unit: { $first: '$lines.unit' }, quantityDelivered: { $sum: '$lines.qty' } } }
      ]),
      this.orderModel.aggregate([
        { $match: matchOrder },
        { $unwind: '$items' },
        { $group: { _id: '$items.sku', name: { $first: '$items.name' }, ordersCount: { $sum: 1 }, quantityOrdered: { $sum: '$items.qty' } } }
      ])
    ]);

    const deliveredMap = new Map(invoiceLines.map((item: any) => [item._id, item]));
    const orderedMap = new Map(orderItems.map((item: any) => [item._id, item]));
    const skus = new Set([...deliveredMap.keys(), ...orderedMap.keys()]);

    return [...skus].map((sku) => {
      const d = deliveredMap.get(sku);
      const o = orderedMap.get(sku);
      return {
        sku,
        name: d?.name ?? o?.name ?? sku,
        unit: d?.unit ?? '',
        ordersCount: o?.ordersCount ?? 0,
        quantityOrdered: o?.quantityOrdered ?? 0,
        quantityDelivered: d?.quantityDelivered ?? 0
      };
    }).sort((a, b) => b.quantityDelivered - a.quantityDelivered);
  }

  async inventoryLedger(dateFrom?: string, dateTo?: string) {
    const match: Record<string, unknown> = {};
    if (dateFrom || dateTo) {
      match.dateIso = {};
      if (dateFrom) (match.dateIso as Record<string, string>).$gte = dateFrom;
      if (dateTo) (match.dateIso as Record<string, string>).$lte = dateTo;
    }

    const movements = await this.movementModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$productSku',
          incoming: { $sum: { $cond: [{ $in: ['$movementType', ['import', 'manual_adjustment']] }, '$quantity', 0] } },
          outgoing: { $sum: { $cond: [{ $in: ['$movementType', ['invoice', 'order_fulfillment']] }, '$quantity', 0] } }
        }
      }
    ]);

    return movements.map((m: any) => ({
      sku: m._id,
      incoming: m.incoming,
      outgoing: m.outgoing,
      closingBalance: m.incoming - m.outgoing
    }));
  }

  async customerAnalytics(dateFrom?: string, dateTo?: string) {
    const match: Record<string, unknown> = {};
    if (dateFrom || dateTo) {
      match.deliveryDate = {};
      if (dateFrom) (match.deliveryDate as Record<string, string>).$gte = dateFrom;
      if (dateTo) (match.deliveryDate as Record<string, string>).$lte = dateTo;
    }

    return this.orderModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$customer',
          ordersCount: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
          lastOrderDate: { $max: '$deliveryDate' }
        }
      },
      { $sort: { revenue: -1 } },
      { $project: { _id: 0, customer: '$_id', ordersCount: 1, revenue: 1, lastOrderDate: 1 } }
    ]);
  }

  async userAnalytics(dateFrom?: string, dateTo?: string) {
    const matchDate: Record<string, unknown> = {};
    if (dateFrom || dateTo) {
      matchDate.createdAt = {};
      if (dateFrom) (matchDate.createdAt as Record<string, string | Date>).$gte = new Date(dateFrom);
      if (dateTo) (matchDate.createdAt as Record<string, string | Date>).$lte = new Date(dateTo + 'T23:59:59');
    }

    const [ordersByUser, invoicesByUser] = await Promise.all([
      this.orderModel.aggregate([
        { $match: matchDate },
        { $group: { _id: '$createdBy', ordersCreated: { $sum: 1 } } }
      ]),
      this.invoiceModel.aggregate([
        { $match: matchDate },
        { $group: { _id: '$createdBy', invoicesCreated: { $sum: 1 } } }
      ])
    ]);

    const userMap = new Map<string, { ordersCreated: number; invoicesCreated: number }>();
    for (const row of ordersByUser) {
      const key = String(row._id);
      if (!userMap.has(key)) userMap.set(key, { ordersCreated: 0, invoicesCreated: 0 });
      userMap.get(key)!.ordersCreated = row.ordersCreated;
    }
    for (const row of invoicesByUser) {
      const key = String(row._id);
      if (!userMap.has(key)) userMap.set(key, { ordersCreated: 0, invoicesCreated: 0 });
      userMap.get(key)!.invoicesCreated = row.invoicesCreated;
    }

    return [...userMap.entries()].map(([userId, stats]) => ({
      userId,
      ordersCreated: stats.ordersCreated,
      invoicesCreated: stats.invoicesCreated,
      activityScore: stats.ordersCreated + stats.invoicesCreated * 2
    })).sort((a, b) => b.activityScore - a.activityScore);
  }
}
