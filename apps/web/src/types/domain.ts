export type UserRole = 'admin' | 'user';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
}

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
  status?: 'draft' | 'saved' | 'delivered' | 'cancelled';
  originalDateIso?: string;
  undeliverComment?: string;
  undeliveredAt?: string | Date;
}

export interface Requisites {
  supplier: {
    name: string;
    addr: string;
    inn: string;
    vat: string;
  };
  receiver: {
    name: string;
    inn: string;
    vat: string;
  };
  contract: string;
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

export interface SessionSummary {
  _id: string;
  invoiceDate: string;
  savedAt: string;
  invoiceCount: number;
  sumTotal: number;
  name: string;
}

export interface SessionRecord extends SessionSummary {
  snapshot: DaySnapshot;
}

export interface VazvratRecord {
  _id?: string;
  date: string;
  marketCode: string;
  marketName: string;
  sapCode: string;
  productName: string;
  qty: number;
  pricePerUnit: number;
  totalWithVat: number;
  orderNo: string;
}

export interface VazvratUploadItem {
  date: string;
  marketCode: string;
  marketName: string;
  sapCode: string;
  productName: string;
  qty: number;
  pricePerUnit: number;
  totalWithVat: number;
  orderNo: string;
}

export interface GenerateResponse {
  rows: number;
  invoices: Invoice[];
  catalog: CatalogProduct[];
  snapshot: DaySnapshot;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: string;
  user: PublicUser;
}

export interface OrderItem {
  sku: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  total: number;
}

export interface Order {
  id: string;
  customer: string;
  deliveryDate: string;
  status: 'new' | 'in_production' | 'delivered' | 'cancelled';
  items: OrderItem[];
  totalQty: number;
  totalAmount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  dateIso: string;
  productSku: string;
  movementType: 'import' | 'invoice' | 'manual_adjustment' | 'order_fulfillment';
  quantity: number;
  userId: string;
  reference: string;
  createdAt: string;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  userId: string;
  importedRecords: number;
  errors: number;
  errorDetails: Record<string, unknown>[];
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action:
    | 'login'
    | 'logout'
    | 'invoice_created'
    | 'invoice_edited'
    | 'invoice_deleted'
    | 'order_created'
    | 'order_updated'
    | 'product_added'
    | 'product_updated'
    | 'product_deleted'
    | 'import_performed';
  entity: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  active: boolean;
}

export interface DashboardStats {
  daily: {
    ordersCount: number;
    invoicesCount: number;
    ordersDelivered: number;
    ordersPending: number;
    revenue: number;
    productsIssued: number;
  };
  weekly: { ordersCount: number; revenue: number; productsIssued: number };
  monthly: { ordersCount: number; revenue: number; productsIssued: number };
}

export interface ProductStat {
  sku: string;
  name: string;
  unit: string;
  ordersCount: number;
  quantityOrdered: number;
  quantityDelivered: number;
}

export interface CustomerStat {
  customer: string;
  ordersCount: number;
  revenue: number;
  lastOrderDate: string;
}

export interface InventoryStat {
  sku: string;
  incoming: number;
  outgoing: number;
  closingBalance: number;
}

/** Ishonchnoma (power-of-attorney) fields */
export interface DovFields {
  driver: string;
  prava: string;
  car: string;
  plate: string;
  validUntil: string;
  director: string;
  company: string;
  address: string;
  docDate: string;
  docNo: string;
}

/** One printed Ishonchnoma entry stored in history */
export interface DovEntry extends DovFields {
  printedAt: string; // ISO string
}

export type SettingsView = 'catalog' | 'requisites' | 'users' | 'audit' | 'doverennost' | null;
