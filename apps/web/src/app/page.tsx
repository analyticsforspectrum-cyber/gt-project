'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Download,
  FileText,
  Grid3x3,
  LogOut,
  Map as MapIcon,
  Plus,
  Printer,
  QrCode,
  RefreshCcw,
  Save,
  ScrollText,
  Search,
  Settings,
  Palette,
  Shield,
  Table2,
  Trash2,
  TrendingUp,
  Truck,
  UserPlus,
  Users
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { downloadBarcodePdf } from '@/lib/barcodePdf';
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

type View = 'register' | 'matrix' | 'documents' | 'stats' | 'settings' | 'operations' | 'customers' | 'analytics' | 'orders' | 'schedule' | 'dispatch' | 'undelivered' | 'preferences';
type SettingsView = 'catalog' | 'requisites' | 'sessions' | 'users' | 'exceptions' | 'doverennost';
type Theme = 'dark' | 'light';
type Density = 'compact' | 'cozy' | 'comfortable';

// Curated backgrounds guaranteed to match the rest of the UI. `theme` is the
// readable text/surface theme each background pairs with.
const BG_PRESETS: { id: string; label: string; value: string; theme: Theme }[] = [
  { id: 'midnight', label: 'Midnight', value: 'linear-gradient(180deg, #0b0e12 0%, #080a0d 100%)', theme: 'dark' },
  { id: 'ocean',    label: 'Ocean',    value: 'linear-gradient(160deg, #0a1420 0%, #080d14 100%)', theme: 'dark' },
  { id: 'plum',     label: 'Plum',     value: 'linear-gradient(160deg, #16101c 0%, #0b0810 100%)', theme: 'dark' },
  { id: 'forest',   label: 'Forest',   value: 'linear-gradient(160deg, #0c1612 0%, #080d0b 100%)', theme: 'dark' },
  { id: 'graphite', label: 'Graphite', value: '#0f1115', theme: 'dark' },
  { id: 'paper',    label: 'Paper',    value: 'linear-gradient(180deg, #eef1f6 0%, #e4e9f1 100%)', theme: 'light' },
];

// Relative luminance of a #rrggbb color → decide light vs dark text/surfaces.
function isLightColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6;
}
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
  const [startId, setStartId] = useState(() => {
    if (typeof window === 'undefined') return 16300;
    const saved = localStorage.getItem('gdetort_last_inv_no');
    return saved ? Number(saved) + 1 : 16300;
  });
  const [dateIso, setDateIso] = useState(todayIso());
  const [filterDate, setFilterDate] = useState('');
  const [sessionSuffix, setSessionSuffix] = useState('');
  const [ordersTab, setOrdersTab] = useState<'import' | 'history'>('import');
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [catalogDraft, setCatalogDraft] = useState<CatalogProduct[]>([]);
  const [requisites, setRequisites] = useState<Requisites>(DEFAULT_REQUISITES);
  const [requisitesDraft, setRequisitesDraft] = useState<Requisites>(DEFAULT_REQUISITES);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [allDbInvoices, setAllDbInvoices] = useState<Invoice[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [vazvratAllRows, setVazvratAllRows] = useState<import('@/types/domain').VazvratRecord[]>([]);
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
  const [undeliveredFilter, setUndeliveredFilter] = useState<{ from: string; to: string }>({ from: '', to: '' });
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
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window !== 'undefined' ? ((localStorage.getItem('pref_theme') as Theme) || 'light') : 'light'
  );
  const [density, setDensity] = useState<Density>(() =>
    typeof window !== 'undefined' ? ((localStorage.getItem('pref_density') as Density) || 'cozy') : 'cozy'
  );
  const [appBg, setAppBg] = useState<string>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('pref_bg') || '') : ''
  );

  // Ishonchnoma (power of attorney) fields
  const [dovFields, setDovFields] = useState(() => {
    if (typeof window === 'undefined') return { driver: '', prava: '', car: '', plate: '', validUntil: '', director: '', company: '', address: '' };
    const s = localStorage.getItem('dov_fields');
    return s ? JSON.parse(s) : { driver: '', prava: '', car: '', plate: '', validUntil: '', director: '', company: '', address: '' };
  });
  const setDov = (key: string, val: string) => {
    setDovFields((prev: typeof dovFields) => {
      const next = { ...prev, [key]: val };
      localStorage.setItem('dov_fields', JSON.stringify(next));
      return next;
    });
  };
  const [dovHistory, setDovHistory] = useState<any[]>(() =>
    typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('dov_history') || '[]') : []
  );
  const [histTab, setHistTab] = useState<'nakl' | 'dov'>('nakl');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const toggleDateGroup = (key: string) => setExpandedDates(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const printDov = () => {
    const entry = { ...dovFields, printedAt: new Date().toISOString() };
    const hist = [entry, ...dovHistory].slice(0, 20);
    setDovHistory(hist);
    localStorage.setItem('dov_history', JSON.stringify(hist));

    const w = window.open('', '_blank', 'width=794,height=1123');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:'Times New Roman',serif;font-size:14pt;margin:0;padding:40px 60px;line-height:1.6;color:#000}
      .center{text-align:center}.bold{font-weight:bold}.right{text-align:right}
      .title{font-size:18pt;font-weight:bold;letter-spacing:4px;margin:30px 0 10px}
      .field{border-bottom:1px solid #000;display:inline-block;min-width:200px;padding:0 4px}
      p{margin:8px 0}
      .sign{margin-top:60px;display:flex;justify-content:space-between}
      @media print{body{padding:20px 40px}@page{size:A4;margin:20mm}}
    </style></head><body>
    <div class="right"><b>${dovFields.company || 'MCHJ «_________»'}</b><br>
    ${dovFields.address || ''}<br>
    Ish. №____<br>
    ${dovFields.validUntil ? `от ${new Date(dovFields.validUntil).toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' })} г.` : 'от __________ г.'} г. Ташкент</div>
    <div class="center title">Д О В Е Р Е Н Н О С Т Ь</div>
    <p>Настоящей доверенностью руководство <b>${dovFields.company || '___________'}</b> уполномочивает водителя
    <b>${dovFields.driver || '______________________________'}</b> экспедитора
    владельцу прав <b>${dovFields.prava || '__________'}</b>
    направо пользования автомобилем <b>«${dovFields.car || '_____'}»</b>
    гос. номер <b>${dovFields.plate || '____________'}</b></p>
    <p>Доверенность действительна до <b>${dovFields.validUntil ? new Date(dovFields.validUntil).toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' }) : '__________'}</b> года.</p>
    <div class="sign">
      <div>Генеральный директор</div>
      <div>${dovFields.director || '_________________________'}</div>
    </div>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  };
  // Apply visual preferences to <html> so all token-based styling reacts.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.density = density;
    if (appBg) root.style.setProperty('--app-bg', appBg);
    else root.style.removeProperty('--app-bg');
    localStorage.setItem('pref_theme', theme);
    localStorage.setItem('pref_density', density);
    localStorage.setItem('pref_bg', appBg);
  }, [theme, density, appBg]);
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

  // Available dates from all invoices (for the date filter pill bar)
  const availableDates = useMemo(() =>
    [...new Set(invoices.map((i) => i.dateIso))].sort().reverse(),
  [invoices]);

  // Invoices filtered by selected date (empty = show all)
  const filteredInvoices = useMemo(() =>
    filterDate ? invoices.filter((i) => i.dateIso === filterDate) : invoices,
  [invoices, filterDate]);

  const selectedInvoices = useMemo(() => {
    if (!selected.size) return filteredInvoices;
    return filteredInvoices.filter((invoice) => selected.has(invoice.invNo));
  }, [filteredInvoices, selected]);

  const totals = useMemo(
    () => {
      const active = filteredInvoices.filter((inv) => inv.status === 'delivered');
      return {
        count: filteredInvoices.filter((inv) => inv.status !== 'cancelled').length,
        qty: active.reduce((sum, inv) => sum + inv.sumQty, 0),
        sum: active.reduce((sum, inv) => sum + inv.sumTotal, 0),
      };
    },
    [filteredInvoices]
  );

  const showToast = useCallback((kind: NonNullable<Toast>['kind'], text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  const loadCore = useCallback(
    async (authToken: string, role?: string) => {
      const [catalogResult, requisitesResult, sessionsResult, ordersResult, inventoryResult, importsResult, auditResult, customersResult, statsResult, vazvratAll] = await Promise.all([
        api.catalog(authToken),
        api.requisites(authToken),
        api.sessions(authToken),
        api.orders(authToken),
        api.inventoryMovements(authToken),
        role === 'admin' ? api.imports(authToken) : Promise.resolve([] as ImportRecord[]),
        role === 'admin' ? api.auditLogs(authToken) : Promise.resolve([] as AuditLog[]),
        api.customers(authToken),
        api.dashboardStats(authToken).catch(() => null),
        api.queryVazvrat(authToken, '2020-01-01', new Date().toISOString().slice(0, 10)).catch(() => [] as import('@/types/domain').VazvratRecord[]),
      ]);
      setCatalog(catalogResult);
      setCatalogDraft(catalogResult);
      setRequisites(requisitesResult || DEFAULT_REQUISITES);
      setRequisitesDraft(requisitesResult || DEFAULT_REQUISITES);
      setSessions(sessionsResult);
      setVazvratAllRows(vazvratAll);
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
              setAllDbInvoices(dbInvoices);
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
    try {
      const result = await api.sessions(authToken);
      setSessions(result);
    } catch {
      // ignore auth errors (token expired etc.)
    }
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
      // Track last used invNo for auto-increment
      if (nextInvoices.length) {
        const maxInvNo = Math.max(...nextInvoices.map(i => i.invNo));
        localStorage.setItem('gdetort_last_inv_no', String(maxInvNo));
        setStartId(maxInvNo + 1);
      }
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
        : `${addedNos.length} ta hujjat qo'shildi: №${addedNos.join(', №')}`);
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
      // Sync status + undeliverComment + undeliveredAt from DB
      try {
        const dbInvoices = await api.invoices(token);
        setAllDbInvoices(dbInvoices);
        const dbByInvNo: Record<number, Invoice> = {};
        for (const dbInv of dbInvoices) { dbByInvNo[dbInv.invNo] = dbInv; }
        setInvoices((prev) => prev.map((inv) => {
          const db = dbByInvNo[inv.invNo];
          if (!db) return inv;
          return {
            ...inv,
            status: db.status ?? inv.status ?? 'saved',
            undeliverComment: db.undeliverComment ?? inv.undeliverComment,
            undeliveredAt: db.undeliveredAt ?? inv.undeliveredAt,
          };
        }));
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
    setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: 'saved', undeliverComment: comment.trim(), undeliveredAt: new Date().toISOString() } : inv));
    try {
      const updated = await api.undeliverInvoice(token, invNo, comment.trim());
      setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, ...updated, undeliverComment: updated.undeliverComment ?? comment.trim() } : inv));
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
    // Only send fields accepted by backend DTO: sku, name, unit, qty, price
    const updatedLines = lines.map((l) => ({
      sku: l.sku, name: l.name, unit: l.unit, price: l.price, qty: l.qty,
    }));
    setInvoices((prev) => prev.map((inv) => inv.invNo === invNo ? { ...inv, status: 'delivered', dateIso: date } : inv));
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

      // Merge all sessions' invoices for analytics
      if (sessions.length > 1) {
        try {
          const allSnaps = await Promise.all(
            sessions.map(s => api.session(token, s.invoiceDate).catch(() => null))
          );
          const merged: Invoice[] = [];
          const seen = new Set<number>();
          for (const rec of allSnaps) {
            if (!rec?.snapshot?.invoices) continue;
            for (const inv of rec.snapshot.invoices as Invoice[]) {
              if (!seen.has(inv.invNo)) { seen.add(inv.invNo); merged.push(inv); }
            }
          }
          // Sync statuses from DB
          const dbInvs = allDbInvoices.length > 0 ? allDbInvoices : await api.invoices(token).catch(() => []);
          const statusMap: Record<number, Invoice['status']> = {};
          for (const d of dbInvs) statusMap[d.invNo] = d.status;
          setAllDbInvoices(merged.map(inv => ({ ...inv, status: statusMap[inv.invNo] ?? inv.status })));
        } catch { /* ignore */ }
      }
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
        const total = filteredInvoices.reduce((sum, invoice) => sum + (invoice.lines[index]?.qty || 0), 0);
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
              <SessionPicker
                sessions={sessions}
                currentDate={dateIso}
                onSelect={(d) => void loadSession(d)}
              />
            )}
            <div className="topstat-chip" title="Hujjat soni"><span className="topstat-val">{totals.count}</span></div>
            <div className="topstat-chip"><span className="topstat-val">{fmt0(totals.qty)}</span><span className="topstat-lbl">{T('lbl_pcs')}</span></div>
            <div className="topstat-chip accent"><span className="topstat-val">{fmt0(totals.sum)}</span><span className="topstat-lbl">{T('lbl_sum')}</span></div>
            {unsaved && <span className="topstat-unsaved">{T('lbl_unsaved')}</span>}
          </div>
          <div className="userbar">
            <select
              className="langSelect"
              value={lang}
              onChange={(e) => { const l = e.target.value as Lang; setLang(l); localStorage.setItem('lang', l); }}
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
          <Tab             active={view === 'schedule'}    icon={<MapIcon size={18} />}            label={T('nav_schedule')}  onClick={() => setView('schedule')} />
          {!isAdmin && <Tab active={view === 'stats'}      icon={<TrendingUp size={18} />}    label={T('nav_stats')}     onClick={() => setView('stats')} />}
          {!isAdmin && <Tab active={view === 'customers'}  icon={<Users size={18} />}         label={T('nav_clients')}   onClick={() => setView('customers')} />}
          {isAdmin  && <Tab active={view === 'analytics'}  icon={<BarChart3 size={18} />}     label={T('nav_analytics')} onClick={() => { setView('analytics'); void loadAnalytics(); }} />}
          <Tab             active={view === 'undelivered'} icon={<AlertTriangle size={18} />} label="Qaytgan" onClick={() => setView('undelivered')}
            badge={invoices.filter(i => i.status === 'saved').length || undefined} />
          <Tab             active={view === 'settings'}    icon={<Settings size={18} />}      label={T('nav_settings')}  onClick={() => setView('settings')} />
          <Tab             active={view === 'preferences'} icon={<Palette size={18} />}       label={T('nav_preferences')} onClick={() => setView('preferences')} />
        </nav>

        <main className="workspace">
          {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}

          {view === 'register' && (
            <section className="pane">
              <PaneHead
                title={T('reg_title')}
                meta={filteredInvoices.length ? `${filteredInvoices.length} ${T('reg_meta_docs')} · ${fmt0(totals.sum)} ${T('lbl_sum')}` : '—'}
                actions={
                  <>
                    <SessionPicker
                      sessions={sessions}
                      currentDate={dateIso}
                      onSelect={(d) => loadSession(d)}
                    />
                    <button className="small dark" type="button" onClick={() => setManualOpen(true)}>
                      <Plus size={15} /> {T('reg_manual')}
                    </button>
                    <button className="small" type="button" disabled={!filteredInvoices.length} onClick={exportXlsx}>
                      <Download size={15} /> Excel
                    </button>
                  </>
                }
              />
              {!filteredInvoices.length ? (
                <Empty title={T('reg_empty')} />
              ) : (
                <div className="tablewrap" style={{ maxHeight: 'calc(100dvh - 240px)', overflowY: 'auto' }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th title={T('lbl_delivered')}>Status</th>
                        <th className="check" title="Chop etish uchun tanlash">
                          <input type="checkbox"
                            style={{ accentColor: '#46bf72', cursor: 'pointer' }}
                            checked={filteredInvoices.length > 0 && filteredInvoices.every(i => selected.has(i.invNo))}
                            onChange={(e) => {
                              if (e.target.checked) setSelected(new Set(filteredInvoices.map(i => i.invNo)));
                              else setSelected(new Set());
                            }} />
                        </th>
                        <th>№</th>
                        <th>{T('lbl_order')}</th>
                        <th>{T('lbl_store')}</th>
                        <th className="right">{T('lbl_pcs')}</th>
                        <th className="right">{T('lbl_total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((invoice) => (
                        <tr
                          key={invoice.invNo}
                          className={[selected.has(invoice.invNo) ? 'picked' : '', invoice.status === 'cancelled' ? 'cancelled-row' : ''].join(' ')}
                          style={invoice.status === 'cancelled' ? { opacity: 0.4 } : undefined}
                        >
                          <td className="check" title={invoice.status === 'saved' && invoice.undeliverComment ? `⚠️ ${invoice.undeliverComment}` : undefined}>
                            <input
                              type="checkbox"
                              checked={invoice.status === 'delivered'}
                              style={{ accentColor: 'var(--ok)', cursor: 'pointer' }}
                              onChange={() => toggleDelivered(invoice.invNo, invoice.status === 'delivered')}
                            />
                          </td>
                          <td className="check">
                            <input
                              type="checkbox"
                              checked={selected.has(invoice.invNo)}
                              style={{ accentColor: '#46bf72', cursor: 'pointer' }}
                              title="Chop uchun tanlash"
                              onChange={() => setSelected(prev => {
                                const n = new Set(prev);
                                n.has(invoice.invNo) ? n.delete(invoice.invNo) : n.add(invoice.invNo);
                                return n;
                              })}
                            />
                          </td>
                          <td>
                            <button className="linklike" type="button" onClick={() => setInvoiceDetail(invoice)}>
                              <span className="invoiceNo">{invoice.invNo}</span>
                            </button>
                            {invoice.originalDateIso && invoice.originalDateIso !== invoice.dateIso && (
                              <span title={`Ko'chirilgan: ${fmtDateRu(invoice.originalDateIso)} → ${fmtDateRu(invoice.dateIso)}`}
                                style={{ marginLeft: 5, fontSize: 10, background: 'rgba(70,191,114,0.18)', color: 'var(--ok)', borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle', cursor: 'default' }}>
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
                            {fmt0(invoice.sumQty)}
                          </td>
                          <td className="right mono" style={invoice.status !== 'delivered' ? { color: 'var(--muted)' } : undefined}>
                            {fmt(invoice.sumTotal)}
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
                      background: 'rgba(var(--hi-rgb),0.06)', border: '1px solid rgba(var(--hi-rgb),0.14)',
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
                    style={{ background: 'var(--danger)', color: '#fff', opacity: undeliverModal.comment.trim() ? 1 : 0.4 }}
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
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, height: 40 }}
                    />
                  </div>
                  {/* Editable product lines */}
                  {restoreModal.lines.length > 0 && (
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Mahsulotlar (sonini o&apos;zgartiring)</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                        {restoreModal.lines.map((line, i) => (
                          <div key={line.sku} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(var(--hi-rgb),0.04)', borderRadius: 8 }}>
                            <div style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(line.price * 1.12)} so&apos;m / {line.unit}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              <button type="button"
                                style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(var(--hi-rgb),0.08)', border: '1px solid rgba(var(--hi-rgb),0.12)', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
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
                                style={{ width: 48, textAlign: 'center', background: 'rgba(var(--hi-rgb),0.06)', border: '1px solid rgba(var(--hi-rgb),0.14)', borderRadius: 6, color: 'inherit', fontSize: 14, padding: '3px 4px', fontFamily: 'var(--mono)' }}
                              />
                              <button type="button"
                                style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(var(--hi-rgb),0.08)', border: '1px solid rgba(var(--hi-rgb),0.12)', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                                onClick={() => {
                                  const updated = restoreModal.lines.map((l, idx) => idx === i ? { ...l, qty: Math.min(l.initQty, l.qty + 1) } : l);
                                  setRestoreModal({ ...restoreModal, lines: updated });
                                }}>+</button>
                              <span style={{ fontSize: 11, color: line.qty < line.initQty ? 'var(--warn)' : 'var(--muted)', minWidth: 30, textAlign: 'right' }}>
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
                        <b style={{ fontSize: 13, color: 'var(--warn)' }}>{invoiceDetail.undeliverComment}</b>
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
              {!filteredInvoices.length ? (
                <Empty title={T('docs_empty')} />
              ) : (
                <div className="matrixwrap">
                  <table className="matrix">
                    <thead>
                      <tr>
                        <th className="productcol">{T('matrix_product')}</th>
                        <th className="totcol">{T('matrix_total')}</th>
                        {filteredInvoices.map((invoice) => (
                          <th key={invoice.invNo}>
                            <span>№ {invoice.invNo}</span>
                            <small style={{ whiteSpace: 'nowrap' }}>{invoice.storeCode} · {shortMkt(invoice.market)} <b style={{ color: 'var(--honey)', fontFamily: 'var(--mono)', fontWeight: 900 }}>/{invoice.seq}</b></small>
                            <em>{invoice.order}</em>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixIndices.map(({ product, index }, rowIdx) => {
                        const rowTotal = filteredInvoices.reduce((acc, inv) => acc + (inv.lines[index]?.qty || 0), 0);
                        const initTotal = filteredInvoices.reduce((acc, inv) => acc + (inv.lines[index]?.init || 0), 0);
                        return (
                          <tr key={`${product.sku}-${index}`} className={rowIdx % 2 === 0 ? 'row-even' : 'row-odd'} style={rowTotal === 0 ? { opacity: 0.4 } : undefined}>
                            <td className="productcol">
                              <b>{product.name}</b>
                              <span className="sku-hidden">{product.sku}</span>
                            </td>
                            <td className="totcol">
                              <b>{rowTotal > 0 ? fmt0(rowTotal) : <span className="muted">—</span>}</b>
                              {initTotal > 0 && rowTotal < initTotal && (
                                <span style={{ color: 'var(--danger)', fontSize: 10 }}>/{fmt0(initTotal)}</span>
                              )}
                            </td>
                            {filteredInvoices.map((invoice, colIdx) => {
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
                                        const nCols = filteredInvoices.length;
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
              <div className="subtabs" style={{ position: 'static', marginTop: 0, paddingTop: 0, background: 'transparent' }}>
                <button className={ordersTab === 'import' ? 'active' : ''} type="button" onClick={() => setOrdersTab('import')}>
                  <FileText size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} /> SAP import
                </button>
                <button className={ordersTab === 'history' ? 'active' : ''} type="button" onClick={() => setOrdersTab('history')}>
                  <ClipboardList size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} /> Buyurtma tarixi
                  <span style={{ fontSize: 11, background: 'rgba(var(--ink-rgb),0.08)', borderRadius: 10, padding: '1px 7px', marginLeft: 4 }}>{sessions.length}</span>
                </button>
              </div>

              {ordersTab === 'import' && (<>

              {/* ── Trendy import layout ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

                {/* LEFT: Upload zone */}
                <label style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 200, border: `2px dashed ${sapRaw ? '#46bf72' : 'rgba(var(--ink-rgb),0.15)'}`, borderRadius: 16, background: sapRaw ? 'rgba(70,191,114,0.06)' : 'rgba(var(--ink-rgb),0.02)', cursor: 'pointer', transition: 'all 0.2s' }}>
                  <input type="file" accept=".xls,.xlsx" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
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
                        showToast('ok', `Fayl yuklandi: ${rows.length} qator`);
                      } catch { showToast('err', "Faylni o'qishda xatolik"); }
                    }}
                  />
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: sapRaw ? 'rgba(70,191,114,0.15)' : 'rgba(var(--ink-rgb),0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={26} style={{ color: sapRaw ? '#46bf72' : 'var(--muted)' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: sapRaw ? '#46bf72' : 'var(--ink)' }}>{sapRaw ? '✓ Fayl yuklandi' : 'Excel faylni tanlang'}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>.xls yoki .xlsx formatda</div>
                  </div>
                  {xlsSheets.length > 1 && (
                    <select value={xlsSelectedSheet} style={{ fontSize: 12, borderRadius: 8, padding: '4px 8px', position: 'relative', zIndex: 1 }}
                      onClick={e => e.stopPropagation()}
                      onChange={async (e) => {
                        e.stopPropagation();
                        const sheetName = e.target.value;
                        setXlsSelectedSheet(sheetName);
                        if (!xlsWorkbook) return;
                        const XLSX = await import('xlsx');
                        const ws = xlsWorkbook.Sheets[sheetName];
                        const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
                        setSapRaw(rows.map((r) => r.join('\t')).join('\n'));
                      }}>
                      {xlsSheets.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </label>

                {/* RIGHT: Settings */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 6 }}>Sana</div>
                      <input type="date" value={dateIso} onChange={(e) => setDateIso(e.target.value)} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 6 }}>Hujjat № dan</div>
                      <input type="number" value={startId} onChange={(e) => setStartId(Number(e.target.value))} style={{ width: '100%' }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 6 }}>Sessiya nomi</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(var(--ink-rgb),0.04)', border: '1px solid rgba(var(--ink-rgb),0.09)', borderRadius: 10, padding: '2px 10px 2px 4px' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)', background: 'rgba(var(--ink-rgb),0.06)', borderRadius: 6, padding: '4px 8px', whiteSpace: 'nowrap' }}>{dateIso}</span>
                      <input type="text" placeholder="qo'shimcha (ixtiyoriy)" value={sessionSuffix} onChange={(e) => setSessionSuffix(e.target.value)} style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13 }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 'auto' }}>
                    <button type="button" disabled={busy || !sapRaw} onClick={() => generateInvoices()}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 12, fontWeight: 700, fontSize: 14, border: 'none', cursor: busy || !sapRaw ? 'not-allowed' : 'pointer', opacity: busy || !sapRaw ? 0.45 : 1, background: 'linear-gradient(135deg, #46bf72 0%, #2ea855 100%)', color: '#fff', boxShadow: sapRaw ? '0 4px 16px rgba(70,191,114,0.35)' : 'none', transition: 'all 0.2s' }}>
                      <FileText size={16} /> SAP import
                    </button>
                    <button type="button" disabled={busy || !invoices.length} onClick={() => saveCurrentSession()}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 12, fontWeight: 700, fontSize: 14, border: '1.5px solid rgba(var(--ink-rgb),0.15)', cursor: busy || !invoices.length ? 'not-allowed' : 'pointer', opacity: busy || !invoices.length ? 0.4 : 1, background: 'rgba(var(--ink-rgb),0.04)', color: 'var(--ink)', transition: 'all 0.2s' }}>
                      <Save size={16} /> Saqlash
                    </button>
                  </div>
                </div>
              </div>

              {/* Summary */}
              {invoices.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Nakladnoylar', value: `${invoices[0].invNo}–${invoices[invoices.length-1].invNo}` },
                    { label: 'Jami dona', value: invoices.length },
                    { label: 'Summa', value: `${fmt0(totals.sum)} so'm` },
                    { label: 'Tanlangan', value: selected.size || invoices.length },
                  ].map(item => (
                    <div key={item.label} style={{ background: 'rgba(var(--ink-rgb),0.03)', border: '1px solid rgba(var(--ink-rgb),0.08)', borderRadius: 12, padding: '12px 16px' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              )}
              </>)}

              {ordersTab === 'history' && (
                <div className="sessionList" style={{ marginTop: 8 }}>
                  {sessions.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Buyurtma tarixi yo'q</div>
                  ) : sessions.map((session) => (
                    <div className="sessionRow" key={session.invoiceDate}>
                      <b>{session.invoiceDate}</b>
                      <span className="sess-badge">{session.invoiceCount} накл.</span>
                      <span className="sess-sum">{fmt0(session.sumTotal)} сум</span>
                      <span className="sess-badge">{session.versions?.length || 0} версий</span>
                      <button className="mini" type="button" onClick={() => loadSession(session.invoiceDate)}>
                        {T('lbl_restore')}
                      </button>
                      {isAdmin && (
                        <button className="iconbtn danger" type="button" onClick={() => deleteSession(session.invoiceDate)}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {view === 'schedule' && (
            <SchedulePane
              scheduleRows={scheduleRows}
              setScheduleRows={setScheduleRows}
              setScheduleDrivers={setScheduleDrivers}
              invoices={filteredInvoices}
              dateIso={filterDate || dateIso}
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
              invoices={filteredInvoices}
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
              invoices={allDbInvoices.length > invoices.length ? allDbInvoices : invoices}
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

          {view === 'undelivered' && <UndeliveredPane
            invoices={invoices}
            undeliveredFilter={undeliveredFilter}
            setUndeliveredFilter={setUndeliveredFilter}
            setInvoiceDetail={setInvoiceDetail}
            setRestoreModal={setRestoreModal}
            fmt={fmt}
            todayIso={todayIso}
          />}


          {view === 'preferences' && (

            <section className="pane">
              <PaneHead title={T('nav_preferences')} />
              <div className="prefGrid">

                <div className="prefCard">
                  <h3>{T('pref_theme')}</h3>
                  <p className="prefHint">{T('pref_theme_hint')}</p>
                  <div className="seg" role="group">
                    <button type="button" className={theme === 'dark' ? 'on' : ''} onClick={() => { setTheme('dark'); setAppBg(''); }}>{T('pref_dark')}</button>
                    <button type="button" className={theme === 'light' ? 'on' : ''} onClick={() => { setTheme('light'); setAppBg(''); }}>{T('pref_light')}</button>
                  </div>
                </div>

                <div className="prefCard">
                  <h3>{T('pref_bg')}</h3>
                  <p className="prefHint">{T('pref_bg_hint')}</p>
                  <div className="swatches">
                    {BG_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        title={p.label}
                        className={`swatch${appBg === p.value ? ' on' : ''}`}
                        style={{ background: p.value }}
                        onClick={() => { setAppBg(p.value); setTheme(p.theme); }}
                      />
                    ))}
                  </div>
                  <div className="prefRow" style={{ marginTop: 14 }}>
                    <span>{T('pref_bg_custom')}</span>
                    <span className="colorPick">
                      <input
                        type="color"
                        value={/^#[0-9a-f]{6}$/i.test(appBg) ? appBg : '#0b0e12'}
                        onChange={(e) => { const c = e.target.value; setAppBg(c); setTheme(isLightColor(c) ? 'light' : 'dark'); }}
                      />
                      <button className="small" type="button" onClick={() => { setAppBg(''); setTheme('dark'); }}>{T('pref_reset')}</button>
                    </span>
                  </div>
                </div>

                <div className="prefCard">
                  <h3>{T('pref_density')}</h3>
                  <p className="prefHint">{T('pref_density_hint')}</p>
                  <div className="seg" role="group">
                    <button type="button" className={density === 'compact' ? 'on' : ''} onClick={() => setDensity('compact')}>{T('pref_compact')}</button>
                    <button type="button" className={density === 'cozy' ? 'on' : ''} onClick={() => setDensity('cozy')}>{T('pref_cozy')}</button>
                    <button type="button" className={density === 'comfortable' ? 'on' : ''} onClick={() => setDensity('comfortable')}>{T('pref_comfortable')}</button>
                  </div>
                </div>

                <div className="prefCard">
                  <h3>{T('pref_lang')}</h3>
                  <p className="prefHint">{T('pref_lang_hint')}</p>
                  <div className="seg" role="group">
                    <button type="button" className={lang === 'uz' ? 'on' : ''} onClick={() => { setLang('uz'); localStorage.setItem('lang', 'uz'); }}>O‘zbek</button>
                    <button type="button" className={lang === 'ru' ? 'on' : ''} onClick={() => { setLang('ru'); localStorage.setItem('lang', 'ru'); }}>Русский</button>
                    <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => { setLang('en'); localStorage.setItem('lang', 'en'); }}>English</button>
                  </div>
                </div>

              </div>
            </section>
          )}

          {view === 'settings' && (
            <section className="pane">
              <div className="subtabs">
                <button className={settingsView === 'catalog' ? 'active' : ''} type="button" onClick={() => setSettingsView('catalog')}>{T('settings_cat')}</button>
                <button className={settingsView === 'requisites' ? 'active' : ''} type="button" onClick={() => setSettingsView('requisites')}>{T('settings_req')}</button>
                <button className={(settingsView as string) === 'exceptions' ? 'active' : ''} type="button" onClick={() => setSettingsView('exceptions')}>{T('settings_exc')}</button>
                <button className={settingsView === 'sessions' ? 'active' : ''} type="button" onClick={() => setSettingsView('sessions')}>{T('settings_hist')}</button>
                {isAdmin && <button className={settingsView === 'users' ? 'active' : ''} type="button" onClick={() => setSettingsView('users')}>{T('settings_access')}</button>}
                <button className={(settingsView as string) === 'doverennost' ? 'active' : ''} type="button" onClick={() => setSettingsView('doverennost' as any)}>Ishonchnoma</button>
              </div>

              {settingsView === 'catalog' && (
                <>
                  <PaneHead
                    title=""
                    meta={`${catalogDraft.length} ta mahsulot`}
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
                    <table className="data editable" style={{ tableLayout: 'auto', width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '180px' }}>SKU</th>
                          <th>{T('lbl_product')}</th>
                          <th style={{ width: '60px' }}>{T('lbl_unit')}</th>
                          <th className="right" style={{ width: '120px' }}>{T('lbl_price')}</th>
                          {isAdmin && <th style={{ width: '40px' }} />}
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
                              <input className="right" disabled={!isAdmin} value={fmt0(product.price)} onChange={(event) => setCatalogDraft(updateCatalogDraft(catalogDraft, index, { price: parseNum(event.target.value) }))} />
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
                    title=""
                    meta=""
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
                <TarixPane
                  sessions={sessions}
                  dovHistory={dovHistory}
                  qaytganInvoices={invoices.filter(i => i.status === 'saved' && !!i.undeliverComment)}
                  vazvratRows={vazvratAllRows}
                  setVazvratAllRows={setVazvratAllRows}
                  orders={orders}
                  token={token!}
                  expandedDates={expandedDates}
                  toggleDateGroup={toggleDateGroup}
                  loadSession={loadSession}
                  deleteSession={deleteSession}
                  setDovFields={setDovFields}
                  setSettingsView={setSettingsView}
                  refreshSessions={refreshSessions}
                  isAdmin={isAdmin}
                  fmtDateRu={fmtDateRu}
                  fmt0={fmt0}
                  T={T}
                />
              )}

              {settingsView === 'exceptions' && (
                <>
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

              {(settingsView as string) === 'doverennost' && (
                <>
                  {/* Word-like document preview */}
                  <div className="dov-page-wrap" style={{ position: 'relative' }}>
                    <button className="small dark" type="button" onClick={printDov} style={{ position: 'absolute', top: 16, right: 16, fontSize: 12, padding: '6px 16px', zIndex: 2 }}>
                      <Printer size={13} /> Chop etish
                    </button>
                    <div className="dov-page">

                      {/* Top-right block */}
                      <div className="dov-topright">
                        <div><input className="dov-inp dov-inp-right bold" value={dovFields.company} onChange={e => setDov('company', e.target.value)} placeholder='MCHJ «Druzya»' /></div>
                        <div><input className="dov-inp dov-inp-right" value={dovFields.address} onChange={e => setDov('address', e.target.value)} placeholder='Toshkent shahar, Yunusobod tumani, ...' /></div>
                        <div className="dov-tr-meta">Исх. №18</div>
                        <div className="dov-tr-meta">
                          от <input className="dov-inp dov-inp-sm" type="date" value={dovFields.validUntil} onChange={e => setDov('validUntil', e.target.value)} /> г.&nbsp;&nbsp;г. Ташкент
                        </div>
                      </div>

                      {/* Title */}
                      <div className="dov-title">Д О В Е Р Е Н Н О С Т Ь</div>

                      {/* Body — single paragraph, inputs inline */}
                      <p className="dov-body">
                        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Настоящей доверенностью руководство <input className="dov-inp dov-inp-md bold" value={dovFields.company} onChange={e => setDov('company', e.target.value)} placeholder='MCHJ «Druzya»' /> уполномочивает водителя <input className="dov-inp dov-inp-lg bold" value={dovFields.driver} onChange={e => setDov('driver', e.target.value)} placeholder="FAMILIYA ISMI SHARIFI" /> экспедитора владельцу правы <input className="dov-inp dov-inp-md" value={dovFields.prava} onChange={e => setDov('prava', e.target.value)} placeholder='AF 0006178' /> направо пользования автомобилем «<input className="dov-inp dov-inp-sm" value={dovFields.car} onChange={e => setDov('car', e.target.value)} placeholder='LB2' />» гос. номер <input className="dov-inp dov-inp-md" value={dovFields.plate} onChange={e => setDov('plate', e.target.value)} placeholder='01 W 851 SC' />
                      </p>

                      <p className="dov-body">
                        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Доверенность действительна до <strong>{dovFields.validUntil ? new Date(dovFields.validUntil).toLocaleDateString('ru-RU', {day:'2-digit',month:'2-digit',year:'numeric'}) : '__________'}</strong> года.
                      </p>

                      {/* Signature */}
                      <div className="dov-sign">
                        <span>Генеральный директор</span>
                        <input className="dov-inp dov-inp-md" value={dovFields.director} onChange={e => setDov('director', e.target.value)} placeholder='Бойматова Д.А.' />
                      </div>
                    </div>
                  </div>

                  {/* Doverennost history moved to Tarix tab */}
                </>
              )}
            </section>
          )}
        </main>
      </div>

      {manualOpen && (
        <div className="modalBackdrop">
          <div className="modal manual-modal">
            <div className="modalHead">
              <h3>Qo&apos;lda hujjat</h3>
              <button className="iconbtn" type="button" onClick={() => { setManualOpen(false); setManualStores([emptyStoreRow()]); }}>✕</button>
            </div>
            <div className="modalBody manual-modal-body">
              {/* Top bar: date + add store */}
              <div className="manual-topbar">
                <label className="manual-date-field">
                  <span>Sana</span>
                  <input type="date" value={manual.dateIso} onChange={(e) => setManual({ ...manual, dateIso: e.target.value })} />
                </label>
                <button type="button" className="small" onClick={() => setManualStores([...manualStores, emptyStoreRow()])}>
                  + Do&apos;kon
                </button>
              </div>

              {/* Transposed table: products = rows, stores = columns */}
              <div className="manual-tablewrap">
                <table className="manual-table">
                  <thead>
                    <tr>
                      <th className="manual-prodcol">Mahsulot</th>
                      {manualStores.map((col, ci) => (
                        <th key={ci} className="manual-storecol">
                          <div className="manual-store-header">
                            <input className="manual-inp" placeholder="Kod" value={col.storeCode}
                              onChange={(e) => { const u = [...manualStores]; u[ci] = { ...u[ci], storeCode: e.target.value }; setManualStores(u); }} />
                            <input className="manual-inp manual-inp-grow" placeholder="Market nomi" value={col.storeName}
                              onChange={(e) => { const u = [...manualStores]; u[ci] = { ...u[ci], storeName: e.target.value }; setManualStores(u); }} />
                            <button type="button" className="manual-del"
                              onClick={() => setManualStores(manualStores.length > 1 ? manualStores.filter((_, i) => i !== ci) : [emptyStoreRow()])}>×</button>
                          </div>
                          <input className="manual-inp manual-inp-full" placeholder="№ Zakaz" value={col.order}
                            onChange={(e) => { const u = [...manualStores]; u[ci] = { ...u[ci], order: e.target.value }; setManualStores(u); }} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((p, ri) => {
                      const defaultPrice = Math.round(p.price * 1.12 * 100) / 100;
                      const rowHasAny = manualStores.some(col => parseNum(col.cells[p.sku]?.qty ?? '') > 0);
                      return (
                        <tr key={p.sku} className={ri % 2 === 0 ? '' : 'manual-row-even'}>
                          <td className="manual-prodcol manual-prodname">
                            <span className="manual-name">{p.name}</span>
                            <span className="manual-meta">{defaultPrice.toLocaleString('ru-RU')} · {p.unit}</span>
                          </td>
                          {manualStores.map((col, ci) => {
                            const cell = col.cells[p.sku];
                            const qtyVal = cell?.qty ?? '';
                            const priceVal = cell?.price ?? '';
                            const hasQty = parseNum(qtyVal) > 0;
                            const update = (field: 'qty' | 'price', val: string) => {
                              const u = [...manualStores];
                              u[ci] = { ...u[ci], cells: { ...u[ci].cells, [p.sku]: { qty: qtyVal, price: priceVal, [field]: val } } };
                              setManualStores(u);
                            };
                            return (
                              <td key={ci} className={`manual-cell${hasQty ? ' manual-cell-active' : ''}`}>
                                <input type="number" min={0} placeholder="0"
                                  value={qtyVal} onChange={(e) => update('qty', e.target.value)}
                                  className={`manual-qty${hasQty ? ' active' : ''}`} />
                                <input type="number" min={0} placeholder={String(defaultPrice)}
                                  value={priceVal} onChange={(e) => update('price', e.target.value)}
                                  className="manual-price" style={{ color: priceVal && parseNum(priceVal) !== defaultPrice ? 'var(--honey)' : undefined }} />
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
    <main style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      {/* LEFT: form */}
      <section className="login-split-form" style={{ flex: '0 0 420px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 52px', background: 'var(--surface)' }}>
        {/* Logo */}
        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #46bf72, #2ea855)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 auto 12px', boxShadow: '0 8px 24px rgba(70,191,114,0.35)' }}>GT</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Добро пожаловать</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>Введите свои учётные данные</p>
        </div>

        <form style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}
          onSubmit={(event) => { event.preventDefault(); void onLogin(email, password); }}>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Email</div>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@example.com"
              style={{ width: '100%', borderRadius: 10, padding: '10px 14px', fontSize: 14, border: '1.5px solid rgba(var(--ink-rgb),0.12)', background: 'rgba(var(--ink-rgb),0.03)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Пароль</div>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              style={{ width: '100%', borderRadius: 10, padding: '10px 14px', fontSize: 14, border: '1.5px solid rgba(var(--ink-rgb),0.12)', background: 'rgba(var(--ink-rgb),0.03)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <button type="submit" disabled={busy}
            style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 12, fontWeight: 700, fontSize: 15, border: 'none', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1, background: 'linear-gradient(135deg, #46bf72 0%, #2ea855 100%)', color: '#fff', boxShadow: '0 4px 16px rgba(70,191,114,0.35)', transition: 'all 0.2s', width: '100%' }}>
            <Shield size={17} /> Войти
          </button>
        </form>

        {toast && <div className={`toast ${toast.kind}`} style={{ marginTop: 20, width: '100%' }}>{toast.text}</div>}
      </section>

      {/* RIGHT: brand panel */}
      <section className="login-split-brand" style={{ flex: 1, background: 'linear-gradient(160deg, #0f5c30 0%, #1a8c44 60%, #25b857 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 48px', position: 'relative', overflow: 'hidden', gap: 28 }}>
        {/* Deco blobs */}
        <div style={{ position: 'absolute', top: -120, right: -120, width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', bottom: -100, left: -100, width: 320, height: 320, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />

        {/* Title */}
        <div style={{ textAlign: 'center', zIndex: 1 }}>
          <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 900, margin: '0 0 6px', letterSpacing: '-0.02em' }}>ГДЕ ТОРТ? — система управления</h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, margin: 0 }}>Накладные · аналитика · экспедиция · реестр</p>
        </div>

        {/* Stacked mockup screenshots */}
        <div style={{ position: 'relative', width: '100%', maxWidth: 460, height: 340, zIndex: 1 }}>

          {/* Back card — Statistika */}
          <div style={{ position: 'absolute', top: 40, left: 30, width: 380, height: 240, background: '#fff', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', transform: 'rotate(-4deg)', overflow: 'hidden', opacity: 0.85 }}>
            <div style={{ background: '#f8f8fa', borderBottom: '1px solid #eee', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f57' }} /><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#febc2e' }} /><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#28c840' }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: '#666', marginLeft: 6 }}>Statistika</div>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {['970', '0', '970', '24 765 261'].map((v, i) => (
                  <div key={i} style={{ flex: 1, background: i === 3 ? '#e8f5ee' : '#f5f5f5', borderRadius: 8, padding: '6px 8px' }}>
                    <div style={{ fontSize: 7, color: '#999', marginBottom: 2 }}>{['KELDI','KAMAYDI','BERILDI','SUMMA'][i]}</div>
                    <div style={{ fontSize: i === 3 ? 8 : 11, fontWeight: 800, color: i === 3 ? '#1a8c44' : '#111' }}>{v}</div>
                  </div>
                ))}
              </div>
              {[['Где торт? "Орешки" 350г', '120', '2 904 000'],['Баурсак 365 kun, 350г','110','2 798 400'],['Где торт? Рогалик 300г','100','2 365 000'],['Чак-чак 365 kun, 300г','90','2 332 800']].map(([n,q,s]) => (
                <div key={n} style={{ display: 'flex', gap: 6, padding: '4px 0', borderBottom: '1px solid #f0f0f0', alignItems: 'center' }}>
                  <div style={{ flex: 1, fontSize: 8, color: '#333', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{n}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#1a8c44', width: 24, textAlign: 'right' }}>{q}</div>
                  <div style={{ fontSize: 8, color: '#666', width: 52, textAlign: 'right' }}>{s}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Middle card — Ro'yxat */}
          <div style={{ position: 'absolute', top: 20, left: 10, width: 390, height: 250, background: '#fff', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', transform: 'rotate(2deg)', overflow: 'hidden', opacity: 0.92 }}>
            <div style={{ background: '#f8f8fa', borderBottom: '1px solid #eee', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f57' }} /><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#febc2e' }} /><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#28c840' }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: '#666', marginLeft: 6 }}>Nakladnoylar ro'yxati — 75 hujjat</div>
            </div>
            <div style={{ padding: '8px 12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '32px 40px 1fr 60px 60px', gap: 4, fontSize: 7, fontWeight: 800, color: '#aaa', textTransform: 'uppercase', marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid #eee' }}>
                <span>St.</span><span>№</span><span>Market</span><span style={{ textAlign:'right' }}>Dona</span><span style={{ textAlign:'right' }}>Jami</span>
              </div>
              {[['16301','Mercato /1','20','478 500'],['16302','Mercato /2','15','326 880'],['16303','Alayskiy /1','40','1 055 999'],['16304','Uchtepa /1','40','1 160 500'],['16305','Shedevr /1','10','241 999']].map(([no,m,d,s]) => (
                <div key={no} style={{ display: 'grid', gridTemplateColumns: '32px 40px 1fr 60px 60px', gap: 4, padding: '4px 0', borderBottom: '1px solid #f5f5f5', alignItems: 'center' }}>
                  <div style={{ width: 14, height: 14, borderRadius: 7, background: '#28c840' }} />
                  <div style={{ fontSize: 8, fontWeight: 800, color: '#e07b00' }}>{no}</div>
                  <div style={{ fontSize: 8, color: '#333' }}>{m}</div>
                  <div style={{ fontSize: 8, color: '#999', textAlign: 'right' }}>{d}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#111', textAlign: 'right' }}>{s}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Front card — Savdo analytics */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: 400, height: 260, background: '#fff', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
            <div style={{ background: '#f8f8fa', borderBottom: '1px solid #eee', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f57' }} /><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#febc2e' }} /><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#28c840' }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: '#666', marginLeft: 6 }}>Analitika · Savdo</div>
              <div style={{ marginLeft: 'auto', fontSize: 9, background: '#e8f5ee', color: '#1a8c44', borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>14.06 — 20.06.2026</div>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1, background: '#f5f5f5', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 8, color: '#999', marginBottom: 3 }}>BERILGAN</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#111' }}>24 472 661</div>
                </div>
                <div style={{ flex: 1, background: '#fff4f4', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 8, color: '#999', marginBottom: 3 }}>VAZVRAT</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#e84a5f' }}>24 756 671</div>
                </div>
                <div style={{ flex: 1, background: '#f5f5f5', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 8, color: '#999', marginBottom: 3 }}>SAVDO</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#111' }}>−284 011</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 70px 70px', gap: 4, fontSize: 7, fontWeight: 800, color: '#aaa', textTransform: 'uppercase', marginBottom: 4, paddingBottom: 4, borderBottom: '2px solid #eee' }}>
                <span>SANA</span><span style={{textAlign:'right'}}>NAKL.</span><span style={{textAlign:'right'}}>BERILGAN</span><span style={{textAlign:'right'}}>VAZVRAT</span><span style={{textAlign:'right'}}>SAVDO</span>
              </div>
              {[['16.06.2026','–','–','8 903 454','−8 903 454'],['17.06.2026','–','–','5 254 479','−5 254 479'],['20.06.2026','75','24 472 661','–','24 472 661']].map(([d,n,b,v,s]) => (
                <div key={d} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 70px 70px', gap: 4, padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ fontSize: 8, color: '#555' }}>{d}</span>
                  <span style={{ fontSize: 8, color: '#999', textAlign: 'right' }}>{n}</span>
                  <span style={{ fontSize: 8, fontWeight: 700, color: '#111', textAlign: 'right' }}>{b}</span>
                  <span style={{ fontSize: 8, color: '#e84a5f', textAlign: 'right' }}>{v}</span>
                  <span style={{ fontSize: 8, fontWeight: 700, color: s.startsWith('−') ? '#e84a5f' : '#1a8c44', textAlign: 'right' }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom tagline */}
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: 0, zIndex: 1, textAlign: 'center' }}>
          Barcha ma'lumotlar real vaqtda · MongoDB · Next.js · NestJS
        </p>
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
    <button className={active ? 'navitem active' : 'navitem'} type="button" onClick={onClick}>
      <span className="navicon">{icon}</span>
      <span className="navlabel">{label}</span>
      {badge ? <span className="navbadge">{badge}</span> : null}
    </button>
  );
}

// ── SessionPicker: searchable session dropdown ─────────────────────────────
function SessionPicker({
  sessions,
  currentDate,
  onSelect,
}: {
  sessions: SessionSummary[];
  currentDate: string;
  onSelect: (invoiceDate: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Show raw invoiceDate (file name)
  const label = (s: SessionSummary) => s.invoiceDate;

  const filtered = sessions.filter((s) =>
    label(s).toLowerCase().includes(query.toLowerCase()) ||
    s.invoiceDate.includes(query)
  );

  const currentLabel = (() => {
    const s = sessions.find((s) => s.invoiceDate === currentDate);
    return s ? label(s) : currentDate.slice(0, 10);
  })();

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(''); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 32, padding: '0 10px 0 12px', borderRadius: 10,
          border: '1.5px solid rgba(var(--ink-rgb),0.12)',
          background: 'rgba(var(--ink-rgb),0.04)',
          color: 'var(--ink)', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', whiteSpace: 'nowrap',
          transition: 'border-color 0.15s',
        }}
        onMouseOver={(e) => (e.currentTarget.style.borderColor = 'rgba(70,191,114,0.55)')}
        onMouseOut={(e) => (e.currentTarget.style.borderColor = 'rgba(var(--ink-rgb),0.12)')}
      >
        <span style={{ fontSize: 13 }}>📅</span>
        {currentLabel}
        <span style={{ opacity: 0.5, fontSize: 10, marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 36, left: 0, zIndex: 999,
          background: 'var(--surface)', border: '1.5px solid rgba(var(--ink-rgb),0.12)',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          minWidth: 240, overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 8px 6px' }}>
            <input
              autoFocus
              type="text"
              placeholder="Qidirish..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                height: 30, padding: '0 10px', borderRadius: 7,
                border: '1px solid rgba(var(--ink-rgb),0.12)',
                background: 'rgba(var(--ink-rgb),0.06)',
                color: 'var(--ink)', fontSize: 12, outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted)' }}>Topilmadi</div>
            )}
            {filtered.map((s) => {
              const active = s.invoiceDate === currentDate;
              return (
                <button
                  key={s.invoiceDate}
                  type="button"
                  onClick={() => { onSelect(s.invoiceDate); setOpen(false); setQuery(''); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '7px 14px', border: 'none', textAlign: 'left',
                    background: active ? 'rgba(70,191,114,0.12)' : 'transparent',
                    color: active ? 'var(--ok)' : 'var(--ink)',
                    fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                    borderBottom: '1px solid rgba(var(--ink-rgb),0.05)',
                  }}
                  onMouseOver={(e) => { if (!active) e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.06)'; }}
                  onMouseOut={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span>{label(s)}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{s.invoiceCount} nakl</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
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
        {meta && <span className="paneMeta">{meta}</span>}
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

function groupByDateKey<T>(items: T[], getDate: (item: T) => string): { dateKey: string; items: T[] }[] {
  const map: Record<string, T[]> = {};
  for (const item of items) {
    const d = getDate(item);
    if (!map[d]) map[d] = [];
    map[d].push(item);
  }
  return Object.keys(map)
    .sort((a, b) => b.localeCompare(a))
    .map(dateKey => ({ dateKey, items: map[dateKey] }));
}

function DateGroupHeader({ dateKey, count, expanded, onToggle }: { dateKey: string; count: number; expanded: boolean; onToggle: () => void }) {
  const dayLabel = new Date(dateKey + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 6px', marginBottom: 2 }}>
      <div style={{ height: 1, flex: 1, background: 'rgba(0,0,0,0.08)' }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{dayLabel}</span>
      {count > 1 && (
        <button type="button" onClick={onToggle}
          style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'rgba(70,191,114,0.1)', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
          <span style={{ display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }}>›</span> {count} ta
        </button>
      )}
      <div style={{ height: 1, width: 20, background: 'rgba(0,0,0,0.08)' }} />
    </div>
  );
}

function NaklHistory({ sessions, expandedDates, toggleDateGroup, loadSession, deleteSession, isAdmin, fmtDateRu, fmt0, T }: {
  sessions: any[]; expandedDates: Set<string>; toggleDateGroup: (k: string) => void;
  loadSession: (d: string) => void; deleteSession: (d: string) => void;
  isAdmin: boolean; fmtDateRu: (d: string) => string; fmt0: (n: number) => string; T: (k: string) => string;
}) {
  const groups = groupByDateKey(sessions, s => s.invoiceDate.slice(0, 10));
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {groups.map(({ dateKey, items }) => {
        const multi = items.length > 1;
        const open = expandedDates.has('nakl-' + dateKey);
        const visible = multi && !open ? [items[0]] : items;
        return (
          <div key={dateKey}>
            <DateGroupHeader dateKey={dateKey} count={items.length} expanded={open} onToggle={() => toggleDateGroup('nakl-' + dateKey)} />
            {visible.map((session: any) => (
              <div className="sessionRow" key={session.invoiceDate} style={{ marginBottom: 6, marginLeft: multi ? 12 : 0 }}>
                {multi && <span style={{ color: 'var(--muted)', fontWeight: 700 }}>›</span>}
                <b>{session.invoiceDate}</b>
                <span className="sess-badge">{session.invoiceCount} накл.</span>
                <span className="sess-sum">{fmt0(session.sumTotal)} сум</span>
                <span className="sess-badge">{session.versions?.length || 0} версий</span>
                <button className="mini" type="button" onClick={() => loadSession(session.invoiceDate)}>{T('lbl_restore')}</button>
                {isAdmin && <button className="iconbtn danger" type="button" onClick={() => deleteSession(session.invoiceDate)}><Trash2 size={15} /></button>}
              </div>
            ))}
            {multi && !open && (
              <div onClick={() => toggleDateGroup('nakl-' + dateKey)} style={{ fontSize: 12, color: 'var(--muted)', padding: '2px 0 6px 20px', cursor: 'pointer' }}>
                › yana {items.length - 1} ta ko&apos;rish...
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DovHistory({ dovHistory, expandedDates, toggleDateGroup, setDovFields, setSettingsView }: {
  dovHistory: any[]; expandedDates: Set<string>; toggleDateGroup: (k: string) => void;
  setDovFields: (h: any) => void; setSettingsView: (v: any) => void;
}) {
  const groups = groupByDateKey(dovHistory, h => new Date(h.printedAt).toISOString().slice(0, 10));
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {groups.map(({ dateKey, items }) => {
        const multi = items.length > 1;
        const open = expandedDates.has('dov-' + dateKey);
        const visible = multi && !open ? [items[0]] : items;
        return (
          <div key={dateKey}>
            <DateGroupHeader dateKey={dateKey} count={items.length} expanded={open} onToggle={() => toggleDateGroup('dov-' + dateKey)} />
            {visible.map((h: any, i: number) => (
              <div className="sessionRow" key={i} style={{ marginBottom: 6, marginLeft: multi ? 12 : 0 }}>
                {multi && <span style={{ color: 'var(--muted)', fontWeight: 700 }}>›</span>}
                <b>{new Date(h.printedAt).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</b>
                <span className="sess-badge">{h.driver || '—'}</span>
                <span className="sess-badge">{h.plate || '—'} · {h.car || '—'}</span>
                <button className="mini" type="button" onClick={() => { setDovFields(h); setSettingsView('doverennost'); }}>Yuklash</button>
              </div>
            ))}
            {multi && !open && (
              <div onClick={() => toggleDateGroup('dov-' + dateKey)} style={{ fontSize: 12, color: 'var(--muted)', padding: '2px 0 6px 20px', cursor: 'pointer' }}>
                › yana {items.length - 1} ta ko&apos;rish...
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type HistoryEvent =
  | { kind: 'nakl'; dateKey: string; data: any }
  | { kind: 'dov';  dateKey: string; data: any }
  | { kind: 'qayt'; dateKey: string; data: any }
  | { kind: 'vazt'; dateKey: string; data: any };

const KIND_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  nakl: { label: 'Hujjat',    color: '#2563eb', bg: 'rgba(37,99,235,0.09)' },
  dov:  { label: 'Ishonchnoma', color: '#7c3aed', bg: 'rgba(124,58,237,0.09)' },
  qayt: { label: 'Qaytgan',   color: '#dc2626', bg: 'rgba(220,38,38,0.09)' },
  vazt: { label: 'Qaytarma',  color: '#d97706', bg: 'rgba(217,119,6,0.09)' },
};

// ─── TarixPane: tabbed history ────────────────────────────────────────────────
type TarixTab = 'nakl' | 'vazvrat' | 'zakas' | 'dov';

function TarixPane({ sessions, dovHistory, qaytganInvoices, vazvratRows, setVazvratAllRows, orders, token,
  expandedDates, toggleDateGroup, loadSession, deleteSession, setDovFields, setSettingsView,
  refreshSessions, isAdmin, fmtDateRu, fmt0, T }: {
  sessions: any[]; dovHistory: any[]; qaytganInvoices: any[]; vazvratRows: any[];
  setVazvratAllRows: (rows: any[]) => void; orders: any[]; token: string;
  expandedDates: Set<string>; toggleDateGroup: (k: string) => void;
  loadSession: (d: string) => void; deleteSession: (d: string) => void;
  setDovFields: (h: any) => void; setSettingsView: (v: any) => void;
  refreshSessions: () => void;
  isAdmin: boolean; fmtDateRu: (d: string) => string; fmt0: (n: number) => string; T: (k: string) => string;
}) {
  const [vazvratBusy, setVazvratBusy] = React.useState(false);

  const deleteVazvratDate = async (date: string) => {
    if (!confirm(`${date} sanasidagi barcha vazvratlarni o'chirish?`)) return;
    setVazvratBusy(true);
    try {
      await api.deleteVazvratByDate(token, date);
      setVazvratAllRows(vazvratRows.filter(v => v.date !== date));
    } finally { setVazvratBusy(false); }
  };

  const deleteAllVazvrat = async () => {
    if (!confirm('Barcha vazvrat yozuvlarini o\'chirish?')) return;
    setVazvratBusy(true);
    try {
      await api.deleteAllVazvrat(token);
      setVazvratAllRows([]);
    } finally { setVazvratBusy(false); }
  };

  const uploadVazvratExcel = async (file: File) => {
    setVazvratBusy(true);
    try {
      const XLSX = await import('xlsx');
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      let maxR = 0, maxC = 0;
      Object.keys(ws).filter((k) => !k.startsWith('!')).forEach((addr) => {
        const cell = XLSX.utils.decode_cell(addr);
        if (cell.r > maxR) maxR = cell.r;
        if (cell.c > maxC) maxC = cell.c;
      });
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
      const records: import('@/types/domain').VazvratUploadItem[] = [];
      let lastOrderNo = '', lastDate = '', lastMarketCode = '', lastMarketName = '';
      for (let i = 3; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.every((c) => !c)) continue;
        const orderNo    = String(r[0] || lastOrderNo);
        const dateRaw    = r[1];
        const marketName = String(r[4] || lastMarketName);
        const marketCode = String(r[5] || lastMarketCode);
        const sapCode    = String(r[17] || '');
        const productName = String(r[15] || '');
        const qty        = Number(r[19]) || 0;
        const price      = Number(r[20]) || 0;
        const totalWithVat = Number(r[24]) || 0;
        if (!sapCode && !productName) continue;
        let date = lastDate;
        if (dateRaw) {
          if (typeof dateRaw === 'number') {
            const d = new Date(Math.round((dateRaw - 25569) * 86400 * 1000));
            date = d.toISOString().slice(0, 10);
          } else { date = String(dateRaw).slice(0, 10); }
        }
        if (orderNo) lastOrderNo = orderNo;
        if (date)    lastDate = date;
        if (marketCode) lastMarketCode = marketCode;
        if (marketName) lastMarketName = marketName;
        if (!lastDate || !sapCode) continue;
        // Ensure ISO date format YYYY-MM-DD
        const isoDate = lastDate.match(/^\d{4}-\d{2}-\d{2}$/) ? lastDate : null;
        if (!isoDate) continue;
        records.push({ orderNo: lastOrderNo || '-', date: isoDate, marketCode: lastMarketCode || '-', marketName: lastMarketName || '-', sapCode, productName: productName || sapCode, qty: qty || 0, pricePerUnit: price || 0, totalWithVat: totalWithVat || 0 });
      }
      if (!records.length) { alert('Hech qanday yozuv topilmadi'); return; }
      await api.uploadVazvrat(token, records);
      const fresh = await api.queryVazvrat(token, '2020-01-01', new Date().toISOString().slice(0, 10));
      setVazvratAllRows(fresh);
    } catch (e) { alert('Xato: ' + String(e)); }
    finally { setVazvratBusy(false); }
  };

  const [tab, setTab] = React.useState<TarixTab>('nakl');

  const TABS: { key: TarixTab; label: string; count: number; color: string }[] = [
    { key: 'nakl',    label: 'Hujjat',    count: sessions.length,     color: '#2563eb' },
    { key: 'vazvrat', label: 'Qaytarma',    count: vazvratRows.length,  color: '#d97706' },
    { key: 'zakas',   label: 'Buyurtma',    count: sessions.length,     color: '#7c3aed' },
    { key: 'dov',     label: 'Ishonchnoma', count: dovHistory.length,   color: '#059669' },
  ];

  return (
    <>
      {/* Tab bar + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="tarix-tabs">
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: tab === t.key ? t.color : 'var(--surface)',
                color: tab === t.key ? '#fff' : 'var(--ink)',
                boxShadow: tab === t.key ? `0 2px 8px ${t.color}44` : '0 1px 3px rgba(0,0,0,0.06)',
              }}>
              {t.label}
              <span style={{ fontSize: 11, fontWeight: 800, background: tab === t.key ? 'rgba(255,255,255,0.25)' : 'rgba(var(--ink-rgb),0.08)', borderRadius: 6, padding: '1px 6px' }}>{t.count}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={refreshSessions}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid rgba(var(--ink-rgb),0.15)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>
          <RefreshCcw size={13} /> Yangilash
        </button>
      </div>

      {/* Nakladnoy tab */}
      {tab === 'nakl' && (
        sessions.length === 0 ? <Empty title="Hujjat tarixi yo'q" /> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {sessions.map(s => {
            const key = 'nakl-' + s.invoiceDate;
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface)', border: '1px solid rgba(var(--ink-rgb),0.07)', borderLeft: '3px solid #2563eb', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{s.invoiceDate}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{s.invoiceCount} ta nakl</div>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{fmt0(s.sumTotal)} so&apos;m</span>
                <button className="mini" type="button" onClick={() => loadSession(s.invoiceDate)}>{T('lbl_restore')}</button>
                {isAdmin && <button className="iconbtn danger" type="button" onClick={() => deleteSession(s.invoiceDate)}><Trash2 size={14} /></button>}
              </div>
            );
          })}
        </div>
      )}

      {/* Vazvrat tab */}
      {tab === 'vazvrat' && (() => {
        const sorted = [...vazvratRows].sort((a, b) => b.date.localeCompare(a.date));
        const byDate: Record<string, typeof sorted> = {};
        for (const v of sorted) { if (!byDate[v.date]) byDate[v.date] = []; byDate[v.date].push(v); }
        const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
        return (
          <>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '6px 12px', border: '1px solid rgba(var(--ink-rgb),0.15)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                <FileText size={13} /> Excel yuklash
                <input type="file" accept=".xlsx,.xls" style={{ position: 'absolute', opacity: 0, inset: 0, cursor: 'pointer' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadVazvratExcel(f); e.target.value = ''; }} />
              </label>
              {vazvratRows.length > 0 && (
                <button type="button" disabled={vazvratBusy} onClick={deleteAllVazvrat}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '6px 12px', border: '1px solid #dc2626', borderRadius: 8, background: 'rgba(220,38,38,0.06)', color: '#dc2626', cursor: 'pointer' }}>
                  <Trash2 size={13} /> Hammasini o&apos;chir
                </button>
              )}
            </div>
            {dates.length === 0 ? <Empty title="Vazvrat tarixi yo'q" /> :
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dates.map(date => {
                  const rows = byDate[date];
                  const total = rows.reduce((s, v) => s + v.totalWithVat, 0);
                  const open = expandedDates.has('vazt-' + date);
                  return (
                    <div key={date} style={{ background: 'var(--surface)', border: '1px solid rgba(var(--ink-rgb),0.08)', borderRadius: 12, overflow: 'hidden' }}>
                      {/* Date header — clickable */}
                      <div onClick={() => toggleDateGroup('vazt-' + date)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: open ? 'rgba(217,119,6,0.07)' : 'transparent' }}>
                        <span style={{ color: '#d97706', fontWeight: 800, fontSize: 15, display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>›</span>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{fmtDateRu(date)}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{rows.length} ta yozuv</span>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: '#d97706', marginLeft: 'auto' }}>{fmt0(total)} so&apos;m</span>
                        <button type="button" disabled={vazvratBusy} onClick={(e) => { e.stopPropagation(); void deleteVazvratDate(date); }}
                          className="iconbtn danger" title="Shu sanani o'chir"><Trash2 size={14} /></button>
                      </div>
                      {/* Rows — only when open */}
                      {open && rows.map((v, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 38px', borderTop: '1px solid rgba(var(--ink-rgb),0.05)' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{v.marketName || v.marketCode}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{v.productName}</div>
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>×{v.qty} dona</span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: '#d97706', whiteSpace: 'nowrap' }}>{fmt0(v.totalWithVat)} so&apos;m</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            }
          </>
        );
      })()}

      {/* Zakas tab — grouped by base date (YYYY-MM-DD) */}
      {tab === 'zakas' && (() => {
        // Group sessions by base date (first 10 chars of invoiceDate)
        const dateMap = new Map<string, { dateKey: string; items: any[]; totalNakl: number; totalSum: number }>();
        for (const s of sessions) {
          const dk = (s.invoiceDate || '').slice(0, 10);
          if (!dateMap.has(dk)) dateMap.set(dk, { dateKey: dk, items: [], totalNakl: 0, totalSum: 0 });
          const g = dateMap.get(dk)!;
          g.items.push(s);
          g.totalNakl += s.invoiceCount || 0;
          g.totalSum  += s.sumTotal || 0;
        }
        const groups = [...dateMap.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
        return groups.length === 0 ? <Empty title="Buyurtma tarixi yo'q" /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {groups.map(g => {
              const open = expandedDates.has('zakas-' + g.dateKey);
              const multi = g.items.length > 1;
              return (
                <div key={g.dateKey}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--surface)', border: '1px solid rgba(var(--ink-rgb),0.07)', borderLeft: '3px solid #7c3aed', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', cursor: multi ? 'pointer' : 'default' }}
                    onClick={() => { if (multi) toggleDateGroup('zakas-' + g.dateKey); else loadSession(g.items[0].invoiceDate); }}>
                    {multi && <span style={{ color: '#7c3aed', fontWeight: 800, fontSize: 15, transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>›</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtDateRu(g.dateKey)}</div>
                      {multi && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{g.items.length} ta versiya</div>}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--ok)', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt0(g.totalNakl)} nakl.</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{fmt0(g.totalSum)} so&apos;m</span>
                  </div>
                  {open && multi && (
                    <div style={{ marginLeft: 16, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {g.items.map((s: any) => (
                        <div key={s.invoiceDate} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--surface)', border: '1px solid rgba(var(--ink-rgb),0.05)', borderLeft: '2px solid #c4b5fd', borderRadius: 8, cursor: 'pointer' }}
                          onClick={() => loadSession(s.invoiceDate)}>
                          <div style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>{s.invoiceDate}</div>
                          <span style={{ fontSize: 11, color: 'var(--ok)', fontWeight: 700 }}>{fmt0(s.invoiceCount)} nakl.</span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{fmt0(s.sumTotal)} so&apos;m</span>
                          {isAdmin && <button className="iconbtn danger" type="button" onClick={e => { e.stopPropagation(); deleteSession(s.invoiceDate); }}><Trash2 size={13} /></button>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Ishonchnoma tab */}
      {tab === 'dov' && (
        dovHistory.length === 0 ? <Empty title="Ishonchnoma tarixi yo'q" /> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {dovHistory.map((h, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface)', border: '1px solid rgba(var(--ink-rgb),0.07)', borderLeft: '3px solid #059669', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{h.driver || '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{h.plate} · {h.car}</div>
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(h.printedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <button className="mini" type="button" onClick={() => { setDovFields(h); setSettingsView('doverennost'); }}>Yuklash</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Legacy UnifiedHistory (kept for reference, not used) ────────────────────
function UnifiedHistory({ sessions, dovHistory, qaytganInvoices, vazvratRows, expandedDates, toggleDateGroup,
  loadSession, deleteSession, setDovFields, setSettingsView, isAdmin, fmtDateRu, fmt0, T }: {
  sessions: any[]; dovHistory: any[]; qaytganInvoices: any[]; vazvratRows: any[];
  expandedDates: Set<string>; toggleDateGroup: (k: string) => void;
  loadSession: (d: string) => void; deleteSession: (d: string) => void;
  setDovFields: (h: any) => void; setSettingsView: (v: any) => void;
  isAdmin: boolean; fmtDateRu: (d: string) => string; fmt0: (n: number) => string; T: (k: string) => string;
}) {
  // Build flat event list
  const events: HistoryEvent[] = [
    ...sessions.map(s => ({ kind: 'nakl' as const, dateKey: s.invoiceDate.slice(0, 10), data: s })),
    ...dovHistory.map(h => ({ kind: 'dov' as const, dateKey: new Date(h.printedAt).toISOString().slice(0, 10), data: h })),
    ...qaytganInvoices.map(i => ({ kind: 'qayt' as const, dateKey: (i.undeliveredAt ? new Date(i.undeliveredAt).toISOString() : i.dateIso).slice(0, 10), data: i })),
    ...vazvratRows.map(v => ({ kind: 'vazt' as const, dateKey: v.date.slice(0, 10), data: v })),
  ];

  // Group by dateKey
  const map: Record<string, HistoryEvent[]> = {};
  for (const ev of events) {
    if (!map[ev.dateKey]) map[ev.dateKey] = [];
    map[ev.dateKey].push(ev);
  }
  const dateKeys = Object.keys(map).sort((a, b) => b.localeCompare(a));

  if (!dateKeys.length) return <Empty title="Hali tarix yo'q" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {dateKeys.map(dateKey => {
        const items = map[dateKey];
        const multi = items.length > 1;
        const open = expandedDates.has('uni-' + dateKey);
        const visible = multi && !open ? [items[0]] : items;
        const dayLabel = new Date(dateKey + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        return (
          <div key={dateKey} style={{ marginBottom: 4 }}>
            {/* Date header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 6px' }}>
              <div style={{ height: 1, flex: 1, background: 'rgba(0,0,0,0.08)' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{dayLabel}</span>
              {multi && (
                <button type="button" onClick={() => toggleDateGroup('uni-' + dateKey)}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'rgba(70,191,114,0.1)', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                  <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }}>›</span> {items.length} ta
                </button>
              )}
              <div style={{ height: 1, width: 20, background: 'rgba(0,0,0,0.08)' }} />
            </div>

            {/* Events */}
            {visible.map((ev, idx) => {
              const ks = KIND_STYLE[ev.kind];
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 5, marginLeft: multi ? 12 : 0, background: 'var(--surface)', border: '1px solid rgba(var(--ink-rgb),0.07)', borderLeft: `3px solid ${ks.color}`, borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  {multi && <span style={{ color: 'var(--muted)', fontWeight: 700, flexShrink: 0 }}>›</span>}
                  {/* Type badge */}
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: ks.color, background: ks.bg, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0 }}>{ks.label}</span>

                  {/* Content per kind */}
                  {ev.kind === 'nakl' && (<>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{ev.data.invoiceDate}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{ev.data.invoiceCount} nakl.</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', marginLeft: 'auto' }}>{fmt0(ev.data.sumTotal)} so&apos;m</span>
                    <button className="mini" type="button" onClick={() => loadSession(ev.data.invoiceDate)}>{T('lbl_restore')}</button>
                    {isAdmin && <button className="iconbtn danger" type="button" onClick={() => deleteSession(ev.data.invoiceDate)}><Trash2 size={14} /></button>}
                  </>)}

                  {ev.kind === 'dov' && (<>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{ev.data.driver || '—'}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{ev.data.plate} · {ev.data.car}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{new Date(ev.data.printedAt).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                    <button className="mini" type="button" onClick={() => { setDovFields(ev.data); setSettingsView('doverennost'); }}>Yuklash</button>
                  </>)}

                  {ev.kind === 'qayt' && (<>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>№{ev.data.invNo} — {ev.data.market}</span>
                    <span style={{ fontSize: 12, color: '#dc2626', flex: 1 }}>{ev.data.undeliverComment}</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {ev.data.undeliveredAt ? new Date(ev.data.undeliveredAt).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </>)}

                  {ev.kind === 'vazt' && (<>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{ev.data.marketName || ev.data.marketCode}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{ev.data.productName}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>×{ev.data.qty}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', marginLeft: 'auto', color: '#d97706' }}>{fmt0(ev.data.totalWithVat)} so&apos;m</span>
                  </>)}
                </div>
              );
            })}
            {multi && !open && (
              <div onClick={() => toggleDateGroup('uni-' + dateKey)} style={{ fontSize: 12, color: 'var(--muted)', padding: '2px 0 4px 20px', cursor: 'pointer' }}>
                › yana {items.length - 1} ta ko&apos;rish...
              </div>
            )}
          </div>
        );
      })}
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
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const toggleItem = (key: string) => setExpandedItems(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

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
    const map: Record<string, { storeCode: string; label: string; qty: number; sum: number; count: number }> = {};
    for (const inv of filteredInvoices) {
      if (!map[inv.storeCode]) map[inv.storeCode] = { storeCode: inv.storeCode, label: inv.market, qty: 0, sum: 0, count: 0 };
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

  const aInit    = useMemo(() => filteredInvoices.reduce((s, inv) => s + inv.lines.reduce((ls, l) => ls + (l.init || 0), 0), 0), [filteredInvoices]);
  const aGiven   = useMemo(() => filteredInvoices.reduce((s, inv) => s + inv.sumQty, 0), [filteredInvoices]);
  const aReduced = aInit - aGiven;
  const aSum     = useMemo(() => filteredInvoices.reduce((s, inv) => s + inv.sumTotal, 0), [filteredInvoices]);

  return (
    <section className="pane">
      {/* ── Top bar: tabs + date range + refresh ── */}
      <div className="analytics-topbar" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="analytics-tabs subtabs" style={{ position: 'static', margin: 0, padding: 0, background: 'transparent', flex: '1 1 auto' }}>
          <button className={tab === 'overview' ? 'active' : ''} type="button" onClick={() => setTab('overview')}>{T('analytics_title')}</button>
          <button className={tab === 'products' ? 'active' : ''} type="button" onClick={() => setTab('products')}>{T('lbl_product')}</button>
          <button className={tab === 'markets' ? 'active' : ''} type="button" onClick={() => setTab('markets')}>{T('lbl_store')}</button>
          <button className={tab === 'clients' ? 'active' : ''} type="button" onClick={() => setTab('clients')}>{T('clients_title')}</button>
          <button className={tab === 'savdo' ? 'active' : ''} type="button" onClick={() => { setTab('savdo'); void loadVazvrat(); }}>Savdo</button>
        </div>
        <div className="analytics-daterow" style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <input type="date" value={savdoFrom} onChange={(e) => setSavdoFrom(e.target.value)} style={{ width: 130 }} />
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
          <input type="date" value={savdoTo} onChange={(e) => setSavdoTo(e.target.value)} style={{ width: 130 }} />
          {tab === 'savdo'
            ? <>
                <button type="button" disabled={savdoBusy} onClick={loadVazvrat}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '5px 10px', border: '1px solid rgba(var(--ink-rgb),0.13)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer' }}>
                  <RefreshCcw size={12} /> {savdoBusy ? '…' : 'Yuklash'}
                </button>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '5px 10px', border: '1px solid rgba(var(--ink-rgb),0.13)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                  <FileText size={12} /> {savdoUploading ? '…' : 'Vazvrat Excel'}
                  <input type="file" accept=".xlsx,.xls" style={{ position: 'absolute', opacity: 0, inset: 0, cursor: 'pointer' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleVazvratExcel(f); e.target.value = ''; }} />
                </label>
              </>
            : <button type="button" onClick={onRefresh}
                style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 8px', border: '1px solid rgba(var(--ink-rgb),0.13)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer' }}>
                <RefreshCcw size={13} />
              </button>
          }
        </div>
      </div>

      {tab === 'overview' && (
        <>
          {/* ── KPI cards ── */}
          <div className="kpi-4-grid">
            {[
              { label: 'Keldi',   val: fmt0(aInit),    sub: 'Jami zakaz dona', color: 'var(--ink)', accent: false },
              { label: 'Kamaydi', val: fmt0(aReduced), sub: 'Yetkazilmagan',   color: aReduced > 0 ? '#dc2626' : 'var(--ok)', accent: false },
              { label: 'Berildi', val: fmt0(aGiven),   sub: 'Yetkazilgan dona', color: 'var(--ok)', accent: false },
              { label: 'Summa',   val: fmt0(aSum) + ' so\'m', sub: 'Jami aylanma', color: 'var(--ink)', accent: true },
            ].map(k => (
              <div key={k.label} style={{ padding: '14px 16px', borderRadius: 14, background: k.accent ? 'linear-gradient(135deg, #46bf72, #2ea855)' : 'var(--surface)', border: k.accent ? 'none' : '1px solid rgba(var(--ink-rgb),0.08)', boxShadow: k.accent ? '0 4px 16px rgba(70,191,114,0.25)' : '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: k.accent ? 'rgba(255,255,255,0.75)' : 'var(--muted)', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: k.accent ? '#fff' : k.color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{k.val}</div>
                <div style={{ fontSize: 11, color: k.accent ? 'rgba(255,255,255,0.65)' : 'var(--muted)', marginTop: 4 }}>{k.sub}</div>
              </div>
            ))}
          </div>
          <h3 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{T('lbl_store')}</h3>
          <div className="market-overview" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 620 }}>
            {filteredMarkets.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sana oralig'ida ma'lumot yo'q</div>}
            {filteredMarkets.map((m) => {
              const mKey = 'ov-mkt-' + m.label;
              const open = expandedItems.has(mKey);
              const mInvoices = filteredInvoices.filter(inv => inv.storeCode === m.storeCode);
              return (
                <div key={m.label}>
                  <div onClick={() => toggleItem(mKey)} style={{ display: 'grid', gridTemplateColumns: '18px minmax(120px,200px) 1fr 90px', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer', padding: '4px 6px', borderRadius: 8, background: open ? 'rgba(var(--ink-rgb),0.04)' : 'transparent' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 800, fontSize: 14, transition: 'transform 0.15s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
                    <div style={{ overflow: 'hidden' }}>
                      <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortMkt(m.label)}</span>
                      <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{m.count} ta nakl</span>
                    </div>
                    <div style={{ background: 'rgba(var(--hi-rgb),0.08)', borderRadius: 4, height: 12, overflow: 'hidden' }}>
                      <div style={{ width: `${(m.sum / fMaxMarketSum) * 100}%`, height: '100%', background: '#46bf72', borderRadius: 4 }} />
                    </div>
                    <span className="mono" style={{ textAlign: 'right', fontSize: 12 }}>{fmt0(m.sum)}</span>
                  </div>
                  {open && (
                    <div style={{ marginLeft: 26, marginBottom: 4, borderLeft: '2px solid rgba(var(--ink-rgb),0.08)', paddingLeft: 10 }}>
                      {mInvoices.map(inv => (
                        <div key={inv.invNo} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 90px', gap: 8, fontSize: 12, padding: '3px 4px', borderRadius: 6, alignItems: 'center' }}>
                          <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>#{inv.invNo}</span>
                          <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.dateIso}</span>
                          <span style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--muted)' }}>{fmt0(inv.sumQty)} dona</span>
                          <span style={{ fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 600 }}>{fmt0(inv.sumTotal)}</span>
                        </div>
                      ))}
                      {mInvoices.length > 1 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 90px', gap: 8, fontSize: 12, padding: '4px 4px 2px', borderTop: '1px solid rgba(var(--ink-rgb),0.08)', marginTop: 2 }}>
                          <span />
                          <span style={{ fontWeight: 700, color: 'var(--muted)', fontSize: 11 }}>Jami</span>
                          <span style={{ fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 700 }}>{fmt0(m.qty)} dona</span>
                          <span style={{ fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{fmt0(m.sum)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
                    <th style={{ width: 24 }}></th>
                    <th>{T('lbl_product')}</th>
                    <th className="right">Zakaz</th>
                    <th className="right">Berildi</th>
                    <th className="right">Summa</th>
                    <th>График</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProductRows.map((row) => {
                    const pKey = 'prod-' + row.product.sku;
                    const open = expandedItems.has(pKey);
                    // per-market breakdown for this product
                    const byMarket: Record<string, { market: string; qty: number; sum: number; invNos: number[] }> = {};
                    for (const inv of filteredInvoices) {
                      const line = inv.lines.find(l => l.sku === row.product.sku);
                      if (!line || !line.qty) continue;
                      if (!byMarket[inv.storeCode]) byMarket[inv.storeCode] = { market: inv.market, qty: 0, sum: 0, invNos: [] };
                      byMarket[inv.storeCode].qty += line.qty;
                      byMarket[inv.storeCode].sum += line.total;
                      byMarket[inv.storeCode].invNos.push(inv.invNo);
                    }
                    const marketRows = Object.values(byMarket).sort((a,b) => b.qty - a.qty);
                    return (
                      <React.Fragment key={row.product.sku}>
                        <tr onClick={() => toggleItem(pKey)} style={{ cursor: 'pointer', background: open ? 'rgba(var(--ink-rgb),0.03)' : undefined }}>
                          <td style={{ textAlign: 'center', color: 'var(--accent)', fontWeight: 800, fontSize: 15, transition: 'transform 0.15s', paddingRight: 0 }}>
                            <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
                          </td>
                          <td><b>{row.product.name}</b></td>
                          <td className="right mono">{fmt0(row.initTotal)}</td>
                          <td className="right mono">{fmt0(row.givenQty)}</td>
                          <td className="right mono">{fmt0(row.givenSum)}</td>
                          <td style={{ minWidth: 80 }}>
                            <div style={{ background: 'rgba(var(--hi-rgb),0.08)', borderRadius: 4, height: 12, overflow: 'hidden', width: '100%' }}>
                              <div style={{ width: `${(row.givenQty / fMaxProductQty) * 100}%`, height: '100%', background: '#46bf72', borderRadius: 4 }} />
                            </div>
                          </td>
                        </tr>
                        {open && marketRows.map(mr => (
                          <tr key={mr.market} style={{ background: 'rgba(var(--ink-rgb),0.02)', fontSize: 12 }}>
                            <td></td>
                            <td style={{ paddingLeft: 24, color: 'var(--muted)' }}>› {shortMkt(mr.market)}</td>
                            <td></td>
                            <td className="right mono" style={{ color: 'var(--muted)' }}>{fmt0(mr.qty)}</td>
                            <td className="right mono" style={{ color: 'var(--muted)' }}>{fmt0(mr.sum)}</td>
                            <td style={{ color: 'var(--muted)', fontSize: 11 }}>{mr.invNos.length} nakl.</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
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
                    <th style={{ width: 24 }}></th>
                    <th>{T('lbl_store')}</th>
                    <th className="right">Hujjat</th>
                    <th className="right">{T('lbl_pcs')}</th>
                    <th className="right">{T('lbl_sum')}</th>
                    <th>График</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMarkets.map((m) => {
                    const mKey = 'mkt-' + m.label;
                    const open = expandedItems.has(mKey);
                    const mInvoices = filteredInvoices.filter(inv => inv.market === m.label).sort((a,b) => a.invNo - b.invNo);
                    return (
                      <React.Fragment key={m.label}>
                        <tr onClick={() => toggleItem(mKey)} style={{ cursor: 'pointer', background: open ? 'rgba(var(--ink-rgb),0.03)' : undefined }}>
                          <td style={{ textAlign: 'center', color: 'var(--accent)', fontWeight: 800, fontSize: 15, paddingRight: 0 }}>
                            <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
                          </td>
                          <td><b>{shortMkt(m.label)}</b></td>
                          <td className="right mono">{m.count}</td>
                          <td className="right mono">{fmt0(m.qty)}</td>
                          <td className="right mono">{fmt0(m.sum)}</td>
                          <td style={{ minWidth: 80 }}>
                            <div style={{ background: 'rgba(var(--hi-rgb),0.08)', borderRadius: 4, height: 12, overflow: 'hidden', width: '100%' }}>
                              <div style={{ width: `${(m.sum / fMaxMarketSum) * 100}%`, height: '100%', background: 'var(--honey)', borderRadius: 4 }} />
                            </div>
                          </td>
                        </tr>
                        {open && mInvoices.map(inv => {
                          const iKey = 'inv-' + inv.invNo;
                          const iOpen = expandedItems.has(iKey);
                          return (
                            <React.Fragment key={inv.invNo}>
                              <tr onClick={(e) => { e.stopPropagation(); toggleItem(iKey); }} style={{ background: 'rgba(var(--ink-rgb),0.02)', cursor: 'pointer', fontSize: 12 }}>
                                <td></td>
                                <td style={{ paddingLeft: 20, color: 'var(--muted)' }}>
                                  <span style={{ display: 'inline-block', transform: iOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', marginRight: 4, color: 'var(--accent)' }}>›</span>
                                  Nakl. #{inv.invNo} <span style={{ color: 'var(--muted)', fontSize: 11 }}>· {inv.dateIso}</span>
                                </td>
                                <td></td>
                                <td className="right mono" style={{ color: 'var(--muted)' }}>{fmt0(inv.sumQty)}</td>
                                <td className="right mono" style={{ fontWeight: 600 }}>{fmt0(inv.sumTotal)}</td>
                                <td></td>
                              </tr>
                              {iOpen && inv.lines.filter(l => l.qty > 0).map((l, li) => (
                                <tr key={li} style={{ background: 'rgba(70,191,114,0.03)', fontSize: 11 }}>
                                  <td></td>
                                  <td style={{ paddingLeft: 36, color: 'var(--muted)' }}>{l.name}</td>
                                  <td></td>
                                  <td className="right mono" style={{ color: 'var(--muted)' }}>{l.qty}</td>
                                  <td className="right mono" style={{ color: 'var(--muted)' }}>{fmt0(l.total)}</td>
                                  <td style={{ color: 'var(--muted)', fontSize: 11 }}>{fmt0(l.price)} × {l.qty}</td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
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
      {tab === 'savdo' && <SavdoTab
        sessions={sessions} vazvratRows={vazvratRows} invoices={invoices}
        savdoFrom={savdoFrom} savdoTo={savdoTo} savdoInvoices={savdoInvoices}
        savdoAnalytics={savdoAnalytics} savdoTab={savdoTab} setSavdoTab={setSavdoTab}
        fmtDateRu={fmtDateRu} fmt0={fmt0}
      />}

    </section>
  );
}

function UndeliveredPane({ invoices, undeliveredFilter, setUndeliveredFilter, setInvoiceDetail, setRestoreModal, fmt, todayIso }: {
  invoices: Invoice[];
  undeliveredFilter: { from: string; to: string };
  setUndeliveredFilter: (v: { from: string; to: string }) => void;
  setInvoiceDetail: (inv: Invoice) => void;
  setRestoreModal: (v: any) => void;
  fmt: (n: number) => string;
  todayIso: () => string;
}) {
  const all = invoices.filter(i => i.status === 'saved');
  const undeliveredList = all.filter(i => {
    const d = i.dateIso || '';
    if (undeliveredFilter.from && d < undeliveredFilter.from) return false;
    if (undeliveredFilter.to && d > undeliveredFilter.to) return false;
    return true;
  });
  return (
    <section className="pane">
      <PaneHead
        title="Yetkazilmagan hujjatlar"
        meta={`${undeliveredList.length} / ${all.length} ta`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>dan:</span>
            <input type="date" value={undeliveredFilter.from} onChange={e => setUndeliveredFilter({ ...undeliveredFilter, from: e.target.value })} style={{ width: 140 }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>gacha:</span>
            <input type="date" value={undeliveredFilter.to} onChange={e => setUndeliveredFilter({ ...undeliveredFilter, to: e.target.value })} style={{ width: 140 }} />
            {(undeliveredFilter.from || undeliveredFilter.to) && (
              <button className="iconbtn" type="button" onClick={() => setUndeliveredFilter({ from: '', to: '' })} title="Tozalash">✕</button>
            )}
          </div>
        }
      />
      {undeliveredList.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>✓ Barcha hujjatlar yetkazilgan</div>
      ) : (
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th>№</th><th>Buyurtma</th><th>Do&apos;kon</th>
                <th className="right">Summa</th><th>Bekor qilish sababi</th><th>Vaqt</th><th></th>
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
                    {inv.undeliverComment
                      ? <span style={{ color: 'var(--warn)', fontSize: 13 }}>⚠️ {inv.undeliverComment}</span>
                      : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {inv.undeliveredAt ? new Date(inv.undeliveredAt).toLocaleString('uz-UZ') : '—'}
                  </td>
                  <td>
                    <button className="mini" type="button" style={{ color: 'var(--ok)', borderColor: 'rgba(47,209,88,0.3)' }}
                      onClick={() => setRestoreModal({
                        invNo: inv.invNo,
                        date: todayIso(),
                        lines: (inv.lines || []).filter(l => (l.name || l.sku) && Math.max(l.init ?? 0, l.qty ?? 0) > 0).map(l => {
                          const initQty = Math.max(l.init ?? 0, l.qty ?? 0);
                          return { sku: l.sku, name: l.name, unit: l.unit, price: l.price, qty: initQty, initQty };
                        }),
                      })}>
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
}

function SavdoTab({ sessions, vazvratRows, invoices, savdoFrom, savdoTo, savdoInvoices, savdoAnalytics, savdoTab, setSavdoTab, fmtDateRu, fmt0 }: {
  sessions: any[]; vazvratRows: any[]; invoices: Invoice[]; savdoFrom: string; savdoTo: string;
  savdoInvoices: Invoice[]; savdoAnalytics: any[]; savdoTab: string; setSavdoTab: (t: any) => void;
  fmtDateRu: (d: string) => string; fmt0: (n: number) => string;
}) {
  const sessionsInRange = sessions.filter(s => s.invoiceDate >= savdoFrom && s.invoiceDate <= savdoTo);
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
  const rescheduled = invoices.filter(inv => inv.status === 'delivered' && inv.originalDateIso && inv.originalDateIso !== inv.dateIso);
  for (const inv of rescheduled) {
    const orig = inv.originalDateIso!;
    if (orig >= savdoFrom && orig <= savdoTo && dayMap[orig]) {
      dayMap[orig].berilgan -= inv.sumTotal;
      dayMap[orig].count = Math.max(0, dayMap[orig].count - 1);
    }
    const newD = inv.dateIso;
    if (newD >= savdoFrom && newD <= savdoTo) {
      if (!dayMap[newD]) dayMap[newD] = { berilgan: 0, vazvrat: 0, count: 0 };
      dayMap[newD].berilgan += inv.sumTotal;
      dayMap[newD].count += 1;
    }
  }
  const dayRows = Object.entries(dayMap).sort(([a],[b]) => a.localeCompare(b));
  const totBerilgan = sessionsInRange.reduce((s, sess) => s + sess.sumTotal, 0);
  const totVazvrat  = vazvratRows.reduce((s, vr) => s + vr.totalWithVat, 0);
  const totSavdo    = totBerilgan - totVazvrat;
  const mktMap: Record<string, { code: string; name: string; berilgan: number; vazvrat: number }> = {};
  for (const inv of savdoInvoices) {
    if (!mktMap[inv.storeCode]) mktMap[inv.storeCode] = { code: inv.storeCode, name: shortMkt(inv.market), berilgan: 0, vazvrat: 0 };
    mktMap[inv.storeCode].berilgan += inv.sumTotal;
  }
  for (const vr of vazvratRows) {
    if (!mktMap[vr.marketCode]) mktMap[vr.marketCode] = { code: vr.marketCode, name: shortMkt(vr.marketName), berilgan: 0, vazvrat: 0 };
    mktMap[vr.marketCode].vazvrat += vr.totalWithVat;
  }
  const mktRows = Object.values(mktMap).sort((a,b) => (b.berilgan-b.vazvrat)-(a.berilgan-a.vazvrat));
  const prodRows = savdoAnalytics;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="kpis kpis-3">
        <Kpi label="BERILGAN" value={fmt0(totBerilgan)} />
        <Kpi label="VAZVRAT"  value={fmt0(totVazvrat)} valueStyle={totVazvrat > 0 ? { color: 'var(--danger)' } : undefined} />
        <Kpi label="SAVDO"    value={fmt0(totSavdo)} accent />
      </div>
      <div className="subtabs" style={{ marginBottom: 12 }}>
        {(['kunlik', 'dokonlar', 'mahsulotlar'] as const).map(st => (
          <button key={st} type="button" onClick={() => setSavdoTab(st)} className={savdoTab === st ? 'active' : ''}>
            {st === 'kunlik' ? 'Kunlik' : st === 'dokonlar' ? "Do'konlar" : 'Mahsulotlar'}
          </button>
        ))}
      </div>
      {savdoTab === 'kunlik' && (
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Sana</th><th className="right">Nakl.</th><th className="right">Berilgan</th><th className="right">Qaytarma</th><th className="right">Savdo</th></tr></thead>
            <tbody>
              {dayRows.map(([date, d]) => (
                <tr key={date}>
                  <td className="mono">{fmtDateRu(date)}</td>
                  <td className="right mono muted">{d.count || '—'}</td>
                  <td className="right mono">{d.berilgan ? fmt0(d.berilgan) : <span className="muted">—</span>}</td>
                  <td className="right mono" style={d.vazvrat > 0 ? { color: 'var(--danger)' } : undefined}>{d.vazvrat ? fmt0(d.vazvrat) : <span className="muted">—</span>}</td>
                  <td className="right mono" style={{ color: (d.berilgan-d.vazvrat) < 0 ? 'var(--danger)' : 'var(--ok)', fontWeight: 600 }}>{fmt0(d.berilgan-d.vazvrat)}</td>
                </tr>
              ))}
              {dayRows.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>Ma'lumot yo'q</td></tr>}
            </tbody>
            {dayRows.length > 0 && <tfoot><tr>
              <td style={{ fontWeight: 700, color: 'var(--muted)', fontSize: 11, padding: '8px 12px' }}>JAMI</td>
              <td className="right mono" style={{ fontWeight: 700 }}>{sessionsInRange.reduce((s,x)=>s+x.invoiceCount,0)}</td>
              <td className="right mono" style={{ fontWeight: 700 }}>{fmt0(totBerilgan)}</td>
              <td className="right mono" style={{ fontWeight: 700, color: totVazvrat > 0 ? 'var(--danger)' : undefined }}>{fmt0(totVazvrat)}</td>
              <td className="right mono" style={{ fontWeight: 800, color: totSavdo < 0 ? 'var(--danger)' : 'var(--ok)' }}>{fmt0(totSavdo)}</td>
            </tr></tfoot>}
          </table>
        </div>
      )}
      {savdoTab === 'dokonlar' && (
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Do'kon</th><th className="right">Berilgan</th><th className="right">Qaytarma</th><th className="right">Savdo</th></tr></thead>
            <tbody>
              {mktRows.map(r => (
                <tr key={r.code}>
                  <td><b>{r.name}</b> <span className="muted">{r.code}</span></td>
                  <td className="right mono">{fmt0(r.berilgan)}</td>
                  <td className="right mono" style={r.vazvrat > 0 ? { color: 'var(--danger)' } : undefined}>{fmt0(r.vazvrat)}</td>
                  <td className="right mono" style={{ color: 'var(--ok)', fontWeight: 600 }}>{fmt0(r.berilgan-r.vazvrat)}</td>
                </tr>
              ))}
              {mktRows.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>Ma'lumot yo'q</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {savdoTab === 'mahsulotlar' && (
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Mahsulot</th><th className="right">B.dona</th><th className="right">Berilgan</th><th className="right">V.dona</th><th className="right">Qaytarma</th><th className="right">Savdo</th></tr></thead>
            <tbody>
              {prodRows.map((r: any) => (
                <tr key={r.sku}>
                  <td title={r.sku}>{r.name}</td>
                  <td className="right mono">{r.berilganQty || '—'}</td>
                  <td className="right mono">{fmt0(r.berilganSum)}</td>
                  <td className="right mono" style={r.vazvratQty > 0 ? { color: 'var(--danger)' } : undefined}>{r.vazvratQty || '—'}</td>
                  <td className="right mono" style={r.vazvratSum > 0 ? { color: 'var(--danger)' } : undefined}>{fmt0(r.vazvratSum)}</td>
                  <td className="right mono" style={{ color: 'var(--ok)', fontWeight: 600 }}>{fmt0(r.berilganSum-r.vazvratSum)}</td>
                </tr>
              ))}
              {prodRows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>Ma'lumot yo'q</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
  const totalSum     = invoices.filter(inv => inv.status === 'delivered').reduce((s, inv) => s + inv.sumTotal, 0);
  const totalInit    = invoices.reduce((s, inv) => s + inv.lines.reduce((ls, l) => ls + (l.init || 0), 0), 0);
  const totalInitSum = invoices.reduce((s, inv) => s + inv.lines.reduce((ls, l) => ls + (l.init || 0) * (l.price || 0) * 1.12, 0), 0);
  const totalGiven   = invoices.reduce((s, inv) => s + inv.sumQty, 0);
  const totalReduced = totalInit - totalGiven;

  const products = useMemo(() =>
    catalog.map((product, index) => {
      const initTotal = invoices.reduce((s, inv) => s + (inv.lines[index]?.init || 0), 0);
      const givenQty  = invoices.reduce((s, inv) => s + (inv.lines[index]?.qty  || 0), 0);
      const givenSum  = invoices.reduce((s, inv) => s + (inv.lines[index]?.total || 0), 0);
      return { name: product.name, index, initTotal, givenQty, givenSum, reduced: initTotal - givenQty };
    }).filter((r) => r.initTotal > 0).sort((a, b) => b.givenQty - a.givenQty),
  [invoices, catalog]);

  const markets = useMemo(() => {
    const map: Record<string, { storeCode: string; market: string; qty: number; sum: number; initSum: number; count: number }> = {};
    for (const inv of invoices) {
      const key = inv.storeCode;
      if (!map[key]) map[key] = { storeCode: key, market: inv.market, qty: 0, sum: 0, initSum: 0, count: 0 };
      map[key].qty     += inv.sumQty;
      map[key].sum     += inv.sumTotal;
      map[key].initSum += inv.lines.reduce((s, l) => s + (l.init || 0) * (l.price || 0), 0);
      map[key].count   += 1;
    }
    return Object.values(map).sort((a, b) => b.sum - a.sum);
  }, [invoices]);

  const [peekMarket, setPeekMarket] = useState<string | null>(null);
  const [peekInv, setPeekInv] = useState<number | null>(null);

  const maxProdQty   = products[0]?.givenQty || 1;
  const maxMarketSum = markets[0]?.sum || 1;

  const [statsTab, setStatsTab] = useState<'products'|'markets'>('products');
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);

  return (
    <section className="pane statsPane">
      <div className="stats-head-row">
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{T('stats_title')}</h2>
        </div>
        <div className="stats-kpi-bar">
          <span className="skpi"><span className="skpi-lbl">Keldi</span><span className="skpi-val">{fmt0(totalInit)}</span></span>
          <span className="skpi-sep" />
          <span className="skpi"><span className="skpi-lbl">Kamaydi</span><span className="skpi-val" style={totalReduced > 0 ? { color: 'var(--danger)' } : undefined}>{fmt0(totalReduced)}</span></span>
          <span className="skpi-sep" />
          <span className="skpi"><span className="skpi-lbl">Berildi</span><span className="skpi-val">{fmt0(totalGiven)}</span></span>
          <span className="skpi-sep" />
          <span className="skpi"><span className="skpi-lbl">Zakaz summa</span><span className="skpi-val">{fmt0(totalInitSum)}</span></span>
          <span className="skpi-sep" />
          <span className="skpi"><span className="skpi-lbl">Berilgan summa</span><span className="skpi-val skpi-accent">{fmt0(totalSum)}</span></span>
        </div>
        <div className="statsTabs">
          <button className={`statsTab${statsTab === 'products' ? ' active' : ''}`} onClick={() => setStatsTab('products')}>
            📦 {T('lbl_product')} ({products.length})
          </button>
          <button className={`statsTab${statsTab === 'markets' ? ' active' : ''}`} onClick={() => setStatsTab('markets')}>
            🏪 {T('lbl_store')} ({markets.length})
          </button>
        </div>
      </div>

      {/* Products tab */}
      {statsTab === 'products' && (
        <div className="tablewrap" style={{ maxHeight: 'calc(100dvh - 200px)', overflowY: 'auto' }}>
          <table className="data compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Mahsulot nomi</th>
                <th style={{ textAlign: 'right' }}>Zakaz</th>
                <th style={{ textAlign: 'right' }}>Kamaydi</th>
                <th style={{ textAlign: 'right' }}>Berildi</th>
                <th style={{ textAlign: 'right' }}>Summa (so'm)</th>
              </tr>
            </thead>
            <tbody>
              {products.map((row, i) => {
                const isOpen = expandedProduct === row.index;
                const invRows = isOpen ? invoices.filter(inv => (inv.lines[row.index]?.qty || 0) > 0) : [];
                return (
                  <React.Fragment key={row.name}>
                    <tr className={isOpen ? 'prod-expanded-row' : ''} style={{ cursor: 'pointer' }} onClick={() => setExpandedProduct(isOpen ? null : row.index)}>
                      <td style={{ color: 'var(--muted)', fontSize: 11, width: 1, whiteSpace: 'nowrap' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>
                        <span className={`prod-chevron${isOpen ? ' open' : ''}`}>›</span>
                        {row.name}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt0(row.initTotal)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: row.reduced > 0 ? 'var(--danger)' : 'var(--muted)', fontWeight: row.reduced > 0 ? 700 : 400 }}>
                        {row.reduced > 0 ? `−${fmt0(row.reduced)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ok)', fontWeight: 700 }}>{fmt0(row.givenQty)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{fmt0(row.givenSum)}</td>
                    </tr>
                    {isOpen && invRows.map(inv => (
                      <tr key={`${row.index}-${inv.invNo}`} className="prod-sub-row">
                        <td />
                        <td style={{ paddingLeft: 28, color: 'var(--muted)', fontSize: 12 }}>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--ok)', fontWeight: 700, marginRight: 8 }}>{inv.invNo}</span>
                          {inv.market}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>{fmt0(inv.lines[row.index]?.init || 0)}</td>
                        <td />
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ok)', fontWeight: 600 }}>{fmt0(inv.lines[row.index]?.qty || 0)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt0(inv.lines[row.index]?.total || 0)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Markets tab */}
      {statsTab === 'markets' && (
        <div className="tablewrap" style={{ maxHeight: 'calc(100dvh - 200px)', overflowY: 'auto' }}>
          <table className="data compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Market nomi</th>
                <th style={{ textAlign: 'right' }}>Hujjat soni</th>
                <th style={{ textAlign: 'right' }}>Dona</th>
                <th style={{ textAlign: 'right' }}>Summa (so'm)</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m, i) => {
                const isOpen = peekMarket === m.storeCode;
                const mInvs = isOpen ? invoices.filter(inv => inv.storeCode === m.storeCode) : [];
                return (
                  <React.Fragment key={m.storeCode}>
                    <tr className={isOpen ? 'prod-expanded-row' : ''} style={{ cursor: 'pointer' }} onClick={() => setPeekMarket(isOpen ? null : m.storeCode)}>
                      <td style={{ color: 'var(--muted)', fontSize: 11, width: 1, whiteSpace: 'nowrap' }}>{i + 1}</td>
                      <td style={{ fontWeight: 700 }}>
                        <span className={`prod-chevron${isOpen ? ' open' : ''}`}>›</span>
                        {shortMkt(m.market)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{m.count}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt0(m.qty)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{fmt0(m.sum)}</td>
                    </tr>
                    {isOpen && mInvs.map(inv => {
                      const invOpen = peekInv === inv.invNo;
                      const invLines = catalog.map((p, pi) => ({ name: p.name, qty: inv.lines[pi]?.qty || 0, price: inv.lines[pi]?.price || 0, total: inv.lines[pi]?.total || 0 })).filter(l => l.qty > 0);
                      return (
                        <React.Fragment key={inv.invNo}>
                          <tr className="prod-sub-row" style={{ cursor: 'pointer', ...(inv.status === 'cancelled' ? { opacity: 0.4 } : {}) }} onClick={() => setPeekInv(invOpen ? null : inv.invNo)}>
                            <td />
                            <td style={{ paddingLeft: 28, fontSize: 12 }}>
                              <span className={`prod-chevron${invOpen ? ' open' : ''}`} style={{ fontSize: 13 }}>›</span>
                              <span style={{ fontFamily: 'var(--mono)', color: 'var(--ok)', fontWeight: 700, marginRight: 8 }}>{inv.invNo}</span>
                              <span style={{ color: 'var(--muted)' }}>{inv.order}</span>
                            </td>
                            <td />
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ok)', fontWeight: 600 }}>{fmt0(inv.sumQty)}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{fmt0(inv.sumTotal)}</td>
                          </tr>
                          {invOpen && invLines.map(l => (
                            <tr key={l.name} className="prod-sub-row">
                              <td colSpan={2} style={{ paddingLeft: 56, fontSize: 11, color: 'var(--muted)' }}>{l.name}</td>
                              <td />
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ok)' }}>{fmt0(l.qty)}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>{fmt0(l.total)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatusChip({ status, T = (k: string) => k }: { status: string; T?: (k: string) => string }) {
  const label: Record<string, string> = {
    new: T('ops_status_new'),
    in_production: T('ops_status_prod'),
    delivered: T('ops_status_del'),
    cancelled: T('ops_status_can'),
  };
  return (
    <span className={`statuschip ${status}`}>
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

function BarcodeCanvas({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!value || !ref.current) return;
    const render = () => {
      if (ref.current && (window as any).JsBarcode) {
        try {
          (window as any).JsBarcode(ref.current, value, {
            format: 'CODE128', width: 0.9, height: 20,
            displayValue: true, fontSize: 7, margin: 2,
            background: '#fff', lineColor: '#000',
          });
        } catch {}
      }
    };
    if ((window as any).JsBarcode) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
    s.onload = render;
    document.head.appendChild(s);
  }, [value]);
  return <canvas ref={ref} style={{ display: 'block', maxWidth: '100%' }} />;
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
        <div>
          <span>№ заказа</span>
          {invoice.order && <BarcodeCanvas value={invoice.order} />}
        </div>
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
    nav_docs:'Hujjatlar', nav_dispatch:'Marshrut', nav_schedule:'Grafik',
    nav_stats:'Statistika', nav_ops:'Operatsiyalar', nav_clients:'Mijozlar',
    nav_analytics:'Analitika', nav_settings:'Sozlamalar',
    nav_preferences:'Shaxsiy', pref_theme:'Mavzu', pref_theme_hint:'Yorug‘ yoki tungi ko‘rinish', pref_dark:'Tungi', pref_light:'Yorug‘',
    pref_bg:'Orqa fon', pref_bg_hint:'Tayyor fon yoki o‘z rangingizni tanlang', pref_bg_custom:'O‘z rangim', pref_reset:'Tiklash',
    pref_density:'Zichlik', pref_density_hint:'Element va matn o‘lchami', pref_compact:'Ixcham', pref_cozy:'O‘rtacha', pref_comfortable:'Keng',
    pref_lang:'Til', pref_lang_hint:'Interfeys tili',
    // topbar
    lbl_invoices:'nakl.', lbl_pcs:'dona', lbl_sum:"so'm", lbl_unsaved:'saqlanmagan',
    lbl_logout:'Chiqish', lbl_store:'Market', lbl_driver:'Haydovchi',
    lbl_print:'Chop etish', lbl_save:'Saqlash', lbl_add:"Qo'shish",
    lbl_cancel:'Bekor', lbl_date:'Sana', lbl_order:'Buyurtma',
    lbl_product:'Mahsulot', lbl_unit:'Birlik', lbl_qty:'Miqdor',
    lbl_price:'Narx', lbl_total:'Jami', lbl_vat:'QQS',
    lbl_delivered:'Yetkazildi', lbl_selected:'Tanlangan', lbl_restore:'Tiklash', lbl_delete:"O'chirish",
    // pane titles/meta
    reg_title:"Hujjatlar ro'yxati", reg_empty:"Hujjat yo'q",
    reg_meta_docs:'hujjat', reg_manual:'Qo\'lda',
    matrix_title:'Miqdor matritsasi', hide_zeros:"Nollarni yashir",
    matrix_product:'Mahsulot', matrix_total:'Jami',
    docs_title:'Hujjatlar', docs_print_sel:'Tanlanganlarni chop',
    docs_empty:'Avval hujjat shakllantiring',
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
    dispatch_title:'Marshrut', dispatch_empty:'Avval hujjat shakllantiring',
    schedule_title:'Yetkazib berish jadvali',
    schedule_upload:'Grafik yuklash', schedule_view_only:"Ko'rish rejimi",
    stats_title:'Statistika', stats_invoices:'Nakladnoylar',
    stats_items:'Dona', stats_sum:'Summa', stats_avg:'O\'rtacha',
    analytics_title:'Analitika',
    settings_cat:'Mahsulotlar', settings_req:'Tafsilot',
    settings_exc:'Istisno kunlar', settings_hist:'Tarix', settings_access:'Kirish',
    settings_cat_title:'Mahsulotlar', settings_req_title:'Tafsilot',
    settings_hist_title:'Sessiya tarixi', settings_users_title:'Foydalanuvchilar',
    settings_supplier:'Yetkazib beruvchi', settings_receiver:'Qabul qiluvchi',
    settings_contract:'Shartnoma',
    modal_manual:'Qo\'lda hujjat', modal_order:'Yangi buyurtma', modal_client:'Yangi mijoz',
    // days
    days:['Du','Se','Ch','Pa','Ju','Sh','Ya'],
    days_full:['Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'],
  },
  ru: {
    nav_orders:'Заказы', nav_register:'Реестр', nav_matrix:'Таблица',
    nav_docs:'Hujjatlar', nav_dispatch:'Marshrut', nav_schedule:'График',
    nav_stats:'Статистика', nav_ops:'Операции', nav_clients:'Клиенты',
    nav_analytics:'Аналитика', nav_settings:'Настройки',
    nav_preferences:'Персонализация', pref_theme:'Тема', pref_theme_hint:'Светлый или тёмный режим', pref_dark:'Тёмная', pref_light:'Светлая',
    pref_bg:'Фон', pref_bg_hint:'Готовый фон или свой цвет', pref_bg_custom:'Свой цвет', pref_reset:'Сбросить',
    pref_density:'Плотность', pref_density_hint:'Размер элементов и текста', pref_compact:'Компактно', pref_cozy:'Обычно', pref_comfortable:'Просторно',
    pref_lang:'Язык', pref_lang_hint:'Язык интерфейса',
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
    docs_title:'Hujjatlar', docs_print_sel:'Печать выбранных',
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
    dispatch_title:'Marshrut', dispatch_empty:'Сначала сформируйте накладные',
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
    nav_docs:'Hujjatlar', nav_dispatch:'Dispatch', nav_schedule:'Schedule',
    nav_stats:'Statistics', nav_ops:'Operations', nav_clients:'Clients',
    nav_analytics:'Analytics', nav_settings:'Settings',
    nav_preferences:'Preferences', pref_theme:'Theme', pref_theme_hint:'Light or dark appearance', pref_dark:'Dark', pref_light:'Light',
    pref_bg:'Background', pref_bg_hint:'Pick a preset or your own color', pref_bg_custom:'Custom color', pref_reset:'Reset',
    pref_density:'Density', pref_density_hint:'Size of elements and text', pref_compact:'Compact', pref_cozy:'Cozy', pref_comfortable:'Comfortable',
    pref_lang:'Language', pref_lang_hint:'Interface language',
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
    docs_title:'Hujjatlar', docs_print_sel:'Print selected',
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
// Per-route color coding, aligned to the brand palette (blue/pistachio/indigo/
// honey/berry + one teal) instead of a separate iOS-system palette.
const DISPATCH_COLORS = [
  { header:'rgba(76,155,234,0.85)',  text:'#ffffff', dot:'#4c9bea',  cell:'rgba(76,155,234,0.10)' },
  { header:'rgba(70,191,114,0.85)',  text:'#ffffff', dot:'#46bf72',  cell:'rgba(70,191,114,0.10)' },
  { header:'rgba(124,124,230,0.85)', text:'#ffffff', dot:'#7c7ce6',  cell:'rgba(124,124,230,0.10)' },
  { header:'rgba(233,166,58,0.85)',  text:'#ffffff', dot:'#e9a63a',  cell:'rgba(233,166,58,0.10)' },
  { header:'rgba(232,79,106,0.85)',  text:'#ffffff', dot:'#e84f6a',  cell:'rgba(232,79,106,0.10)' },
  { header:'rgba(64,191,180,0.85)',  text:'#ffffff', dot:'#40bfb4',  cell:'rgba(64,191,180,0.10)' },
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
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(var(--hi-rgb),0.4)', minWidth: 60 }}>{s.storeCode}</span>
                    <span style={{ color: 'rgba(var(--hi-rgb),0.75)' }}>{s.market}</span>
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
          <div className="schedule-tablewrap" style={{ maxWidth: 760 }}>
          <table className="data compact">
            <thead><tr>
              <th className="sched-freeze sched-freeze-1">{T('lbl_store')} (код)</th>
              <th className="sched-freeze sched-freeze-2">{T('lbl_store')}</th>
              <th className="sched-freeze sched-freeze-3">{T('lbl_driver')}</th>
              <th className="sched-day">Dushanba</th><th className="sched-day">Seshanba</th><th className="sched-day">Chorshanba</th><th className="sched-day">Payshanba</th><th className="sched-day">Juma</th><th className="sched-day">Shanba</th><th className="sched-day">Yakshanba</th>
            </tr></thead>
            <tbody>
              <tr>
                <td className="sched-freeze sched-freeze-1">4508881756</td>
                <td className="sched-freeze sched-freeze-2">Aeroport /1</td>
                <td className="sched-freeze sched-freeze-3">Алишер</td>
                <td className="sched-day">1</td><td className="sched-day"></td><td className="sched-day">1</td><td className="sched-day"></td><td className="sched-day"></td><td className="sched-day">1</td><td className="sched-day"></td>
              </tr>
              <tr>
                <td className="sched-freeze sched-freeze-1">4508882431</td>
                <td className="sched-freeze sched-freeze-2">Aeroport /2</td>
                <td className="sched-freeze sched-freeze-3">Бобур</td>
                <td className="sched-day"></td><td className="sched-day">1</td><td className="sched-day"></td><td className="sched-day">1</td><td className="sched-day"></td><td className="sched-day"></td><td className="sched-day"></td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      ) : (
        <div className="schedule-tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th className="sched-freeze sched-freeze-1">{T('lbl_store')} (код)</th>
                <th className="sched-freeze sched-freeze-2">{T('lbl_store')}</th>
                <th className="sched-freeze sched-freeze-3">{T('lbl_driver')}</th>
                {dayNames.map((d, i) => <th key={i} className={`sched-day${i === dow ? ' today-col' : ''}`}>{d}</th>)}
                <th>Бугун</th>
              </tr>
            </thead>
            <tbody>
              {scheduleRows.map((row, i) => {
                const todayOk = row.days[dow];
                const inInvoices = invoices.some((inv) => inv.storeCode === row.storeCode);
                return (
                  <tr key={i} style={!inInvoices ? { opacity: 0.4 } : undefined}>
                    <td className="sched-freeze sched-freeze-1" style={{ fontSize: 12, color: 'var(--muted)' }}>{row.storeCode}</td>
                    <td className="sched-freeze sched-freeze-2"><b>{row.market}</b></td>
                    <td className="sched-freeze sched-freeze-3">{row.driver}</td>
                    {row.days.map((on, di) => (
                      <td key={di} className="sched-day" style={{ background: di === dow && on ? 'rgba(34,197,94,0.15)' : di === dow && !on ? 'rgba(239,68,68,0.08)' : '' }}>
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
  const DEFAULT_DRIVERS = [T('lbl_driver') + ' 1', T('lbl_driver') + ' 2'];
  const [extraDrivers, setExtraDrivers] = useState<string[]>([]);
  const baseDrivers = scheduleDrivers.length > 0 ? scheduleDrivers : DEFAULT_DRIVERS;
  const [driverNames, setDriverNames] = useState<string[]>([]);
  const [hiddenDrivers, setHiddenDrivers] = useState<Set<number>>(new Set());
  const rawDrivers = [...baseDrivers, ...extraDrivers];
  const drivers = rawDrivers.map((d, i) => driverNames[i] ?? d);

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
          <div className="tablewrap dispatch-tablewrap" style={{ marginBottom: 24, maxHeight: 'calc(100dvh - 220px)', overflowY: 'auto' }}>
            <table className="data dispatchTable">
              <thead className="dispatch-thead">
                <tr>
                  <th className="dispatch-name-cell" rowSpan={2} style={{ minWidth: 220, position: 'sticky', left: 0, zIndex: 5, top: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--muted)' }}>{T('lbl_store')}</span>
                  </th>
                  {drivers.map((d, di) => {
                    if (hiddenDrivers.has(di)) return null;
                    const partCount = driverPartCounts[di] ?? 1;
                    const clr = DISPATCH_COLORS[di % DISPATCH_COLORS.length];
                    const isExtra = di >= baseDrivers.length;
                    return (
                      <th key={di} colSpan={partCount} style={{ textAlign: 'center', borderLeft: '2px solid rgba(0,0,0,0.18)', background: clr.header, color: clr.text, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3, padding: '8px 10px', height: 40, verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <input
                            value={d}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (isExtra) {
                                setExtraDrivers((prev) => { const n = [...prev]; n[di - baseDrivers.length] = val; return n; });
                              }
                              setDriverNames((prev) => { const n = [...prev]; n[di] = val; return n; });
                            }}
                            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderBottom: `1.5px solid rgba(255,255,255,0.5)`, borderRadius: 4, color: clr.text, fontSize: 13, fontWeight: 700, textAlign: 'center', outline: 'none', width: 100, padding: '2px 4px' }}
                          />
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: '1px 4px' }}>
                            <button type="button" onClick={() => setDriverPartCounts((prev) => { const n = [...prev]; n[di] = Math.max(1, (n[di] ?? 1) - 1); return n; })} style={{ background: 'none', border: 'none', color: clr.text, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px', fontWeight: 700 }}>−</button>
                            <span style={{ fontSize: 11, color: clr.text, minWidth: 12, textAlign: 'center' }}>{partCount}</span>
                            <button type="button" onClick={() => setDriverPartCounts((prev) => { const n = [...prev]; n[di] = Math.min(8, (n[di] ?? 1) + 1); return n; })} style={{ background: 'none', border: 'none', color: clr.text, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px', fontWeight: 700 }}>+</button>
                          </span>
                          {di >= 2 && (
                            <button type="button" onClick={() => {
                              if (isExtra) {
                                setExtraDrivers((prev) => prev.filter((_, i) => i !== di - baseDrivers.length));
                                setDispatchMap(Object.fromEntries(Object.entries(dispatchMap).filter(([, v]) => v.driverIdx !== di)));
                              } else {
                                setHiddenDrivers((prev) => new Set([...prev, di]));
                              }
                            }} style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 4, color: clr.text, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '1px 5px' }}>×</button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  {drivers.map((_, di) => {
                    if (hiddenDrivers.has(di)) return null;
                    const partCount = driverPartCounts[di] ?? 1;
                    const clr = DISPATCH_COLORS[di % DISPATCH_COLORS.length];
                    return Array.from({ length: partCount }, (__, pi) => {
                      const partNo = pi + 1;
                      const hasMarkets = markets.some((m) => dispatchMap[m.storeCode]?.driverIdx === di && dispatchMap[m.storeCode]?.part === partNo);
                      return (
                        <th key={`${di}-${pi}`} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: clr.dot, borderLeft: pi === 0 ? '2px solid rgba(0,0,0,0.15)' : undefined, whiteSpace: 'nowrap', padding: '3px 4px', height: 28 }}>
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
                        className="dispatch-name-cell"
                        style={{ position: 'sticky', left: 0, zIndex: 2 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.2 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', fontFamily: 'var(--sans)', letterSpacing: '-0.01em' }}>
                            {mkt.market.replace(/\s*\/\d+$/, '')}<span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: 11, marginLeft: 4 }}>({mkt.storeCode})</span>
                          </span>
                        </div>
                      </td>
                      {drivers.map((_, di) => {
                        if (hiddenDrivers.has(di)) return null;
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
                                background: undefined,
                                cursor: 'pointer',
                                userSelect: 'none',
                                transition: 'background 0.15s',
                              }}
                            >
                              <span
                                className="dispatch-dot"
                                style={{
                                  width: 18, height: 18, borderRadius: '50%',
                                  border: `1.5px solid ${checked ? clr.dot : 'rgba(var(--hi-rgb),0.20)'}`,
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
