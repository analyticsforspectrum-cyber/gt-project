'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Download,
  FileText,
  Grid3x3,
  LogOut,
  Map,
  Plus,
  Printer,
  RefreshCcw,
  Save,
  Search,
  Settings,
  Shield,
  Table2,
  Trash2,
  TrendingUp,
  Truck,
  UserPlus,
  Users
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import {
  amountWords,
  buildSnapshot,
  DEFAULT_REQUISITES,
  downloadBlob,
  fmt,
  fmt0,
  fmtDateRu,
  parseNum,
  recomputeInvoice,
  todayIso
} from '@/lib/invoice';
import {
  AuditLog,
  CatalogProduct,
  Customer,
  CustomerStat,
  DashboardStats,
  DaySnapshot,
  ImportRecord,
  InventoryMovement,
  InventoryStat,
  Invoice,
  Order,
  OrderItem,
  ProductStat,
  PublicUser,
  Requisites,
  SessionSummary
} from '@/types/domain';

type View = 'register' | 'matrix' | 'documents' | 'stats' | 'settings' | 'operations' | 'customers' | 'analytics' | 'orders' | 'schedule' | 'dispatch' | 'undelivered';
type SettingsView = 'catalog' | 'requisites' | 'sessions' | 'users' | 'exceptions';
type AnalyticsTab = 'overview' | 'products' | 'inventory' | 'customers';
type Toast = { kind: 'ok' | 'err' | 'info'; text: string } | null;

const TOKEN_KEY = 'gde_tort_token';

/** "Korzinka Go - Bashlyk /1" → "Bashlyk" */
function shortMkt(name: string): string {
  // Remove "korzinka" word and its separators (case-insensitive)
  // e.g. "korzinka - Abay /1" → "Abay", "korzinka Abay" → "Abay", "Abay /1" → "Abay"
  let s = name.replace(/^korzinka\s*[-,]?\s*/i, '').trim();
  // Remove trailing store number like "/1", "/2"
  s = s.replace(/\s*\/\d+$/, '').trim();
  return s || name.replace(/\s*\/\d+$/, '').trim();
}

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sapRaw, setSapRaw] = useState('');
  const [startId, setStartId] = useState(16300);
  const [dateIso, setDateIso] = useState(todayIso());
  const [sessionSuffix, setSessionSuffix] = useState('');
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [catalogDraft, setCatalogDraft] = useState<CatalogProduct[]>([]);
  const [requisites, setRequisites] = useState<Requisites>(DEFAULT_REQUISITES);
  const [requisitesDraft, setRequisitesDraft] = useState<Requisites>(DEFAULT_REQUISITES);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [productStats, setProductStats] = useState<ProductStat[]>([]);
  const [inventoryStats, setInventoryStats] = useState<InventoryStat[]>([]);
  const [customerStats, setCustomerStats] = useState<CustomerStat[]>([]);
  // analyticsTab lives inside AnalyticsPane — removed from outer state
  const [orderFilters, setOrderFilters] = useState({ dateFrom: '', dateTo: '', customer: '', status: '' });
  const [orderCreateOpen, setOrderCreateOpen] = useState(false);
  const [newOrderCustomer, setNewOrderCustomer] = useState('');
  const [newOrderDeliveryDate, setNewOrderDeliveryDate] = useState(todayIso());
  const [newOrderNotes, setNewOrderNotes] = useState('');
  const [newOrderItems, setNewOrderItems] = useState<Array<{ sku: string; name: string; unit: string; qty: number; price: number }>>([]);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '', notes: '' });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [xlsSheets, setXlsSheets] = useState<string[]>([]);
  const [xlsSelectedSheet, setXlsSelectedSheet] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [xlsWorkbook, setXlsWorkbook] = useState<any>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<Invoice | null>(null);
  const [undeliverModal, setUndeliverModal] = useState<{ invNo: number; comment: string } | null>(null);
  const [restoreModal, setRestoreModal] = useState<{
    invNo: number;
    date: string;
    lines: { sku: string; name: string; unit: string; price: number; qty: number; initQty: number }[];
  } | null>(null);

  // Schedule (Grafik) state — persisted to localStorage
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('gdetort_schedule') || '[]') as ScheduleRow[]; } catch { return []; }
  });
  const [scheduleDrivers, setScheduleDrivers] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('gdetort_schedule_drivers') || '[]') as string[]; } catch { return []; }
  });
  const [exceptionDates, setExceptionDates] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('gdetort_exceptions') || '[]') as string[]; } catch { return []; }
  });

  // Dispatch state: per storeCode → { driverIdx, part }
  const [dispatchMap, setDispatchMap] = useState<Record<string, { driverIdx: number; part: number }>>({});
  const [dispatchPrintTarget, setDispatchPrintTarget] = useState<{ driverIdx: number; part: number } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [view, setView] = useState<View>('register');
  const [settingsView, setSettingsView] = useState<SettingsView>('catalog');
  const [pivotSearch, setPivotSearch] = useState('');
  const [hideZero, setHideZero] = useState(true);
  const [lang, setLang] = useState<'uz' | 'ru' | 'en'>(() =>
    typeof window !== 'undefined' ? ((localStorage.getItem('lang') as 'uz' | 'ru' | 'en') || 'uz') : 'uz'
  );
  const [unsaved, setUnsaved] = useState(false);
  const [printInvoices, setPrintInvoices] = useState<Invoice[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({
    storeCode: '',
    storeName: '',
    address: '',
    order: '',
    dateIso: todayIso()
  });
  // manualQty replaced by manualStores[ci].cells — removed
  // Multi-store manual: products = rows, stores = columns
  type StoreCol = { storeCode: string; storeName: string; order: string; cells: Record<string, { qty: string; price: string }> };
  const emptyStoreRow = (): StoreCol => ({ storeCode: '', storeName: '', order: '', cells: {} });
  const [manualStores, setManualStores] = useState<StoreCol[]>([emptyStoreRow()]);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user' as 'admin' | 'user'
  });

  const selectedInvoices = useMemo(() => {
    if (!selected.size) return invoices;
    return invoices.filter((invoice) => selected.has(invoice.invNo));
  }, [invoices, selected]);

  const totals = useMemo(
    () => {
      const active = invoices.filter((inv) => inv.status === 'delivered');
      return {
        count: invoices.filter((inv) => inv.status !== 'cancelled').length,
        qty: active.reduce((sum, inv) => sum + inv.sumQty, 0),
        sum: active.reduce((sum, inv) => sum + inv.sumTotal, 0),
      };
    },
    [invoices]
  );

  const showToast = useCallback((kind: NonNullable<Toast>['kind'], text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  const loadCore = useCallback(
    async (authToken: string, role?: string) => {
      const [catalogResult, requisitesResult, sessionsResult, ordersResult, inventoryResult, importsResult, auditResult, customersResult, statsResult] = await Promise.all([
        api.catalog(authToken),
        api.requisites(authToken),
        api.sessions(authToken),
        api.orders(authToken),
        api.inventoryMovements(authToken),
        role === 'admin' ? api.imports(authToken) : Promise.resolve([] as ImportRecord[]),
        role === 'admin' ? api.auditLogs(authToken) : Promise.resolve([] as AuditLog[]),
        api.customers(authToken),
        api.dashboardStats(authToken).catch(() => null),
      ]);
      setCatalog(catalogResult);
      setCatalogDraft(catalogResult);
      setRequisites(requisitesResult || DEFAULT_REQUISITES);
      setRequisitesDraft(requisitesResult || DEFAULT_REQUISITES);
      setSessions(sessionsResult);
      setOrders(ordersResult);
      setInventoryMovements(inventoryResult);
      setImports(importsResult);
      setAuditLogs(auditResult);
      setCustomers(customersResult);
      if (statsResult) setDashboardStats(statsResult);

      // Auto-restore latest session so all views have consistent data with init values
      if (sessionsResult.length > 0) {
        try {
          const latest = sessionsResult[0]; // sorted newest first
          const sessionRecord = await api.session(authToken, latest.invoiceDate);
          if (sessionRecord?.snapshot) {
            // restoreSnapshot needs setInvoices etc — call inline here
            const snap = sessionRecord.snapshot;
            setInvoices(snap.invoices || []);
            // Use live catalog (up-to-date prices); fall back to snapshot only if API failed
            setCatalog(catalogResult || snap.catalog);
            setCatalogDraft(catalogResult || snap.catalog);
            // Sync DB statuses on top of snapshot
            try {
              const dbInvoices = await api.invoices(authToken);
              const statusMap: Record<number, Invoice['status']> = {};
              for (const d of dbInvoices) statusMap[d.invNo] = d.status;
              setInvoices((prev) => prev.map((inv) => ({ ...inv, status: statusMap[inv.invNo] ?? inv.status ?? 'saved' })));
            } catch { /* ignore */ }
          }
        } catch { /* ignore — no session available */ }
      }
      if (role === 'admin') {
        const userResult = await api.users(authToken);
        setUsers(userResult);
      }
    },
    []
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setBooting(false);
      return;
    }
    api
      .me(saved)
      .then(async (me) => {
        setToken(saved);
        setUser(me);
        if (me.role === 'admin') setView('analytics');
        await loadCore(saved, me.role);
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setBooting(false));
  }, [loadCore]);

  useEffect(() => {
    const cleanup = () => setPrintInvoices([]);
    window.addEventListener('afterprint', cleanup);
    return () => window.removeEventListener('afterprint', cleanup);
  }, []);

  async function handleLogin(email: string, password: string) {
    setBusy(true);
    try {
      const result = await api.login(email, password);
      window.localStorage.setItem(TOKEN_KEY, result.accessToken);
      setToken(result.accessToken);
      setUser(result.user);
      await loadCore(result.accessToken, result.user.role);
      if (result.user.role === 'admin') setView('analytics');
      showToast('ok', 'Вход выполнен');
    } catch (error) {
      showToast('err', getError(error));
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setInvoices([]);
    setSelected(new Set());
    setView('register');
  }

  async function refreshSessions(authToken = token) {
    if (!authToken) return;
    const result = await api.sessions(authToken);
    setSessions(result);
  }

  async function generateInvoices(overrideSap?: string) {
    if (!token) return;
    const raw = overrideSap ?? sapRaw;
    if (!raw.trim()) {
      showToast('err', 'SAP faylini yuklang');
      return;
    }
    setBusy(true);
    try {
      const result = await api.generate(token, { sapRaw: raw, startId, dateIso });
      setInvoices(result.invoices);
      setCatalog(result.catalog);
      setCatalogDraft(result.catalog);
      setSelected(new Set(result.invoices.map((invoice) => invoice.invNo)));
      setUnsaved(false);
      setView('register');
      await refreshSessions();
      showToast('ok', `Готово: ${result.invoices.length} накладных из ${result.rows} строк`);
    } catch (error) {
      showToast('err', getError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrentSession(nextInvoices = invoices, nextCatalog = catalog, silent = false) {
    if (!token || !nextInvoices.length) return;
    const snapshot = buildSnapshot({
      invoiceDate: dateIso,
      startId,
      sapRaw,
      catalog: nextCatalog,
      invoices: nextInvoices
    });
    try {
      const sessionName = dateIso + (sessionSuffix.trim() ? ` ${sessionSuffix.trim()}` : '');
      await api.saveSession(token, {
        invoiceDate: dateIso,
        invoiceCount: nextInvoices.length,
        sumTotal: nextInvoices.reduce((sum, invoice) => sum + invoice.sumTotal, 0),
        snapshot,
        name: sessionName
      });
      setUnsaved(false);
      await refreshSessions();
      if (!silent) showToast('ok', 'Сессия сохранена');
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  function updateQty(invNo: number, lineIndex: number, value: string) {
    const qty = parseNum(value);
    setInvoices((previous) =>
      previous.map((invoice) => {
        if (invoice.invNo !== invNo) return invoice;
        const lines = invoice.lines.map((line, index) => {
          if (index !== lineIndex || line.init === 0) return line;
          return { ...line, qty };
        });
        return recomputeInvoice({ ...invoice, lines });
      })
    );
    setUnsaved(true);
  }

  async function createManualInvoice() {
    if (!token) return;
    // Validate: each store row must have storeCode + at least one qty
    const validRows = manualStores.filter((row) => {
      const hasCode = row.storeCode.trim();
      const hasQty = catalog.some((p) => parseNum(row.cells[p.sku]?.qty) > 0);
      return hasCode && hasQty;
    });
    if (!validRows.length) {
      showToast('err', "Do'kon kodi va kamida 1 mahsulot sonini kiriting");
      return;
    }
    setBusy(true);
    try {
      let currentInvoices = [...invoices];
      let lastCatalog = catalog;
      const addedNos: number[] = [];
      for (const row of validRows) {
        const quantities = catalog
          .map((p) => {
            const cell = row.cells[p.sku];
            const qty = parseNum(cell?.qty);
            if (qty <= 0) return null;
            // price displayed to user is with VAT; convert to pre-VAT for backend
            const userPrice = parseNum(cell?.price);
            const pricePreVat = userPrice > 0 ? Math.round((userPrice / 1.12) * 100) / 100 : undefined;
            return { sku: p.sku, qty, price: pricePreVat };
          })
          .filter((l): l is NonNullable<typeof l> => l !== null);
        const result = await api.manualInvoice(token, {
          storeCode: row.storeCode.trim(),
          storeName: row.storeName.trim() || row.storeCode.trim(),
          address: '',
          order: row.order.trim(),
          dateIso: manual.dateIso || dateIso,
          startId,
          quantities,
          existingInvoices: currentInvoices,
        });
        currentInvoices = [...currentInvoices, result.invoice];
        lastCatalog = result.catalog;
        addedNos.push(result.invoice.invNo);
      }
      setInvoices(currentInvoices);
      setCatalog(lastCatalog);
      setCatalogDraft(lastCatalog);
      setSelected((prev) => new Set([...prev, ...addedNos]));
      // Bump startId so next generate/manual won't collide with manually-created invoices
      if (addedNos.length > 0) setStartId(Math.max(...addedNos) + 1);
      setManualOpen(false);
      setManualStores([emptyStoreRow()]);
      setManual({ storeCode: '', storeName: '', address: '', order: '', dateIso });
      await saveCurrentSession(currentInvoices, lastCatalog, true);
      showToast('ok', addedNos.length === 1
        ? `Накладная № ${addedNos[0]} добавлена`
        : `${addedNos.length} ta nakladnoy qo'shildi: №${addedNos.join(', №')}`);
    } catch (error) {
      showToast('err', getError(error));
    } finally {
      setBusy(false);
    }
  }

  function restoreSnapshot(snapshot: DaySnapshot) {
    setSapRaw(snapshot.sapRaw || '');
    setStartId(snapshot.startId || 16300);
    setDateIso(snapshot.invoiceDate || todayIso());
    setCatalog(snapshot.catalog || []);
    setCatalogDraft(snapshot.catalog || []);
    setInvoices(snapshot.invoices || []);
    setSelected(new Set((snapshot.invoices || []).map((invoice) => invoice.invNo)));
    setUnsaved(false);
    setView('register');
  }

  async function loadSession(invoiceDate: string) {
    if (!token) return;
    try {
      const session = await api.session(token, invoiceDate);
      restoreSnapshot(session.snapshot);
      // Sync delivered status from DB
      try {
        const dbInvoices = await api.invoices(token);
        const statusByInvNo: Record<number, Invoice['status']> = {};
        for (const dbInv of dbInvoices) { statusByInvNo[dbInv.invNo] = dbInv.status; }
        setInvoices((prev) => prev.map((inv) => ({
          ...inv,
          status: statusByInvNo[inv.invNo] ?? inv.status ?? 'saved'
        })));
      } catch {
        // ignore — snapshot status is fine
      }
      showToast('ok', `Открыта сессия ${fmtDateRu(invoiceDate)}`);
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  async function deleteSession(invoiceDate: string) {
    if (!token || !window.confirm(`Удалить сессию ${fmtDateRu(invoiceDate)}?`)) return;
    try {
      await api.deleteSession(token, invoiceDate);
      await refreshSessions();
      showToast('ok', 'Сессия удалена');
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  async function saveCatalogDraft() {
    if (!token) return;
    setBusy(true);
    try {
      const saved = await Promise.all(
        catalogDraft.map((product) =>
          product.id ? api.updateProduct(token, product) : api.createProduct(token, product)
        )
      );
      setCatalog(saved);
      setCatalogDraft(saved);
      showToast('ok', 'Каталог сохранён');
    } catch (error) {
      showToast('err', getError(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(product: CatalogProduct) {
    if (!token) return;
    if (!product.id) {
      setCatalogDraft((previous) => previous.filter((item) => item !== product));
      return;
    }
    if (!window.confirm(`Удалить ${product.name}?`)) return;
    try {
      await api.deleteProduct(token, product.id);
      const next = catalogDraft.filter((item) => item.id !== product.id);
      setCatalog(next);
      setCatalogDraft(next);
      showToast('ok', 'Товар удалён');
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  async function resetCatalog() {
    if (!token || !window.confirm('Сбросить каталог к исходному списку?')) return;
    try {
      const result = await api.resetCatalog(token);
      setCatalog(result);
      setCatalogDraft(result);
      showToast('ok', 'Каталог сброшен');
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  async function saveRequisites() {
    if (!token) return;
    try {
      const result = await api.updateRequisites(token, requisitesDraft);
      setRequisites(result);
      setRequisitesDraft(result);
      showToast('ok', 'Реквизиты сохранены');
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  async function resetRequisites() {
    if (!token || !window.confirm('Сбросить реквизиты?')) return;
    try {
      const result = await api.resetRequisites(token);
      setRequisites(result);
      setRequisitesDraft(result);
      showToast('ok', 'Реквизиты сброшены');
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  async function createUser() {
    if (!token) return;
    try {
      const result = await api.createUser(token, newUser);
      setUsers((previous) => [result, ...previous]);
      setNewUser({ name: '', email: '', password: '', role: 'user' });
      showToast('ok', 'Пользователь создан');
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  async function toggleUserActive(target: PublicUser) {
    if (!token) return;
    try {
      const result = await api.updateUser(token, target.id, { active: !target.active });
      setUsers((previous) => previous.map((item) => (item.id === result.id ? result : item)));
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  async function uploadImportFile() {
    if (!token || !importFile) return;
    setUploading(true);
    try {
      const result = await api.uploadImport(token, importFile);
      setImports((previous) => [result, ...previous]);
      setImportFile(null);
      showToast('ok', `Импорт ${result.fileName} завершён`);
    } catch (error) {
      showToast('err', getError(error));
    } finally {
      setUploading(false);
    }
  }

  async function deleteInvoice(invNo: number) {
    if (!token) return;
    try {
      await api.deleteInvoice(token, invNo);
      // Keep in list as cancelled (matches DB state; snapshot stays consistent)
      setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: 'cancelled' } : inv));
      setInvoiceDetail(null);
      showToast('ok', `Накладная № ${invNo} ўчирилди`);
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  async function restoreInvoice(invNo: number) {
    if (!token) return;
    try {
      const updated = await api.restoreInvoice(token, invNo);
      setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: updated.status } : inv));
      setInvoiceDetail((prev) => prev?.invNo === invNo ? { ...prev, status: updated.status } : prev);
      showToast('ok', `Накладная № ${invNo} тикланди`);
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  function toggleDelivered(invNo: number, currentlyDelivered: boolean) {
    if (!token) return;
    if (currentlyDelivered) {
      // Turning OFF → show modal with mandatory comment
      setUndeliverModal({ invNo, comment: '' });
    } else {
      // Turning ON → optimistic update, rollback to previous status on error
      const prevStatus = invoices.find((inv) => inv.invNo === invNo)?.status ?? 'saved';
      setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: 'delivered' } : inv));
      api.deliverInvoice(token, invNo)
        .then((updated) => setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: updated.status } : inv)))
        .catch((error) => {
          setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: prevStatus } : inv));
          showToast('err', getError(error));
        });
    }
  }

  async function confirmUndeliver() {
    if (!token || !undeliverModal) return;
    const { invNo, comment } = undeliverModal;
    if (!comment.trim()) { showToast('err', 'Izoh kiritish majburiy!'); return; }
    setUndeliverModal(null);
    setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: 'saved' } : inv));
    try {
      const updated = await api.undeliverInvoice(token, invNo, comment.trim());
      setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, ...updated } : inv));
      showToast('ok', 'Yetkazib berish bekor qilindi');
    } catch (error) {
      setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: 'delivered' } : inv));
      showToast('err', getError(error));
    }
  }

  async function confirmRestore() {
    if (!token || !restoreModal) return;
    const { invNo, date, lines } = restoreModal;
    setRestoreModal(null);
    // Build updated lines with recalculated totals
    const updatedLines = lines.map((l) => ({
      sku: l.sku, name: l.name, unit: l.unit, price: l.price, qty: l.qty,
      init: l.initQty,
      cost:  Math.round(l.qty * l.price * 100) / 100,
      vat:   Math.round(l.qty * l.price * 0.12 * 100) / 100,
      total: Math.round(l.qty * l.price * 1.12 * 100) / 100,
    }));
    setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: 'delivered', dateIso: date, lines: updatedLines } : inv));
    try {
      const updated = await api.updateInvoice(token, invNo, { status: 'delivered', dateIso: date, lines: updatedLines } as any);
      setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, ...updated } : inv));
      showToast('ok', `✓ Nakl. №${invNo} tiklandi — ${fmtDateRu(date)}`);
    } catch (error) {
      setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: 'saved' } : inv));
      showToast('err', getError(error));
    }
  }

  async function toggleActive(invNo: number, currentlyCancelled: boolean) {
    if (!token) return;
    // Optimistic: cancelled → show 0 | active → show real values
    if (!currentlyCancelled) {
      // Turning OFF → cancelled (show 0)
      setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: 'cancelled' } : inv));
      try {
        await api.deleteInvoice(token, invNo);
      } catch (error) {
        setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: 'saved' } : inv));
        showToast('err', getError(error));
      }
    } else {
      // Turning ON → restore from DB
      setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: 'saved' } : inv));
      try {
        const updated = await api.restoreInvoice(token, invNo);
        // Replace entire invoice with fresh DB data (correct quantities)
        setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, ...updated } : inv));
      } catch (error) {
        setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: 'cancelled' } : inv));
        showToast('err', getError(error));
      }
    }
  }

  async function deliverOrder(orderId: string) {
    if (!token) return;
    try {
      const result = await api.deliverOrder(token, orderId);
      setOrders((previous) => previous.map((o) => (o.id === orderId ? result : o)));
      showToast('ok', 'Заказ доставлен');
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  async function createOrder() {
    if (!token || !newOrderCustomer || !newOrderItems.length) {
      showToast('err', 'Укажите клиента и хотя бы один товар');
      return;
    }
    try {
      const items = newOrderItems.filter((item) => item.qty > 0).map((item) => ({
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        qty: item.qty,
        price: item.price,
        total: Math.round(item.qty * item.price * 100) / 100
      }));
      const result = await api.createOrder(token, {
        customer: newOrderCustomer,
        deliveryDate: newOrderDeliveryDate,
        items,
        notes: newOrderNotes
      });
      setOrders((previous) => [result, ...previous]);
      setOrderCreateOpen(false);
      setNewOrderCustomer('');
      setNewOrderNotes('');
      setNewOrderItems([]);
      showToast('ok', 'Заказ создан');
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  async function createCustomer() {
    if (!token || !newCustomer.name.trim()) {
      showToast('err', 'Укажите имя клиента');
      return;
    }
    try {
      const result = await api.createCustomer(token, newCustomer);
      setCustomers((previous) => [result, ...previous]);
      setNewCustomerOpen(false);
      setNewCustomer({ name: '', phone: '', address: '', notes: '' });
      showToast('ok', 'Клиент создан');
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  async function loadAnalytics() {
    if (!token) return;
    try {
      const [stats, pStats, iStats, cStats] = await Promise.all([
        api.dashboardStats(token),
        api.analyticsProducts(token),
        api.analyticsInventory(token),
        api.analyticsCustomers(token)
      ]);
      setDashboardStats(stats);
      setProductStats(pStats);
      setInventoryStats(iStats);
      setCustomerStats(cStats);
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  function print(list = selectedInvoices) {
    if (!list.length) {
      showToast('err', 'Нет накладных для печати');
      return;
    }
    setPrintInvoices(list);
    window.setTimeout(() => window.print(), 80);
  }

  async function exportXlsx() {
    if (!invoices.length) return;
    const XLSX = await import('xlsx');

    function styledSheet(headers: string[], data: (string | number)[][]): ReturnType<typeof XLSX.utils.aoa_to_sheet> {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const orange = { fgColor: { rgb: 'E8651A' } };
      const headerStyle = { fill: orange, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center' }, border: { bottom: { style: 'thin', color: { rgb: '000000' } } } };
      const evenStyle = { fill: { fgColor: { rgb: 'FDE0CC' } } };
      headers.forEach((_, ci) => {
        const addr = XLSX.utils.encode_cell({ r: 0, c: ci });
        if (!ws[addr]) ws[addr] = { v: headers[ci], t: 's' };
        ws[addr].s = headerStyle;
      });
      data.forEach((row, ri) => {
        row.forEach((_, ci) => {
          const addr = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
          if (ws[addr] && ri % 2 === 0) ws[addr].s = evenStyle;
        });
      });
      ws['!cols'] = headers.map((h, ci) => ({ wch: Math.min(Math.max(h.length, ...data.map((r) => String(r[ci] ?? '').length)) + 2, 30) }));
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      return ws;
    }

    // Sheet 1: full detail register
    const reestrHeaders = ['№ счёта', '№ заказа', 'Код', 'Магазин', 'Дата', 'Артикул', 'Товар', 'Ед.', 'Заказ', 'Скидка', 'Отгружено', 'Цена', 'Стоимость', 'НДС', 'Сумма с НДС'];
    const reestrData: (string | number)[][] = [];
    for (const inv of invoices) {
      for (const line of inv.lines) {
        if (!line.qty) continue;
        const ordered = line.init ?? line.qty;
        reestrData.push([inv.invNo, inv.order, inv.storeCode, shortMkt(inv.market), fmtDateRu(inv.dateIso), line.sku, line.name, line.unit, ordered, ordered - line.qty, line.qty, line.price, line.cost, line.vat, line.total]);
      }
    }

    // Sheet 2: summary (delta)
    const summaryHeaders = ['№ счёта', 'Магазин', '№ заказа', 'Дата', 'Было, шт', 'Финал, шт', 'Изменение, шт', 'Было с НДС', 'Финал с НДС', 'Изменение с НДС', 'Изм. строк'];
    const summaryData = invoices.map((inv) => {
      const initQty = inv.lines.reduce((s, l) => s + l.init, 0);
      const initSum = Math.round(inv.lines.reduce((s, l) => s + l.init * l.price * 1.12, 0));
      return [inv.invNo, inv.market, inv.order, fmtDateRu(inv.dateIso), initQty, inv.sumQty, inv.sumQty - initQty, initSum, Math.round(inv.sumTotal), Math.round(inv.sumTotal - initSum), inv.lines.filter((l) => l.qty !== l.init).length] as (string | number)[];
    });

    // Sheet 3: changed lines only
    const detailHeaders = ['№ счёта', 'Магазин', '№ заказа', 'SKU', 'Товар', 'Ед.', 'Было', 'Стало', 'Дельта', 'Цена', 'Сумма дельты с НДС'];
    const detailData = invoices.flatMap((inv) =>
      inv.lines.filter((l) => l.qty !== l.init).map((l): (string | number)[] =>
        [inv.invNo, inv.market, inv.order, l.sku, l.name, l.unit, l.init, l.qty, l.qty - l.init, l.price, Math.round((l.qty - l.init) * l.price * 1.12)]
      )
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, styledSheet(reestrHeaders, reestrData), 'Реестр');
    XLSX.utils.book_append_sheet(wb, styledSheet(summaryHeaders, summaryData), 'Заказы финал');
    XLSX.utils.book_append_sheet(wb, styledSheet(detailHeaders, detailData), 'Изменения');
    XLSX.writeFile(wb, `reestr_${dateIso}.xlsx`);
  }

  if (booting) {
    return <div className="boot">ГДЕ ТОРТ?</div>;
  }

  if (!user || !token) {
    return <LoginScreen busy={busy} onLogin={handleLogin} toast={toast} />;
  }

  const isAdmin = user.role === 'admin';
  const T = (key: string) => t(lang, key);
  const dayNames = tDays(lang);
  const dayNamesFull = tDaysFull(lang);
  const matrixIndices = catalog
    .map((product, index) => ({ product, index }))
    .filter(({ product, index }) => {
      const q = pivotSearch.trim().toLowerCase();
      if (q && !product.name.toLowerCase().includes(q) && !product.sku.toLowerCase().includes(q)) return false;
      if (hideZero) {
        const total = invoices.reduce((sum, invoice) => sum + (invoice.lines[index]?.qty || 0), 0);
        if (total === 0) return false;
      }
      return true;
    });

  return (
    <>
      <div className="screen shell">
        <header className="topbar">
          <div className="brandblock">
            <div className="brandmark">GT</div>
            <div>
              <div className="brandtitle">ГДЕ ТОРТ?</div>
              <div className="brandsub">накладные · счёт-фактура</div>
            </div>
          </div>
          <div className="topstats">
            {/* Session date switcher */}
            {sessions.length > 0 && (
              <select
                value={dateIso}
                onChange={(e) => { if (e.target.value) void loadSession(e.target.value); }}
                title="Sessiyani tanlang"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', color: '#fff', borderRadius: 8, padding: '3px 8px', fontSize: 12, cursor: 'pointer', maxWidth: 130 }}
              >
                {sessions.map((s) => (
                  <option key={s.invoiceDate} value={s.invoiceDate}>
                    {fmtDateRu(s.invoiceDate)} · {s.invoiceCount} nakl
                  </option>
                ))}
              </select>
            )}
            <span>{totals.count} {T('lbl_invoices')}</span>
            <span>{fmt0(totals.qty)} {T('lbl_pcs')}</span>
            <span>{fmt0(totals.sum)} {T('lbl_sum')}</span>
            {unsaved && <b>{T('lbl_unsaved')}</b>}
          </div>
          <div className="userbar">
            <select
              value={lang}
              onChange={(e) => { const l = e.target.value as Lang; setLang(l); localStorage.setItem('lang', l); }}
              style={{ background: 'rgba(255,255,255,0.10)', border: '0.5px solid rgba(255,255,255,0.18)', color: '#fff', borderRadius: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
            >
              <option value="uz">UZ</option>
              <option value="ru">RU</option>
              <option value="en">EN</option>
            </select>
            <span className="rolechip">{user.role}</span>
            <span className="username-label">{user.name}</span>
            <button className="iconbtn" type="button" onClick={logout} title={T('lbl_logout')}>
              <LogOut size={17} />
            </button>
          </div>
        </header>


        <nav className="sidebar">
          {!isAdmin && <Tab active={view === 'orders'}     icon={<ClipboardList size={18} />} label={T('nav_orders')}    onClick={() => setView('orders')} />}
          <Tab             active={view === 'register'}    icon={<FileText size={18} />}      label={T('nav_register')}  onClick={() => setView('register')} />
          {!isAdmin && <Tab active={view === 'matrix'}     icon={<Grid3x3 size={18} />}       label={T('nav_matrix')}    onClick={() => setView('matrix')} />}
          {!isAdmin && <Tab active={view === 'documents'}  icon={<Printer size={18} />}       label={T('nav_docs')}      onClick={() => setView('documents')} />}
          {!isAdmin && <Tab active={view === 'dispatch'}   icon={<Truck size={18} />}         label={T('nav_dispatch')}  onClick={() => setView('dispatch')} />}
          <Tab             active={view === 'schedule'}    icon={<Map size={18} />}            label={T('nav_schedule')}  onClick={() => setView('schedule')} />
          {!isAdmin && <Tab active={view === 'stats'}      icon={<TrendingUp size={18} />}    label={T('nav_stats')}     onClick={() => setView('stats')} />}
          {!isAdmin && <Tab active={view === 'customers'}  icon={<Users size={18} />}         label={T('nav_clients')}   onClick={() => setView('customers')} />}
          {isAdmin  && <Tab active={view === 'analytics'}  icon={<BarChart3 size={18} />}     label={T('nav_analytics')} onClick={() => { setView('analytics'); void loadAnalytics(); }} />}
          <Tab             active={view === 'undelivered'} icon={<AlertTriangle size={18} />} label="Qaytgan" onClick={() => setView('undelivered')}
            badge={invoices.filter(i => i.status === 'saved').length || undefined} />
          <Tab             active={view === 'settings'}    icon={<Settings size={18} />}      label={T('nav_settings')}  onClick={() => setView('settings')} />
        </nav>

        <main className="workspace">
          {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}

          {view === 'register' && (
            <section className="pane">
              <PaneHead
                title={T('reg_title')}
                meta={invoices.length ? `${invoices.length} ${T('reg_meta_docs')} · ${fmt0(totals.sum)} ${T('lbl_sum')}` : '—'}
                actions={
                  <>
                    <button className="small dark" type="button" onClick={() => setManualOpen(true)}>
                      <Plus size={15} /> {T('reg_manual')}
                    </button>
                    <button className="small" type="button" disabled={!invoices.length} onClick={exportXlsx}>
                      <Download size={15} /> Excel
                    </button>
                  </>
                }
              />
              {!invoices.length ? (
                <Empty title={T('reg_empty')} />
              ) : (
                <div className="tablewrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th className="check" title="Faol/bekor">●</th>
                        <th className="check" title={T('lbl_delivered')}>✓</th>
                        <th>№</th>
                        <th>{T('lbl_order')}</th>
                        <th>{T('lbl_store')}</th>
                        <th className="right">{T('lbl_pcs')}</th>
                        <th className="right">{T('lbl_total')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => (
                        <tr
                          key={invoice.invNo}
                          className={[selected.has(invoice.invNo) ? 'picked' : '', invoice.status !== 'delivered' ? 'cancelled-row' : ''].join(' ')}
                          style={invoice.status !== 'delivered' ? { opacity: 0.45 } : undefined}
                        >
                          <td className="check">
                            <input
                              type="checkbox"
                              checked={invoice.status !== 'cancelled'}
                              style={{ cursor: 'pointer' }}
                              onChange={() => toggleActive(invoice.invNo, invoice.status === 'cancelled')}
                            />
                          </td>
                          <td className="check" title={invoice.status === 'saved' && invoice.undeliverComment ? `⚠️ ${invoice.undeliverComment}` : undefined}>
                            <input
                              type="checkbox"
                              checked={invoice.status === 'delivered'}
                              style={{ accentColor: 'var(--ok)', cursor: 'pointer' }}
                              onChange={() => toggleDelivered(invoice.invNo, invoice.status === 'delivered')}
                            />
                          </td>
                          <td>
                            <button className="linklike" type="button" onClick={() => setInvoiceDetail(invoice)}>
                              <span className="invoiceNo">{invoice.invNo}</span>
                            </button>
                            {invoice.originalDateIso && invoice.originalDateIso !== invoice.dateIso && (
                              <span title={`Ko'chirilgan: ${fmtDateRu(invoice.originalDateIso)} → ${fmtDateRu(invoice.dateIso)}`}
                                style={{ marginLeft: 5, fontSize: 10, background: 'rgba(99,179,237,0.18)', color: '#63b3ed', borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle', cursor: 'default' }}>
                                📅 {fmtDateRu(invoice.dateIso)}
                              </span>
                            )}
                          </td>
                          <td className="mono">{invoice.order}</td>
                          <td>
                            {invoice.market}
                            <span className="muted"> {invoice.storeCode}</span>
                          </td>
                          <td className="right mono" style={invoice.status !== 'delivered' ? { color: 'var(--muted)' } : undefined}>
                            {invoice.status !== 'delivered' ? '0' : fmt0(invoice.sumQty)}
                          </td>
                          <td className="right mono" style={invoice.status !== 'delivered' ? { color: 'var(--muted)' } : undefined}>
                            {invoice.status !== 'delivered' ? '0' : fmt(invoice.sumTotal)}
                          </td>
                          <td className="actions">
                            <button className="mini" type="button" onClick={() => print([invoice])}>
                              <Printer size={14} /> {T('lbl_print')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Undeliver confirmation modal */}
          {undeliverModal && (
            <div className="modalBackdrop" onClick={() => setUndeliverModal(null)}>
              <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
                <div className="modalHead">
                  <h3>⚠️ Yetkazib berishni bekor qilish</h3>
                  <button className="iconbtn" type="button" onClick={() => setUndeliverModal(null)}>✕</button>
                </div>
                <div className="modalBody" style={{ padding: '20px 24px' }}>
                  <p style={{ color: 'var(--muted)', marginBottom: 12, fontSize: 14 }}>
                    Nakl. №{undeliverModal.invNo} uchun delivery statusini o&apos;chiryapsiz. Sabab ko&apos;rsatish <b style={{ color: 'var(--fg)' }}>majburiy</b>:
                  </p>
                  <textarea
                    autoFocus
                    rows={3}
                    placeholder="Izoh kiriting (masalan: noto'g'ri belgilandi, mijoz rad etdi...)"
                    value={undeliverModal.comment}
                    onChange={(e) => setUndeliverModal({ ...undeliverModal, comment: e.target.value })}
                    style={{
                      width: '100%', boxSizing: 'border-box', resize: 'vertical',
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                      borderRadius: 8, color: 'inherit', fontSize: 14, padding: '8px 12px',
                      fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                </div>
                <div className="modalFoot" style={{ gap: 8 }}>
                  <button className="small" type="button" onClick={() => setUndeliverModal(null)}>Bekor</button>
                  <button
                    className="small"
                    type="button"
                    style={{ background: 'var(--danger, #e53e3e)', color: '#fff', opacity: undeliverModal.comment.trim() ? 1 : 0.4 }}
                    onClick={confirmUndeliver}
                  >
                    Tasdiqlash
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Restore modal — pick delivery date */}
          {restoreModal && (
            <div className="modalBackdrop" onClick={() => setRestoreModal(null)}>
              <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
                <div className="modalHead">
                  <h3>↩ Nakl. №{restoreModal.invNo} — tiklash</h3>
                  <button className="iconbtn" type="button" onClick={() => setRestoreModal(null)}>✕</button>
                </div>
                <div className="modalBody" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Date picker */}
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Yetkazib berish sanasi</label>
                    <input
                      type="date"
                      autoFocus
                      value={restoreModal.date}
                      onChange={(e) => setRestoreModal({ ...restoreModal, date: e.target.value })}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                        borderRadius: 8, color: 'inherit', fontSize: 14, padding: '8px 12px',
                        fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                  </div>
                  {/* Editable product lines */}
                  {restoreModal.lines.length > 0 && (
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Mahsulotlar (sonini o&apos;zgartiring)</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                        {restoreModal.lines.map((line, i) => (
                          <div key={line.sku} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                            <div style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(line.price * 1.12)} so&apos;m / {line.unit}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              <button type="button"
                                style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                                onClick={() => {
                                  const updated = restoreModal.lines.map((l, idx) => idx === i ? { ...l, qty: Math.max(0, l.qty - 1) } : l);
                                  setRestoreModal({ ...restoreModal, lines: updated });
                                }}>−</button>
                              <input
                                type="number" min={0} max={line.initQty}
                                value={line.qty}
                                onChange={(e) => {
                                  const v = Math.max(0, Math.min(line.initQty, parseInt(e.target.value) || 0));
                                  const updated = restoreModal.lines.map((l, idx) => idx === i ? { ...l, qty: v } : l);
                                  setRestoreModal({ ...restoreModal, lines: updated });
                                }}
                                style={{ width: 48, textAlign: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, color: 'inherit', fontSize: 14, padding: '3px 4px', fontFamily: 'var(--mono)' }}
                              />
                              <button type="button"
                                style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                                onClick={() => {
                                  const updated = restoreModal.lines.map((l, idx) => idx === i ? { ...l, qty: Math.min(l.initQty, l.qty + 1) } : l);
                                  setRestoreModal({ ...restoreModal, lines: updated });
                                }}>+</button>
                              <span style={{ fontSize: 11, color: line.qty < line.initQty ? '#ffa500' : 'var(--muted)', minWidth: 30, textAlign: 'right' }}>
                                /{line.initQty}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Jami dona: <b style={{ color: 'var(--fg)' }}>{restoreModal.lines.reduce((s, l) => s + l.qty, 0)}</b></span>
                        <span>Jami summa: <b style={{ color: 'var(--honey)' }}>{fmt(restoreModal.lines.reduce((s, l) => s + Math.round(l.qty * l.price * 1.12 * 100) / 100, 0))}</b></span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="modalFoot" style={{ gap: 8 }}>
                  <button className="small" type="button" onClick={() => setRestoreModal(null)}>Bekor</button>
                  <button
                    className="small" type="button"
                    style={{ background: 'rgba(47,209,88,0.18)', color: 'var(--ok)', borderColor: 'rgba(47,209,88,0.3)' }}
                    onClick={confirmRestore}
                  >✓ Tiklash</button>
                </div>
              </div>
            </div>
          )}

          {/* Invoice detail modal */}
          {invoiceDetail && (
            <div className="modalBackdrop" onClick={() => setInvoiceDetail(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
                <div className="modalHead">
                  <h3>№ {invoiceDetail.invNo} — {shortMkt(invoiceDetail.market)}</h3>
                  <button className="iconbtn" type="button" onClick={() => setInvoiceDetail(null)}>✕</button>
                </div>
                <div className="modalBody">
                  <div className="ledger" style={{ marginTop: 0, marginBottom: 14 }}>
                    <div><span>{T('lbl_store')}</span><b style={{ fontSize: 13 }}>{invoiceDetail.market} <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 11 }}>({invoiceDetail.storeCode})</span></b></div>
                    <div><span>{T('lbl_order')}</span><b>{invoiceDetail.order || '—'}</b></div>
                    <div><span>{T('lbl_date')}</span><b>{fmtDateRu(invoiceDetail.dateIso)}</b></div>
                    <div><span>{T('lbl_total')}</span><b style={{ color: 'var(--honey)', fontSize: 15 }}>{fmt(invoiceDetail.sumTotal)} {T('lbl_sum')}</b></div>
                    <div><span>Status</span><b style={{ color: invoiceDetail.status === 'delivered' ? 'var(--ok)' : invoiceDetail.status === 'cancelled' ? 'var(--danger)' : 'var(--muted)' }}>
                      {invoiceDetail.status === 'delivered' ? '✓ Yetkazildi' : invoiceDetail.status === 'cancelled' ? '✗ Bekor' : '— Yetkazilmagan'}
                    </b></div>
                    {invoiceDetail.status === 'saved' && invoiceDetail.undeliverComment && (
                      <div style={{ gridColumn: '1 / -1', background: 'rgba(255,160,0,0.10)', border: '1px solid rgba(255,160,0,0.25)', borderRadius: 8, padding: '8px 12px', marginTop: 4 }}>
                        <span style={{ color: 'var(--muted)', fontSize: 12, display: 'block', marginBottom: 3 }}>
                          ⚠️ Bekor qilish sababi{invoiceDetail.undeliveredAt ? ` · ${new Date(invoiceDetail.undeliveredAt).toLocaleString('uz-UZ')}` : ''}:
                        </span>
                        <b style={{ fontSize: 13, color: '#ffa500' }}>{invoiceDetail.undeliverComment}</b>
                      </div>
                    )}
                  </div>
                  <div className="tablewrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
                    <table className="data compact">
                      <thead>
                        <tr><th>{T('lbl_product')}</th><th className="right">{T('lbl_qty')}</th><th className="right">{T('lbl_total')}</th></tr>
                      </thead>
                      <tbody>
                        {invoiceDetail.lines.filter((l) => l.qty > 0).map((line, i) => (
                          <tr key={i}>
                            <td>{line.name}</td>
                            <td className="right mono">{fmt0(line.qty)}</td>
                            <td className="right mono">{fmt(line.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="modalFoot">
                  <button className="small" type="button" onClick={() => print([invoiceDetail])}>
                    <Printer size={14} /> {T('lbl_print')}
                  </button>
                  {invoiceDetail.status === 'cancelled' ? (
                    <button className="small" type="button" style={{ color: 'var(--ok)', borderColor: 'rgba(47,209,88,0.3)' }} onClick={() => { restoreInvoice(invoiceDetail.invNo); setInvoiceDetail(null); }}>
                      ↩ {T('lbl_restore')}
                    </button>
                  ) : (
                    <button
                      className="small"
                      type="button"
                      style={{ color: 'var(--danger)', borderColor: 'rgba(255,69,58,0.3)' }}
                      onClick={() => {
                        if (window.confirm(`${T('lbl_delete')}?`)) {
                          void deleteInvoice(invoiceDetail.invNo);
                        }
                      }}
                    >
                      <Trash2 size={13} /> {T('lbl_delete')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {view === 'matrix' && (
            <section className="pane">
              <PaneHead
                title={T('matrix_title')}
                meta={`${matrixIndices.length} / ${catalog.length}`}
                actions={
                  <>
                    <label className="searchbox">
                      <Search size={16} />
                      <input value={pivotSearch} onChange={(event) => setPivotSearch(event.target.value)} placeholder={T('lbl_product')} />
                    </label>
                    <label className="toggle">
                      <input type="checkbox" checked={hideZero} onChange={(event) => setHideZero(event.target.checked)} />
                      {T('hide_zeros')}
                    </label>
                    <button className="small dark" type="button" disabled={!invoices.length} onClick={() => saveCurrentSession()}>
                      <Save size={15} /> {unsaved ? `${T('lbl_save')} *` : T('lbl_save')}
                    </button>
                  </>
                }
              />
              {!invoices.length ? (
                <Empty title={T('docs_empty')} />
              ) : (
                <div className="matrixwrap">
                  <table className="matrix">
                    <thead>
                      <tr>
                        <th className="productcol">{T('matrix_product')}</th>
                        <th className="totcol">{T('matrix_total')}</th>
                        {invoices.map((invoice) => (
                          <th key={invoice.invNo}>
                            <span>№ {invoice.invNo}</span>
                            <small>{invoice.market}</small>
                            <em>{invoice.order}</em>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixIndices.map(({ product, index }, rowIdx) => {
                        const rowTotal = invoices.reduce((acc, inv) => acc + (inv.lines[index]?.qty || 0), 0);
                        const initTotal = invoices.reduce((acc, inv) => acc + (inv.lines[index]?.init || 0), 0);
                        return (
                          <tr key={`${product.sku}-${index}`} className={rowIdx % 2 === 0 ? 'row-even' : 'row-odd'} style={rowTotal === 0 ? { opacity: 0.4 } : undefined}>
                            <td className="productcol">
                              <b>{product.name}</b>
                              <span>{product.sku}</span>
                            </td>
                            <td className="totcol">
                              <b>{rowTotal > 0 ? fmt0(rowTotal) : <span className="muted">—</span>}</b>
                              {initTotal > 0 && rowTotal < initTotal && (
                                <span style={{ color: 'var(--danger)', fontSize: 10, display: 'block' }}>/{fmt0(initTotal)}</span>
                              )}
                            </td>
                            {invoices.map((invoice, colIdx) => {
                              const line = invoice.lines[index];
                              const locked = !line || line.init === 0;
                              const changed = !!line && line.qty !== line.init && line.qty > 0;
                              return (
                                <td key={`${invoice.invNo}-${product.sku}`} className={changed ? 'changed' : locked ? 'locked' : ''}>
                                  {locked ? null : (
                                    <input
                                      data-row={rowIdx}
                                      data-col={colIdx}
                                      value={line?.qty ?? ''}
                                      onChange={(event) => {
                                        const val = parseNum(event.target.value);
                                        const max = line?.init ?? 0;
                                        if (val > max) return;
                                        updateQty(invoice.invNo, index, event.target.value);
                                        if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
                                        autosaveTimer.current = setTimeout(() => saveCurrentSession(undefined, undefined, true), 2000);
                                      }}
                                      onKeyDown={(event) => {
                                        const dirs: Record<string, [number, number]> = {
                                          ArrowRight: [0, 1], ArrowLeft: [0, -1],
                                          ArrowDown: [1, 0], ArrowUp: [-1, 0], Enter: [1, 0]
                                        };
                                        if (!dirs[event.key]) return;
                                        event.preventDefault();
                                        const [dr, dc] = dirs[event.key];
                                        const r = Number(event.currentTarget.getAttribute('data-row'));
                                        const c = Number(event.currentTarget.getAttribute('data-col'));
                                        const nRows = matrixIndices.length;
                                        const nCols = invoices.length;
                                        let nr = r + dr, nc = c + dc;
                                        for (let attempt = 0; attempt < nRows * nCols; attempt++) {
                                          if (nc < 0) { nc = nCols - 1; nr--; }
                                          if (nc >= nCols) { nc = 0; nr++; }
                                          if (nr < 0) nr = nRows - 1;
                                          if (nr >= nRows) nr = 0;
                                          const el = document.querySelector<HTMLInputElement>(`input[data-row="${nr}"][data-col="${nc}"]`);
                                          if (el) { el.focus(); el.select(); break; }
                                          nr += dr; nc += dc;
                                        }
                                      }}
                                      inputMode="decimal"
                                      placeholder=""
                                      title={line?.init ? `Макс: ${line.init}` : ''}
                                    />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="productcol">{T('matrix_total')}, {T('lbl_pcs')}</td>
                        <td className="totcol"><b>{fmt0(invoices.reduce((acc, inv) => acc + inv.sumQty, 0))}</b></td>
                        {invoices.map((invoice) => (
                          <td key={invoice.invNo}>{fmt0(invoice.sumQty)}</td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>
          )}

          {view === 'orders' && (
            <section className="pane">
              <PaneHead
                title={T('sap_title')}
                meta={sapRaw ? `${invoices.length} ${T('sap_meta_ready')}` : T('sap_meta_empty')}
                actions={null}
              />

              {/* Upload card */}
              <div className="importCard">
                <div className="importUploadArea">
                  <label className="uploadZone">
                    <input
                      type="file"
                      accept=".xls,.xlsx"
                      style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) { setSapRaw(''); setXlsSheets([]); setXlsSelectedSheet(''); setXlsWorkbook(null); return; }
                        try {
                          const XLSX = await import('xlsx');
                          const buf = await file.arrayBuffer();
                          const wb = XLSX.read(buf, { type: 'array' });
                          setXlsWorkbook(wb);
                          setXlsSheets(wb.SheetNames as string[]);
                          const defaultSheet = wb.SheetNames[1] ?? wb.SheetNames[0];
                          setXlsSelectedSheet(defaultSheet as string);
                          const ws = wb.Sheets[defaultSheet];
                          const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
                          setSapRaw(rows.map((r) => r.join('\t')).join('\n'));
                          showToast('ok', `Fayl yuklandi: ${rows.length} qator (list: ${defaultSheet})`);
                        } catch {
                          showToast('err', 'Faylni o\'qishda xatolik');
                        }
                      }}
                    />
                    <div className="uploadZoneInner">
                      <FileText size={32} strokeWidth={1.5} style={{ color: 'var(--berry)', marginBottom: 8 }} />
                      <span className="uploadZoneTitle">{sapRaw ? '✓ Fayl yuklandi' : 'Excel faylni tanlang'}</span>
                      <span className="uploadZoneSub">.xls yoki .xlsx formatda</span>
                    </div>
                  </label>
                </div>

                <div className="importFields">
                  {xlsSheets.length > 1 && (
                    <label className="field">
                      <span>Varaq (list)</span>
                      <select
                        value={xlsSelectedSheet}
                        onChange={async (e) => {
                          const sheetName = e.target.value;
                          setXlsSelectedSheet(sheetName);
                          if (!xlsWorkbook) return;
                          const XLSX = await import('xlsx');
                          const ws = xlsWorkbook.Sheets[sheetName];
                          const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
                          setSapRaw(rows.map((r) => r.join('\t')).join('\n'));
                          showToast('info', `List o'zgartirildi: ${sheetName}`);
                        }}
                      >
                        {xlsSheets.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="field">
                    <span>Sana</span>
                    <input type="date" value={dateIso} onChange={(e) => setDateIso(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>{T('lbl_order')} №</span>
                    <input type="number" value={startId} onChange={(e) => setStartId(Number(e.target.value))} />
                  </label>
                  <label className="field">
                    <span>Sessiya nomi</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 13, whiteSpace: 'nowrap' }}>{dateIso}</span>
                      <input
                        type="text"
                        placeholder="qo'shimcha (ixtiyoriy)"
                        value={sessionSuffix}
                        onChange={(e) => setSessionSuffix(e.target.value)}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                    </div>
                  </label>
                </div>
              </div>

              {/* Action buttons */}
              <div className="importActions">
                <button className="command primary" type="button" disabled={busy || !sapRaw} onClick={() => generateInvoices()}>
                  <FileText size={17} /> {T('sap_title')}
                </button>
                <button className="command ghost" type="button" disabled={busy || !invoices.length} onClick={() => saveCurrentSession()}>
                  <Save size={17} /> {T('lbl_save')}
                </button>
              </div>

              {/* Summary */}
              {invoices.length > 0 && (
                <div className="ledger">
                  <div><span>№</span><b>{invoices[0].invNo}–{invoices[invoices.length - 1].invNo}</b></div>
                  <div><span>{T('stats_invoices')}</span><b>{invoices.length}</b></div>
                  <div><span>{T('lbl_total')}</span><b>{fmt0(totals.sum)} {T('lbl_sum')}</b></div>
                  <div><span>{T('lbl_selected')}</span><b>{selected.size || invoices.length}</b></div>
                </div>
              )}
            </section>
          )}

          {view === 'schedule' && (
            <SchedulePane
              scheduleRows={scheduleRows}
              setScheduleRows={setScheduleRows}
              setScheduleDrivers={setScheduleDrivers}
              invoices={invoices}
              dateIso={dateIso}
              exceptionDates={exceptionDates}
              showToast={showToast}
              dayNames={dayNames}
              dayNamesFull={dayNamesFull}
              T={T}
              isAdmin={isAdmin}
            />
          )}

          {view === 'dispatch' && (
            <DispatchPane
              invoices={invoices}
              catalog={catalog}
              scheduleRows={scheduleRows}
              scheduleDrivers={scheduleDrivers}
              dispatchMap={dispatchMap}
              setDispatchMap={setDispatchMap}
              dateIso={dateIso}
              T={T}
            />
          )}

          {view === 'documents' && (
            <section className="pane docsPane">
              <PaneHead
                title={T('docs_title')}
                meta={`${selectedInvoices.length}`}
                actions={
                  <button className="small dark" type="button" disabled={!selectedInvoices.length} onClick={() => print(selectedInvoices)}>
                    <Printer size={15} /> {T('docs_print_sel')}
                  </button>
                }
              />
              {!invoices.length ? (
                <Empty title={T('docs_empty')} />
              ) : (
                <div className="docgrid">
                  {invoices.map((invoice) => (
                    <article key={invoice.invNo} className="paper">
                      <div className="paperTools">
                        <span>№ {invoice.invNo}</span>
                        <button className="mini" type="button" onClick={() => print([invoice])}>
                          <Printer size={14} /> {T('lbl_print')}
                        </button>
                      </div>
                      <InvoiceDocument invoice={invoice} requisites={requisites} />
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {view === 'stats' && <StatsPane invoices={invoices} catalog={catalog} sessions={sessions} isAdmin={isAdmin} T={T} />}

          {view === 'operations' && (
            <section className="pane">
              <PaneHead
                title={T('ops_title')}
                meta={`${orders.length} · ${inventoryMovements.length}`}
                actions={
                  <button className="small" type="button" onClick={() => loadCore(token!, user?.role)}>
                    <RefreshCcw size={15} />
                  </button>
                }
              />
              <div className="kpis">
                <Kpi label={T('ops_orders')} value={fmt0(orders.length)} />
                <Kpi label={T('ops_moves')} value={fmt0(inventoryMovements.length)} />
                <Kpi label={T('ops_imports')} value={fmt0(imports.length)} />
                <Kpi label={T('ops_audit')} value={fmt0(auditLogs.length)} accent={isAdmin} />
              </div>
              <div className="panel">
                <h3>{T('ops_orders')}
                  <button className="mini" style={{ marginLeft: 10 }} type="button" onClick={() => setOrderCreateOpen(true)}>+ {T('ops_new_order')}</button>
                </h3>
                <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
                  <input placeholder={T('lbl_date')} type="date" value={orderFilters.dateFrom} onChange={(e) => setOrderFilters({ ...orderFilters, dateFrom: e.target.value })} style={{ width: 140 }} />
                  <input placeholder={T('lbl_date')} type="date" value={orderFilters.dateTo} onChange={(e) => setOrderFilters({ ...orderFilters, dateTo: e.target.value })} style={{ width: 140 }} />
                  <input placeholder={T('clients_name')} value={orderFilters.customer} onChange={(e) => setOrderFilters({ ...orderFilters, customer: e.target.value })} style={{ width: 160 }} />
                  <select value={orderFilters.status} onChange={(e) => setOrderFilters({ ...orderFilters, status: e.target.value })} style={{ width: 140 }}>
                    <option value="">{T('ops_all_statuses')}</option>
                    <option value="new">{T('ops_status_new')}</option>
                    <option value="in_production">{T('ops_status_prod')}</option>
                    <option value="delivered">{T('ops_status_del')}</option>
                    <option value="cancelled">{T('ops_status_can')}</option>
                  </select>
                </div>
                {orders.length ? (
                  <div className="tablewrap">
                    <table className="data compact">
                      <thead>
                        <tr>
                          <th className="check">✓</th>
                          <th>{T('clients_name')}</th>
                          <th>{T('lbl_date')}</th>
                          <th>Status</th>
                          <th className="right">{T('lbl_qty')}</th>
                          <th className="right">{T('lbl_total')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders
                          .filter((o) => {
                            if (orderFilters.customer && !o.customer.toLowerCase().includes(orderFilters.customer.toLowerCase())) return false;
                            if (orderFilters.status && o.status !== orderFilters.status) return false;
                            if (orderFilters.dateFrom && o.deliveryDate < orderFilters.dateFrom) return false;
                            if (orderFilters.dateTo && o.deliveryDate > orderFilters.dateTo) return false;
                            return true;
                          })
                          .slice(0, 30)
                          .map((order) => (
                          <tr key={order.id}>
                            <td className="check">
                              <input
                                type="checkbox"
                                checked={order.status === 'delivered'}
                                onChange={() => order.status !== 'delivered' && deliverOrder(order.id)}
                                title={T('lbl_delivered')}
                              />
                            </td>
                            <td>{order.customer}</td>
                            <td>{fmtDateRu(order.deliveryDate)}</td>
                            <td><StatusChip status={order.status} T={T} /></td>
                            <td className="right mono">{fmt0(order.totalQty)}</td>
                            <td className="right mono">{fmt0(order.totalAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title={T('ops_empty_orders')} />
                )}
              </div>
              <div className="panel">
                <h3>{T('ops_last_moves')}</h3>
                {inventoryMovements.length ? (
                  <div className="tablewrap">
                    <table className="data compact">
                      <thead>
                        <tr>
                          <th>{T('lbl_date')}</th>
                          <th>SKU</th>
                          <th>Type</th>
                          <th className="right">{T('lbl_qty')}</th>
                          <th>Ref</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventoryMovements.slice(0, 10).map((movement) => (
                          <tr key={movement.id}>
                            <td>{fmtDateRu(movement.dateIso)}</td>
                            <td>{movement.productSku}</td>
                            <td>{movement.movementType.replace('_', ' ')}</td>
                            <td className="right mono">{fmt0(movement.quantity)}</td>
                            <td>{movement.reference}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title={T('ops_empty_moves')} />
                )}
              </div>
              {isAdmin && (
                <>
                  <div className="panel">
                    <h3>{T('ops_imports')}</h3>
                    <div className="uploadRow">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(event) => setImportFile(event.target.files?.[0] || null)}
                      />
                      <button className="small dark" type="button" disabled={!importFile || uploading} onClick={uploadImportFile}>
                        {uploading ? 'Загрузка...' : 'Загрузить'}
                      </button>
                    </div>
                    {imports.length ? (
                      <div className="tablewrap">
                        <table className="data compact">
                          <thead>
                            <tr>
                              <th>File</th>
                              <th>Status</th>
                              <th className="right">{T('lbl_qty')}</th>
                              <th className="right">Err</th>
                              <th>{T('lbl_date')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {imports.slice(0, 10).map((item) => (
                              <tr key={item.id}>
                                <td>{item.fileName}</td>
                                <td>{item.status}</td>
                                <td className="right mono">{item.importedRecords}</td>
                                <td className="right mono">{item.errors}</td>
                                <td>{fmtDateRu(item.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty title={T('ops_empty_imports')} />
                    )}
                  </div>
                  <div className="panel">
                    <h3>{T('ops_audit')}</h3>
                    {auditLogs.length ? (
                      <div className="tablewrap">
                        <table className="data compact">
                          <thead>
                            <tr>
                              <th>{T('clients_name')}</th>
                              <th>Action</th>
                              <th>Entity</th>
                              <th className="right">{T('lbl_date')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {auditLogs.slice(0, 10).map((item) => (
                              <tr key={item.id}>
                                <td>{item.userName}</td>
                                <td>{item.action.replace('_', ' ')}</td>
                                <td>{item.entity}</td>
                                <td className="right mono">{fmtDateRu(item.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty title={T('ops_empty_audit')} />
                    )}
                  </div>
                </>
              )}
            </section>
          )}

          {view === 'customers' && (
            <section className="pane">
              <PaneHead
                title={T('clients_title')}
                meta={`${customers.length} ${T('clients_meta')}`}
                actions={
                  <button className="small dark" type="button" onClick={() => setNewCustomerOpen(true)}>
                    <Plus size={15} /> {T('lbl_add')}
                  </button>
                }
              />
              {customers.length ? (
                <div className="tablewrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>{T('clients_name')}</th>
                        <th>{T('clients_phone')}</th>
                        <th>{T('clients_addr')}</th>
                        <th>{T('clients_notes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map((c) => (
                        <tr key={c.id}>
                          <td><b>{c.name}</b></td>
                          <td className="mono">{c.phone || '—'}</td>
                          <td>{c.address || '—'}</td>
                          <td className="muted">{c.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title={T('clients_empty')} />
              )}
            </section>
          )}

          {view === 'analytics' && (
            <AnalyticsPane
              invoices={invoices}
              catalog={catalog}
              sessions={sessions}
              dashboardStats={dashboardStats}
              productStats={productStats}
              customerStats={customerStats}
              token={token}
              onRefresh={loadAnalytics}
              onToast={showToast}
              T={T}
            />
          )}

          {view === 'undelivered' && (() => {
            const undeliveredList = invoices.filter(i => i.status === 'saved');
            return (
              <section className="pane">
                <div className="paneHead">
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={18} color="#e53e3e" />
                    Yetkazilmagan nakladnoylar
                    {undeliveredList.length > 0 && (
                      <span style={{ background: '#e53e3e', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '2px 8px' }}>
                        {undeliveredList.length}
                      </span>
                    )}
                  </h2>
                </div>
                {undeliveredList.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                    ✓ Barcha nakladnoylar yetkazilgan
                  </div>
                ) : (
                  <div className="tablewrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>№</th>
                          <th>Buyurtma</th>
                          <th>Do&apos;kon</th>
                          <th className="right">Summa</th>
                          <th>Bekor qilish sababi</th>
                          <th>Vaqt</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {undeliveredList.map(inv => (
                          <tr key={inv.invNo}>
                            <td>
                              <button className="linklike" type="button" onClick={() => setInvoiceDetail(inv)}>
                                <span className="invoiceNo">{inv.invNo}</span>
                              </button>
                            </td>
                            <td className="mono">{inv.order}</td>
                            <td>{inv.market} <span className="muted">{inv.storeCode}</span></td>
                            <td className="right mono">{fmt(inv.sumTotal)}</td>
                            <td>
                              {inv.undeliverComment ? (
                                <span style={{ color: '#ffa500', fontSize: 13 }}>⚠️ {inv.undeliverComment}</span>
                              ) : (
                                <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                              )}
                            </td>
                            <td style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                              {inv.undeliveredAt ? new Date(inv.undeliveredAt).toLocaleString('uz-UZ') : '—'}
                            </td>
                            <td>
                              <button
                                className="mini"
                                type="button"
                                style={{ color: 'var(--ok)', borderColor: 'rgba(47,209,88,0.3)' }}
                                onClick={() => setRestoreModal({
                                  invNo: inv.invNo,
                                  date: inv.dateIso || todayIso(),
                                  lines: (inv.lines || []).filter(l => (l.init ?? 0) > 0 || l.qty > 0).map(l => ({
                                    sku: l.sku, name: l.name, unit: l.unit, price: l.price,
                                    qty: l.qty, initQty: l.init ?? l.qty,
                                  })),
                                })}
                              >
                                ↩ Tiklash
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })()}

          {view === 'settings' && (
            <section className="pane">
              <div className="subtabs">
                <button className={settingsView === 'catalog' ? 'active' : ''} type="button" onClick={() => setSettingsView('catalog')}>{T('settings_cat')}</button>
                <button className={settingsView === 'requisites' ? 'active' : ''} type="button" onClick={() => setSettingsView('requisites')}>{T('settings_req')}</button>
                <button className={(settingsView as string) === 'exceptions' ? 'active' : ''} type="button" onClick={() => setSettingsView('exceptions')}>{T('settings_exc')}</button>
                <button className={settingsView === 'sessions' ? 'active' : ''} type="button" onClick={() => setSettingsView('sessions')}>{T('settings_hist')}</button>
                {isAdmin && <button className={settingsView === 'users' ? 'active' : ''} type="button" onClick={() => setSettingsView('users')}>{T('settings_access')}</button>}
              </div>

              {settingsView === 'catalog' && (
                <>
                  <PaneHead
                    title={T('settings_cat_title')}
                    meta={`${catalogDraft.length}`}
                    actions={
                      isAdmin ? (
                        <>
                          <button className="small dark" type="button" onClick={() => setCatalogDraft((previous) => [...previous, { sku: '', name: T('lbl_product'), unit: T('lbl_unit'), price: 0 }])}>
                            <Plus size={15} /> {T('lbl_add')}
                          </button>
                          <button className="small" type="button" onClick={saveCatalogDraft}>
                            <Save size={15} /> {T('lbl_save')}
                          </button>
                          <button className="small" type="button" onClick={resetCatalog}>
                            <RefreshCcw size={15} />
                          </button>
                        </>
                      ) : null
                    }
                  />
                  <div className="tablewrap">
                    <table className="data editable">
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>{T('lbl_product')}</th>
                          <th>{T('lbl_unit')}</th>
                          <th className="right">{T('lbl_price')}</th>
                          {isAdmin && <th />}
                        </tr>
                      </thead>
                      <tbody>
                        {catalogDraft.map((product, index) => (
                          <tr key={product.id || index}>
                            <td>
                              <input disabled={!isAdmin} value={product.sku} onChange={(event) => setCatalogDraft(updateCatalogDraft(catalogDraft, index, { sku: event.target.value }))} />
                            </td>
                            <td>
                              <input disabled={!isAdmin} value={product.name} onChange={(event) => setCatalogDraft(updateCatalogDraft(catalogDraft, index, { name: event.target.value }))} />
                            </td>
                            <td>
                              <input disabled={!isAdmin} value={product.unit} onChange={(event) => setCatalogDraft(updateCatalogDraft(catalogDraft, index, { unit: event.target.value }))} />
                            </td>
                            <td>
                              <input className="right" disabled={!isAdmin} value={product.price} onChange={(event) => setCatalogDraft(updateCatalogDraft(catalogDraft, index, { price: parseNum(event.target.value) }))} />
                            </td>
                            {isAdmin && (
                              <td className="actions">
                                <button className="iconbtn danger" type="button" onClick={() => deleteProduct(product)}>
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {settingsView === 'requisites' && (
                <>
                  <PaneHead
                    title={T('settings_req_title')}
                    meta={T('settings_req')}
                    actions={
                      isAdmin ? (
                        <>
                          <button className="small dark" type="button" onClick={saveRequisites}>
                            <Save size={15} /> {T('lbl_save')}
                          </button>
                          <button className="small" type="button" onClick={resetRequisites}>
                            <RefreshCcw size={15} />
                          </button>
                        </>
                      ) : null
                    }
                  />
                  <div className="formgrid">
                    <RequisiteBlock
                      title={T('settings_supplier')}
                      values={[
                        ['name', T('clients_name'), requisitesDraft.supplier.name],
                        ['addr', T('clients_addr'), requisitesDraft.supplier.addr],
                        ['inn', 'INN', requisitesDraft.supplier.inn],
                        ['vat', T('lbl_vat'), requisitesDraft.supplier.vat]
                      ]}
                      disabled={!isAdmin}
                      onChange={(key, value) => setRequisitesDraft({ ...requisitesDraft, supplier: { ...requisitesDraft.supplier, [key]: value } })}
                    />
                    <RequisiteBlock
                      title={T('settings_receiver')}
                      values={[
                        ['name', T('clients_name'), requisitesDraft.receiver.name],
                        ['inn', 'INN', requisitesDraft.receiver.inn],
                        ['vat', T('lbl_vat'), requisitesDraft.receiver.vat]
                      ]}
                      disabled={!isAdmin}
                      onChange={(key, value) => setRequisitesDraft({ ...requisitesDraft, receiver: { ...requisitesDraft.receiver, [key]: value } })}
                    />
                  </div>
                  <label className="field wide">
                    <span>{T('settings_contract')}</span>
                    <input disabled={!isAdmin} value={requisitesDraft.contract} onChange={(event) => setRequisitesDraft({ ...requisitesDraft, contract: event.target.value })} />
                  </label>
                </>
              )}

              {settingsView === 'sessions' && (
                <>
                  <PaneHead
                    title={T('settings_hist_title')}
                    meta={`${sessions.length}`}
                    actions={
                      <button className="small" type="button" onClick={() => refreshSessions()}>
                        <RefreshCcw size={15} />
                      </button>
                    }
                  />
                  <div className="sessionList">
                    {sessions.length ? (
                      sessions.map((session) => (
                        <div className="sessionRow" key={session.invoiceDate}>
                          <b>{session.name || fmtDateRu(session.invoiceDate)}</b>
                          <span>{session.invoiceCount} накл.</span>
                          <span>{fmt0(session.sumTotal)} сум</span>
                          <span>{session.versions?.length || 0} версий</span>
                          <button className="mini" type="button" onClick={() => loadSession(session.invoiceDate)}>
                            {T('lbl_restore')}
                          </button>
                          {isAdmin && (
                            <button className="iconbtn danger" type="button" onClick={() => deleteSession(session.invoiceDate)}>
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <Empty title={T('ops_empty_audit')} />
                    )}
                  </div>
                </>
              )}

              {settingsView === 'exceptions' && (
                <>
                  <PaneHead title={T('settings_exc')} meta="" actions={null} />
                  <div className="panel">
                    <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                      Қуйидаги саналарда график бузилишлари ҳисобланмайди (байрам, махсус кун).
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input
                        type="date"
                        id="exc-date-input"
                        style={{ width: 160 }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value; if (v && !exceptionDates.includes(v)) { setExceptionDates((p) => { const n = [...p, v].sort(); localStorage.setItem('gdetort_exceptions', JSON.stringify(n)); return n; }); (e.target as HTMLInputElement).value = ''; } } }}
                      />
                      <button className="small dark" type="button" onClick={() => {
                        const inp = document.getElementById('exc-date-input') as HTMLInputElement;
                        const v = inp?.value;
                        if (v && !exceptionDates.includes(v)) { setExceptionDates((p) => { const n = [...p, v].sort(); localStorage.setItem('gdetort_exceptions', JSON.stringify(n)); return n; }); inp.value = ''; }
                      }}>
                        <Plus size={14} /> {T('lbl_add')}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {exceptionDates.length === 0 && <span className="muted">{T('settings_exc')}: —</span>}
                      {exceptionDates.map((d) => (
                        <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', borderRadius: 6, padding: '4px 10px', fontSize: 13 }}>
                          <input type="checkbox" defaultChecked onChange={(e) => { if (!e.target.checked) setExceptionDates((p) => { const n = p.filter((x) => x !== d); localStorage.setItem('gdetort_exceptions', JSON.stringify(n)); return n; }); }} />
                          {fmtDateRu(d)}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {settingsView === 'users' && isAdmin && (
                <>
                  <PaneHead title={T('settings_users_title')} meta={`${users.length}`} />
                  <div className="userCreate">
                    <input placeholder={T('clients_name')} value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} />
                    <input placeholder="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} />
                    <input placeholder="Parol" type="password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} />
                    <select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as 'admin' | 'user' })}>
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                    <button className="small dark" type="button" onClick={createUser}>
                      <UserPlus size={15} /> {T('lbl_add')}
                    </button>
                  </div>
                  <div className="tablewrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>{T('clients_name')}</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((item) => (
                          <tr key={item.id}>
                            <td>{item.name}</td>
                            <td className="mono">{item.email}</td>
                            <td>
                              <span className="rolechip">{item.role}</span>
                            </td>
                            <td>{item.active ? 'активен' : 'выключен'}</td>
                            <td className="actions">
                              <button className="mini" type="button" onClick={() => toggleUserActive(item)}>
                                {item.active ? 'Выключить' : 'Включить'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}
        </main>
      </div>

      {manualOpen && (
        <div className="modalBackdrop">
          <div className="modal" style={{ maxWidth: '92vw', width: '92vw' }}>
            <div className="modalHead">
              <h3>Qo&apos;lda nakladnoy</h3>
              <button className="iconbtn" type="button" onClick={() => { setManualOpen(false); setManualStores([emptyStoreRow()]); }}>✕</button>
            </div>
            <div className="modalBody" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Shared date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Sana:</span>
                <input type="date" value={manual.dateIso}
                  onChange={(e) => setManual({ ...manual, dateIso: e.target.value })}
                  style={{ fontSize: 13, padding: '4px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, color: 'inherit', outline: 'none' }} />
                <button type="button" onClick={() => setManualStores([...manualStores, emptyStoreRow()])}
                  style={{ marginLeft: 'auto', fontSize: 12, padding: '5px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  + Do&apos;kon qo&apos;shish
                </button>
              </div>

              {/* Transposed table: products = rows, stores = columns */}
              <div style={{ overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', tableLayout: 'fixed' }}>
                  <thead>
                    {/* Row 1: product label + store code/name */}
                    <tr>
                      <th style={{ width: 180, minWidth: 180, padding: '6px 10px', fontSize: 11, color: 'var(--muted)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'var(--card)', position: 'sticky', left: 0, zIndex: 2 }}>
                        Mahsulot
                      </th>
                      {manualStores.map((col, ci) => (
                        <th key={ci} style={{ width: 140, minWidth: 140, padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ display: 'flex', gap: 3 }}>
                              <input placeholder="Kod"
                                value={col.storeCode}
                                onChange={(e) => { const u = [...manualStores]; u[ci] = { ...u[ci], storeCode: e.target.value }; setManualStores(u); }}
                                style={{ width: 52, fontSize: 11, padding: '4px 5px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, color: 'inherit', outline: 'none' }} />
                              <input placeholder="Nom"
                                value={col.storeName}
                                onChange={(e) => { const u = [...manualStores]; u[ci] = { ...u[ci], storeName: e.target.value }; setManualStores(u); }}
                                style={{ flex: 1, fontSize: 11, padding: '4px 5px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, color: 'inherit', outline: 'none' }} />
                              <button type="button"
                                onClick={() => setManualStores(manualStores.length > 1 ? manualStores.filter((_, i) => i !== ci) : [emptyStoreRow()])}
                                style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 4, background: 'transparent', border: '1px solid rgba(255,80,80,0.3)', color: '#e53e3e', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>
                                ×
                              </button>
                            </div>
                            <input placeholder="№ Zakaz"
                              value={col.order}
                              onChange={(e) => { const u = [...manualStores]; u[ci] = { ...u[ci], order: e.target.value }; setManualStores(u); }}
                              style={{ width: '100%', fontSize: 11, padding: '4px 5px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, color: 'inherit', outline: 'none' }} />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((p) => {
                      const defaultPrice = Math.round(p.price * 1.12 * 100) / 100;
                      return (
                        <tr key={p.sku} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          {/* Product info — sticky left */}
                          <td style={{ padding: '6px 10px', fontSize: 12, background: 'var(--card)', position: 'sticky', left: 0, zIndex: 1, borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170 }}>{p.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                              {defaultPrice.toLocaleString('ru-RU')} so&apos;m · {p.unit}
                            </div>
                          </td>
                          {/* Cell per store: qty + price */}
                          {manualStores.map((col, ci) => {
                            const cell = col.cells[p.sku];
                            const qtyVal = cell?.qty ?? '';
                            const priceVal = cell?.price ?? '';
                            const updateCell = (field: 'qty' | 'price', val: string) => {
                              const u = [...manualStores];
                              u[ci] = { ...u[ci], cells: { ...u[ci].cells, [p.sku]: { qty: qtyVal, price: priceVal, [field]: val } } };
                              setManualStores(u);
                            };
                            const hasQty = parseNum(qtyVal) > 0;
                            return (
                              <td key={ci} style={{ padding: '4px 6px', verticalAlign: 'middle', background: hasQty ? 'rgba(110,231,183,0.04)' : 'transparent' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontSize: 10, color: 'var(--muted)', width: 26, flexShrink: 0 }}>dona</span>
                                    <input type="number" min={0} placeholder="0"
                                      value={qtyVal}
                                      onChange={(e) => updateCell('qty', e.target.value)}
                                      style={{ flex: 1, fontSize: 13, padding: '3px 5px', textAlign: 'center', background: 'rgba(255,255,255,0.06)', border: hasQty ? '1px solid rgba(110,231,183,0.4)' : '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', outline: 'none', fontFamily: 'var(--mono)' }} />
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontSize: 10, color: 'var(--muted)', width: 26, flexShrink: 0 }}>narx</span>
                                    <input type="number" min={0}
                                      placeholder={String(defaultPrice)}
                                      value={priceVal}
                                      onChange={(e) => updateCell('price', e.target.value)}
                                      style={{ flex: 1, fontSize: 11, padding: '3px 5px', textAlign: 'right', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: priceVal && parseNum(priceVal) !== defaultPrice ? '#fbbf24' : 'var(--muted)', outline: 'none', fontFamily: 'var(--mono)' }} />
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modalFoot">
              <button className="small" type="button" onClick={() => { setManualOpen(false); setManualStores([emptyStoreRow()]); }}>{T('lbl_cancel')}</button>
              <button className="small dark" type="button" onClick={createManualInvoice} disabled={busy}>
                {busy ? '...' : `✓ Qo'shish (${manualStores.filter(r => r.storeCode.trim()).length} ta do'kon)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {orderCreateOpen && (
        <div className="modalBackdrop">
          <div className="modal">
            <div className="modalHead">
              <h3>{T('modal_order')}</h3>
              <button className="iconbtn" type="button" onClick={() => setOrderCreateOpen(false)}>×</button>
            </div>
            <div className="modalBody">
              <div className="formgrid tight">
                <label className="field">
                  <span>{T('clients_name')}</span>
                  <input list="customer-list" value={newOrderCustomer} onChange={(e) => setNewOrderCustomer(e.target.value)} placeholder={T('clients_name')} />
                  <datalist id="customer-list">{customers.map((c) => <option key={c.id} value={c.name} />)}</datalist>
                </label>
                <label className="field">
                  <span>{T('lbl_date')}</span>
                  <input type="date" value={newOrderDeliveryDate} onChange={(e) => setNewOrderDeliveryDate(e.target.value)} />
                </label>
              </div>
              <label className="field">
                <span>{T('clients_notes')}</span>
                <input value={newOrderNotes} onChange={(e) => setNewOrderNotes(e.target.value)} />
              </label>
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 900, fontSize: 11, color: 'var(--muted)' }}>{T('lbl_product').toUpperCase()}</span>
                  <button className="mini" type="button" onClick={() => setNewOrderItems([...newOrderItems, { sku: '', name: '', unit: 'шт', qty: 1, price: 0 }])}>+ Добавить</button>
                </div>
                {newOrderItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px 80px auto', gap: 6, marginBottom: 6 }}>
                    <select value={item.sku} onChange={(e) => {
                      const product = catalog.find((p) => p.sku === e.target.value);
                      const updated = [...newOrderItems];
                      updated[idx] = { ...item, sku: e.target.value, name: product?.name || '', unit: product?.unit || 'шт', price: product?.price || 0 };
                      setNewOrderItems(updated);
                    }}>
                      <option value="">Выбрать товар</option>
                      {catalog.map((p) => <option key={p.sku} value={p.sku}>{p.name}</option>)}
                    </select>
                    <input placeholder="Ед." value={item.unit} readOnly />
                    <input type="number" placeholder="Кол" value={item.qty} min={1} onChange={(e) => {
                      const updated = [...newOrderItems];
                      updated[idx] = { ...item, qty: Number(e.target.value) };
                      setNewOrderItems(updated);
                    }} />
                    <input type="number" placeholder="Цена" value={item.price} min={0} onChange={(e) => {
                      const updated = [...newOrderItems];
                      updated[idx] = { ...item, price: Number(e.target.value) };
                      setNewOrderItems(updated);
                    }} />
                    <button className="iconbtn danger" type="button" onClick={() => setNewOrderItems(newOrderItems.filter((_, i) => i !== idx))}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="modalFoot">
              <button className="small" type="button" onClick={() => setOrderCreateOpen(false)}>{T('lbl_cancel')}</button>
              <button className="small dark" type="button" onClick={createOrder}>{T('lbl_add')}</button>
            </div>
          </div>
        </div>
      )}

      {newCustomerOpen && (
        <div className="modalBackdrop">
          <div className="modal">
            <div className="modalHead">
              <h3>{T('modal_client')}</h3>
              <button className="iconbtn" type="button" onClick={() => setNewCustomerOpen(false)}>×</button>
            </div>
            <div className="modalBody">
              <label className="field"><span>{T('clients_name')}</span><input value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} /></label>
              <label className="field"><span>{T('clients_phone')}</span><input value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} /></label>
              <label className="field"><span>{T('clients_addr')}</span><input value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} /></label>
              <label className="field"><span>{T('clients_notes')}</span><input value={newCustomer.notes} onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })} /></label>
            </div>
            <div className="modalFoot">
              <button className="small" type="button" onClick={() => setNewCustomerOpen(false)}>{T('lbl_cancel')}</button>
              <button className="small dark" type="button" onClick={createCustomer}>{T('lbl_add')}</button>
            </div>
          </div>
        </div>
      )}

      <div id="printRoot">
        {printInvoices.map((invoice) => (
          <div className="printPage" key={invoice.invNo}>
            <div className="printHalf">
              <InvoiceDocument invoice={invoice} requisites={requisites} />
            </div>
            <div className="printHalf">
              <InvoiceDocument invoice={invoice} requisites={requisites} />
            </div>
          </div>
        ))}
        {/* Dispatch prints open in a new tab via window.open() — nothing to render here */}
      </div>
    </>
  );
}

function LoginScreen({
  busy,
  onLogin,
  toast
}: {
  busy: boolean;
  onLogin: (email: string, password: string) => Promise<void>;
  toast: Toast;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <main className="login">
      <section className="loginPanel">
        <div className="loginBrand">
          <span>GT</span>
          <h1>ГДЕ ТОРТ?</h1>
          <p>Накладные · счёт-фактура · реестр</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onLogin(email, password);
          }}
        >
          <label className="field">
            <span>Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="command primary" disabled={busy} type="submit">
            <Shield size={18} /> Войти
          </button>
        </form>
        {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
      </section>
    </main>
  );
}

function Tab({
  active,
  icon,
  label,
  onClick,
  badge,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button className={active ? 'navitem active' : 'navitem'} type="button" onClick={onClick} style={{ position: 'relative' }}>
      <span className="navicon">{icon}</span>
      <span className="navlabel">{label}</span>
      {badge ? (
        <span style={{
          position: 'absolute', top: 4, right: 4,
          background: '#e53e3e', color: '#fff',
          fontSize: 10, fontWeight: 700, lineHeight: 1,
          borderRadius: 10, padding: '2px 5px', minWidth: 16, textAlign: 'center',
        }}>{badge}</span>
      ) : null}
    </button>
  );
}

function PaneHead({
  title,
  meta,
  actions
}: {
  title: string;
  meta?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="paneHead">
      <div>
        <h2>{title}</h2>
        {meta && <span>{meta}</span>}
      </div>
      {actions && <div className="paneActions">{actions}</div>}
    </div>
  );
}

function Empty({ title }: { title: string }) {
  return (
    <div className="empty">
      <div>▦</div>
      <b>{title}</b>
    </div>
  );
}

function AnalyticsPane({
  invoices,
  catalog,
  sessions,
  dashboardStats,
  productStats,
  customerStats,
  token,
  onRefresh,
  onToast,
  T = (k: string) => k,
}: {
  invoices: Invoice[];
  catalog: CatalogProduct[];
  sessions: SessionSummary[];
  dashboardStats: DashboardStats | null;
  token: string | null;
  productStats: ProductStat[];
  customerStats: CustomerStat[];
  onRefresh: () => void;
  onToast: (kind: 'ok' | 'err' | 'info', text: string) => void;
  T?: (k: string) => string;
}) {
  const [tab, setTab] = useState<'overview' | 'products' | 'markets' | 'clients' | 'savdo'>('overview');

  // ─── Shared date range for ALL tabs ───────────────────────────────────────
  const today = todayIso();
  const [savdoFrom, setSavdoFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); });
  const [savdoTo,   setSavdoTo]   = useState(today);
  const [vazvratRows, setVazvratRows] = useState<import('@/types/domain').VazvratRecord[]>([]);
  const [savdoInvoices, setSavdoInvoices] = useState<Invoice[]>([]);
  const [savdoAnalytics, setSavdoAnalytics] = useState<{ sku: string; name: string; berilganQty: number; berilganSum: number; vazvratQty: number; vazvratSum: number }[]>([]);
  const [savdoBusy, setSavdoBusy] = useState(false);
  const [savdoUploading, setSavdoUploading] = useState(false);
  const [savdoTab, setSavdoTab] = useState<'kunlik' | 'dokonlar' | 'mahsulotlar'>('kunlik');

  async function loadVazvrat() {
    if (!token) return;
    setSavdoBusy(true);
    try {
      const [rows, allInvoices, analytics] = await Promise.all([
        api.queryVazvrat(token, savdoFrom, savdoTo),
        api.invoices(token),
        api.vazvratAnalytics(token, savdoFrom, savdoTo),
      ]);
      setVazvratRows(rows);
      setSavdoAnalytics(analytics);
      setSavdoInvoices(allInvoices.filter(
        (inv) => inv.dateIso >= savdoFrom && inv.dateIso <= savdoTo && inv.status !== 'cancelled'
      ));
    } catch { /* ignore */ } finally { setSavdoBusy(false); }
  }

  async function handleVazvratExcel(file: File) {
    if (!token) return;
    setSavdoUploading(true);
    try {
      const XLSX = await import('xlsx');
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // Fix: Excel may have a wrong <dimension> tag (e.g. A1:Y5) that truncates rows.
      // Expand !ref to cover all actual cell data in the sheet.
      let maxR = 0, maxC = 0;
      Object.keys(ws).filter((k) => !k.startsWith('!')).forEach((addr) => {
        const cell = XLSX.utils.decode_cell(addr);
        if (cell.r > maxR) maxR = cell.r;
        if (cell.c > maxC) maxC = cell.c;
      });
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
      // Data starts from row 4 (index 3), skip header rows 1-3
      const records: import('@/types/domain').VazvratUploadItem[] = [];
      let lastOrderNo = '';
      let lastDate = '';
      let lastMarketCode = '';
      let lastMarketName = '';
      for (let i = 3; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.every((c) => !c)) continue; // empty row (totals)
        const orderNo    = String(r[0] || lastOrderNo);
        const dateRaw    = r[1]; // 2026-06-16
        const marketName = String(r[4] || lastMarketName);
        const marketCode = String(r[5] || lastMarketCode);
        const sapCode    = String(r[17] || '').trim();
        const productName = String(r[15] || '').trim();
        const qty        = Number(r[19]) || 0;
        const pricePerUnit = Number(r[20]) || 0;
        const totalWithVat = Number(r[24]) || 0;
        if (!sapCode || !marketCode || qty === 0) continue;
        const date = dateRaw
          ? (typeof dateRaw === 'string' ? dateRaw.slice(0, 10) : new Date(String(dateRaw)).toISOString().slice(0, 10))
          : lastDate;
        if (orderNo) lastOrderNo = orderNo;
        if (date)    lastDate    = date;
        if (marketCode) { lastMarketCode = marketCode; lastMarketName = marketName; }
        records.push({ date, marketCode, marketName, sapCode, productName, qty, pricePerUnit, totalWithVat, orderNo });
      }
      if (!records.length) { alert('Faylda ma\'lumot topilmadi'); return; }

      // ─── Duplicate detection (TWO passes) ────────────────────────────────
      // Pass 1: same orderNo+sap+qty  → same physical delivery row uploaded twice
      // Pass 2: same date+mkt+sap+qty+totalWithVat but DIFFERENT orderNo
      //         → same return registered twice in ordering system with different IDs
      type DupGroup = { label: string; sapCode: string; marketCode: string; date: string; qty: number; count: number; totalSum: number };
      const dupMap1: Record<string, DupGroup> = {};
      const dupMap2: Record<string, DupGroup> = {};
      for (const rec of records) {
        const deliveryId = rec.orderNo?.includes(' - ') ? rec.orderNo.split(' - ')[1].trim() : (rec.orderNo || '?');
        // Pass 1 key: orderNo + sapCode + qty
        const key1 = `${rec.orderNo}|${rec.sapCode}|${rec.qty}`;
        if (!dupMap1[key1]) dupMap1[key1] = { label: `ID:${deliveryId}`, sapCode: rec.sapCode, marketCode: rec.marketCode, date: rec.date, qty: rec.qty, count: 0, totalSum: 0 };
        dupMap1[key1].count += 1;
        dupMap1[key1].totalSum += rec.totalWithVat;
        // Pass 2 key: date + marketCode + sapCode + qty + totalWithVat (content-based, ignores orderNo)
        const key2 = `${rec.date}|${rec.marketCode}|${rec.sapCode}|${rec.qty}|${rec.totalWithVat.toFixed(2)}`;
        if (!dupMap2[key2]) dupMap2[key2] = { label: `${rec.marketCode}`, sapCode: rec.sapCode, marketCode: rec.marketCode, date: rec.date, qty: rec.qty, count: 0, totalSum: 0 };
        dupMap2[key2].count += 1;
        dupMap2[key2].totalSum += rec.totalWithVat;
      }
      const dups1 = Object.values(dupMap1).filter((g) => g.count > 1);
      const dups2 = Object.values(dupMap2).filter((g) => g.count > 1);
      // Merge: dups2 will include dups1, so use dups2 as the comprehensive list
      const duplicates: DupGroup[] = dups2.length > 0 ? dups2 : dups1;
      const dupSumTotal = duplicates.reduce((s, g) => s + g.totalSum * (g.count - 1) / g.count, 0);

      if (duplicates.length > 0) {
        const dupLines = duplicates.slice(0, 5).map((g) =>
          `  • ${g.date} | ${g.marketCode} | SAP: ${g.sapCode} | qty:${g.qty} — ${g.count}x (+${Math.round(g.totalSum*(g.count-1)/g.count).toLocaleString()} so'm ortiqcha)`
        );
        const more = duplicates.length > 5 ? `\n  ... va yana ${duplicates.length - 5} ta` : '';
        const proceed = window.confirm(
          `⚠️ Faylda ${duplicates.length} ta dublikat topildi!\n\n${dupLines.join('\n')}${more}\n\n` +
          `Ortiqcha summa: ~${Math.round(dupSumTotal).toLocaleString()} so'm\n\n` +
          `Tizim dublikatlarni AVTOMATIK olib tashlab saqlaydi.\nDavom etasizmi?`
        );
        if (!proceed) return;
        // AUTO-DEDUPLICATE: keep only first occurrence of each content-based key
        const seenKeys = new Set<string>();
        const dedupedRecords: typeof records = [];
        for (const rec of records) {
          const k = `${rec.date}|${rec.marketCode}|${rec.sapCode}|${rec.qty}|${rec.totalWithVat.toFixed(2)}`;
          if (!seenKeys.has(k)) {
            seenKeys.add(k);
            dedupedRecords.push(rec);
          }
        }
        records.splice(0, records.length, ...dedupedRecords);
      }
      // ──────────────────────────────────────────────────────────────────────

      const result = await api.uploadVazvrat(token, records);
      const dupMsg = duplicates.length > 0 ? ` | ⚠️ ${duplicates.length} ta dublikat` : '';
      onToast('ok', `✓ ${result.inserted} qator saqlandi (${result.dates.join(', ')})${dupMsg}`);
      await loadVazvrat();
    } catch (e) { onToast('err', 'Xato: ' + String(e)); } finally { setSavdoUploading(false); }
  }

  // Filter invoices by shared date range (for non-Savdo tabs)
  const filteredInvoices = useMemo(() => invoices.filter(
    (inv) => inv.dateIso >= savdoFrom && inv.dateIso <= savdoTo && inv.status !== 'cancelled'
  ), [invoices, savdoFrom, savdoTo]);

  const filteredMarkets = useMemo(() => {
    const map: Record<string, { label: string; qty: number; sum: number; count: number }> = {};
    for (const inv of filteredInvoices) {
      if (!map[inv.storeCode]) map[inv.storeCode] = { label: inv.market, qty: 0, sum: 0, count: 0 };
      map[inv.storeCode].qty += inv.sumQty;
      map[inv.storeCode].sum += inv.sumTotal;
      map[inv.storeCode].count += 1;
    }
    return Object.values(map).sort((a, b) => b.sum - a.sum);
  }, [filteredInvoices, savdoFrom, savdoTo]);

  const filteredProductRows = useMemo(() => {
    return catalog.map((product, index) => {
      const initTotal = filteredInvoices.reduce((acc, inv) => acc + (inv.lines[index]?.init || 0), 0);
      const givenQty = filteredInvoices.reduce((acc, inv) => acc + (inv.lines[index]?.qty || 0), 0);
      const givenSum = filteredInvoices.reduce((acc, inv) => acc + (inv.lines[index]?.total || 0), 0);
      return { product, initTotal, givenQty, givenSum };
    }).filter((r) => r.initTotal > 0).sort((a, b) => b.givenQty - a.givenQty);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredInvoices, catalog, savdoFrom, savdoTo]);

  const fMaxMarketSum = filteredMarkets[0]?.sum || 1;
  const fMaxProductQty = filteredProductRows[0]?.givenQty || 1;

  // Date range controls component (shared across all tabs)
  const DateControls = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
      <input type="date" value={savdoFrom} onChange={(e) => setSavdoFrom(e.target.value)}
        style={{ width: 130, fontSize: 13, padding: '5px 8px', background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.14)', borderRadius: 8, color: 'inherit' }} />
      <span style={{ color: 'var(--muted)', fontSize: 13 }}>—</span>
      <input type="date" value={savdoTo} onChange={(e) => setSavdoTo(e.target.value)}
        style={{ width: 130, fontSize: 13, padding: '5px 8px', background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.14)', borderRadius: 8, color: 'inherit' }} />
      {tab === 'savdo' && (
        <>
          <button type="button" disabled={savdoBusy} onClick={loadVazvrat}
            style={{ fontSize: 12, padding: '5px 12px', background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.14)', borderRadius: 8, color: 'var(--ink)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <RefreshCcw size={12} /> {savdoBusy ? '…' : 'Yuklash'}
          </button>
          <label style={{ fontSize: 12, padding: '5px 12px', background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.14)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, position: 'relative', overflow: 'hidden' }}>
            <FileText size={12} /> {savdoUploading ? '…' : 'Vazvrat Excel'}
            <input type="file" accept=".xlsx,.xls" style={{ position: 'absolute', opacity: 0, inset: 0, cursor: 'pointer' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleVazvratExcel(f); e.target.value = ''; }} />
          </label>
        </>
      )}
    </div>
  );

  return (
    <section className="pane">
      <PaneHead
        title={T('analytics_title')}
        actions={<button className="small" type="button" onClick={onRefresh}><RefreshCcw size={15} /></button>}
      />
      <div className="subtabs">
        <button className={tab === 'overview' ? 'active' : ''} type="button" onClick={() => setTab('overview')}>{T('analytics_title')}</button>
        <button className={tab === 'products' ? 'active' : ''} type="button" onClick={() => setTab('products')}>{T('lbl_product')}</button>
        <button className={tab === 'markets' ? 'active' : ''} type="button" onClick={() => setTab('markets')}>{T('lbl_store')}</button>
        <button className={tab === 'clients' ? 'active' : ''} type="button" onClick={() => setTab('clients')}>{T('clients_title')}</button>
        <button className={tab === 'savdo' ? 'active' : ''} type="button" onClick={() => { setTab('savdo'); void loadVazvrat(); }}>Savdo</button>
      </div>

      {/* ─── Shared date range controls ─── */}
      {DateControls}

      {tab === 'overview' && (
        <>
          {(() => {
            const aInit    = filteredInvoices.reduce((s, inv) => s + inv.lines.reduce((ls, l) => ls + (l.init || 0), 0), 0);
            const aGiven   = filteredInvoices.reduce((s, inv) => s + inv.sumQty, 0);
            const aReduced = aInit - aGiven;
            const aSum     = filteredInvoices.reduce((s, inv) => s + inv.sumTotal, 0);
            return (
              <div className="kpis" style={{ marginBottom: 20 }}>
                <Kpi label="KELDI"   value={fmt0(aInit)} />
                <Kpi label="KAMAYDI" value={fmt0(aReduced)} valueStyle={aReduced > 0 ? { color: 'var(--danger)' } : undefined} />
                <Kpi label="BERILDI" value={fmt0(aGiven)} />
                <Kpi label="SUMMA"   value={fmt0(aSum)} accent />
              </div>
            );
          })()}
          <h3 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{T('lbl_store')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxWidth: 560 }}>
            {filteredMarkets.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sana oralig'ida ma'lumot yo'q</div>}
            {filteredMarkets.map((m) => (
              <div key={m.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px,160px) 1fr 86px', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortMkt(m.label)}</span>
                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 14, overflow: 'hidden' }}>
                  <div style={{ width: `${(m.sum / fMaxMarketSum) * 100}%`, height: '100%', background: 'var(--berry)', borderRadius: 4 }} />
                </div>
                <span className="mono" style={{ textAlign: 'right', fontSize: 12 }}>{fmt0(m.sum)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'products' && (
        filteredProductRows.length === 0
          ? <Empty title="Sana oralig'ida ma'lumot yo'q" />
          : <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{T('lbl_product')}</th>
                    <th className="right">Zakaz</th>
                    <th className="right">Berildi</th>
                    <th className="right">Summa</th>
                    <th>График</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProductRows.map((row) => (
                    <tr key={row.product.sku}>
                      <td><b>{row.product.name}</b></td>
                      <td className="right mono">{fmt0(row.initTotal)}</td>
                      <td className="right mono">{fmt0(row.givenQty)}</td>
                      <td className="right mono">{fmt0(row.givenSum)}</td>
                      <td style={{ minWidth: 80 }}>
                        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 12, overflow: 'hidden', width: '100%' }}>
                          <div style={{ width: `${(row.givenQty / fMaxProductQty) * 100}%`, height: '100%', background: 'var(--berry)', borderRadius: 4 }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
      )}

      {tab === 'markets' && (
        filteredMarkets.length === 0
          ? <Empty title="Sana oralig'ida ma'lumot yo'q" />
          : <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{T('lbl_store')}</th>
                    <th className="right">Nakladnoy</th>
                    <th className="right">{T('lbl_pcs')}</th>
                    <th className="right">{T('lbl_sum')}</th>
                    <th>График</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMarkets.map((m) => (
                    <tr key={m.label}>
                      <td><b>{shortMkt(m.label)}</b> <span className="muted">{m.count} nakl.</span></td>
                      <td className="right mono">{m.count}</td>
                      <td className="right mono">{fmt0(m.qty)}</td>
                      <td className="right mono">{fmt0(m.sum)}</td>
                      <td style={{ minWidth: 80 }}>
                        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 12, overflow: 'hidden', width: '100%' }}>
                          <div style={{ width: `${(m.sum / fMaxMarketSum) * 100}%`, height: '100%', background: 'var(--honey)', borderRadius: 4 }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
      )}

      {tab === 'clients' && (
        customerStats.length ? (
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{T('clients_name')}</th>
                  <th className="right">{T('ops_orders')}</th>
                  <th className="right">{T('stats_sum')}</th>
                  <th>{T('lbl_date')}</th>
                </tr>
              </thead>
              <tbody>
                {customerStats.map((row) => (
                  <tr key={row.customer}>
                    <td><b>{row.customer}</b></td>
                    <td className="right mono">{row.ordersCount}</td>
                    <td className="right mono">{fmt0(row.revenue)}</td>
                    <td>{fmtDateRu(row.lastOrderDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title={T('clients_empty')} />
      )}

      {/* ─── SAVDO TAB ─────────────────────────────────────────────── */}
      {tab === 'savdo' && (() => {
        // ─── BERILGAN source: sessions (always correct, even for old sessions not in DB) ───
        // Sessions API: { invoiceDate, invoiceCount, sumTotal } — one record per date
        const sessionsInRange = sessions.filter(
          (s) => s.invoiceDate >= savdoFrom && s.invoiceDate <= savdoTo
        );

        // Build daily data: berilgan from SESSIONS, vazvrat from DB
        const dayMap: Record<string, { berilgan: number; vazvrat: number; count: number }> = {};
        for (const s of sessionsInRange) {
          if (!dayMap[s.invoiceDate]) dayMap[s.invoiceDate] = { berilgan: 0, vazvrat: 0, count: 0 };
          dayMap[s.invoiceDate].berilgan += s.sumTotal;
          dayMap[s.invoiceDate].count += s.invoiceCount;
        }
        for (const vr of vazvratRows) {
          if (!dayMap[vr.date]) dayMap[vr.date] = { berilgan: 0, vazvrat: 0, count: 0 };
          dayMap[vr.date].vazvrat += vr.totalWithVat;
        }

        // ── Rescheduled invoices adjustment ──────────────────────────────────
        // Invoices that were undelivered then restored with a NEW date have originalDateIso set.
        // Remove their sumTotal from the original session date and add to the new date.
        const rescheduled = invoices.filter(
          (inv) => inv.status === 'delivered' && inv.originalDateIso && inv.originalDateIso !== inv.dateIso
        );
        for (const inv of rescheduled) {
          // Remove from original date (was already counted in that session's sumTotal)
          const orig = inv.originalDateIso!;
          if (orig >= savdoFrom && orig <= savdoTo && dayMap[orig]) {
            dayMap[orig].berilgan -= inv.sumTotal;
            dayMap[orig].count = Math.max(0, dayMap[orig].count - 1);
          }
          // Add to new date
          const newD = inv.dateIso;
          if (newD >= savdoFrom && newD <= savdoTo) {
            if (!dayMap[newD]) dayMap[newD] = { berilgan: 0, vazvrat: 0, count: 0 };
            dayMap[newD].berilgan += inv.sumTotal;
            dayMap[newD].count += 1;
          }
        }
        // ─────────────────────────────────────────────────────────────────────

        const dayRows = Object.entries(dayMap).sort(([a],[b]) => a.localeCompare(b));

        // KPI totals (rescheduled don't change the overall total, just shift between days)
        const totBerilgan = sessionsInRange.reduce((s, sess) => s + sess.sumTotal, 0);
        const totVazvrat  = vazvratRows.reduce((s, vr) => s + vr.totalWithVat, 0);
        const totSavdo    = totBerilgan - totVazvrat;

        // Do'konlar: from DB invoices (savdoInvoices) — best available, may be incomplete for old sessions
        type MarketRow = { code: string; name: string; berilgan: number; vazvrat: number };
        const mktMap: Record<string, MarketRow> = {};
        for (const inv of savdoInvoices) {
          if (!mktMap[inv.storeCode]) mktMap[inv.storeCode] = { code: inv.storeCode, name: shortMkt(inv.market), berilgan: 0, vazvrat: 0 };
          mktMap[inv.storeCode].berilgan += inv.sumTotal;
        }
        for (const vr of vazvratRows) {
          if (!mktMap[vr.marketCode]) mktMap[vr.marketCode] = { code: vr.marketCode, name: shortMkt(vr.marketName), berilgan: 0, vazvrat: 0 };
          mktMap[vr.marketCode].vazvrat += vr.totalWithVat;
        }
        const mktRows = Object.values(mktMap).sort((a, b) => (b.berilgan - b.vazvrat) - (a.berilgan - a.vazvrat));

        // Product rows from server-side aggregation (DB invoices + vazvrat)
        const prodRows = savdoAnalytics;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* KPIs */}
            <div className="kpis">
              <Kpi label="BERILGAN" value={fmt0(totBerilgan)} />
              <Kpi label="VAZVRAT"  value={fmt0(totVazvrat)} valueStyle={totVazvrat > 0 ? { color: 'var(--danger)' } : undefined} />
              <Kpi label="SAVDO"    value={fmt0(totSavdo)} accent />
            </div>

            {/* Inner sub-tabs */}
            <div className="subtabs" style={{ marginBottom: 12 }}>
              {(['kunlik', 'dokonlar', 'mahsulotlar'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSavdoTab(st)}
                  className={savdoTab === st ? 'active' : ''}
                  style={{ fontWeight: savdoTab === st ? 700 : 400 }}
                >
                  {st === 'kunlik' ? 'Kunlik' : st === 'dokonlar' ? "Do'konlar" : 'Mahsulotlar'}
                </button>
              ))}
            </div>

            {/* Kunlik sub-tab */}
            {savdoTab === 'kunlik' && (
              <div className="tablewrap">
                <table className="data">
                  <thead><tr>
                    <th>Sana</th>
                    <th className="right">Nakl.</th>
                    <th className="right">Berilgan</th>
                    <th className="right">Vazvrat</th>
                    <th className="right">Savdo</th>
                  </tr></thead>
                  <tbody>
                    {dayRows.map(([date, d]) => (
                      <tr key={date}>
                        <td className="mono">{fmtDateRu(date)}</td>
                        <td className="right mono muted">{d.count || '—'}</td>
                        <td className="right mono">{d.berilgan ? fmt0(d.berilgan) : <span className="muted">—</span>}</td>
                        <td className="right mono" style={d.vazvrat > 0 ? { color: 'var(--danger)' } : undefined}>{d.vazvrat ? fmt0(d.vazvrat) : <span className="muted">—</span>}</td>
                        <td className="right mono" style={{ color: (d.berilgan - d.vazvrat) < 0 ? 'var(--danger)' : 'var(--ok)', fontWeight: 600 }}>{fmt0(d.berilgan - d.vazvrat)}</td>
                      </tr>
                    ))}
                    {dayRows.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>Ma'lumot yo'q</td></tr>}
                  </tbody>
                  {dayRows.length > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <td style={{ fontWeight: 700, color: 'var(--muted)', fontSize: 11, padding: '8px 12px' }}>JAMI</td>
                        <td className="right mono" style={{ fontWeight: 700 }}>{sessionsInRange.reduce((s,x)=>s+x.invoiceCount,0)}</td>
                        <td className="right mono" style={{ fontWeight: 700 }}>{fmt0(totBerilgan)}</td>
                        <td className="right mono" style={{ fontWeight: 700, color: totVazvrat > 0 ? 'var(--danger)' : undefined }}>{fmt0(totVazvrat)}</td>
                        <td className="right mono" style={{ fontWeight: 800, color: totSavdo < 0 ? 'var(--danger)' : 'var(--ok)' }}>{fmt0(totSavdo)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* Do'konlar sub-tab */}
            {savdoTab === 'dokonlar' && (
              <div className="tablewrap">
                <table className="data">
                  <thead><tr>
                    <th>Do'kon</th>
                    <th className="right">Berilgan</th>
                    <th className="right">Vazvrat</th>
                    <th className="right">Savdo</th>
                  </tr></thead>
                  <tbody>
                    {mktRows.map((r) => (
                      <tr key={r.code}>
                        <td><b>{r.name}</b> <span className="muted">{r.code}</span></td>
                        <td className="right mono">{fmt0(r.berilgan)}</td>
                        <td className="right mono" style={r.vazvrat > 0 ? { color: 'var(--danger)' } : undefined}>{fmt0(r.vazvrat)}</td>
                        <td className="right mono" style={{ color: 'var(--ok)', fontWeight: 600 }}>{fmt0(r.berilgan - r.vazvrat)}</td>
                      </tr>
                    ))}
                    {mktRows.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>Ma'lumot yo'q</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {/* Mahsulotlar sub-tab */}
            {savdoTab === 'mahsulotlar' && (
              <div className="tablewrap">
                <table className="data">
                  <thead><tr>
                    <th>Mahsulot</th>
                    <th className="right">B.dona</th>
                    <th className="right">Berilgan</th>
                    <th className="right">V.dona</th>
                    <th className="right">Vazvrat</th>
                    <th className="right">Savdo</th>
                  </tr></thead>
                  <tbody>
                    {prodRows.map((r) => (
                      <tr key={r.sku}>
                        <td title={r.sku}>{r.name}</td>
                        <td className="right mono">{r.berilganQty || '—'}</td>
                        <td className="right mono">{fmt0(r.berilganSum)}</td>
                        <td className="right mono" style={r.vazvratQty > 0 ? { color: 'var(--danger)' } : undefined}>{r.vazvratQty || '—'}</td>
                        <td className="right mono" style={r.vazvratSum > 0 ? { color: 'var(--danger)' } : undefined}>{fmt0(r.vazvratSum)}</td>
                        <td className="right mono" style={{ color: 'var(--ok)', fontWeight: 600 }}>{fmt0(r.berilganSum - r.vazvratSum)}</td>
                      </tr>
                    ))}
                    {prodRows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>Ma'lumot yo'q</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}
    </section>
  );
}

function StatsPane({
  invoices,
  catalog,
  sessions,
  isAdmin,
  T = (k: string) => k,
}: {
  invoices: Invoice[];
  catalog: CatalogProduct[];
  sessions: SessionSummary[];
  isAdmin: boolean;
  T?: (k: string) => string;
}) {
  const totalSum  = invoices.reduce((s, inv) => s + inv.sumTotal, 0);
  const totalInit = invoices.reduce((s, inv) => s + inv.lines.reduce((ls, l) => ls + (l.init || 0), 0), 0);
  const totalGiven = invoices.reduce((s, inv) => s + inv.sumQty, 0);
  const totalReduced = totalInit - totalGiven;

  const products = useMemo(() =>
    catalog.map((product, index) => {
      const initTotal = invoices.reduce((s, inv) => s + (inv.lines[index]?.init || 0), 0);
      const givenQty  = invoices.reduce((s, inv) => s + (inv.lines[index]?.qty  || 0), 0);
      const givenSum  = invoices.reduce((s, inv) => s + (inv.lines[index]?.total || 0), 0);
      return { name: product.name, initTotal, givenQty, givenSum, reduced: initTotal - givenQty };
    }).filter((r) => r.initTotal > 0).sort((a, b) => b.givenQty - a.givenQty),
  [invoices, catalog]);

  const markets = useMemo(() => {
    const map: Record<string, { market: string; qty: number; sum: number; initSum: number; count: number }> = {};
    for (const inv of invoices) {
      const key = inv.storeCode;
      if (!map[key]) map[key] = { market: inv.market, qty: 0, sum: 0, initSum: 0, count: 0 };
      map[key].qty     += inv.sumQty;
      map[key].sum     += inv.sumTotal;
      map[key].initSum += inv.lines.reduce((s, l) => s + (l.init || 0) * (l.price || 0), 0);
      map[key].count   += 1;
    }
    return Object.values(map).sort((a, b) => b.sum - a.sum);
  }, [invoices]);

  const maxProdQty   = products[0]?.givenQty || 1;
  const maxMarketSum = markets[0]?.sum || 1;

  return (
    <section className="pane statsPane">
      {/* Top: KPIs */}
      <PaneHead title={T('stats_title')} meta={`${invoices.length} nakl.`} />
      <div className="kpis" style={{ marginBottom: 20 }}>
        <Kpi label="KELDI"    value={fmt0(totalInit)}    />
        <Kpi label="KAMAYDI"  value={fmt0(totalReduced)} valueStyle={totalReduced > 0 ? { color: 'var(--danger)' } : undefined} />
        <Kpi label="BERILDI"  value={fmt0(totalGiven)}   />
        <Kpi label="SUMMA"    value={fmt0(totalSum)}     accent />
      </div>

      {/* Two-column layout: products left, markets right */}
      <div className="statsCols">
        {/* LEFT: Products */}
        <div className="statsCol">
          <h3 className="statsColHead">{T('lbl_product')}</h3>
          <div className="statsRows">
            {products.map((row) => (
              <div key={row.name} className="statsRow">
                <div className="statsRowName" title={row.name}>{row.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div className="statsRowBar">
                    <div className="statsBarFill" style={{ width: `${(row.givenQty / maxProdQty) * 100}%`, background: 'var(--berry)' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    <span title="Zakaz">Z:{fmt0(row.initTotal)}</span>
                    {row.reduced > 0 && <span title="Kamaytirildi" style={{ color: 'var(--danger)' }}>−{fmt0(row.reduced)}</span>}
                    <span title="Berildi" style={{ color: 'var(--ok)' }}>✓{fmt0(row.givenQty)}</span>
                    <span title="Summa" style={{ color: 'var(--honey)' }}>{fmt0(row.givenSum)} so'm</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Markets */}
        <div className="statsCol">
          <h3 className="statsColHead">{T('lbl_store')}</h3>
          <div className="statsRows">
            {markets.map((m) => (
              <div key={m.market} className="statsRow">
                <div className="statsRowName" title={m.market}>{shortMkt(m.market)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div className="statsRowBar">
                    <div className="statsBarFill" style={{ width: `${(m.sum / maxMarketSum) * 100}%`, background: 'var(--blue)' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    <span title="Zakaz summasi">Z:{fmt0(m.initSum)}</span>
                    <span title="Berildi summasi" style={{ color: 'var(--ok)' }}>✓{fmt0(m.sum)}</span>
                    <span>{m.count} nakl.</span>
                  </div>
                </div>
                <div className="statsRowNums">
                  <span className="mono">{fmt0(m.sum)}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>{fmt0(m.qty)} dona</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const STATUS_COLORS: Record<string, string> = {
  new: 'var(--blue)',
  in_production: 'var(--honey)',
  delivered: 'var(--ok)',
  cancelled: 'var(--muted)'
};

function StatusChip({ status, T = (k: string) => k }: { status: string; T?: (k: string) => string }) {
  const label: Record<string, string> = {
    new: T('ops_status_new'),
    in_production: T('ops_status_prod'),
    delivered: T('ops_status_del'),
    cancelled: T('ops_status_can'),
  };
  return (
    <span style={{ color: STATUS_COLORS[status] || 'var(--muted)', fontWeight: 900, fontSize: 12 }}>
      {label[status] || status}
    </span>
  );
}

function Kpi({ label, value, accent, valueStyle }: { label: string; value: string; accent?: boolean; valueStyle?: React.CSSProperties }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <b className={accent ? 'accent' : ''} style={valueStyle}>{value}</b>
    </div>
  );
}

function RequisiteBlock({
  title,
  values,
  disabled,
  onChange
}: {
  title: string;
  values: Array<[string, string, string]>;
  disabled: boolean;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="reqBlock">
      <h3>{title}</h3>
      {values.map(([key, label, value]) => (
        <label className="field" key={key}>
          <span>{label}</span>
          <input disabled={disabled} value={value} onChange={(event) => onChange(key, event.target.value)} />
        </label>
      ))}
    </div>
  );
}

function InvoiceDocument({ invoice, requisites }: { invoice: Invoice; requisites: Requisites }) {
  const lines = invoice.lines.filter((line) => line.qty > 0);
  return (
    <div className="invoiceDoc">
      <header>
        <div>
          <b>ГДЕ ТОРТ?</b>
          <span>Кондитерские изделия</span>
        </div>
        <section>
          <h2>Накладная — счёт-фактура</h2>
          <strong>№ {invoice.invNo}</strong>
        </section>
      </header>
      <div className="docMeta">
        <DocMeta label="Дата" value={fmtDateRu(invoice.dateIso)} />
        <DocMeta label="№ заказа" value={invoice.order} />
        <DocMeta label="Магазин" value={invoice.market} />
        <DocMeta label="Код" value={invoice.storeCode} />
      </div>
      <p className="contract">{requisites.contract}</p>
      <div className="parties">
        <div>
          <em>Поставщик</em>
          <b>{requisites.supplier.name}</b>
          <span>{requisites.supplier.addr}</span>
          <span>ИНН: {requisites.supplier.inn} · НДС: {requisites.supplier.vat}</span>
        </div>
        <div>
          <em>Получатель</em>
          <b>{requisites.receiver.name}</b>
          <span className="red">Адрес: {invoice.address}</span>
          <span>ИНН: {requisites.receiver.inn} · НДС: {requisites.receiver.vat}</span>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Наименование товара</th>
            <th>Ед.</th>
            <th>Кол-во</th>
            <th>Цена</th>
            <th>Стоимость</th>
            <th>НДС</th>
            <th>С НДС</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.sku}>
              <td>{index + 1}</td>
              <td>{line.name}</td>
              <td>{line.unit}</td>
              <td className="right">{fmt0(line.qty)}</td>
              <td className="right">{fmt(line.price)}</td>
              <td className="right">{fmt(line.cost)}</td>
              <td className="right">{fmt(line.vat)}</td>
              <td className="right">{fmt(line.total)}</td>
            </tr>
          ))}
          <tr className="total">
            <td />
            <td>Итого</td>
            <td />
            <td className="right">{fmt0(invoice.sumQty)}</td>
            <td />
            <td className="right">{fmt(invoice.sumCost)}</td>
            <td className="right">{fmt(invoice.sumVat)}</td>
            <td className="right">{fmt(invoice.sumTotal)}</td>
          </tr>
        </tbody>
      </table>
      <p className="words">Всего отпущено на сумму: <b>{amountWords(invoice.sumTotal)}</b></p>
      <footer>
        <span>Руководитель ____________ <b>BAYMATOVA D.A</b></span>
        <span>Главный бухгалтер ____________ <b>НЕ ПРЕДУСМОТРЕН</b></span>
      </footer>
      <footer>
        <span>Отпустил ____________________</span>
        <span>Получил ____________________</span>
      </footer>
    </div>
  );
}

function DocMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function updateCatalogDraft(
  current: CatalogProduct[],
  index: number,
  patch: Partial<CatalogProduct>
): CatalogProduct[] {
  return current.map((product, productIndex) => (productIndex === index ? { ...product, ...patch } : product));
}

function getError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Неизвестная ошибка';
}

// ─── i18n ─────────────────────────────────────────────────────────────────────
type Lang = 'uz' | 'ru' | 'en';
const I18N: Record<Lang, Record<string, string | string[]>> = {
  uz: {
    // nav
    nav_orders:'Buyurtmalar', nav_register:"Ro'yxat", nav_matrix:'Jadval',
    nav_docs:'Nakladnoylar', nav_dispatch:'Ekspeditsiya', nav_schedule:'Grafik',
    nav_stats:'Statistika', nav_ops:'Operatsiyalar', nav_clients:'Mijozlar',
    nav_analytics:'Analitika', nav_settings:'Sozlamalar',
    // topbar
    lbl_invoices:'nakl.', lbl_pcs:'dona', lbl_sum:"so'm", lbl_unsaved:'saqlanmagan',
    lbl_logout:'Chiqish', lbl_store:"Do'kon", lbl_driver:'Haydovchi',
    lbl_print:'Chop etish', lbl_save:'Saqlash', lbl_add:"Qo'shish",
    lbl_cancel:'Bekor', lbl_date:'Sana', lbl_order:'Buyurtma',
    lbl_product:'Mahsulot', lbl_unit:'Birlik', lbl_qty:'Miqdor',
    lbl_price:'Narx', lbl_total:'Jami', lbl_vat:'QQS',
    lbl_delivered:'Yetkazildi', lbl_selected:'Tanlangan', lbl_restore:'Tiklash', lbl_delete:"O'chirish",
    // pane titles/meta
    reg_title:"Nakladnoylar ro'yxati", reg_empty:"Nakladnoy yo'q",
    reg_meta_docs:'hujjat', reg_manual:'Qo\'lda',
    matrix_title:'Miqdor matritsasi', hide_zeros:"Nollarni yashir",
    matrix_product:'Mahsulot', matrix_total:'Jami',
    docs_title:'Nakladnoylar', docs_print_sel:'Tanlanganlarni chop',
    docs_empty:'Avval nakladnoy shakllantiring',
    sap_title:'SAP import', sap_meta_ready:'nakladnoy tayyor', sap_meta_empty:'Excel yukla',
    sap_batch:'Partiya nomi',
    ops_title:'Operatsiyalar', ops_orders:'Buyurtmalar', ops_moves:'Harakatlar',
    ops_imports:'Importlar', ops_audit:'Audit',
    ops_empty_orders:"Buyurtma yo'q", ops_empty_moves:"Harakat yo'q",
    ops_empty_imports:"Import yo'q", ops_empty_audit:"Audit bo'sh",
    ops_new_order:'Yangi buyurtma', ops_all_statuses:'Barcha statuslar',
    ops_status_new:'Yangi', ops_status_prod:'Ishlab chiqarish',
    ops_status_del:'Yetkazildi', ops_status_can:"Bekor qilindi",
    ops_last_moves:'So\'nggi harakatlar',
    clients_title:'Mijozlar', clients_meta:'mijoz', clients_empty:"Mijoz yo'q",
    clients_name:'Nomi', clients_phone:'Telefon', clients_addr:'Manzil', clients_notes:'Izoh',
    dispatch_title:'Ekspeditsiya', dispatch_empty:'Avval nakladnoy shakllantiring',
    schedule_title:'Yetkazib berish jadvali',
    schedule_upload:'Grafik yuklash', schedule_view_only:"Ko'rish rejimi",
    stats_title:'Statistika', stats_invoices:'Nakladnoylar',
    stats_items:'Dona', stats_sum:'Summa', stats_avg:'O\'rtacha',
    analytics_title:'Analitika',
    settings_cat:'Katalog', settings_req:'Rekvizitlar',
    settings_exc:'Istisno kunlar', settings_hist:'Tarix', settings_access:'Kirish',
    settings_cat_title:'Tovarlar katalogi', settings_req_title:'Rekvizitlar',
    settings_hist_title:'Sessiya tarixi', settings_users_title:'Foydalanuvchilar',
    settings_supplier:'Yetkazib beruvchi', settings_receiver:'Qabul qiluvchi',
    settings_contract:'Shartnoma',
    modal_manual:'Qo\'lda nakladnoy', modal_order:'Yangi buyurtma', modal_client:'Yangi mijoz',
    // days
    days:['Du','Se','Ch','Pa','Ju','Sh','Ya'],
    days_full:['Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'],
  },
  ru: {
    nav_orders:'Заказы', nav_register:'Реестр', nav_matrix:'Таблица',
    nav_docs:'Накладные', nav_dispatch:'Экспедиция', nav_schedule:'График',
    nav_stats:'Статистика', nav_ops:'Операции', nav_clients:'Клиенты',
    nav_analytics:'Аналитика', nav_settings:'Настройки',
    lbl_invoices:'накл.', lbl_pcs:'шт', lbl_sum:'сум', lbl_unsaved:'не сохранено',
    lbl_logout:'Выйти', lbl_store:'Магазин', lbl_driver:'Водитель',
    lbl_print:'Печать', lbl_save:'Сохранить', lbl_add:'Добавить',
    lbl_cancel:'Отмена', lbl_date:'Дата', lbl_order:'Заказ',
    lbl_product:'Товар', lbl_unit:'Ед.', lbl_qty:'Кол-во',
    lbl_price:'Цена', lbl_total:'С НДС', lbl_vat:'НДС',
    lbl_delivered:'Доставлен', lbl_selected:'Выбрано', lbl_restore:'Восстановить', lbl_delete:'Удалить',
    reg_title:'Реестр накладных', reg_empty:'Накладных пока нет',
    reg_meta_docs:'документов', reg_manual:'Вручную',
    matrix_title:'Матрица количества', hide_zeros:'Скрыть нули',
    matrix_product:'Товар', matrix_total:'Итого',
    docs_title:'Накладные', docs_print_sel:'Печать выбранных',
    docs_empty:'Сначала сформируйте накладные',
    sap_title:'SAP импорт', sap_meta_ready:'накладных готово', sap_meta_empty:'Загрузите Excel',
    sap_batch:'Название партии',
    ops_title:'Операции', ops_orders:'Заказы', ops_moves:'Движения',
    ops_imports:'Импорты', ops_audit:'Аудит',
    ops_empty_orders:'Заказы отсутствуют', ops_empty_moves:'Движений нет',
    ops_empty_imports:'Импортов нет', ops_empty_audit:'Аудит пуст',
    ops_new_order:'Новый заказ', ops_all_statuses:'Все статусы',
    ops_status_new:'Новый', ops_status_prod:'В производстве',
    ops_status_del:'Доставлен', ops_status_can:'Отменён',
    ops_last_moves:'Последние движения',
    clients_title:'Клиенты', clients_meta:'клиентов', clients_empty:'Клиентов пока нет',
    clients_name:'Имя', clients_phone:'Телефон', clients_addr:'Адрес', clients_notes:'Примечания',
    dispatch_title:'Экспедиция', dispatch_empty:'Сначала сформируйте накладные',
    schedule_title:'График доставки',
    schedule_upload:'Загрузить график', schedule_view_only:'Режим просмотра',
    stats_title:'Статистика', stats_invoices:'Накладных',
    stats_items:'Позиций', stats_sum:'Сумма', stats_avg:'Средний чек',
    analytics_title:'Аналитика',
    settings_cat:'Каталог', settings_req:'Реквизиты',
    settings_exc:'Исключения', settings_hist:'История', settings_access:'Доступ',
    settings_cat_title:'Каталог товаров', settings_req_title:'Реквизиты',
    settings_hist_title:'История сессий', settings_users_title:'Пользователи',
    settings_supplier:'Поставщик', settings_receiver:'Получатель',
    settings_contract:'Договор',
    modal_manual:'Накладная вручную', modal_order:'Новый заказ', modal_client:'Новый клиент',
    days:['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],
    days_full:['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'],
  },
  en: {
    nav_orders:'Orders', nav_register:'Registry', nav_matrix:'Table',
    nav_docs:'Invoices', nav_dispatch:'Dispatch', nav_schedule:'Schedule',
    nav_stats:'Statistics', nav_ops:'Operations', nav_clients:'Clients',
    nav_analytics:'Analytics', nav_settings:'Settings',
    lbl_invoices:'inv.', lbl_pcs:'pcs', lbl_sum:'UZS', lbl_unsaved:'unsaved',
    lbl_logout:'Logout', lbl_store:'Store', lbl_driver:'Driver',
    lbl_print:'Print', lbl_save:'Save', lbl_add:'Add',
    lbl_cancel:'Cancel', lbl_date:'Date', lbl_order:'Order',
    lbl_product:'Product', lbl_unit:'Unit', lbl_qty:'Qty',
    lbl_price:'Price', lbl_total:'Total', lbl_vat:'VAT',
    lbl_delivered:'Delivered', lbl_selected:'Selected', lbl_restore:'Restore', lbl_delete:'Delete',
    reg_title:'Invoice Registry', reg_empty:'No invoices yet',
    reg_meta_docs:'documents', reg_manual:'Manual',
    matrix_title:'Quantity Matrix', hide_zeros:'Hide zeros',
    matrix_product:'Product', matrix_total:'Total',
    docs_title:'Invoices', docs_print_sel:'Print selected',
    docs_empty:'Generate invoices first',
    sap_title:'SAP Import', sap_meta_ready:'invoices ready', sap_meta_empty:'Upload Excel',
    sap_batch:'Batch name',
    ops_title:'Operations', ops_orders:'Orders', ops_moves:'Movements',
    ops_imports:'Imports', ops_audit:'Audit',
    ops_empty_orders:'No orders', ops_empty_moves:'No movements',
    ops_empty_imports:'No imports', ops_empty_audit:'Audit is empty',
    ops_new_order:'New order', ops_all_statuses:'All statuses',
    ops_status_new:'New', ops_status_prod:'In production',
    ops_status_del:'Delivered', ops_status_can:'Cancelled',
    ops_last_moves:'Recent movements',
    clients_title:'Clients', clients_meta:'clients', clients_empty:'No clients yet',
    clients_name:'Name', clients_phone:'Phone', clients_addr:'Address', clients_notes:'Notes',
    dispatch_title:'Dispatch', dispatch_empty:'Generate invoices first',
    schedule_title:'Delivery Schedule',
    schedule_upload:'Upload schedule', schedule_view_only:'View only',
    stats_title:'Statistics', stats_invoices:'Invoices',
    stats_items:'Items', stats_sum:'Revenue', stats_avg:'Avg. check',
    analytics_title:'Analytics',
    settings_cat:'Catalog', settings_req:'Requisites',
    settings_exc:'Exceptions', settings_hist:'History', settings_access:'Access',
    settings_cat_title:'Product catalog', settings_req_title:'Requisites',
    settings_hist_title:'Session history', settings_users_title:'Users',
    settings_supplier:'Supplier', settings_receiver:'Receiver',
    settings_contract:'Contract',
    modal_manual:'Manual invoice', modal_order:'New order', modal_client:'New client',
    days:['Mo','Tu','We','Th','Fr','Sa','Su'],
    days_full:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
  },
};
function t(lang: Lang, key: string): string {
  const val = I18N[lang][key];
  return Array.isArray(val) ? val.join(',') : (val ?? key);
}
function tDays(lang: Lang): string[] { return I18N[lang].days as string[]; }
function tDaysFull(lang: Lang): string[] { return I18N[lang].days_full as string[]; }

// ─── DISPATCH COLORS ──────────────────────────────────────────────────────────
const DISPATCH_COLORS = [
  { header:'rgba(10,132,255,0.22)',  text:'#6ab8ff', dot:'#0a84ff',  cell:'rgba(10,132,255,0.10)' },
  { header:'rgba(48,209,88,0.22)',   text:'#6ee89a', dot:'#30d158',  cell:'rgba(48,209,88,0.10)'  },
  { header:'rgba(191,90,242,0.22)',  text:'#d494f8', dot:'#bf5af2',  cell:'rgba(191,90,242,0.10)' },
  { header:'rgba(255,159,10,0.22)',  text:'#ffc55c', dot:'#ff9f0a',  cell:'rgba(255,159,10,0.10)' },
  { header:'rgba(255,69,58,0.22)',   text:'#ff857e', dot:'#ff453a',  cell:'rgba(255,69,58,0.10)'  },
  { header:'rgba(94,204,244,0.22)',  text:'#7dd8f8', dot:'#5ac8fa',  cell:'rgba(94,204,244,0.10)' },
];

// ─── SCHEDULE PANE ───────────────────────────────────────────────────────────

type ScheduleRow = { storeCode: string; market: string; driver: string; days: boolean[] };

function SchedulePane({
  scheduleRows, setScheduleRows, setScheduleDrivers, invoices, dateIso, exceptionDates, showToast,
  dayNames = ['Du','Se','Ch','Pa','Ju','Sh','Ya'],
  dayNamesFull = ['Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'],
  T = (k: string) => k,
  isAdmin = true,
}: {
  scheduleRows: ScheduleRow[];
  setScheduleRows: (r: ScheduleRow[]) => void;
  setScheduleDrivers: (d: string[]) => void;
  invoices: Invoice[];
  dateIso: string;
  exceptionDates: string[];
  showToast: (kind: 'ok' | 'err' | 'info', text: string) => void;
  dayNames?: string[];
  dayNamesFull?: string[];
  T?: (k: string) => string;
  isAdmin?: boolean;
}) {
  // day of week for the current invoice date (0=Sun JS → 0=Du we want Mon=0)
  const dow = useMemo(() => {
    const d = new Date(dateIso + 'T00:00:00');
    return (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  }, [dateIso]);

  const isException = exceptionDates.includes(dateIso);

  async function loadScheduleExcel(file: File) {
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw: (string | number)[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as (string | number)[][];
    // Expect: row[0]=storeCode, row[1]=market, row[2]=driver, row[3..9]=Du..Ya
    const rows: ScheduleRow[] = raw.slice(1).filter((r) => r[0]).map((r) => ({
      storeCode: String(r[0]).trim(),
      market: String(r[1]).trim(),
      driver: String(r[2]).trim(),
      days: [r[3], r[4], r[5], r[6], r[7], r[8], r[9]].map((v) => !!v && v !== '' && v !== 0),
    }));
    setScheduleRows(rows);
    const drivers = [...new Set(rows.map((r) => r.driver).filter(Boolean))];
    setScheduleDrivers(drivers);
    localStorage.setItem('gdetort_schedule', JSON.stringify(rows));
    localStorage.setItem('gdetort_schedule_drivers', JSON.stringify(drivers));
    showToast('ok', `График юкланди: ${rows.length} магазин, ${drivers.length} ҳайдовчи`);
  }

  // Per-invoice schedule status
  const invoiceStatus = useMemo(() => {
    return invoices.map((inv) => {
      const sr = scheduleRows.find((r) => r.storeCode === inv.storeCode);
      if (!sr) return { storeCode: inv.storeCode, market: inv.market, scheduled: null, scheduledToday: false, driver: '' };
      return {
        storeCode: inv.storeCode,
        market: inv.market,
        scheduled: sr.days,
        scheduledToday: sr.days[dow],
        driver: sr.driver,
      };
    });
  }, [invoices, scheduleRows, dow]);

  const uniqStatus = useMemo(() => {
    const seen = new Set<string>();
    return invoiceStatus.filter((s) => { if (seen.has(s.storeCode)) return false; seen.add(s.storeCode); return true; });
  }, [invoiceStatus]);

  const offSchedule = uniqStatus.filter((s) => s.scheduled !== null && !s.scheduledToday && !isException);
  const notInSchedule = uniqStatus.filter((s) => s.scheduled === null);

  return (
    <section className="pane">
      <PaneHead
        title={T('schedule_title')}
        meta={scheduleRows.length ? `${scheduleRows.length}` : '—'}
        actions={
          isAdmin ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {scheduleRows.length > 0 && (
                <>
                  <span style={{ fontSize: 11, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} />
                    Saqlangan
                  </span>
                  <button type="button" className="small" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}
                    onClick={() => {
                      setScheduleRows([]);
                      setScheduleDrivers([]);
                      localStorage.removeItem('gdetort_schedule');
                      localStorage.removeItem('gdetort_schedule_drivers');
                      showToast('ok', 'График o\'chirildi');
                    }}>
                    O&apos;chirish
                  </button>
                </>
              )}
              <label className="small dark" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Download size={14} /> {scheduleRows.length > 0 ? 'Yangilash' : T('schedule_upload')}
                <input type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadScheduleExcel(f); e.target.value = ''; }} />
              </label>
            </div>
          ) : (
            <span className="rolechip">{T('schedule_view_only')}</span>
          )
        }
      />

      {/* Today status banner */}
      {invoices.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className={isException ? 'sched-ok' : offSchedule.length > 0 ? 'sched-err' : scheduleRows.length === 0 ? 'sched-warn' : 'sched-ok'}>
            {isException ? '✓ Бугун истисно кун — график бузилиши ҳисобланмайди' :
             offSchedule.length > 0 ? `⚠ ${offSchedule.length} та магазин бугун графикда йўқ (${dayNamesFull[dow]})` :
             scheduleRows.length === 0 ? '— График юкланмаган' :
             `✓ Барча магазинлар графикда (${dayNamesFull[dow]})`}
          </div>
          {notInSchedule.length > 0 && (
            <details className="sched-warn" style={{ cursor: 'pointer' }}>
              <summary style={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
                <span>ℹ {notInSchedule.length} та магазин графикда топилмади</span>
                <span style={{ fontSize: 10, opacity: 0.6 }}>▼ ko'rish</span>
              </summary>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {notInSchedule.map((s) => (
                  <div key={s.storeCode} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(255,255,255,0.4)', minWidth: 60 }}>{s.storeCode}</span>
                    <span style={{ color: 'rgba(255,255,255,0.75)' }}>{s.market}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {scheduleRows.length === 0 ? (
        <div className="panel">
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>Excel формати:</p>
          <table className="data compact" style={{ maxWidth: 760 }}>
            <thead><tr><th>{T('lbl_store')} (код)</th><th>{T('lbl_store')}</th><th>{T('lbl_driver')}</th><th>Du</th><th>Se</th><th>Ch</th><th>Pa</th><th>Ju</th><th>Sh</th><th>Ya</th></tr></thead>
            <tbody>
              <tr><td>4508881756</td><td>Aeroport /1</td><td>Алишер</td><td>1</td><td></td><td>1</td><td></td><td></td><td>1</td><td></td></tr>
              <tr><td>4508882431</td><td>Aeroport /2</td><td>Бобур</td><td></td><td>1</td><td></td><td>1</td><td></td><td></td><td></td></tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th>Магазин</th>
                <th>{T('lbl_driver')}</th>
                {dayNames.map((d, i) => <th key={i} style={i === dow ? { background: 'var(--honey)', color: '#000' } : {}}>{d}</th>)}
                <th>Бугун</th>
              </tr>
            </thead>
            <tbody>
              {scheduleRows.map((row, i) => {
                const todayOk = row.days[dow];
                const inInvoices = invoices.some((inv) => inv.storeCode === row.storeCode);
                return (
                  <tr key={i} style={!inInvoices ? { opacity: 0.4 } : undefined}>
                    <td><b>{row.market}</b><span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{row.storeCode}</span></td>
                    <td>{row.driver}</td>
                    {row.days.map((on, di) => (
                      <td key={di} style={{ textAlign: 'center', background: di === dow && on ? 'rgba(34,197,94,0.15)' : di === dow && !on ? 'rgba(239,68,68,0.08)' : '' }}>
                        {on ? <span style={{ color: 'var(--ok)', fontWeight: 700 }}>✓</span> : <span style={{ color: '#ccc' }}>·</span>}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center' }}>
                      {isException ? <span style={{ color: 'var(--ok)' }}>истисно</span> :
                       todayOk ? <span style={{ color: 'var(--ok)', fontWeight: 700 }}>✓ бор</span> :
                       inInvoices ? <span style={{ color: 'var(--danger)', fontWeight: 700 }}>⚠ йўқ</span> :
                       <span className="muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── DISPATCH PANE ────────────────────────────────────────────────────────────
function DispatchPane({
  invoices, catalog, scheduleRows, scheduleDrivers,
  dispatchMap, setDispatchMap, dateIso,
  T = (k: string) => k,
}: {
  invoices: Invoice[];
  catalog: CatalogProduct[];
  scheduleRows: ScheduleRow[];
  scheduleDrivers: string[];
  dispatchMap: Record<string, { driverIdx: number; part: number }>;
  setDispatchMap: (m: Record<string, { driverIdx: number; part: number }>) => void;
  dateIso: string;
  T?: (k: string) => string;
}) {
  const DISPATCH_COLORS = [
    { header:'rgba(10,132,255,0.22)', text:'#6ab8ff', dot:'#0a84ff', cell:'rgba(10,132,255,0.10)' },
    { header:'rgba(48,209,88,0.22)',  text:'#6ee89a', dot:'#30d158', cell:'rgba(48,209,88,0.10)'  },
    { header:'rgba(191,90,242,0.22)', text:'#d494f8', dot:'#bf5af2', cell:'rgba(191,90,242,0.10)' },
    { header:'rgba(255,159,10,0.22)', text:'#ffc55c', dot:'#ff9f0a', cell:'rgba(255,159,10,0.10)' },
    { header:'rgba(255,69,58,0.22)',  text:'#ff857e', dot:'#ff453a', cell:'rgba(255,69,58,0.10)'  },
    { header:'rgba(94,204,244,0.22)', text:'#7dd8f8', dot:'#5ac8fa', cell:'rgba(94,204,244,0.10)' },
  ];

  const DEFAULT_DRIVERS = [T('lbl_driver') + ' 1', T('lbl_driver') + ' 2'];
  const [extraDrivers, setExtraDrivers] = useState<string[]>([]);
  const baseDrivers = scheduleDrivers.length > 0 ? scheduleDrivers : DEFAULT_DRIVERS;
  const drivers = [...baseDrivers, ...extraDrivers];

  // Configurable parts per driver
  const [driverPartCounts, setDriverPartCounts] = useState<number[]>(() => drivers.map(() => 1));

  // Keep part counts in sync when drivers change
  useEffect(() => {
    setDriverPartCounts((prev) => drivers.map((_, i) => prev[i] ?? 1));
  }, [drivers.length]);

  const markets = useMemo(() => {
    const seen = new Set<string>();
    return invoices.filter((inv) => { if (seen.has(inv.storeCode)) return false; seen.add(inv.storeCode); return true; })
      .map((inv) => {
        const sr = scheduleRows.find((r) => r.storeCode === inv.storeCode);
        return { storeCode: inv.storeCode, market: inv.market, defaultDriver: sr?.driver ?? '' };
      });
  }, [invoices, scheduleRows]);

  function assign(storeCode: string, driverIdx: number, part: number) {
    setDispatchMap({ ...dispatchMap, [storeCode]: { driverIdx, part } });
  }

  function unassign(storeCode: string) {
    const next = { ...dispatchMap };
    delete next[storeCode];
    setDispatchMap(next);
  }

  function printDriverPart(driverIdx: number, part: number) {
    const storeCodes = new Set(
      markets
        .filter((m) => dispatchMap[m.storeCode]?.driverIdx === driverIdx && dispatchMap[m.storeCode]?.part === part)
        .map((m) => m.storeCode)
    );
    const filteredInvoices = invoices.filter((inv) => storeCodes.has(inv.storeCode));
    const driver = drivers[driverIdx];
    const uniqueMarkets: { storeCode: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const inv of filteredInvoices) {
      if (!seen.has(inv.storeCode)) { seen.add(inv.storeCode); uniqueMarkets.push({ storeCode: inv.storeCode, label: shortMkt(inv.market) }); }
    }
    const usedRows = catalog
      .map((p, i) => {
        const qtys = uniqueMarkets.map((mkt) =>
          filteredInvoices.filter((inv) => inv.storeCode === mkt.storeCode).reduce((s, inv) => s + (inv.lines[i]?.qty || 0), 0)
        );
        const total = qtys.reduce((s, q) => s + q, 0);
        return { name: p.name, qtys, total };
      })
      .filter((r) => r.total > 0);
    const colTotals = uniqueMarkets.map((mkt) =>
      filteredInvoices.filter((inv) => inv.storeCode === mkt.storeCode).reduce((s, inv) => s + inv.sumQty, 0)
    );
    const grandTotal = colTotals.reduce((s, v) => s + v, 0);
    const dateFmt = dateIso.split('-').reverse().join('.');
    const CW = 38;
    const diagTh = uniqueMarkets.map((mkt) => `
      <th style="width:${CW}px;height:80px;padding:0;vertical-align:bottom;border:1px solid #bbb;background:#f0f0f0;text-align:center">
        <div style="writing-mode:vertical-lr;transform:rotate(180deg);font-size:7pt;font-weight:700;white-space:nowrap;padding:3px 0;display:inline-block">${mkt.label}</div>
      </th>`).join('');
    const tbody = usedRows.map((row, ri) => `
      <tr style="background:${ri % 2 === 1 ? '#f5f5f5' : '#fff'}">
        <td style="padding:2px 5px;border:1px solid #ccc;font-size:8pt">${row.name}</td>
        ${row.qtys.map((q) => `<td style="width:${CW}px;text-align:center;border:1px solid #ccc;padding:2px 1px;font-size:8pt;background:${q > 0 ? 'inherit' : '#efefef'}">${q > 0 ? q : ''}</td>`).join('')}
        <td style="width:46px;text-align:center;border:1px solid #999;font-weight:900;font-size:8pt;padding:2px 3px">${row.total}</td>
      </tr>`).join('');
    const tfoot = `<tr style="background:#ddd;font-weight:700;border-top:2px solid #555">
      <td style="padding:3px 5px;border:1px solid #888;font-size:8pt">${T('lbl_total')}</td>
      ${colTotals.map((q) => `<td style="width:${CW}px;text-align:center;border:1px solid #999;font-size:8pt;padding:2px 1px">${q}</td>`).join('')}
      <td style="width:46px;text-align:center;border:1px solid #777;font-weight:900;font-size:9pt;padding:3px">${grandTotal}</td>
    </tr>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${driver} — P${part}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 8pt; margin: 0; color: #000; }
      h2 { font-size: 11pt; margin: 0 0 2px; font-weight: 900; }
      p { margin: 0 0 6px; font-size: 7.5pt; color: #555; }
      table { border-collapse: collapse; width: 100%; table-layout: fixed; }
      @media print {
        @page { size: A4 landscape; margin: 7mm; }
        body { margin: 0; }
        table { page-break-inside: avoid; }
      }
    </style></head><body>
    <h2>${driver} — P${part}</h2>
    <p>${dateFmt} · ${filteredInvoices.length} nakl. · ${grandTotal} dona</p>
    <table>
      <colgroup><col>${uniqueMarkets.map(() => `<col style="width:${CW}px">`).join('')}<col style="width:46px"></colgroup>
      <thead><tr><th style="text-align:left;vertical-align:bottom;padding:3px 5px;border:1px solid #aaa;background:#e8e8e8;font-size:8.5pt">${T('lbl_product')}</th>${diagTh}<th style="width:46px;vertical-align:bottom;padding:3px;border:1px solid #aaa;background:#d8d8d8;font-size:8.5pt">${T('lbl_total')}</th></tr></thead>
      <tbody>${tbody}</tbody>
      <tfoot>${tfoot}</tfoot>
    </table>
    <script>window.onload = () => { window.print(); }<\/script>
    </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <section className="pane">
      <PaneHead
        title={T('dispatch_title')}
        meta={`${markets.length} ${T('lbl_store')} · ${drivers.length} ${T('lbl_driver')}`}
        actions={
          <button type="button" className="small dark"
            onClick={() => setExtraDrivers((prev) => [...prev, `${T('lbl_driver')} ${drivers.length + 1}`])}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            + {T('lbl_driver')}
          </button>
        }
      />

      {invoices.length === 0 ? <Empty title={T('dispatch_empty')} /> : (
        <>
          <div className="tablewrap" style={{ marginBottom: 24 }}>
            <table className="data dispatchTable">
              <thead>
                <tr>
                  <th style={{ minWidth: 220, position: 'sticky', left: 0, zIndex: 4, background: 'rgba(18,18,20,1)' }}>{T('lbl_store')}</th>
                  {drivers.map((d, di) => {
                    const partCount = driverPartCounts[di] ?? 1;
                    const clr = DISPATCH_COLORS[di % DISPATCH_COLORS.length];
                    const isExtra = di >= baseDrivers.length;
                    return (
                      <th key={di} colSpan={partCount} style={{ textAlign: 'center', borderLeft: '2px solid var(--line)', background: clr.header, color: clr.text, whiteSpace: 'nowrap' }}>
                        {isExtra ? (
                          <input
                            value={d}
                            onChange={(e) => setExtraDrivers((prev) => { const n = [...prev]; n[di - baseDrivers.length] = e.target.value; return n; })}
                            style={{ background: 'transparent', border: 'none', borderBottom: `1px solid ${clr.text}`, color: clr.text, fontSize: 12, fontWeight: 600, textAlign: 'center', outline: 'none', width: 90, marginRight: 6 }}
                          />
                        ) : (
                          <span style={{ marginRight: 8 }}>{d}</span>
                        )}
                        <button type="button" onClick={() => setDriverPartCounts((prev) => { const n = [...prev]; n[di] = Math.max(1, (n[di] ?? 1) - 1); return n; })} style={{ background: 'none', border: 'none', color: clr.text, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 3px' }}>−</button>
                        <span style={{ fontSize: 11, color: clr.text }}>{partCount}</span>
                        <button type="button" onClick={() => setDriverPartCounts((prev) => { const n = [...prev]; n[di] = Math.min(8, (n[di] ?? 1) + 1); return n; })} style={{ background: 'none', border: 'none', color: clr.text, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 3px' }}>+</button>
                        {isExtra && (
                          <button type="button" onClick={() => { setExtraDrivers((prev) => prev.filter((_, i) => i !== di - baseDrivers.length)); setDispatchMap(Object.fromEntries(Object.entries(dispatchMap).filter(([, v]) => v.driverIdx !== di))); }}
                            style={{ background: 'none', border: 'none', color: clr.text, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 3px', opacity: 0.6, marginLeft: 4 }}>×</button>
                        )}
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  <th style={{ position: 'sticky', left: 0, zIndex: 4, background: 'rgba(18,18,20,1)' }} />
                  {drivers.map((_, di) => {
                    const partCount = driverPartCounts[di] ?? 1;
                    const clr = DISPATCH_COLORS[di % DISPATCH_COLORS.length];
                    return Array.from({ length: partCount }, (__, pi) => {
                      const partNo = pi + 1;
                      const hasMarkets = markets.some((m) => dispatchMap[m.storeCode]?.driverIdx === di && dispatchMap[m.storeCode]?.part === partNo);
                      return (
                        <th key={`${di}-${pi}`} style={{ textAlign: 'center', fontSize: 10, color: clr.text, borderLeft: pi === 0 ? '2px solid var(--line)' : undefined, whiteSpace: 'nowrap' }}>
                          {hasMarkets ? (
                            <button className="linklike" type="button" onClick={() => printDriverPart(di, partNo)} style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 2, color: clr.dot }}>
                              <Printer size={11} /> P{partNo}
                            </button>
                          ) : (
                            <span>P{partNo}</span>
                          )}
                        </th>
                      );
                    });
                  })}
                </tr>
              </thead>
              <tbody>
                {markets.map((mkt) => {
                  const cur = dispatchMap[mkt.storeCode];
                  return (
                    <tr key={mkt.storeCode}>
                      <td title={`${mkt.storeCode}-${mkt.market.replace(/\s*\/\d+$/, '')}${mkt.defaultDriver ? ' · ' + mkt.defaultDriver : ''}`}
                        style={{ position: 'sticky', left: 0, zIndex: 2, background: 'rgba(18,18,20,1)', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.2 }}>
                          <span style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap' }}>
                            {mkt.market.replace(/\s*\/\d+$/, '')}<span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}> ({mkt.storeCode})</span>
                          </span>
                        </div>
                      </td>
                      {drivers.map((_, di) => {
                        const partCount = driverPartCounts[di] ?? 1;
                        const clr = DISPATCH_COLORS[di % DISPATCH_COLORS.length];
                        return Array.from({ length: partCount }, (__, pi) => {
                          const partNo = pi + 1;
                          const checked = cur?.driverIdx === di && cur?.part === partNo;
                          return (
                            <td
                              key={`${di}-${pi}`}
                              onClick={() => checked ? unassign(mkt.storeCode) : assign(mkt.storeCode, di, partNo)}
                              style={{
                                textAlign: 'center',
                                borderLeft: pi === 0 ? '2px solid var(--line)' : undefined,
                                background: checked ? clr.cell : undefined,
                                cursor: 'pointer',
                                userSelect: 'none',
                                transition: 'background 0.15s',
                              }}
                            >
                              <span
                                className="dispatch-dot"
                                style={{
                                  width: 18, height: 18, borderRadius: '50%',
                                  border: `1.5px solid ${checked ? clr.dot : 'rgba(255,255,255,0.20)'}`,
                                  background: checked ? clr.dot : 'transparent',
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: 1,
                                  transition: 'all 0.15s ease',
                                  pointerEvents: 'none',
                                }}
                              >
                                {checked ? '✓' : ''}
                              </span>
                            </td>
                          );
                        });
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
