import {
  AuditLog,
  CatalogProduct,
  Customer,
  CustomerStat,
  DashboardStats,
  GenerateResponse,
  ImportRecord,
  Invoice,
  InventoryMovement,
  InventoryStat,
  LoginResponse,
  Order,
  ProductStat,
  PublicUser,
  Requisites,
  SessionRecord,
  SessionSummary
} from '@/types/domain';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  token: string | null,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(', ');
      else if (body.message) message = body.message;
    } catch {
      // Keep status text.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', null, {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  me: (token: string) => request<PublicUser>('/auth/me', token),
  users: (token: string) => request<PublicUser[]>('/users', token),
  createUser: (
    token: string,
    input: { name: string; email: string; password: string; role: 'admin' | 'user' }
  ) =>
    request<PublicUser>('/users', token, {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  updateUser: (
    token: string,
    id: string,
    input: Partial<{ name: string; email: string; password: string; role: 'admin' | 'user'; active: boolean }>
  ) =>
    request<PublicUser>(`/users/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify(input)
    }),
  catalog: (token: string) => request<CatalogProduct[]>('/catalog', token),
  createProduct: (token: string, product: CatalogProduct) =>
    request<CatalogProduct>('/catalog', token, {
      method: 'POST',
      body: JSON.stringify(product)
    }),
  updateProduct: (token: string, product: CatalogProduct) =>
    request<CatalogProduct>(`/catalog/${product.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        price: product.price
      })
    }),
  deleteProduct: (token: string, id: string) =>
    request<{ ok: true }>(`/catalog/${id}`, token, { method: 'DELETE' }),
  resetCatalog: (token: string) =>
    request<CatalogProduct[]>('/catalog/reset', token, { method: 'POST' }),
  requisites: (token: string) => request<Requisites>('/requisites', token),
  updateRequisites: (token: string, requisites: Requisites) =>
    request<Requisites>('/requisites', token, {
      method: 'PUT',
      body: JSON.stringify(requisites)
    }),
  resetRequisites: (token: string) =>
    request<Requisites>('/requisites/reset', token, { method: 'POST' }),
  generate: (token: string, input: { sapRaw: string; startId: number; dateIso: string }) =>
    request<GenerateResponse>('/invoices/generate', token, {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  manualInvoice: (
    token: string,
    input: {
      storeCode: string;
      storeName: string;
      address: string;
      order?: string;
      dateIso: string;
      startId: number;
      quantities: { sku: string; qty: number; price?: number }[];
      existingInvoices: unknown[];
    }
  ) =>
    request<{ invoice: GenerateResponse['invoices'][number]; catalog: CatalogProduct[] }>(
      '/invoices/manual',
      token,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    ),
  sessions: (token: string) => request<SessionSummary[]>('/sessions', token),
  session: (token: string, invoiceDate: string) =>
    request<SessionRecord>(`/sessions/${invoiceDate}`, token),
  saveSession: (
    token: string,
    input: { invoiceDate: string; invoiceCount: number; sumTotal: number; snapshot: unknown; name?: string }
  ) =>
    request<SessionRecord>('/sessions', token, {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  deleteSession: (token: string, invoiceDate: string) =>
    request<{ ok: true }>(`/sessions/${invoiceDate}`, token, { method: 'DELETE' }),
  invoices: (token: string) => request<Invoice[]>('/invoices', token),
  invoice: (token: string, invNo: number) => request<Invoice>(`/invoices/${invNo}`, token),
  updateInvoice: (token: string, invNo: number, input: Partial<Invoice>) =>
    request<Invoice>(`/invoices/${invNo}`, token, {
      method: 'PATCH',
      body: JSON.stringify(input)
    }),
  deleteInvoice: (token: string, invNo: number) =>
    request<Invoice>(`/invoices/${invNo}`, token, { method: 'DELETE' }),
  restoreInvoice: (token: string, invNo: number) =>
    request<Invoice>(`/invoices/${invNo}/restore`, token, { method: 'PATCH' }),
  deliverInvoice: (token: string, invNo: number) =>
    request<Invoice>(`/invoices/${invNo}/deliver`, token, { method: 'PATCH' }),
  undeliverInvoice: (token: string, invNo: number, comment: string) =>
    request<Invoice>(`/invoices/${invNo}/undeliver`, token, { method: 'PATCH', body: JSON.stringify({ comment }) }),
  orders: (token: string) => request<Order[]>('/orders', token),
  inventoryMovements: (token: string) => request<InventoryMovement[]>('/inventory/movements', token),
  createInventoryMovement: (
    token: string,
    input: Pick<InventoryMovement, 'dateIso' | 'productSku' | 'movementType' | 'quantity' | 'reference'>
  ) =>
    request<InventoryMovement>('/inventory/movements', token, {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  imports: (token: string) => request<ImportRecord[]>('/imports', token),
  createImport: (
    token: string,
    input: Pick<ImportRecord, 'fileName' | 'importedRecords' | 'errors' | 'errorDetails'>
  ) =>
    request<ImportRecord>('/imports', token, {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  uploadImport: (token: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<ImportRecord>('/imports/upload', token, {
      method: 'POST',
      body: form
    });
  },
  auditLogs: (token: string) => request<AuditLog[]>('/audit', token),

  // Customers
  customers: (token: string) => request<Customer[]>('/customers', token),
  customerNames: (token: string) => request<string[]>('/customers/names', token),
  createCustomer: (token: string, input: Pick<Customer, 'name' | 'phone' | 'address' | 'notes'>) =>
    request<Customer>('/customers', token, { method: 'POST', body: JSON.stringify(input) }),
  updateCustomer: (token: string, id: string, input: Partial<Customer>) =>
    request<Customer>(`/customers/${id}`, token, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteCustomer: (token: string, id: string) =>
    request<{ ok: true }>(`/customers/${id}`, token, { method: 'DELETE' }),

  // Orders with filters
  ordersFiltered: (
    token: string,
    params: { dateFrom?: string; dateTo?: string; customer?: string; status?: string }
  ) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>
    );
    return request<Order[]>(`/orders?${qs}`, token);
  },
  createOrder: (
    token: string,
    input: Pick<Order, 'customer' | 'deliveryDate' | 'items' | 'notes'>
  ) =>
    request<Order>('/orders', token, { method: 'POST', body: JSON.stringify(input) }),
  updateOrder: (
    token: string,
    id: string,
    input: Partial<Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'totalQty' | 'totalAmount'>>
  ) =>
    request<Order>(`/orders/${id}`, token, { method: 'PATCH', body: JSON.stringify(input) }),
  deliverOrder: (token: string, id: string) =>
    request<Order>(`/orders/${id}/deliver`, token, { method: 'PATCH' }),

  // Analytics
  dashboardStats: (token: string) => request<DashboardStats>('/analytics/dashboard', token),
  analyticsProducts: (token: string) => request<ProductStat[]>('/analytics/products', token),
  analyticsInventory: (token: string) => request<InventoryStat[]>('/analytics/inventory', token),
  analyticsCustomers: (token: string) => request<CustomerStat[]>('/analytics/customers', token),

  // Vazvrat
  uploadVazvrat: (token: string, records: import('@/types/domain').VazvratUploadItem[]) =>
    request<{ ok: boolean; inserted: number; dates: string[] }>('/vazvrat/upload', token, {
      method: 'POST',
      body: JSON.stringify({ records })
    }),
  queryVazvrat: (token: string, from: string, to: string) =>
    request<import('@/types/domain').VazvratRecord[]>(`/vazvrat?from=${from}&to=${to}`, token),
  vazvratDates: (token: string) =>
    request<string[]>('/vazvrat/dates', token),
  vazvratAnalytics: (token: string, from: string, to: string) =>
    request<{ sku: string; name: string; berilganQty: number; berilganSum: number; vazvratQty: number; vazvratSum: number }[]>(
      `/vazvrat/analytics?from=${from}&to=${to}`, token
    ),
  deleteVazvratByDate: (token: string, date: string) =>
    request<{ ok: boolean; deleted: number }>(`/vazvrat/by-date/${date}`, token, { method: 'DELETE' }),
  deleteAllVazvrat: (token: string) =>
    request<{ ok: boolean; deleted: number }>('/vazvrat/all', token, { method: 'DELETE' }),
};
