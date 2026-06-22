import { BadRequestException } from '@nestjs/common';
import { InvoiceEngineService } from './invoice-engine.service';
import type { CatalogProduct } from '../common/types/invoice.types';

describe('InvoiceEngineService', () => {
  let engine: InvoiceEngineService;

  const catalog: CatalogProduct[] = [
    { sku: 'SKU-001', name: 'Tort A', unit: 'dona', price: 50000 },
    { sku: 'SKU-002', name: 'Tort B', unit: 'dona', price: 30000 },
  ];

  // Minimal valid SAP row (16 tab-separated columns)
  const makeSapRow = (overrides: Partial<{
    storeCode: string; storeName: string; address: string;
    order: string; sku: string; qty: string; price: string;
  }> = {}) => {
    const cols = Array(16).fill('');
    cols[0] = overrides.storeCode ?? 'ST001';
    cols[1] = overrides.storeName ?? 'Supermarket Test';
    cols[2] = overrides.address ?? 'Toshkent, 1-ko\'cha';
    cols[5] = overrides.order ?? 'ORD-001';
    cols[10] = overrides.sku ?? 'SKU-001';
    cols[12] = overrides.qty ?? '10';
    cols[14] = overrides.price ?? '50000';
    return cols.join('\t');
  };

  beforeEach(() => {
    engine = new InvoiceEngineService();
  });

  // ─── parseSap ────────────────────────────────────────────────────────────────

  describe('parseSap', () => {
    it('parses a single valid row', () => {
      const raw = makeSapRow();
      const rows = engine.parseSap(raw);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        storeCode: 'ST001',
        order: 'ORD-001',
        sku: 'SKU-001',
        qty: 10,
        price: 50000,
      });
    });

    it('skips the header row', () => {
      const header = 'Код магазина\t' + Array(15).fill('x').join('\t');
      const data = makeSapRow();
      const rows = engine.parseSap(`${header}\n${data}`);
      expect(rows).toHaveLength(1);
    });

    it('skips rows with fewer than 15 columns', () => {
      const short = 'ST001\tName\tAddr';
      const valid = makeSapRow();
      const rows = engine.parseSap(`${short}\n${valid}`);
      expect(rows).toHaveLength(1);
    });

    it('skips rows with empty order or sku', () => {
      const noOrder = makeSapRow({ order: '' });
      const noSku = makeSapRow({ sku: '' });
      const valid = makeSapRow();
      const rows = engine.parseSap(`${noOrder}\n${noSku}\n${valid}`);
      expect(rows).toHaveLength(1);
    });

    it('throws when no rows are recognized', () => {
      expect(() => engine.parseSap('')).toThrow(BadRequestException);
      expect(() => engine.parseSap('too\tshort')).toThrow(BadRequestException);
    });

    it('parses comma-decimal qty and price', () => {
      const row = makeSapRow({ qty: '5,5', price: '12 500' });
      const rows = engine.parseSap(row);
      expect(rows[0].qty).toBeCloseTo(5.5);
      expect(rows[0].price).toBe(12500);
    });

    it('accumulates qty for duplicate order+sku', () => {
      const r1 = makeSapRow({ qty: '3' });
      const r2 = makeSapRow({ qty: '7' });
      const rows = engine.parseSap(`${r1}\n${r2}`);
      // parseSap itself does not accumulate — buildInvoices does
      expect(rows).toHaveLength(2);
      expect(rows[0].qty + rows[1].qty).toBe(10);
    });
  });

  // ─── buildLineFromInput ───────────────────────────────────────────────────────

  describe('buildLineFromInput', () => {
    it('computes cost, vat (12%), total correctly', () => {
      const line = engine.buildLineFromInput({ sku: 'SKU-001', name: 'Tort A', unit: 'dona', qty: 10, price: 50000 });
      expect(line.cost).toBe(500000);
      expect(line.vat).toBeCloseTo(60000, 2);
      expect(line.total).toBeCloseTo(560000, 2);
    });

    it('returns zero amounts for zero qty', () => {
      const line = engine.buildLineFromInput({ sku: 'SKU-001', name: 'Tort A', unit: 'dona', qty: 0, price: 50000 });
      expect(line.cost).toBe(0);
      expect(line.vat).toBe(0);
      expect(line.total).toBe(0);
    });

    it('handles zero price', () => {
      const line = engine.buildLineFromInput({ sku: 'SKU-001', name: 'Tort A', unit: 'dona', qty: 5, price: 0 });
      expect(line.cost).toBe(0);
      expect(line.total).toBe(0);
    });
  });

  // ─── lineFrom ────────────────────────────────────────────────────────────────

  describe('lineFrom', () => {
    const product = catalog[0]; // price: 50000

    it('uses catalog price when no override', () => {
      const line = engine.lineFrom(product, 2, 2);
      expect(line.price).toBe(50000);
      expect(line.qty).toBe(2);
      expect(line.init).toBe(2);
    });

    it('uses override price when provided and > 0', () => {
      const line = engine.lineFrom(product, 2, 2, 40000);
      expect(line.price).toBe(40000);
    });

    it('uses override price of 0 (promo item)', () => {
      const line = engine.lineFrom(product, 2, 2, 0);
      expect(line.price).toBe(0);
      expect(line.total).toBe(0);
    });
  });

  // ─── buildInvoices ───────────────────────────────────────────────────────────

  describe('buildInvoices', () => {
    it('creates one invoice per unique order', () => {
      const raw = [makeSapRow({ order: 'ORD-1' }), makeSapRow({ order: 'ORD-2' })].join('\n');
      const rows = engine.parseSap(raw);
      const invoices = engine.buildInvoices(rows, catalog, 0, '2026-06-21');
      expect(invoices).toHaveLength(2);
    });

    it('assigns sequential invNo starting from startId+1', () => {
      const raw = [makeSapRow({ order: 'ORD-1' }), makeSapRow({ order: 'ORD-2' })].join('\n');
      const rows = engine.parseSap(raw);
      const invoices = engine.buildInvoices(rows, catalog, 100, '2026-06-21');
      expect(invoices[0].invNo).toBe(101);
      expect(invoices[1].invNo).toBe(102);
    });

    it('accumulates qty for same order + different sku rows', () => {
      const r1 = makeSapRow({ order: 'ORD-1', sku: 'SKU-001', qty: '3' });
      const r2 = makeSapRow({ order: 'ORD-1', sku: 'SKU-001', qty: '7' });
      const rows = engine.parseSap(`${r1}\n${r2}`);
      const invoices = engine.buildInvoices(rows, catalog, 0, '2026-06-21');
      expect(invoices).toHaveLength(1);
      const line = invoices[0].lines.find(l => l.sku === 'SKU-001');
      expect(line?.qty).toBe(10);
    });

    it('computes correct sumTotal via recompute', () => {
      const raw = makeSapRow({ order: 'ORD-1', sku: 'SKU-001', qty: '10', price: '50000' });
      const rows = engine.parseSap(raw);
      const invoices = engine.buildInvoices(rows, catalog, 0, '2026-06-21');
      const inv = invoices[0];
      // cost = 10 * 50000 = 500000, vat = 60000, total = 560000
      expect(inv.sumCost).toBe(500000);
      expect(inv.sumVat).toBeCloseTo(60000, 2);
      expect(inv.sumTotal).toBeCloseTo(560000, 2);
    });

    it('tracks seq per storeCode', () => {
      const r1 = makeSapRow({ order: 'ORD-1', storeCode: 'ST001' });
      const r2 = makeSapRow({ order: 'ORD-2', storeCode: 'ST001' });
      const r3 = makeSapRow({ order: 'ORD-3', storeCode: 'ST002' });
      const rows = engine.parseSap([r1, r2, r3].join('\n'));
      const invoices = engine.buildInvoices(rows, catalog, 0, '2026-06-21');
      expect(invoices[0].seq).toBe(1);
      expect(invoices[1].seq).toBe(2);
      expect(invoices[2].seq).toBe(1);
    });

    it('sets manual: false', () => {
      const rows = engine.parseSap(makeSapRow());
      const [inv] = engine.buildInvoices(rows, catalog, 0, '2026-06-21');
      expect(inv.manual).toBe(false);
    });
  });

  // ─── buildManualInvoice ───────────────────────────────────────────────────────

  describe('buildManualInvoice', () => {
    it('creates a manual invoice with correct invNo', () => {
      const inv = engine.buildManualInvoice(catalog, {
        storeCode: 'ST001',
        storeName: 'Test',
        dateIso: '2026-06-21',
        startId: 50,
        quantities: [{ sku: 'SKU-001', qty: 5 }],
      });
      expect(inv.invNo).toBe(51);
      expect(inv.manual).toBe(true);
    });

    it('assigns invNo above max existing', () => {
      const existingInvoices = [{ invNo: 99 } as any, { invNo: 103 } as any];
      const inv = engine.buildManualInvoice(catalog, {
        storeCode: 'ST001',
        storeName: 'Test',
        dateIso: '2026-06-21',
        startId: 50,
        quantities: [{ sku: 'SKU-001', qty: 2 }],
        existingInvoices,
      });
      expect(inv.invNo).toBe(104);
    });

    it('uses override price when provided', () => {
      const inv = engine.buildManualInvoice(catalog, {
        storeCode: 'ST001',
        storeName: 'Test',
        dateIso: '2026-06-21',
        startId: 0,
        quantities: [{ sku: 'SKU-001', qty: 3, price: 45000 }],
      });
      const line = inv.lines.find(l => l.sku === 'SKU-001');
      expect(line?.price).toBe(45000);
    });

    it('recomputes totals correctly', () => {
      const inv = engine.buildManualInvoice(catalog, {
        storeCode: 'ST001',
        storeName: 'Test',
        dateIso: '2026-06-21',
        startId: 0,
        quantities: [{ sku: 'SKU-001', qty: 2 }], // 2 * 50000 = 100000, vat = 12000
      });
      expect(inv.sumCost).toBe(100000);
      expect(inv.sumVat).toBeCloseTo(12000, 2);
      expect(inv.sumTotal).toBeCloseTo(112000, 2);
    });
  });

  // ─── recompute ────────────────────────────────────────────────────────────────

  describe('recompute', () => {
    it('recomputes sums from lines', () => {
      const rows = engine.parseSap(makeSapRow({ qty: '5', price: '20000' }));
      const [inv] = engine.buildInvoices(rows, catalog, 0, '2026-06-21');
      // Manually corrupt, then recompute
      inv.sumTotal = 9999999;
      engine.recompute(inv);
      expect(inv.sumCost).toBe(100000); // 5 * 20000
      expect(inv.sumVat).toBeCloseTo(12000, 2);
      expect(inv.sumTotal).toBeCloseTo(112000, 2);
    });
  });
});
