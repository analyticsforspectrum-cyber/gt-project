import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CatalogProduct,
  DaySnapshot,
  Invoice,
  InvoiceLine,
  SapOrderRow
} from '../common/types/invoice.types';

const VAT = 0.12;

@Injectable()
export class InvoiceEngineService {
  parseSap(raw: string): SapOrderRow[] {
    const rows: SapOrderRow[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const columns = line.split('\t');
      if (columns.length < 15) continue;
      if ((columns[0] || '').trim() === 'Код магазина') continue;

      const order = (columns[5] || '').trim();
      const sku = (columns[10] || '').trim();
      if (!order || !sku) continue;

      rows.push({
        storeCode: (columns[0] || '').trim(),
        storeName: (columns[1] || '').trim(),
        address: (columns[2] || '').trim(),
        order,
        sku,
        qty: this.parseNum(columns[12]),
        price: this.parseNum(columns[14])
      });
    }
    if (!rows.length) {
      throw new BadRequestException('SAP rows were not recognized');
    }
    return rows;
  }

  buildInvoices(rows: SapOrderRow[], catalog: CatalogProduct[], startId: number, dateIso: string): Invoice[] {
    const orders = new Map<
      string,
      {
        order: string;
        storeCode: string;
        storeName: string;
        address: string;
        qtyBySku: Record<string, number>;
        priceBySku: Record<string, number>;
      }
    >();
    const sequence: string[] = [];

    for (const row of rows) {
      if (!orders.has(row.order)) {
        orders.set(row.order, {
          order: row.order,
          storeCode: row.storeCode,
          storeName: row.storeName,
          address: row.address,
          qtyBySku: {},
          priceBySku: {}
        });
        sequence.push(row.order);
      }
      const target = orders.get(row.order);
      if (!target) continue;
      target.qtyBySku[row.sku] = (target.qtyBySku[row.sku] || 0) + row.qty;
      if (row.price > 0) target.priceBySku[row.sku] = row.price;
    }

    const countByStore: Record<string, number> = {};
    return sequence.map((order, index) => {
      const source = orders.get(order);
      if (!source) throw new BadRequestException(`Order ${order} disappeared during build`);
      const seq = (countByStore[source.storeCode] = (countByStore[source.storeCode] || 0) + 1);
      const short = this.shortStore(source.storeName);
      const invoice: Invoice = {
        invNo: startId + 1 + index,
        order,
        storeCode: source.storeCode,
        short,
        seq,
        market: `${short} /${seq}`,
        label: `${source.storeCode} / ${short} /${seq}`,
        address: source.address,
        dateIso,
        manual: false,
        lines: catalog.map((product) =>
          this.lineFrom(
            product,
            source.qtyBySku[product.sku] || 0,
            source.qtyBySku[product.sku] || 0,
            source.priceBySku[product.sku]
          )
        ),
        sumCost: 0,
        sumVat: 0,
        sumTotal: 0,
        sumQty: 0
      };
      return this.recompute(invoice);
    });
  }

  buildManualInvoice(
    catalog: CatalogProduct[],
    input: {
      storeCode: string;
      storeName: string;
      address?: string;
      order?: string;
      dateIso: string;
      startId: number;
      quantities: { sku: string; qty: number; price?: number }[];
      existingInvoices?: Invoice[];
    }
  ): Invoice {
    const existing = input.existingInvoices || [];
    const maxNo = existing.reduce((max, invoice) => Math.max(max, invoice.invNo), input.startId);
    const seq = existing.filter((invoice) => invoice.storeCode === input.storeCode).length + 1;
    const short = this.shortStore(input.storeName);
    const qtyMap = new Map(input.quantities.map((line) => [line.sku, line.qty]));
    const priceMap = new Map(input.quantities.filter((l) => l.price != null).map((line) => [line.sku, line.price!]));
    const invoice: Invoice = {
      invNo: maxNo + 1,
      order: input.order || `ВР-${String(Date.now()).slice(-6)}`,
      storeCode: input.storeCode,
      short,
      seq,
      market: `${short} /${seq}`,
      label: `${input.storeCode} / ${short} /${seq}`,
      address: input.address ?? '',
      dateIso: input.dateIso,
      manual: true,
      lines: catalog.map((product) => {
        const qty = qtyMap.get(product.sku) || 0;
        return this.lineFrom(product, qty, qty, priceMap.get(product.sku));
      }),
      sumCost: 0,
      sumVat: 0,
      sumTotal: 0,
      sumQty: 0
    };
    return this.recompute(invoice);
  }

  snapshot(input: {
    invoiceDate: string;
    startId: number;
    sapRaw: string;
    catalog: CatalogProduct[];
    invoices: Invoice[];
  }): DaySnapshot {
    return {
      app: 'gdetort',
      v: 7,
      savedAt: new Date().toISOString(),
      invoiceDate: input.invoiceDate,
      startId: input.startId,
      sapRaw: input.sapRaw,
      catalog: input.catalog,
      invoices: input.invoices
    };
  }

  recompute(invoice: Invoice): Invoice {
    invoice.sumCost = this.round2(invoice.lines.reduce((sum, line) => sum + line.cost, 0));
    invoice.sumVat = this.round2(invoice.lines.reduce((sum, line) => sum + line.vat, 0));
    invoice.sumTotal = this.round2(invoice.sumCost + invoice.sumVat);
    invoice.sumQty = invoice.lines.reduce((sum, line) => sum + line.qty, 0);
    return invoice;
  }

  lineFrom(product: CatalogProduct, qty: number, init: number, price?: number): InvoiceLine {
    // Treat an explicit price of 0 as a real override (e.g. free/promo item);
    // only fall back to the catalog price when no override was supplied.
    const resolvedPrice = price != null && price >= 0 ? price : product.price || 0;
    return {
      ...this.buildLineFromInput({
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        qty,
        price: resolvedPrice
      }),
      init
    };
  }

  /**
   * Canonical per-line money computation. All code paths (generate, manual,
   * edit) must go through this so cost/vat/total round identically.
   */
  buildLineFromInput(input: { sku: string; name: string; unit: string; qty: number; price: number; init?: number }): InvoiceLine {
    const cost = this.round2(input.qty * input.price);
    const vat = this.round2(cost * VAT);
    return {
      sku: input.sku,
      name: input.name,
      unit: input.unit,
      qty: input.qty,
      price: input.price,
      cost,
      vat,
      total: this.round2(cost + vat),
      init: input.init ?? input.qty   // SAP boshlang'ich miqdorni saqlaydi
    };
  }

  private parseNum(value: string | undefined): number {
    if (value == null) return 0;
    const parsed = Number.parseFloat(String(value).replace(/\u00a0/g, '').replace(/\s/g, '').replace(',', '.'));
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private shortStore(value: string): string {
    if (!value) return '';
    return value.replace(/^\s*Korzinka\s*[-–]\s*/i, '').trim() || value.trim();
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
