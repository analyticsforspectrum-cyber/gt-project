export interface CatalogProduct {
  id?: string;
  sku: string;
  name: string;
  unit: string;
  price: number;
  category?: string;
  currentStock?: number;
  minStock?: number;
}

export interface SapOrderRow {
  storeCode: string;
  storeName: string;
  address: string;
  order: string;
  sku: string;
  qty: number;
  price: number;
}

export interface InvoiceLine {
  sku: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  cost: number;
  vat: number;
  total: number;
  init: number;
}

export interface Invoice {
  invNo: number;
  order: string;
  storeCode: string;
  short: string;
  seq: number;
  market: string;
  label: string;
  address: string;
  dateIso: string;
  manual: boolean;
  lines: InvoiceLine[];
  sumCost: number;
  sumVat: number;
  sumTotal: number;
  sumQty: number;
}

export interface DaySnapshot {
  app: 'gdetort';
  v: number;
  savedAt: string;
  invoiceDate: string;
  startId: number;
  sapRaw: string;
  catalog: CatalogProduct[];
  invoices: Invoice[];
}
