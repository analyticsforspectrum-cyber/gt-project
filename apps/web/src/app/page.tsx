'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Download,
  FileText,
  Grid3x3,
  LogOut,
  Map as MapIcon,
  PenLine,
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
  daysAgo,
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

type View = 'register' | 'matrix' | 'documents' | 'stats' | 'settings' | 'operations' | 'customers' | 'analytics' | 'orders' | 'schedule' | 'dispatch' | 'undelivered' | 'preferences' | 'manual-list';
type SettingsView = 'catalog' | 'requisites' | 'sessions' | 'users' | 'exceptions' | 'doverennost' | 'trash';
type Theme = 'dark' | 'light';
type Density = 'tight' | 'compact' | 'cozy' | 'comfortable';

// Curated backgrounds guaranteed to match the rest of the UI. `theme` is the
// readable text/surface theme each background pairs with.
const BG_PRESETS: { id: string; label: string; value: string; theme: Theme }[] = [
  { id: 'white',    label: 'Oq',       value: '#ffffff', theme: 'light' },
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
/** Initial vazvrat fetch window. Shown in the UI so users know the visible range. */
const VAZVRAT_DEFAULT_DAYS = 90;

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
  const [ordersTab, setOrdersTab] = useState<'import' | 'history' | 'vazvrat'>('import');
  const [vazvratUploadBusy, setVazvratUploadBusy] = useState(false);
  const [histFrom, setHistFrom] = useState(() => daysAgo(10));
  const [histTo,   setHistTo]   = useState(todayIso);
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
  // customers removed
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [productStats, setProductStats] = useState<ProductStat[]>([]);
  const [inventoryStats, setInventoryStats] = useState<InventoryStat[]>([]);
  // customerStats removed
  // analyticsTab lives inside AnalyticsPane — removed from outer state
  const [orderFilters, setOrderFilters] = useState({ dateFrom: '', dateTo: '', customer: '', status: '' });
  const [orderCreateOpen, setOrderCreateOpen] = useState(false);
  const [newOrderCustomer, setNewOrderCustomer] = useState('');
  const [newOrderDeliveryDate, setNewOrderDeliveryDate] = useState(todayIso());
  const [newOrderNotes, setNewOrderNotes] = useState('');
  const [newOrderItems, setNewOrderItems] = useState<Array<{ sku: string; name: string; unit: string; qty: number; price: number }>>([]);
  // newCustomer removed
  const [importFile, setImportFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [xlsSheets, setXlsSheets] = useState<string[]>([]);
  const [xlsSelectedSheet, setXlsSelectedSheet] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [xlsWorkbook, setXlsWorkbook] = useState<any>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<Invoice | null>(null);
  const [undeliverModal, setUndeliverModal] = useState<{ invNo: number; comment: string } | null>(null);
  const [undeliveredFilter, setUndeliveredFilter] = useState<{ from: string; to: string }>(() => {
    return { from: daysAgo(3), to: todayIso() };
  });
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
  // Always light mode
  const [theme, setTheme] = useState<Theme>('light');
  const [density, setDensity] = useState<Density>(() =>
    typeof window !== 'undefined' ? ((localStorage.getItem('pref_density') as Density) || 'cozy') : 'cozy'
  );
  const [appBg, setAppBg] = useState<string>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('pref_bg') || '') : ''
  );
  // pref_accent_v3: bumped key so the Soliq blue becomes the default again, resetting
  // any stray accent (e.g. orange) that was saved earlier. Switchable in Preferences.
  const [accent, setAccent] = useState<string>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('pref_accent_v3') || 'soliq') : 'soliq'
  );

  // Ishonchnoma (power of attorney) fields
  const [dovFields, setDovFields] = useState(() => {
    const defaults = {
      company: 'MCHJ «Druzya»',
      address: 'Toshkent shahar, Yunusobod tumani, Xiyobon 48',
      docNo: '18',
      docDate: '',
      driver: '',
      prava: 'AF 0006178',
      car: 'LB2',
      plate: '01 W 851 SC',
      validUntil: '',
      director: 'Бойматова Д.А.',
    };
    if (typeof window === 'undefined') return defaults;
    const s = localStorage.getItem('dov_fields');
    if (!s) return defaults;
    const saved = JSON.parse(s);
    // Only override defaults with saved values that are non-empty strings
    const merged = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
      if (saved[key] !== undefined && saved[key] !== '') merged[key] = saved[key];
    }
    return merged;
  });
  const setDov = (key: string, val: string) => {
    setDovSaved(false);
    setDovFields((prev: typeof dovFields) => {
      const next = { ...prev, [key]: val };
      localStorage.setItem('dov_fields', JSON.stringify(next));
      return next;
    });
  };
  const [dovHistory, setDovHistory] = useState<import('@/types/domain').DovEntry[]>(() =>
    typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('dov_history') || '[]') : []
  );
  const [dovSaved, setDovSaved] = useState(false);
  function deleteDovEntry(index: number) {
    setDovHistory(prev => {
      const next = prev.filter((_, i) => i !== index);
      localStorage.setItem('dov_history', JSON.stringify(next));
      return next;
    });
  }
  const [histTab, setHistTab] = useState<'nakl' | 'dov'>('nakl');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const toggleDateGroup = (key: string) => setExpandedDates(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const saveDov = () => {
    const entry = { ...dovFields, printedAt: new Date().toISOString() };
    const hist = [entry, ...dovHistory].slice(0, 20);
    setDovHistory(hist);
    localStorage.setItem('dov_history', JSON.stringify(hist));
    setDovSaved(true);
  };

  const printDov = () => {

    const fmtD = (d: string) => d ? new Date(d).toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' }) : '';
    const v = dovFields;
    const w = window.open('', '_blank', 'width=794,height=1123');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Доверенность</title><style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Times New Roman',Times,serif;font-size:14pt;line-height:1.8;color:#000;background:#fff;padding:20mm 25mm}
      .topright{text-align:right;margin-bottom:24px}
      .ul{border-bottom:1px solid #000;display:inline-block;padding:0 4px;min-width:80px}
      .title{text-align:center;font-size:18pt;font-weight:bold;letter-spacing:6px;margin:32px 0 28px}
      p{margin:0 0 12px;text-align:justify;text-indent:40px}
      .sign{margin-top:80px;display:flex;justify-content:space-between;align-items:flex-end}
      b{font-weight:bold}
      @page{size:A4;margin:0}
    </style></head><body>
      <div class="topright">
        <div><b><span class="ul" style="min-width:220px">${v.company || ''}</span></b></div>
        <div><span class="ul" style="min-width:300px">${v.address || ''}</span></div>
        <div>Исх. №<span class="ul" style="min-width:40px;text-align:center">${v.docNo || ''}</span></div>
        <div>от <span class="ul" style="min-width:120px;text-align:center">${fmtD(v.docDate)}</span> г.&nbsp;&nbsp;г. Ташкент</div>
      </div>
      <div class="title">Д О В Е Р Е Н Н О С Т Ь</div>
      <p>Настоящей доверенностью руководство <b><span class="ul" style="min-width:160px">${v.company || ''}</span></b> уполномочивает водителя <b><span class="ul" style="min-width:260px">${v.driver || ''}</span></b> экспедитора владельцу правы <span class="ul" style="min-width:120px">${v.prava || ''}</span> направо пользования автомобилем «<span class="ul" style="min-width:60px;text-align:center">${v.car || ''}</span>» гос. номер <span class="ul" style="min-width:120px">${v.plate || ''}</span></p>
      <p>Доверенность действительна до <b>${fmtD(v.validUntil) || '__________'}</b> года.</p>
      <div class="sign">
        <div>Генеральный директор</div>
        <div><span class="ul" style="min-width:220px;text-align:center">${v.director || ''}</span></div>
      </div>
    </body></html>`);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };
  // Accent color presets.
  // `ok`/`okRgb` drive success states AND the table zebra tint — Soliq keeps these
  // green so the header goes blue while tables stay clean/neutral. `rgb` feeds
  // --berry-rgb (button shadows).
  const ACCENT_PRESETS = [
    { id: 'soliq',    label: "Soliq",     main: '#0e5fbf', dark: '#0a4aa0', ok: '#22c55e', okRgb: '34,197,94',  rgb: '14,95,191' },
    { id: 'berry',    label: "Pushti",    main: '#e84f6a', dark: '#bf3652', ok: '#46bf72', okRgb: '70,191,114', rgb: '232,79,106' },
    { id: 'green',    label: "Yashil",    main: '#22c55e', dark: '#16a34a', ok: '#22c55e', okRgb: '34,197,94',  rgb: '34,197,94' },
    { id: 'blue',     label: "Ko'k",      main: '#3b82f6', dark: '#2563eb', ok: '#3b82f6', okRgb: '59,130,246', rgb: '59,130,246' },
    { id: 'purple',   label: "Binafsha",  main: '#8b5cf6', dark: '#7c3aed', ok: '#8b5cf6', okRgb: '139,92,246', rgb: '139,92,246' },
    { id: 'orange',   label: "To'q sariq",main: '#f97316', dark: '#ea580c', ok: '#f97316', okRgb: '249,115,22', rgb: '249,115,22' },
    { id: 'teal',     label: "Feruza",    main: '#14b8a6', dark: '#0d9488', ok: '#14b8a6', okRgb: '20,184,166', rgb: '20,184,166' },
  ];

  // Apply visual preferences to <html> so all token-based styling reacts.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.density = density;
    if (appBg) root.style.setProperty('--app-bg', appBg);
    else root.style.removeProperty('--app-bg');
    // Apply accent colors
    const ap = ACCENT_PRESETS.find(p => p.id === accent) ?? ACCENT_PRESETS[0];
    root.style.setProperty('--berry', ap.main);
    root.style.setProperty('--berry-dark', ap.dark);
    root.style.setProperty('--ok', ap.ok);
    root.style.setProperty('--ok-rgb', ap.okRgb);
    root.style.setProperty('--accent', ap.main);
    root.style.setProperty('--berry-rgb', ap.rgb);
    localStorage.setItem('pref_theme', theme);
    localStorage.setItem('pref_density', density);
    localStorage.setItem('pref_bg', appBg);
    localStorage.setItem('pref_accent_v3', accent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, density, appBg, accent]);
  const [unsaved, setUnsaved] = useState(false);
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
  const [manualWithVat, setManualWithVat] = useState(true); // true = narx QQS bilan (×1.12)
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
  const filteredInvoices = useMemo(() => {
    const active = invoices.filter((i) => i.status !== 'cancelled');
    return filterDate ? active.filter((i) => i.dateIso === filterDate) : active;
  }, [invoices, filterDate]);

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
        Promise.resolve([]),
        api.dashboardStats(authToken).catch(() => null),
        api.queryVazvrat(authToken, daysAgo(VAZVRAT_DEFAULT_DAYS), todayIso()).catch(() => [] as import('@/types/domain').VazvratRecord[]),
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
      // customers removed
      if (statsResult) setDashboardStats(statsResult);

      // Auto-restore latest session so all views have consistent data with init values
      if (sessionsResult.length > 0) {
        try {
          const latest = sessionsResult[0]; // sorted newest first
          const sessionRecord = await api.session(authToken, latest._id);
          if (sessionRecord?.snapshot) {
            // restoreSnapshot needs setInvoices etc — call inline here
            const snap = sessionRecord.snapshot;
            setInvoices(snap.invoices || []);
            // Use live catalog (up-to-date prices); fall back to snapshot only if live catalog is empty
            const liveCatalog = catalogResult.length > 0 ? catalogResult : (snap.catalog ?? []);
            setCatalog(liveCatalog);
            setCatalogDraft(liveCatalog);
            // Sync DB statuses on top of snapshot
            try {
              const [dbInvoices, cancelledInvoices] = await Promise.all([
                api.invoices(authToken),
                api.listCancelledInvoices(authToken).catch(() => [] as Invoice[]),
              ]);
              // setAllDbInvoices faqat Analytics tabida yuklanadi (loadAnalytics da)
              const statusMap: Record<number, Invoice['status']> = {};
              for (const d of dbInvoices) statusMap[d.invNo] = d.status;
              for (const d of cancelledInvoices) statusMap[d.invNo] = 'cancelled';
              setInvoices((prev) => prev.map((inv) => ({ ...inv, status: statusMap[inv.invNo] ?? inv.status ?? 'saved' })));
            } catch (e) {
              // Re-throw ApiError (e.g. 401) so the outer loadCore catch handles auth; warn on everything else.
              if (e instanceof ApiError) throw e;
              console.warn('[loadCore] DB status sync failed:', e);
              setToast({ kind: 'err', text: "Holat yangilanmadi — tarmoq xatosi." });
            }
          }
        } catch (e) { console.warn('[loadCore] No session available:', e); }
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
        await loadCore(saved, me.role).catch((e) => {
          console.warn('[loadCore]', e);
          if (e instanceof ApiError && e.status === 401) {
            window.localStorage.removeItem(TOKEN_KEY);
            setToken(null);
            setUser(null);
          } else {
            setToast({ kind: 'err', text: "Ma'lumotlar yuklanmadi. Sahifani yangilang." });
          }
        });
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setBooting(false));
  }, [loadCore]);

  // Pre-load JsBarcode so print doesn't wait for network
  useEffect(() => {
    if ((window as any).JsBarcode) return;
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
    document.head.appendChild(s);
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
      // skipSession: true — sessiya saqlanmaydi, faqat invoicelar generatsiya qilinadi
      // Sessiya faqat "Saqlash" bosilganda saqlanadi
      const result = await api.generate(token, { sapRaw: raw, startId, dateIso, skipSession: true });
      setInvoices(result.invoices);
      setCatalog(result.catalog);
      setCatalogDraft(result.catalog);
      setSelected(new Set(result.invoices.map((invoice) => invoice.invNo)));
      setUnsaved(true); // Saqlash kerakligi ko'rsatiladi
      showToast('ok', `Tayyor: ${result.invoices.length} ta hujjat. "Saqlash" tugmasini bosing!`);
    } catch (error) {
      showToast('err', getError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrentSession(nextInvoices = invoices, nextCatalog = catalog, silent = false, forceName?: string) {
    if (!token || !nextInvoices.length) return;
    const snapshot = buildSnapshot({
      invoiceDate: dateIso,
      startId,
      sapRaw,
      catalog: nextCatalog,
      invoices: nextInvoices
    });
    try {
      // Build session name: suffix if provided, else auto-increment per day
      let sessionName: string;
      if (forceName !== undefined) {
        sessionName = forceName;
      } else if (sessionSuffix.trim()) {
        sessionName = dateIso + ' ' + sessionSuffix.trim();
      } else {
        // Auto-name: use dateIso as base, check backend for duplicates
        sessionName = dateIso;
      }

      // Duplicate check (only when not silent auto-save)
      if (!silent) {
        const dup = await api.checkSessionDuplicate(token, dateIso, sessionName);
        if (dup.exists) {
          const confirmed = window.confirm(`"${sessionName}" nomli sessiya mavjud.\n\nUstiga yozilsinmi?\n\n"Bekor" — yangi nom bilan saqlash`);
          if (!confirmed) {
            // Find next free name
            let n = 2;
            while (true) {
              const candidate = `${dateIso} #${n}`;
              const check = await api.checkSessionDuplicate(token, dateIso, candidate);
              if (!check.exists) { sessionName = candidate; break; }
              n++;
            }
          }
        }
      }

      await api.saveSession(token, {
        invoiceDate: dateIso,
        invoiceCount: nextInvoices.length,
        sumTotal: nextInvoices.reduce((sum, invoice) => sum + invoice.sumTotal, 0),
        snapshot,
        name: sessionName
      });
      setUnsaved(false);
      if (nextInvoices.length) {
        const maxInvNo = Math.max(...nextInvoices.map(i => i.invNo));
        localStorage.setItem('gdetort_last_inv_no', String(maxInvNo));
        setStartId(maxInvNo + 1);
      }
      await refreshSessions();
      if (!silent) {
        showToast('ok', `Сессия сохранена: ${sessionName}`);
        setView('register');
      }
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  async function uploadVazvratFromOrders(file: File) {
    if (!token) return;
    setVazvratUploadBusy(true);
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
        const orderNo     = String(r[0] || lastOrderNo);
        const dateRaw     = r[1];
        const marketName  = String(r[4] || lastMarketName);
        const marketCode  = String(r[5] || lastMarketCode);
        const sapCode     = String(r[17] || '');
        const productName = String(r[15] || '');
        const qty         = Number(r[19]) || 0;
        const price       = Number(r[20]) || 0;
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
        if (date) lastDate = date;
        if (marketCode) lastMarketCode = marketCode;
        if (marketName) lastMarketName = marketName;
        if (!lastDate || !sapCode) continue;
        const isoDate = lastDate.match(/^\d{4}-\d{2}-\d{2}$/) ? lastDate : null;
        if (!isoDate) continue;
        records.push({ orderNo: lastOrderNo || '-', date: isoDate, marketCode: lastMarketCode || '-', marketName: lastMarketName || '-', sapCode, productName: productName || sapCode, qty: qty || 0, pricePerUnit: price || 0, totalWithVat: totalWithVat || 0 });
      }
      if (!records.length) { showToast('err', 'Hech qanday yozuv topilmadi'); return; }
      await api.uploadVazvrat(token, records);
      const fresh = await api.queryVazvrat(token, '2020-01-01', new Date().toISOString().slice(0, 10));
      setVazvratAllRows(fresh);
      showToast('ok', `${records.length} ta qaytarma yozuv yuklandi`);
    } catch (e) { showToast('err', 'Xato: ' + String(e)); }
    finally { setVazvratUploadBusy(false); }
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
            // if manualWithVat=true, user entered price WITH VAT — convert to pre-VAT for backend
            // if manualWithVat=false, user entered pre-VAT price — use directly
            const pricePreVat = userPrice > 0
              ? (manualWithVat ? Math.round((userPrice / 1.12) * 100) / 100 : userPrice)
              : undefined;
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

  async function loadSession(id: string) {
    if (!token) return;
    try {
      const session = await api.session(token, id);
      restoreSnapshot(session.snapshot);
      // Sync status + undeliverComment + undeliveredAt from DB
      try {
        const dbInvoices = await api.invoices(token);
        // setAllDbInvoices faqat Analytics tabida yuklanadi
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
      } catch (e) {
        console.warn('[loadSession] DB status sync skipped (snapshot used):', e);
      }
      showToast('ok', `Sessiya yuklandi: ${session.name || fmtDateRu(session.invoiceDate)}`);
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  async function deleteSession(id: string, name?: string) {
    if (!token || !window.confirm(`"${name || id}" sessiyasini o'chirilsinmi?`)) return;
    try {
      await api.deleteSession(token, id);
      await refreshSessions();
      showToast('ok', 'Sessiya o\'chirildi');
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
      showToast('ok', `✓ ${T('lbl_invoices')} №${invNo} ${T('tarix_restored')} — ${fmtDateRu(date)}`);
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


  async function loadAnalytics() {
    if (!token) return;
    try {
      const [stats, pStats, iStats] = await Promise.all([
        api.dashboardStats(token),
        api.analyticsProducts(token),
        api.analyticsInventory(token),
      ]);
      setDashboardStats(stats);
      setProductStats(pStats);
      setInventoryStats(iStats);

      // Merge ALL saved sessions' invoices for analytics (use _id, not invoiceDate)
      try {
        const allSnaps = await Promise.all(
          sessions.map(s => api.session(token, s._id).catch(() => null))
        );
        const merged: Invoice[] = [];
        const seen = new Set<number>();
        for (const rec of allSnaps) {
          if (!rec?.snapshot?.invoices) continue;
          // Tag each invoice with its session date so date filtering works
          const sessionDate = rec.invoiceDate;
          for (const inv of rec.snapshot.invoices as Invoice[]) {
            if (!seen.has(inv.invNo)) {
              seen.add(inv.invNo);
              merged.push({ ...inv, dateIso: inv.dateIso || sessionDate });
            }
          }
        }
        setAllDbInvoices(merged);
      } catch (e) { console.warn('[loadAnalytics] sessions merge failed:', e); }
    } catch (error) {
      showToast('err', getError(error));
    }
  }

  function print(list = selectedInvoices) {
    if (!list.length) { showToast('err', 'Нет накладных для печати'); return; }

    const doRender = () => {
      // Build SVG barcodes for each invoice with an order number
      const barcodes: Record<string, string> = {};
      list.forEach(inv => {
        if (!inv.order) return;
        try {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          (window as any).JsBarcode(svg, inv.order, {
            format: 'CODE128', width: 0.9, height: 20,
            displayValue: true, fontSize: 7, margin: 2,
            background: '#fff', lineColor: '#000',
          });
          barcodes[inv.order] = new XMLSerializer().serializeToString(svg);
        } catch {}
      });

      const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
      const fmt0 = (n: number) => new Intl.NumberFormat('ru-RU').format(n);
      const fmtDate = (iso: string) => {
        const [y, m, d] = iso.split('-');
        const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
        return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
      };

      const invoiceHtml = (inv: Invoice) => {
        const lines = inv.lines.filter(l => l.qty > 0);
        const barcodeSvg = inv.order && barcodes[inv.order] ? barcodes[inv.order] : '';
        return `
<div class="invoiceDoc">
  <header>
    <div><b>ГДЕ ТОРТ?</b><span>Кондитерские изделия</span></div>
    <section><h2>Накладная — счёт-фактура</h2><strong>№ ${inv.invNo}</strong></section>
  </header>
  <div class="docMeta">
    <div><span>Дата</span><b>${fmtDate(inv.dateIso)}</b></div>
    <div><span>№ заказа</span>${barcodeSvg}</div>
    <div><span>Магазин</span><b>${inv.market ?? ''}</b></div>
    <div><span>Код</span><b>${inv.storeCode}</b></div>
  </div>
  <p class="contract">${requisites.contract ?? ''}</p>
  <div class="parties">
    <div>
      <em>Поставщик</em><b>${requisites.supplier.name}</b>
      <span>${requisites.supplier.addr}</span>
      <span>ИНН: ${requisites.supplier.inn} · НДС: ${requisites.supplier.vat}</span>
    </div>
    <div>
      <em>Получатель</em><b>${requisites.receiver.name}</b>
      <span style="color:#c00">Адрес: ${inv.address}</span>
      <span>ИНН: ${requisites.receiver.inn} · НДС: ${requisites.receiver.vat}</span>
    </div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Наименование товара</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Стоимость</th><th>НДС</th><th>С НДС</th></tr></thead>
    <tbody>
      ${lines.map((l, i) => `<tr><td>${i+1}</td><td>${l.name}</td><td>${l.unit}</td><td class="right">${fmt0(l.qty)}</td><td class="right">${fmt(l.price)}</td><td class="right">${fmt(l.cost)}</td><td class="right">${fmt(l.vat)}</td><td class="right">${fmt(l.total)}</td></tr>`).join('')}
      <tr class="total"><td></td><td>Итого</td><td></td><td class="right">${fmt0(inv.sumQty)}</td><td></td><td class="right">${fmt(inv.sumCost)}</td><td class="right">${fmt(inv.sumVat)}</td><td class="right">${fmt(inv.sumTotal)}</td></tr>
    </tbody>
  </table>
  <p class="words">Всего отпущено на сумму: <b>${amountWords(inv.sumTotal)}</b></p>
  <footer><span>Руководитель ____________ <b>BAYMATOVA D.A</b></span><span>Главный бухгалтер ____________ <b>НЕ ПРЕДУСМОТРЕН</b></span></footer>
  <footer><span>Отпустил ____________________</span><span>Получил ____________________</span></footer>
</div>`;
      };

      const pageHtml = list.map((inv, i) => `
<div class="printPage${i === list.length - 1 ? ' last' : ''}">
  <div class="printHalf top">${invoiceHtml(inv)}</div>
  <div class="printHalf bottom">${invoiceHtml(inv)}</div>
</div>`).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 9px; color: #000; background: #fff; }
@page { size: A4 portrait; margin: 8mm 7mm; }
.printPage { page-break-after: always; break-after: page; }
.printPage.last { page-break-after: auto; break-after: auto; }
.printHalf { height: 138mm; max-height: 138mm; overflow: hidden; padding: 5mm 4mm; }
.printHalf.top { border-bottom: 1.5px dashed #777; }
.invoiceDoc { color: #000; font-size: 9px; line-height: 1.3; }
.invoiceDoc header { margin-bottom: 5px; display: flex; justify-content: space-between; }
.invoiceDoc header b { font-size: 14px; font-weight: 900; }
.invoiceDoc header span { font-size: 8px; font-weight: 700; text-transform: uppercase; display: block; }
.invoiceDoc h2 { font-size: 11px; margin: 0; font-weight: 700; }
.invoiceDoc strong { font-size: 10px; }
.docMeta { display: flex; gap: 4px; margin-bottom: 4px; }
.docMeta > div { border: 1px solid #888; padding: 3px 5px; flex: 1; }
.docMeta span { display: block; color: #333; font-size: 7px; font-weight: 700; text-transform: uppercase; }
.docMeta b { font-size: 10px; font-weight: 700; font-family: "Courier New", monospace; }
.docMeta svg { max-width: 100%; height: auto; display: block; }
.contract { margin: 3px 0; font-size: 6.5px; color: #222; }
.parties { display: flex; gap: 5px; margin-bottom: 4px; }
.parties > div { border: 1px solid #888; padding: 3px 5px; flex: 1; }
.parties em { display: block; color: #333; font-size: 7px; font-weight: 700; text-transform: uppercase; }
.parties b { display: block; font-size: 8px; font-weight: 700; }
.parties span { display: block; font-size: 7.5px; }
table { width: 100%; border-collapse: collapse; font-size: 9px; margin-top: 4px; }
th { background: #d8d8d8 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; border: 1px solid #333; font-weight: 700; padding: 3px 4px; text-align: left; }
td { border: 1px solid #888; padding: 2px 4px; }
td.right, th.right { text-align: right; }
tr.total td { font-weight: 700; border-top: 2px solid #333; }
.words { margin-top: 4px; font-size: 7.5px; }
footer { display: flex; justify-content: space-between; margin-top: 5px; font-size: 7.5px; border-top: 1px solid #bbb; padding-top: 3px; }
</style></head><body>${pageHtml}</body></html>`;

      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument!;
      doc.open(); doc.write(html); doc.close();
      const cleanup = () => { try { document.body.removeChild(iframe); } catch {} window.removeEventListener('afterprint', cleanup); };
      window.addEventListener('afterprint', cleanup);
      setTimeout(() => { iframe.contentWindow!.focus(); iframe.contentWindow!.print(); }, 300);
    };

    if ((window as any).JsBarcode) { doRender(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
    s.onload = doRender;
    document.head.appendChild(s);
  }

  function savePdf(list: Invoice[]) {
    if (!list.length) return;
    const doRender = () => {
      const barcodes: Record<string, string> = {};
      list.forEach(inv => {
        if (!inv.order) return;
        try {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          (window as any).JsBarcode(svg, inv.order, { format: 'CODE128', width: 0.9, height: 20, displayValue: true, fontSize: 7, margin: 2, background: '#fff', lineColor: '#000' });
          barcodes[inv.order] = new XMLSerializer().serializeToString(svg);
        } catch {}
      });
      const fmtN  = (n: number) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
      const fmt0N = (n: number) => new Intl.NumberFormat('ru-RU').format(n);
      const fmtDate = (iso: string) => { const [y,m,d] = iso.split('-'); const months=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']; return `${Number(d)} ${months[Number(m)-1]} ${y}`; };
      const invoiceHtml = (inv: Invoice) => {
        const lines = inv.lines.filter(l => l.qty > 0);
        const barcodeSvg = inv.order && barcodes[inv.order] ? barcodes[inv.order] : '';
        return `<div class="invoiceDoc"><header><div><b>ГДЕ ТОРТ?</b><span>Кондитерские изделия</span></div><section><h2>Накладная — счёт-фактура</h2><strong>№ ${inv.invNo}</strong></section></header><div class="docMeta"><div><span>Дата</span><b>${fmtDate(inv.dateIso)}</b></div><div><span>№ заказа</span>${barcodeSvg}</div><div><span>Магазин</span><b>${inv.market??''}</b></div><div><span>Код</span><b>${inv.storeCode}</b></div></div><p class="contract">${requisites.contract??''}</p><div class="parties"><div><em>Поставщик</em><b>${requisites.supplier.name}</b><span>${requisites.supplier.addr}</span><span>ИНН: ${requisites.supplier.inn} · НДС: ${requisites.supplier.vat}</span></div><div><em>Получатель</em><b>${requisites.receiver.name}</b><span style="color:#c00">Адрес: ${inv.address}</span><span>ИНН: ${requisites.receiver.inn} · НДС: ${requisites.receiver.vat}</span></div></div><table><thead><tr><th>#</th><th>Наименование товара</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Стоимость</th><th>НДС</th><th>С НДС</th></tr></thead><tbody>${lines.map((l,i)=>`<tr><td>${i+1}</td><td>${l.name}</td><td>${l.unit}</td><td class="right">${fmt0N(l.qty)}</td><td class="right">${fmtN(l.price)}</td><td class="right">${fmtN(l.cost)}</td><td class="right">${fmtN(l.vat)}</td><td class="right">${fmtN(l.total)}</td></tr>`).join('')}<tr class="total"><td></td><td>Итого</td><td></td><td class="right">${fmt0N(inv.sumQty)}</td><td></td><td class="right">${fmtN(inv.sumCost)}</td><td class="right">${fmtN(inv.sumVat)}</td><td class="right">${fmtN(inv.sumTotal)}</td></tr></tbody></table><p class="words">Всего отпущено на сумму: <b>${amountWords(inv.sumTotal)}</b></p><footer><span>Руководитель ____________ <b>BAYMATOVA D.A</b></span><span>Главный бухгалтер ____________ <b>НЕ ПРЕДУСМОТРЕН</b></span></footer><footer><span>Отпустил ____________________</span><span>Получил ____________________</span></footer></div>`;
      };
      const css = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:9px;color:#000}.page{width:210mm;padding:8mm 7mm;page-break-after:always}.half{height:138mm;max-height:138mm;overflow:hidden;padding:5mm 4mm}.half.top{border-bottom:1.5px dashed #777}.invoiceDoc{color:#000;font-size:9px;line-height:1.3}.invoiceDoc header{margin-bottom:5px;display:flex;justify-content:space-between}.invoiceDoc header b{font-size:14px;font-weight:900}.invoiceDoc header span{font-size:8px;font-weight:700;text-transform:uppercase;display:block}.invoiceDoc h2{font-size:11px;margin:0;font-weight:700}.invoiceDoc strong{font-size:10px}.docMeta{display:flex;gap:4px;margin-bottom:4px}.docMeta>div{border:1px solid #888;padding:3px 5px;flex:1}.docMeta span{display:block;color:#333;font-size:7px;font-weight:700;text-transform:uppercase}.docMeta b{font-size:10px;font-weight:700;font-family:"Courier New",monospace}.docMeta svg{max-width:100%;height:auto;display:block}.contract{margin:3px 0;font-size:6.5px}.parties{display:flex;gap:5px;margin-bottom:4px}.parties>div{border:1px solid #888;padding:3px 5px;flex:1}.parties em{display:block;color:#333;font-size:7px;font-weight:700;text-transform:uppercase}.parties b{display:block;font-size:8px;font-weight:700}.parties span{display:block;font-size:7.5px}table{width:100%;border-collapse:collapse;font-size:9px;margin-top:4px}th{background:#d8d8d8;border:1px solid #333;font-weight:700;padding:3px 4px;text-align:left}td{border:1px solid #888;padding:2px 4px}td.right{text-align:right}tr.total td{font-weight:700;border-top:2px solid #333}.words{margin-top:4px;font-size:7.5px}footer{display:flex;justify-content:space-between;margin-top:5px;font-size:7.5px;border-top:1px solid #bbb;padding-top:3px}`;
      const pagesHtml = list.map(inv => `<div class="page"><div class="half top">${invoiceHtml(inv)}</div><div class="half">${invoiceHtml(inv)}</div></div>`).join('');
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99998;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-family:sans-serif;';
      overlay.textContent = 'PDF tayyorlanmoqda...';
      document.body.appendChild(overlay);

      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;top:0;left:0;width:794px;background:#fff;z-index:99999;';
      container.innerHTML = `<style>${css.replace(/210mm/g,'794px').replace(/138mm/g,'521px').replace(/8mm 7mm/g,'30px 26px').replace(/5mm 4mm/g,'19px 15px')}</style>${pagesHtml}`;
      document.body.appendChild(container);

      const filename = `nakladnoy_${list.map(i => i.invNo).join('_')}.pdf`;
      (window as any).html2pdf().set({
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, width: 794 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(container).save().finally(() => {
        document.body.removeChild(container);
        document.body.removeChild(overlay);
      });
    };
    const loadAndRender = () => { if ((window as any).JsBarcode) { doRender(); return; } const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js'; s.onload = doRender; document.head.appendChild(s); };
    if ((window as any).html2pdf) { loadAndRender(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    s.onload = loadAndRender;
    document.head.appendChild(s);
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
          <div className="topbar-divider" />
          <div className="topstats">
            {dateIso && (
              <div className="topbar-date">
                <span className="topbar-date-day">{dateIso.slice(8,10)}</span>
                <div className="topbar-date-rest">
                  <span className="topbar-date-month">{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(dateIso.slice(5,7))-1]}</span>
                  <span className="topbar-date-year">{dateIso.slice(0,4)}</span>
                </div>
              </div>
            )}
            {unsaved && <span className="topstat-unsaved">{T('lbl_unsaved')}</span>}
          </div>
          <div className="topbar-divider" />
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
          {isAdmin  && <Tab active={view === 'analytics'}  icon={<BarChart3 size={18} />}     label={T('nav_analytics')} onClick={() => { setView('analytics'); void loadAnalytics(); }} />}
          <Tab             active={view === 'undelivered'} icon={<AlertTriangle size={18} />} label="Qaytgan" onClick={() => setView('undelivered')}
            badge={invoices.filter(i => i.status === 'saved').length || undefined} />
          {!isAdmin && <Tab active={view === 'manual-list'} icon={<PenLine size={18} />} label="Qo'lda" onClick={() => setView('manual-list')}
            badge={invoices.filter(i => i.manual && i.status !== 'cancelled').length || undefined} />}
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
                    <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                      {!isAdmin && <button className="small dark" type="button" onClick={() => setManualOpen(true)} style={{ flex: 1 }}>
                        <Plus size={15} /> {T('reg_manual')}
                      </button>}
                      <button type="button" disabled={!filteredInvoices.length} onClick={exportXlsx}
                        style={{ background: filteredInvoices.length ? '#1d6f42' : '#888', color: '#fff', border: 'none', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, padding: '6px 14px', cursor: filteredInvoices.length ? 'pointer' : 'not-allowed', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <ExcelIcon size={18} />
                        Excel
                      </button>
                    </div>
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
                        <th className="check" title="Chop etish uchun tanlash" style={{ whiteSpace: 'nowrap' }}>
                          <input type="checkbox"
                            style={{ accentColor: '#46bf72', cursor: 'pointer' }}
                            checked={filteredInvoices.length > 0 && filteredInvoices.every(i => selected.has(i.invNo))}
                            onChange={(e) => {
                              if (e.target.checked) setSelected(new Set(filteredInvoices.map(i => i.invNo)));
                              else setSelected(new Set());
                            }} />
                          {' '}Print
                        </th>
                        <th>№</th>
                        <th>{T('lbl_order')}</th>
                        <th>{T('lbl_store')}</th>
                        <th className="right">{T('lbl_pcs')}</th>
                        <th className="right">{T('lbl_total')}</th>
                        <th></th>
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
                          <td style={{ width: 1, whiteSpace: 'nowrap' }}>
                            <button className="mini" type="button" title="Chop etish"
                              onClick={e => { e.stopPropagation(); print([invoice]); }}
                              style={{ padding: '3px 8px', fontSize: 11 }}>
                              <Printer size={12} /> Print
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
                    Hujjat №{undeliverModal.invNo} uchun yetkazish statusini o&apos;chiryapsiz. Sabab ko&apos;rsatish <b style={{ color: 'var(--fg)' }}>majburiy</b>:
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
                  <h3>↩ Hujjat №{restoreModal.invNo} — tiklash</h3>
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
                  ) : isAdmin ? (
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
                  ) : null}
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
                                      onFocus={(e) => e.target.select()}
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
                  <FileText size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} /> Buyurtma yuklash
                </button>
                <button className={ordersTab === 'vazvrat' ? 'active' : ''} type="button" onClick={() => setOrdersTab('vazvrat')}>
                  <Download size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} /> Qaytarma
                </button>
                <button className={ordersTab === 'history' ? 'active' : ''} type="button" onClick={() => setOrdersTab('history')}>
                  <ClipboardList size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} /> Buyurtma tarixi
                  <span style={{ fontSize: 11, background: 'rgba(var(--ink-rgb),0.08)', borderRadius: 10, padding: '1px 7px', marginLeft: 4 }}>{sessions.length}</span>
                </button>
              </div>

              {ordersTab === 'import' && (<>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>

                {/* Upload zone — compact */}
                <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: `2px dashed ${sapRaw ? '#46bf72' : 'rgba(var(--ink-rgb),0.15)'}`, borderRadius: 12, background: sapRaw ? 'rgba(70,191,114,0.06)' : 'rgba(var(--ink-rgb),0.02)', cursor: 'pointer' }}>
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
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: sapRaw ? 'rgba(70,191,114,0.15)' : 'rgba(var(--ink-rgb),0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ExcelIcon size={22} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: sapRaw ? '#46bf72' : 'var(--ink)' }}>{sapRaw ? '✓ Fayl yuklandi' : 'Excel faylni tanlang'}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>.xls yoki .xlsx formatda</div>
                  </div>
                  {xlsSheets.length > 1 && (
                    <select value={xlsSelectedSheet} style={{ fontSize: 12, borderRadius: 8, padding: '4px 8px', position: 'relative', zIndex: 1, marginLeft: 'auto' }}
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

                {/* Settings row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 4 }}>Sana</div>
                    <input type="date" value={dateIso} onChange={(e) => setDateIso(e.target.value)} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 4 }}>Hujjat № dan</div>
                    <input type="number" value={startId} onChange={(e) => setStartId(Number(e.target.value))} style={{ width: '100%' }} />
                  </div>
                </div>

                {/* Sessiya nomi */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 4 }}>Sessiya nomi <span style={{ color: '#ef4444' }}>*</span></div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(var(--ink-rgb),0.04)', border: `1px solid ${!sessionSuffix.trim() ? 'rgba(239,68,68,0.5)' : 'rgba(var(--ink-rgb),0.09)'}`, borderRadius: 10, padding: '2px 10px 2px 4px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', background: 'rgba(var(--ink-rgb),0.06)', borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap' }}>{dateIso}</span>
                    <input type="text" placeholder="— nom kiriting (majburiy)" value={sessionSuffix} onChange={(e) => setSessionSuffix(e.target.value)} style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13 }} />
                  </div>
                </div>

                {/* Buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button type="button" disabled={busy || !sapRaw || !sessionSuffix.trim()} onClick={() => {
                    if (!sessionSuffix.trim()) { showToast('err', 'Sessiya nomini kiriting!'); return; }
                    generateInvoices();
                  }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 0', borderRadius: 10, fontWeight: 700, fontSize: 13, border: 'none', cursor: busy || !sapRaw || !sessionSuffix.trim() ? 'not-allowed' : 'pointer', opacity: busy || !sapRaw || !sessionSuffix.trim() ? 0.45 : 1, background: 'linear-gradient(135deg, #46bf72 0%, #2ea855 100%)', color: '#fff', boxShadow: sapRaw && sessionSuffix.trim() ? '0 4px 12px rgba(70,191,114,0.35)' : 'none' }}>
                    <FileText size={15} /> Buyurtma yuklash
                  </button>
                  <button type="button" disabled={busy || !invoices.length || !sessionSuffix.trim()} onClick={() => saveCurrentSession()}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 0', borderRadius: 10, fontWeight: 700, fontSize: 13, border: 'none', cursor: busy || !invoices.length || !sessionSuffix.trim() ? 'not-allowed' : 'pointer', opacity: busy || !invoices.length || !sessionSuffix.trim() ? 0.4 : 1, background: '#107C41', color: '#fff' }}>
                    <Save size={15} /> {T('lbl_save')}
                  </button>
                </div>

                {/* Summary */}
                {invoices.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {[
                      { label: 'Hujjatlar', value: `${invoices[0].invNo}–${invoices[invoices.length-1].invNo}` },
                      { label: 'Jami dona', value: invoices.length },
                      { label: 'Summa', value: `${fmt0(totals.sum)} so'm` },
                      { label: 'Tanlangan', value: selected.size || invoices.length },
                    ].map(item => (
                      <div key={item.label} style={{ background: 'rgba(var(--ink-rgb),0.03)', border: '1px solid rgba(var(--ink-rgb),0.08)', borderRadius: 10, padding: '8px 12px' }}>
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{item.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </>)}

              {ordersTab === 'vazvrat' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480, marginTop: 8 }}>
                  <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', border: '2px dashed rgba(var(--ink-rgb),0.15)', borderRadius: 12, background: 'rgba(var(--ink-rgb),0.02)', cursor: 'pointer' }}>
                    <input type="file" accept=".xls,.xlsx" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                      disabled={vazvratUploadBusy}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadVazvratFromOrders(f); e.target.value = ''; }} />
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(16,124,65,0.08)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <ExcelIcon size={22} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>Vazvrat Excel faylini tanlang</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>.xls yoki .xlsx formatda</div>
                    </div>
                  </label>
                  {vazvratUploadBusy && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Yuklanmoqda...</div>}
                  {vazvratAllRows.length > 0 && (
                    <div style={{ fontSize: 13, color: 'var(--ok)', fontWeight: 600 }}>
                      ✓ Jami {vazvratAllRows.length} ta qaytarma yozuvi mavjud
                    </div>
                  )}
                </div>
              )}

              {ordersTab === 'history' && (() => {
                const filteredSessions = sessions.filter(s => s.invoiceDate >= histFrom && s.invoiceDate <= histTo);
                return (
                  <div style={{ marginTop: 8 }}>
                    {/* Date filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Sana:</span>
                      <DateRangePicker from={histFrom} to={histTo} setFrom={setHistFrom} setTo={setHistTo} />
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filteredSessions.length} ta sessiya</span>
                    </div>
                    <div className="sessionList">
                      {filteredSessions.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Bu oraliqda buyurtma yo'q</div>
                      ) : filteredSessions.map((session, si) => (
                        <div className="sessionRow" key={session._id || session.invoiceDate + '-' + si}>
                          <b>{session.name || session.invoiceDate}</b>
                          <span className="sess-badge">{session.invoiceCount} {T('lbl_invoices')}</span>
                          <span className="sess-sum">{fmt0(session.sumTotal)} {T('lbl_sum')}</span>
                          <button className="mini" type="button" onClick={() => loadSession(session._id)}>
                            {T('lbl_restore')}
                          </button>
                          {isAdmin && (
                            <button className="iconbtn danger" type="button" onClick={() => deleteSession(session._id, session.name)}>
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
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
                    <article key={invoice.invNo} className="paper" data-invno={invoice.invNo}>
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
                  <DateRangePicker from={orderFilters.dateFrom} to={orderFilters.dateTo}
                    onChange={(f, t) => setOrderFilters(prev => ({ ...prev, dateFrom: f, dateTo: t }))} />
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


          {view === 'analytics' && (
            <AnalyticsPane
              invoices={invoices}
              catalog={catalog}
              sessions={sessions}
              dashboardStats={dashboardStats}
              productStats={productStats}
              customerStats={[]}
              token={token}
              onRefresh={loadAnalytics}
              onToast={showToast}
              T={T}
            />
          )}

          {view === 'undelivered' && <UndeliveredPane
            invoices={invoices.filter(i => i.status !== 'cancelled')}
            undeliveredFilter={undeliveredFilter}
            setUndeliveredFilter={setUndeliveredFilter}
            setInvoiceDetail={setInvoiceDetail}
            setRestoreModal={setRestoreModal}
            fmt={fmt}
            todayIso={todayIso}
          />}


          {view === 'manual-list' && (() => {
            const manualInvoices = invoices
              .filter(i => i.manual && i.status !== 'cancelled')
              .sort((a, b) => b.invNo - a.invNo);
            return (
              <section className="pane">
                <PaneHead
                  title="Qo'lda kiritilgan hujjatlar"
                  meta={manualInvoices.length ? `${manualInvoices.length} ta · ${fmt0(manualInvoices.reduce((s,i)=>s+i.sumTotal,0))} so'm` : '—'}
                  actions={
                    <button className="small dark" type="button" onClick={() => setManualOpen(true)}>
                      <Plus size={15} /> Yangi hujjat
                    </button>
                  }
                />
                {!manualInvoices.length ? (
                  <Empty title="Qo'lda kiritilgan hujjat yo'q" />
                ) : (
                  <div className="tablewrap" style={{ maxHeight: 'calc(100dvh - 240px)', overflowY: 'auto' }}>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>№</th>
                          <th>Sana</th>
                          <th>Do'kon</th>
                          <th>Manzil</th>
                          <th className="right">Summa</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {manualInvoices.map(inv => (
                          <tr key={inv.invNo} style={{ cursor: 'pointer' }} onClick={() => setInvoiceDetail(inv)}>
                            <td><b>{inv.invNo}</b></td>
                            <td>{inv.dateIso}</td>
                            <td>{inv.market}</td>
                            <td style={{ fontSize: '0.8em', color: 'var(--muted)' }}>{inv.address}</td>
                            <td className="right">{fmt0(inv.sumTotal)}</td>
                            <td>
                              <span className={`badge ${inv.status === 'delivered' ? 'green' : 'yellow'}`}>
                                {inv.status === 'delivered' ? 'Yetkazildi' : 'Saqlanda'}
                              </span>
                            </td>
                            {isAdmin && (
                            <td>
                              <button className="icon-btn danger" type="button"
                                onClick={e => { e.stopPropagation(); if (window.confirm(`№ ${inv.invNo} hujjatni o'chirish?`)) void deleteInvoice(inv.invNo); }}
                                title="O'chirish">
                                <Trash2 size={14} />
                              </button>
                            </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })()}

          {view === 'preferences' && (

            <section className="pane">
              <PaneHead title={T('nav_preferences')} />
              <div className="prefGrid">

                <div className="prefCard">
                  <h3>{T('pref_density')}</h3>
                  <p className="prefHint">{T('pref_density_hint')}</p>
                  <div className="seg" role="group">
                    <button type="button" className={density === 'tight' ? 'on' : ''} onClick={() => setDensity('tight')}>{T('pref_tight')}</button>
                    <button type="button" className={density === 'compact' ? 'on' : ''} onClick={() => setDensity('compact')}>{T('pref_compact')}</button>
                    <button type="button" className={density === 'cozy' ? 'on' : ''} onClick={() => setDensity('cozy')}>{T('pref_cozy')}</button>
                    <button type="button" className={density === 'comfortable' ? 'on' : ''} onClick={() => setDensity('comfortable')}>{T('pref_comfortable')}</button>
                  </div>
                </div>

                <div className="prefCard">
                  <h3>{T('pref_accent')}</h3>
                  <p className="prefHint">{T('pref_accent_hint')}</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                    {ACCENT_PRESETS.map(ap => (
                      <button
                        key={ap.id}
                        type="button"
                        onClick={() => setAccent(ap.id)}
                        title={ap.label}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                          background: accent === ap.id ? 'rgba(0,0,0,0.07)' : 'transparent',
                          border: accent === ap.id ? `2px solid ${ap.main}` : '2px solid transparent',
                          borderRadius: 12, padding: '8px 12px', cursor: 'pointer', transition: 'all .15s',
                        }}
                      >
                        <span style={{
                          display: 'block', width: 28, height: 28, borderRadius: '50%',
                          background: ap.main,
                          boxShadow: accent === ap.id ? `0 0 0 3px ${ap.main}40` : 'none',
                          transition: 'box-shadow .15s',
                        }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: accent === ap.id ? ap.main : 'var(--muted)', whiteSpace: 'nowrap' }}>{ap.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="prefCard">
                  <h3>{T('pref_lang')}</h3>
                  <p className="prefHint">{T('pref_lang_hint')}</p>
                  <div className="seg" role="group">
                    <button type="button" className={lang === 'uz' ? 'on' : ''} onClick={() => { setLang('uz'); localStorage.setItem('lang', 'uz'); }}>O'zbek</button>
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
                {isAdmin && <button className={(settingsView as string) === 'trash' ? 'active' : ''} type="button" onClick={() => setSettingsView('trash' as any)} style={(settingsView as string) === 'trash' ? {} : { color: '#ef4444' }}>🗑 Arxiv</button>}
              </div>

              {settingsView === 'catalog' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)', flex: 1 }}>{catalogDraft.length} ta mahsulot</span>
                    {isAdmin && <>
                      <button className="small dark" type="button" onClick={() => setCatalogDraft((previous) => [...previous, { sku: '', name: T('lbl_product'), unit: T('lbl_unit'), price: 0 }])}>
                        <Plus size={14} /> {T('lbl_add')}
                      </button>
                      <button className="small" type="button" onClick={saveCatalogDraft} style={{ background: '#107C41', color: '#fff', border: 'none' }}>
                        <Save size={14} /> {T('lbl_save')}
                      </button>
                      <button className="iconbtn" type="button" onClick={resetCatalog} title="Yangilash">
                        <RefreshCcw size={14} />
                      </button>
                    </>}
                  </div>
                  <div className="tablewrap">
                    <table className="data editable" style={{ tableLayout: 'auto', width: 'max-content', minWidth: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ whiteSpace: 'nowrap' }}>SKU</th>
                          <th style={{ whiteSpace: 'nowrap' }}>{T('lbl_product')}</th>
                          <th style={{ whiteSpace: 'nowrap' }}>{T('lbl_unit')}</th>
                          <th className="right" style={{ whiteSpace: 'nowrap' }}>{T('lbl_price')}</th>
                          <th className="right" style={{ whiteSpace: 'nowrap' }}>NDS (+12%)</th>
                          {isAdmin && <th style={{ width: '40px' }} />}
                        </tr>
                      </thead>
                      <tbody>
                        {catalogDraft.map((product, index) => (
                          <tr key={product.id || index}>
                            <td>
                              <input disabled={!isAdmin} value={product.sku} size={Math.max(10, product.sku?.length || 0)} onChange={(event) => setCatalogDraft(updateCatalogDraft(catalogDraft, index, { sku: event.target.value }))} />
                            </td>
                            <td>
                              <input disabled={!isAdmin} value={product.name} size={Math.max(18, product.name?.length || 0)} onChange={(event) => setCatalogDraft(updateCatalogDraft(catalogDraft, index, { name: event.target.value }))} />
                            </td>
                            <td>
                              <input disabled={!isAdmin} value={product.unit} size={4} onChange={(event) => setCatalogDraft(updateCatalogDraft(catalogDraft, index, { unit: event.target.value }))} />
                            </td>
                            <td>
                              <input className="right" disabled={!isAdmin} value={fmt0(product.price)} size={Math.max(8, fmt0(product.price).length)} onChange={(event) => setCatalogDraft(updateCatalogDraft(catalogDraft, index, { price: parseNum(event.target.value) }))} />
                            </td>
                            <td className="right mono" style={{ color: 'var(--ink-2)', fontSize: 13 }}>
                              {product.price ? fmt0(Math.round(product.price * 1.12)) : '—'}
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
                          <button className="small" type="button" onClick={saveRequisites} style={{ background: '#107C41', color: '#fff', border: 'none' }}>
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
                  setDovSaved={setDovSaved}
                  setSettingsView={setSettingsView}
                  deleteDovEntry={deleteDovEntry}
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
                    <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 2, display: 'flex', gap: 8 }}>
                      <button className="small" type="button" onClick={saveDov} style={{ fontSize: 12, padding: '6px 16px', background: dovSaved ? '#059669' : undefined, color: dovSaved ? '#fff' : undefined, borderColor: dovSaved ? '#059669' : undefined }}>
                        <Save size={13} /> {dovSaved ? T('dov_saved') : T('dov_save')}
                      </button>
                      <button className="small dark" type="button" onClick={printDov} disabled={!dovSaved} style={{ fontSize: 12, padding: '6px 16px', opacity: dovSaved ? 1 : 0.4, cursor: dovSaved ? 'pointer' : 'not-allowed' }}>
                        <Printer size={13} /> {T('dov_print')}
                      </button>
                    </div>
                    <div className="dov-page">

                      {/* Top-right block */}
                      <div className="dov-topright">
                        <div><input className="dov-inp dov-inp-right bold" value={dovFields.company} onChange={e => setDov('company', e.target.value)} placeholder='MCHJ «Druzya»' /></div>
                        <div><input className="dov-inp dov-inp-right" value={dovFields.address} onChange={e => setDov('address', e.target.value)} placeholder='Toshkent shahar, Yunusobod tumani, ...' /></div>
                        <div className="dov-tr-meta">Исх. №<input className="dov-inp" style={{ width: 40, textAlign: 'center' }} value={dovFields.docNo} onChange={e => setDov('docNo', e.target.value)} placeholder='18' /></div>
                        <div className="dov-tr-meta">
                          от <input className="dov-inp dov-inp-sm" type="date" value={dovFields.docDate} onChange={e => setDov('docDate', e.target.value)} /> г.&nbsp;&nbsp;г. Ташкент
                        </div>
                      </div>

                      {/* Title */}
                      <div className="dov-title">Д О В Е Р Е Н Н О С Т Ь</div>

                      {/* Body — single paragraph, inputs inline */}
                      <p className="dov-body">
                        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Настоящей доверенностью руководство <input className="dov-inp dov-inp-md bold" value={dovFields.company} onChange={e => setDov('company', e.target.value)} placeholder='MCHJ «Druzya»' /> уполномочивает водителя <input className="dov-inp dov-inp-lg bold" value={dovFields.driver} onChange={e => setDov('driver', e.target.value)} placeholder="FAMILIYA ISMI SHARIFI" /> экспедитора владельцу правы <input className="dov-inp dov-inp-md" value={dovFields.prava} onChange={e => setDov('prava', e.target.value)} placeholder='AF 0006178' /> направо пользования автомобилем «<input className="dov-inp dov-inp-sm" value={dovFields.car} onChange={e => setDov('car', e.target.value)} placeholder='LB2' />» гос. номер <input className="dov-inp dov-inp-md" value={dovFields.plate} onChange={e => setDov('plate', e.target.value)} placeholder='01 W 851 SC' />
                      </p>

                      <p className="dov-body">
                        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Доверенность действительна до <input className="dov-inp dov-inp-sm" type="date" value={dovFields.validUntil} onChange={e => setDov('validUntil', e.target.value)} /> года.
                      </p>

                      {/* Signature */}
                      <div className="dov-sign">
                        <span>Генеральный директор</span>
                        <input className="dov-inp dov-inp-md" value={dovFields.director} onChange={e => setDov('director', e.target.value)} placeholder='Бойматова Д.А.' />
                      </div>
                    </div>
                  </div>{/* dov-page-wrap */}

                  {/* Doverennost history moved to Tarix tab */}
                </>
              )}

              {(settingsView as string) === 'trash' && isAdmin && token && (
                <TrashPane token={token} fmt0={fmt0} fmtDateRu={fmtDateRu} T={T} />
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
              {/* Top bar: date + QQS toggle + add store + total + submit */}
              <div className="manual-topbar">
                <label className="manual-date-field">
                  <span>Sana</span>
                  <input type="date" value={manual.dateIso} onChange={(e) => setManual({ ...manual, dateIso: e.target.value })} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  <span style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, flexShrink: 0 }}>
                    <input type="checkbox" checked={manualWithVat} onChange={(e) => setManualWithVat(e.target.checked)} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                    <span style={{ position: 'absolute', inset: 0, borderRadius: 20, background: manualWithVat ? '#16a34a' : 'rgba(var(--ink-rgb),0.18)', transition: 'background 0.2s' }} />
                    <span style={{ position: 'absolute', top: 3, left: manualWithVat ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.2s' }} />
                  </span>
                  <span>Narx QQS bilan</span>
                </label>
                <button type="button" className="small" onClick={() => setManualStores([...manualStores, emptyStoreRow()])}>
                  + Do&apos;kon
                </button>
                <div className="manual-topbar-spacer" style={{ flex: 1 }} />
                {(() => {
                  let grandTotal = 0;
                  for (const col of manualStores) {
                    for (const p of catalog) {
                      const cell = col.cells[p.sku];
                      const qty = parseNum(cell?.qty ?? '');
                      if (qty <= 0) continue;
                      const userPrice = parseNum(cell?.price ?? '');
                      const effectivePrice = userPrice > 0 ? userPrice : (manualWithVat ? Math.round(p.price * 1.12 * 100) / 100 : p.price);
                      grandTotal += qty * effectivePrice;
                    }
                  }
                  return grandTotal > 0 ? (
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                      Jami: <span style={{ color: 'var(--honey)', fontWeight: 700 }}>{fmt0(Math.round(grandTotal))} so&apos;m</span>
                    </span>
                  ) : null;
                })()}
              </div>

              {/* Transposed table: products = rows, stores = columns */}
              <div className="manual-tablewrap">
                <table className="manual-table">
                  <thead>
                    <tr>
                      <th className="manual-prodcol">Mahsulot</th>
                      {manualStores.map((col, ci) => (
                        <React.Fragment key={ci}>
                          <th className="manual-storecol" style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.08)', width: 46, textAlign: 'center', verticalAlign: 'bottom', padding: '3px 2px' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Son</div>
                          </th>
                          <th className="manual-storecol" style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.08)', borderRight: '2px solid rgba(var(--ink-rgb),0.10)', width: 80, textAlign: 'center', verticalAlign: 'bottom', paddingBottom: 4 }}>
                            <div style={{ marginBottom: 3 }}>
                              <div className="manual-store-header" style={{ justifyContent: 'center' }}>
                                <input className="manual-inp" placeholder="Kod" value={col.storeCode}
                                  onChange={(e) => { const u = [...manualStores]; u[ci] = { ...u[ci], storeCode: e.target.value }; setManualStores(u); }} />
                                <input className="manual-inp manual-inp-grow" placeholder="Market nomi" value={col.storeName}
                                  onChange={(e) => { const u = [...manualStores]; u[ci] = { ...u[ci], storeName: e.target.value }; setManualStores(u); }} />
                                <button type="button" className="manual-del"
                                  onClick={() => setManualStores(manualStores.length > 1 ? manualStores.filter((_, i) => i !== ci) : [emptyStoreRow()])}>×</button>
                              </div>
                              <input className="manual-inp manual-inp-full" placeholder="№ Zakaz" value={col.order}
                                onChange={(e) => { const u = [...manualStores]; u[ci] = { ...u[ci], order: e.target.value }; setManualStores(u); }}
                                style={{ marginTop: 3 }} />
                            </div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Narx</div>
                          </th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((p, ri) => {
                      const defaultPrice = manualWithVat ? Math.round(p.price * 1.12 * 100) / 100 : p.price;
                      return (
                        <tr key={p.sku} className={ri % 2 === 0 ? '' : 'manual-row-even'}>
                          <td className="manual-prodcol manual-prodname">
                            <span className="manual-name">{p.name}</span>
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
                              <React.Fragment key={ci}>
                                <td style={{ padding: '1px 3px', textAlign: 'center', width: 46, background: hasQty ? 'rgba(5,150,105,0.05)' : undefined }}>
                                  <input type="number" min={0} value={qtyVal} onChange={(e) => update('qty', e.target.value)}
                                    className="manual-qty-input"
                                    style={{ width: 40, textAlign: 'center', fontSize: 13, fontWeight: hasQty ? 700 : 400, color: hasQty ? 'var(--ok)' : 'var(--muted)', fontFamily: 'var(--mono)', background: hasQty ? 'rgba(5,150,105,0.08)' : 'rgba(var(--ink-rgb),0.04)', border: hasQty ? '1px solid rgba(5,150,105,0.35)' : '1px solid rgba(var(--ink-rgb),0.1)', borderRadius: 6, outline: 'none', padding: '2px 2px' }} />
                                </td>
                                <td style={{ padding: '2px 3px', textAlign: 'right', width: 70, borderRight: '2px solid rgba(var(--ink-rgb),0.10)', background: hasQty ? 'rgba(5,150,105,0.05)' : undefined }}>
                                  <input type="text" inputMode="numeric" placeholder={defaultPrice.toLocaleString('ru-RU')}
                                    value={priceVal} onChange={(e) => update('price', e.target.value.replace(/\s/g, ''))}
                                    style={{ width: 64, textAlign: 'right', border: '1px solid rgba(var(--ink-rgb),0.12)', borderRadius: 5, padding: '3px 3px', fontSize: 11, background: 'transparent', outline: 'none', color: priceVal && parseNum(priceVal) !== defaultPrice ? 'var(--honey)' : 'var(--muted)' }} />
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modalFoot manual-foot">
              <button className="small manual-foot-cancel" type="button" onClick={() => { setManualOpen(false); setManualStores([emptyStoreRow()]); }}>
                {T('lbl_cancel')}
              </button>
              <button className="small manual-foot-submit" type="button" onClick={createManualInvoice} disabled={busy}>
                {busy ? 'Saqlanmoqda…' : `+ Qo'shish (${manualStores.filter(r => r.storeCode.trim()).length})`}
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
                  <datalist id="customer-list"></datalist>
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
              <div style={{ fontSize: 10, fontWeight: 700, color: '#666', marginLeft: 6 }}>Hujjatlar ro'yxati — 75 ta</div>
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
                  <div style={{ fontSize: 8, color: '#999', marginBottom: 3 }}>QAYTARMA</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#e84a5f' }}>24 756 671</div>
                </div>
                <div style={{ flex: 1, background: '#f5f5f5', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 8, color: '#999', marginBottom: 3 }}>SAVDO</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#111' }}>−284 011</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 70px 70px', gap: 4, fontSize: 7, fontWeight: 800, color: '#aaa', textTransform: 'uppercase', marginBottom: 4, paddingBottom: 4, borderBottom: '2px solid #eee' }}>
                <span>SANA</span><span style={{textAlign:'right'}}>HUJJAT</span><span style={{textAlign:'right'}}>BERILGAN</span><span style={{textAlign:'right'}}>QAYTARMA</span><span style={{textAlign:'right'}}>SAVDO</span>
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
  onSelect: (id: string) => void;
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

  // Show session name (file name)
  const label = (s: SessionSummary) => s.name || s.invoiceDate;

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
                  key={s._id}
                  type="button"
                  onClick={() => { onSelect(s._id); setOpen(false); setQuery(''); }}
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
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{s.invoiceCount} hujjat</span>
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

// ─── Confirm Modal ───────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}>
      <div style={{ background: 'var(--shell)', borderRadius: 16, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', gap: 20 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="small" type="button" onClick={onCancel}>Bekor qilish</button>
          <button className="small dark" type="button"
            style={{ background: '#ef4444', borderColor: '#ef4444' }}
            onClick={() => { onConfirm(); onCancel(); }}>
            Ha, o'chirish
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TrashPane: Arxiv — cancelled invoices + deleted sessions ────────────────
function TrashPane({ token, fmt0, fmtDateRu, T }: {
  token: string; fmt0: (n: number) => string; fmtDateRu: (d: string) => string; T: (k: string) => string;
}) {
  const [arxivTab, setArxivTab] = React.useState<'invoices' | 'sessions'>('invoices');
  const [invoices, setInvoices] = React.useState<import('@/types/domain').Invoice[]>([]);
  const [sessions, setSessions] = React.useState<import('@/types/domain').SessionSummary[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState<Set<string>>(new Set());
  const [confirm, setConfirm] = React.useState<{ message: string; onConfirm: () => void } | null>(null);

  const load = React.useCallback(() => {
    setBusy(true);
    Promise.all([
      api.listCancelledInvoices(token),
      api.listDeletedSessions(token),
    ]).then(([invs, sess]) => {
      setInvoices(invs);
      setSessions(sess as import('@/types/domain').SessionSummary[]);
    }).catch(() => {}).finally(() => setBusy(false));
  }, [token]);

  React.useEffect(() => { load(); }, [load]);

  const setBusy2 = (key: string, val: boolean) =>
    setActionBusy(prev => { const n = new Set(prev); val ? n.add(key) : n.delete(key); return n; });

  // ── Invoice actions ──
  const restoreInvoice = async (invNo: number) => {
    setBusy2(`inv-${invNo}`, true);
    try { await api.restoreInvoice(token, invNo); setInvoices(prev => prev.filter(i => i.invNo !== invNo)); }
    catch { /* ignore */ } finally { setBusy2(`inv-${invNo}`, false); }
  };
  const hardDeleteInvoice = (invNo: number) => {
    setConfirm({
      message: `№${invNo} hujjatni bazadan butunlay o'chirish. Bu amalni qaytarib bo'lmaydi!`,
      onConfirm: async () => {
        setBusy2(`inv-h-${invNo}`, true);
        try { await api.hardDeleteInvoice(token, invNo); setInvoices(prev => prev.filter(i => i.invNo !== invNo)); }
        catch { /* ignore */ } finally { setBusy2(`inv-h-${invNo}`, false); }
      },
    });
  };

  // ── Session actions ──
  const restoreSession = async (id: string, name: string) => {
    setBusy2(`sess-${id}`, true);
    try { await api.restoreSession(token, id); setSessions(prev => prev.filter(s => s._id !== id)); }
    catch { /* ignore */ } finally { setBusy2(`sess-${id}`, false); }
  };
  const hardDeleteSession = (id: string, name: string) => {
    setConfirm({
      message: `"${name}" sessiyani bazadan butunlay o'chirish. Bu amalni qaytarib bo'lmaydi!`,
      onConfirm: async () => {
        setBusy2(`sess-h-${id}`, true);
        try { await api.hardDeleteSession(token, id); setSessions(prev => prev.filter(s => s._id !== id)); }
        catch { /* ignore */ } finally { setBusy2(`sess-h-${id}`, false); }
      },
    });
  };

  if (busy) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Yuklanmoqda…</div>;

  const row = (key: string, left: React.ReactNode, right: React.ReactNode) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface)', border: '1px solid rgba(var(--ink-rgb),0.07)', borderLeft: '3px solid rgba(239,68,68,0.4)', borderRadius: 10 }}>
      {left}
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>{right}</div>
    </div>
  );

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {confirm && <ConfirmModal message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}

      {/* Tabs */}
      <div className="subtabs" style={{ position: 'static', padding: 0, background: 'transparent' }}>
        <button className={arxivTab === 'invoices' ? 'active' : ''} type="button" onClick={() => setArxivTab('invoices')}>
          Hujjatlar ({invoices.length})
        </button>
        <button className={arxivTab === 'sessions' ? 'active' : ''} type="button" onClick={() => setArxivTab('sessions')}>
          Sessiyalar ({sessions.length})
        </button>
      </div>

      {/* Invoices tab */}
      {arxivTab === 'invoices' && (
        invoices.length === 0
          ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>O'chirilgan hujjatlar yo'q</div>
          : (() => {
              const byDate: Record<string, typeof invoices> = {};
              for (const inv of invoices) { if (!byDate[inv.dateIso]) byDate[inv.dateIso] = []; byDate[inv.dateIso].push(inv); }
              return Object.entries(byDate).sort(([a],[b]) => b.localeCompare(a)).map(([date, invs]) => (
                <div key={date}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid rgba(var(--ink-rgb),0.08)' }}>
                    {fmtDateRu(date)} · {invs.length} ta
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {invs.map(inv => row(
                      String(inv.invNo),
                      <>
                        <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--mono)', color: '#ef4444', minWidth: 52 }}>№{inv.invNo}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 55 }}>{inv.order || '—'}</span>
                        <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.market || inv.storeCode}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmt0(inv.sumTotal ?? 0)} so'm</span>
                      </>,
                      <>
                        <button className="mini" type="button" disabled={actionBusy.has(`inv-${inv.invNo}`)}
                          onClick={() => restoreInvoice(inv.invNo)}
                          style={{ background: '#059669', color: '#fff', borderColor: '#059669' }}>
                          {actionBusy.has(`inv-${inv.invNo}`) ? '…' : '↩ Tiklash'}
                        </button>
                        <button className="mini" type="button" disabled={actionBusy.has(`inv-h-${inv.invNo}`)}
                          onClick={() => hardDeleteInvoice(inv.invNo)}
                          style={{ background: '#ef4444', color: '#fff', borderColor: '#ef4444' }}>
                          {actionBusy.has(`inv-h-${inv.invNo}`) ? '...' : 'Ochirish'}
                        </button>
                      </>
                    ))}
                  </div>
                </div>
              ));
            })()
      )}

      {/* Sessions tab */}
      {arxivTab === 'sessions' && (
        sessions.length === 0
          ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>O'chirilgan sessiyalar yo'q</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sessions.map(s => row(
                s._id,
                <>
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 110 }}>{s.invoiceDate}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>{s.name || '—'}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{s.invoiceCount} ta · {fmt0(s.sumTotal)} so'm</span>
                </>,
                <>
                  <button className="mini" type="button" disabled={actionBusy.has(`sess-${s._id}`)}
                    onClick={() => restoreSession(s._id, s.name || s.invoiceDate)}
                    style={{ background: '#059669', color: '#fff', borderColor: '#059669' }}>
                    {actionBusy.has(`sess-${s._id}`) ? '…' : '↩ Tiklash'}
                  </button>
                  <button className="mini" type="button" disabled={actionBusy.has(`sess-h-${s._id}`)}
                    onClick={() => hardDeleteSession(s._id, s.name || s.invoiceDate)}
                    style={{ background: '#ef4444', color: '#fff', borderColor: '#ef4444' }}>
                    {actionBusy.has(`sess-h-${s._id}`) ? '...' : 'Ochirish'}
                  </button>
                </>
              ))}
            </div>
      )}
    </div>
  );
}

function NaklHistory({ sessions, expandedDates, toggleDateGroup, loadSession, deleteSession, isAdmin, fmtDateRu, fmt0, T }: {
  sessions: import('@/types/domain').SessionSummary[]; expandedDates: Set<string>; toggleDateGroup: (k: string) => void;
  loadSession: (id: string) => void; deleteSession: (id: string, name?: string) => void;
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
            {visible.map((session: import('@/types/domain').SessionSummary) => (
              <div className="sessionRow" key={session._id} style={{ marginBottom: 6, marginLeft: multi ? 12 : 0 }}>
                {multi && <span style={{ color: 'var(--muted)', fontWeight: 700 }}>›</span>}
                <b>{session.name || session.invoiceDate}</b>
                <span className="sess-badge">{session.invoiceCount} накл.</span>
                <span className="sess-sum">{fmt0(session.sumTotal)} сум</span>
                <button className="mini" type="button" onClick={() => loadSession(session._id)}>{T('lbl_restore')}</button>
                {isAdmin && <button className="iconbtn danger" type="button" onClick={() => deleteSession(session._id, session.name)}><Trash2 size={15} /></button>}
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

function DovHistory({ dovHistory, expandedDates, toggleDateGroup, setDovFields, setDovSaved, setSettingsView }: {
  dovHistory: import('@/types/domain').DovEntry[]; expandedDates: Set<string>; toggleDateGroup: (k: string) => void;
  setDovFields: (h: import('@/types/domain').DovEntry) => void; setDovSaved: (v: boolean) => void; setSettingsView: React.Dispatch<React.SetStateAction<SettingsView>>;
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
            {visible.map((h: import('@/types/domain').DovEntry, i: number) => (
              <div className="sessionRow" key={i} style={{ marginBottom: 6, marginLeft: multi ? 12 : 0 }}>
                {multi && <span style={{ color: 'var(--muted)', fontWeight: 700 }}>›</span>}
                <b>{new Date(h.printedAt).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</b>
                <span className="sess-badge">{h.driver || '—'}</span>
                <span className="sess-badge">{h.plate || '—'} · {h.car || '—'}</span>
                <button className="mini" type="button" onClick={() => { setDovFields(h); setDovSaved(true); setSettingsView('doverennost'); }}>Yuklash</button>
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
  | { kind: 'nakl'; dateKey: string; data: import('@/types/domain').SessionSummary }
  | { kind: 'dov';  dateKey: string; data: import('@/types/domain').DovEntry }
  | { kind: 'qayt'; dateKey: string; data: import('@/types/domain').Invoice }
  | { kind: 'vazt'; dateKey: string; data: import('@/types/domain').VazvratRecord };

const KIND_STYLE: Record<string, { labelKey: string; color: string; bg: string }> = {
  nakl: { labelKey: 'tarix_hujjat',      color: '#2563eb', bg: 'rgba(37,99,235,0.09)' },
  dov:  { labelKey: 'tarix_ishonchnoma', color: '#7c3aed', bg: 'rgba(124,58,237,0.09)' },
  qayt: { labelKey: 'tarix_qaytgan',     color: '#dc2626', bg: 'rgba(220,38,38,0.09)' },
  vazt: { labelKey: 'tarix_qaytarma',    color: '#d97706', bg: 'rgba(217,119,6,0.09)' },
};

// ─── TarixPane: tabbed history ────────────────────────────────────────────────
type TarixTab = 'nakl' | 'vazvrat' | 'zakas' | 'dov';

function TarixPane({ sessions, dovHistory, qaytganInvoices, vazvratRows, setVazvratAllRows, orders, token,
  expandedDates, toggleDateGroup, loadSession, deleteSession, setDovFields, setDovSaved, setSettingsView,
  deleteDovEntry, refreshSessions, isAdmin, fmtDateRu, fmt0, T }: {
  sessions: import('@/types/domain').SessionSummary[]; dovHistory: import('@/types/domain').DovEntry[];
  qaytganInvoices: import('@/types/domain').Invoice[]; vazvratRows: import('@/types/domain').VazvratRecord[];
  setVazvratAllRows: (rows: import('@/types/domain').VazvratRecord[]) => void;
  orders: import('@/types/domain').Order[]; token: string;
  expandedDates: Set<string>; toggleDateGroup: (k: string) => void;
  loadSession: (d: string) => void; deleteSession: (d: string, name?: string) => void;
  setDovFields: (h: import('@/types/domain').DovEntry) => void;
  setDovSaved: (v: boolean) => void;
  setSettingsView: React.Dispatch<React.SetStateAction<SettingsView>>;
  deleteDovEntry: (index: number) => void;
  refreshSessions: () => void;
  isAdmin: boolean; fmtDateRu: (d: string) => string; fmt0: (n: number) => string; T: (k: string) => string;
}) {
  const [vazvratBusy, setVazvratBusy] = React.useState(false);
  const allDates = React.useMemo(() => {
    const s = new Set(vazvratRows.map(v => v.date.slice(0, 10)));
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [vazvratRows]);
  const todayPv = todayIso();
  // Default: last 30 days so past sessions are visible
  const [pvFrom, setPvFrom] = React.useState(() => daysAgo(30));
  const [pvTo, setPvTo] = React.useState(todayPv);

  // ── Vazvrat date-picker delete panel ──
  const [showDeletePanel, setShowDeletePanel] = React.useState(false);
  const [deleteDateSearch, setDeleteDateSearch] = React.useState('');
  const [selectedDeleteDates, setSelectedDeleteDates] = React.useState<Set<string>>(new Set());
  const [vazvratAllDates, setVazvratAllDates] = React.useState<string[]>([]);
  const [datesBusy, setDatesBusy] = React.useState(false);

  const openDeletePanel = async () => {
    setShowDeletePanel(true);
    setSelectedDeleteDates(new Set());
    setDeleteDateSearch('');
    setDatesBusy(true);
    try {
      const dates = await api.vazvratDates(token);
      setVazvratAllDates([...dates].sort((a, b) => b.localeCompare(a)));
    } finally { setDatesBusy(false); }
  };

  const filteredDeleteDates = React.useMemo(() => {
    const q = deleteDateSearch.trim().toLowerCase();
    const list = q ? vazvratAllDates.filter(d => d.includes(q)) : vazvratAllDates.slice(0, 10);
    return list;
  }, [vazvratAllDates, deleteDateSearch]);

  const toggleDeleteDate = (d: string) => {
    setSelectedDeleteDates(prev => {
      const n = new Set(prev);
      n.has(d) ? n.delete(d) : n.add(d);
      return n;
    });
  };

  const confirmDeleteDates = async () => {
    if (!selectedDeleteDates.size) return;
    const dates = [...selectedDeleteDates];
    setVazvratBusy(true);
    try {
      await api.deleteVazvratDates(token, dates);
      setVazvratAllRows(vazvratRows.filter(v => !selectedDeleteDates.has(v.date.slice(0, 10))));
      setVazvratAllDates(prev => prev.filter(d => !selectedDeleteDates.has(d)));
      setSelectedDeleteDates(new Set());
      setShowDeletePanel(false);
    } finally { setVazvratBusy(false); }
  };

  const deleteAllVazvrat = async () => {
    if (!confirm(T('pv_del_all'))) return;
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

  const filteredSessions = React.useMemo(() =>
    sessions.filter(s => (!pvFrom || s.invoiceDate >= pvFrom) && (!pvTo || s.invoiceDate <= pvTo)),
    [sessions, pvFrom, pvTo]
  );

  const TABS: { key: TarixTab; label: string; count: number; color: string }[] = [
    { key: 'nakl',    label: T('tarix_hujjat'),      count: filteredSessions.length, color: '#2563eb' },
    { key: 'vazvrat', label: T('tarix_qaytarma'),    count: vazvratRows.length,      color: '#d97706' },
    { key: 'zakas',   label: T('tarix_buyurtma'),    count: filteredSessions.length, color: '#7c3aed' },
    { key: 'dov',     label: T('tarix_ishonchnoma'), count: dovHistory.length,       color: '#059669' },
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
        {/* Refresh + date range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%' }}>
          <button type="button" onClick={refreshSessions}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--berry)', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(var(--berry-rgb,180,0,80),0.28)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <RefreshCcw size={13} /> Yangilash
          </button>
          {/* Date range */}
          <DateRangePicker from={pvFrom} to={pvTo} setFrom={setPvFrom} setTo={setPvTo}
            inputStyle={{ fontSize: 12, fontWeight: 500, border: '1px solid rgba(var(--ink-rgb),0.12)', borderRadius: 8, padding: '4px 6px', background: 'var(--surface)', color: 'var(--ink)' }} />
        </div>
      </div>

      {/* Nakladnoy tab */}
      {tab === 'nakl' && (() => {
        return filteredSessions.length === 0 ? <Empty title="Hujjat tarixi yo'q" /> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {filteredSessions.map(s => {
            return (
              <div key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface)', border: '1px solid rgba(var(--ink-rgb),0.07)', borderLeft: '3px solid #2563eb', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{s.name || s.invoiceDate}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{s.invoiceCount} ta nakl · {s.invoiceDate}</div>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{fmt0(s.sumTotal)} so&apos;m</span>
                <button className="mini" type="button" onClick={() => loadSession(s._id)}>{T('lbl_restore')}</button>
                {isAdmin && <button className="iconbtn danger" type="button" onClick={() => deleteSession(s._id, s.name)}><Trash2 size={14} /></button>}
              </div>
            );
          })}
        </div>;
      })()}

      {/* Vazvrat tab — Pivot table */}
      {tab === 'vazvrat' && (() => {
        // Date filter
        const from = pvFrom || (allDates[allDates.length - 1] ?? '');
        const to   = pvTo   || (allDates[0] ?? '');
        const filtered = vazvratRows.filter(v => {
          const d = v.date.slice(0, 10);
          return (!from || d >= from) && (!to || d <= to);
        });

        // Pivot: rows=product, cols=market, value=qty+sum
        const markets  = [...new Set(filtered.map(v => v.marketName || v.marketCode))].sort();
        type Cell = { qty: number; sum: number };
        const pivot: Record<string, Record<string, Cell>> = {};
        const colTotals: Record<string, Cell> = {};
        const rowTotals: Record<string, Cell> = {};
        let grandQty = 0; let grandSum = 0;
        for (const v of filtered) {
          const p = v.productName;
          const m = v.marketName || v.marketCode;
          if (!pivot[p]) pivot[p] = {};
          if (!pivot[p][m]) pivot[p][m] = { qty: 0, sum: 0 };
          pivot[p][m].qty += v.qty;
          pivot[p][m].sum += v.totalWithVat;
          if (!rowTotals[p]) rowTotals[p] = { qty: 0, sum: 0 };
          rowTotals[p].qty += v.qty; rowTotals[p].sum += v.totalWithVat;
          if (!colTotals[m]) colTotals[m] = { qty: 0, sum: 0 };
          colTotals[m].qty += v.qty; colTotals[m].sum += v.totalWithVat;
          grandQty += v.qty; grandSum += v.totalWithVat;
        }
        // Sort products by total qty descending
        const products = [...new Set(filtered.map(v => v.productName))]
          .sort((a, b) => (rowTotals[b]?.qty ?? 0) - (rowTotals[a]?.qty ?? 0));

        const thStyle: React.CSSProperties = { padding: '7px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', background: 'var(--surface)', border: '1px solid rgba(var(--ink-rgb),0.12)', textAlign: 'center' };
        const tdStyle: React.CSSProperties = { padding: '4px 8px', fontSize: 12, border: '1px solid rgba(var(--ink-rgb),0.1)', textAlign: 'center', whiteSpace: 'nowrap', width: 42 };
        const stickyCol: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 10, background: 'var(--surface)', fontWeight: 600, textAlign: 'left', minWidth: 220, maxWidth: 280, willChange: 'transform' };

        const activeDays = allDates.filter(d => (!from||d>=from)&&(!to||d<=to)).length;
        const kpi = [
          { label: T('pv_kpi_qaytarma'), value: `${grandQty} ${T('pv_dona')}`, sub: fmt0(grandSum) + ' so\'m', color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
          { label: T('pv_kpi_mahsulot'), value: products.length, sub: T('pv_xil_tovar'), color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
          { label: T('pv_kpi_market'), value: markets.length, sub: T('pv_ta_dokon'), color: '#0891b2', bg: 'rgba(8,145,178,0.08)' },
          { label: T('pv_kpi_kunlar'), value: activeDays, sub: `${filtered.length} ${T('pv_ta_yozuv')}`, color: '#059669', bg: 'rgba(5,150,105,0.08)' },
        ];

        return (
          <>
            {/* Top bar: delete + range notice */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', background: 'rgba(var(--ink-rgb),0.06)', borderRadius: 6, padding: '3px 8px', flexShrink: 0 }}>
                So&apos;nggi {VAZVRAT_DEFAULT_DAYS} kun
              </span>
              {isAdmin && vazvratRows.length > 0 && (
                <button type="button" disabled={vazvratBusy} onClick={openDeletePanel}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '7px 12px', border: '1px solid #dc2626', borderRadius: 9, background: 'rgba(220,38,38,0.06)', color: '#dc2626', cursor: 'pointer' }}>
                  <Trash2 size={13} /> O&apos;chir
                </button>
              )}

              {/* Delete date panel */}
              {showDeletePanel && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setShowDeletePanel(false)}>
                  <div style={{ background: 'var(--shell)', borderRadius: 16, padding: 24, width: 360, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Sanani tanlang</div>

                    {/* Search */}
                    <input type="text" placeholder="Qidirish (yyyy-mm-dd)..." value={deleteDateSearch}
                      onChange={e => setDeleteDateSearch(e.target.value)}
                      style={{ padding: '7px 11px', borderRadius: 8, border: '1px solid rgba(var(--ink-rgb),0.18)', fontSize: 13, background: 'var(--surface)' }} />

                    {/* Date list */}
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320 }}>
                      {datesBusy ? (
                        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>Yuklanmoqda…</div>
                      ) : filteredDeleteDates.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>Topilmadi</div>
                      ) : filteredDeleteDates.map(d => (
                        <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: selectedDeleteDates.has(d) ? 'rgba(239,68,68,0.08)' : 'var(--surface)', border: `1px solid ${selectedDeleteDates.has(d) ? '#ef4444' : 'rgba(var(--ink-rgb),0.08)'}` }}>
                          <input type="checkbox" checked={selectedDeleteDates.has(d)} onChange={() => toggleDeleteDate(d)} style={{ accentColor: '#ef4444' }} />
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>{d}</span>
                        </label>
                      ))}
                      {!deleteDateSearch && vazvratAllDates.length > 10 && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', paddingTop: 4 }}>
                          Jami {vazvratAllDates.length} ta sana. Qidirish orqali ko&apos;proq toping.
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="small" type="button" onClick={() => setShowDeletePanel(false)}>Bekor</button>
                      <button className="small dark" type="button"
                        disabled={selectedDeleteDates.size === 0 || vazvratBusy}
                        onClick={confirmDeleteDates}
                        style={{ background: '#ef4444', borderColor: '#ef4444', opacity: selectedDeleteDates.size === 0 ? 0.5 : 1 }}>
                        {vazvratBusy ? '…' : `O'chirish (${selectedDeleteDates.size} ta sana)`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* KPI cards */}
            {filtered.length > 0 && (
              <div className="qaytarma-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 14 }}>
                {kpi.map(k => (
                  <div key={k.label} style={{ padding: '10px 14px', borderRadius: 12, background: k.bg, border: `1px solid ${k.color}33`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: k.color, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{k.label}</span>
                    <span style={{ fontSize: 20, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</span>
                    <span style={{ fontSize: 10, color: k.color, opacity: 0.65, whiteSpace: 'nowrap' }}>{k.sub}</span>
                  </div>
                ))}
              </div>
            )}

            {filtered.length === 0 ? <Empty title={T('pv_empty')} /> : (
              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '65vh', borderRadius: 10, border: '1px solid rgba(var(--ink-rgb),0.1)' }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, ...stickyCol, position: 'sticky', top: 0, left: 0, zIndex: 20, background: 'var(--surface)' }}>{T('pv_mahsulot')}</th>
                      {markets.map(m => (
                        <th key={m} style={{ ...thStyle, position: 'sticky', top: 0, zIndex: 10, padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', background: 'var(--surface)' }}>
                          {m.replace(/^korzinka\s*[-,]?\s*/i, '').replace(/\s*\/\d+$/, '') || m}
                        </th>
                      ))}
                      <th style={{ ...thStyle, position: 'sticky', top: 0, zIndex: 10, background: '#fffbf0', borderLeft: '2px solid #e8a825', minWidth: 90 }}>Jami</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, pi) => {
                      const bg = pi % 2 === 0 ? 'var(--surface)' : 'var(--surface-hi, #f7f8fa)';
                      return (
                        <tr key={p}>
                          <td style={{ ...tdStyle, ...stickyCol, background: bg, borderRight: '2px solid rgba(var(--ink-rgb),0.18)', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, padding: '6px 10px' }} title={p}>{p}</td>
                          {markets.map(m => {
                            const c = pivot[p]?.[m];
                            return (
                              <td key={m} style={{ ...tdStyle, background: bg }}>
                                {c ? <span style={{ fontWeight: 700 }}>{c.qty}</span> : <span style={{ color: 'rgba(var(--ink-rgb),0.18)' }}>—</span>}
                              </td>
                            );
                          })}
                          <td style={{ ...tdStyle, fontWeight: 800, color: '#d97706', borderLeft: '2px solid #e8a825', background: '#fffbf0', minWidth: 90 }}>
                            <div>{rowTotals[p]?.qty ?? 0}</div>
                            <div style={{ fontSize: 10 }}>{fmt0(rowTotals[p]?.sum ?? 0)}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ ...tdStyle, ...stickyCol, fontWeight: 800, background: '#fffbf0', borderTop: '2px solid #e8a825' }}>Jami</td>
                      {markets.map(m => (
                        <td key={m} style={{ ...tdStyle, fontWeight: 700, background: '#fffbf0', borderTop: '2px solid #e8a825' }}>
                          <div>{colTotals[m]?.qty ?? 0}</div>
                          <div style={{ fontSize: 10 }}>{fmt0(colTotals[m]?.sum ?? 0)}</div>
                        </td>
                      ))}
                      <td style={{ ...tdStyle, fontWeight: 900, color: '#d97706', background: '#fff3d0', borderLeft: '2px solid #e8a825', borderTop: '2px solid #e8a825' }}>
                        <div>{grandQty}</div>
                        <div style={{ fontSize: 10 }}>{fmt0(grandSum)}</div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        );
      })()}

      {/* Zakas tab — grouped by base date (YYYY-MM-DD) */}
      {tab === 'zakas' && (() => {
        // Group sessions by base date (first 10 chars of invoiceDate)
        const dateMap = new Map<string, { dateKey: string; items: any[]; totalNakl: number; totalSum: number }>();
        for (const s of filteredSessions) {
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
                    onClick={() => { if (multi) toggleDateGroup('zakas-' + g.dateKey); else loadSession(g.items[0]._id); }}>
                    {multi && <span style={{ color: '#7c3aed', fontWeight: 800, fontSize: 15, transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>›</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtDateRu(g.dateKey)}</div>
                      {multi && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{g.items.length} ta versiya</div>}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--ok)', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt0(g.totalNakl)} hujjat</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{fmt0(g.totalSum)} so&apos;m</span>
                  </div>
                  {open && multi && (
                    <div style={{ marginLeft: 16, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {g.items.map((s: any) => (
                        <div key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--surface)', border: '1px solid rgba(var(--ink-rgb),0.05)', borderLeft: '2px solid #c4b5fd', borderRadius: 8, cursor: 'pointer' }}
                          onClick={() => loadSession(s._id)}>
                          <div style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>{s.name || s.invoiceDate}</div>
                          <span style={{ fontSize: 11, color: 'var(--ok)', fontWeight: 700 }}>{fmt0(s.invoiceCount)} hujjat</span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{fmt0(s.sumTotal)} so&apos;m</span>
                          {isAdmin && <button className="iconbtn danger" type="button" onClick={e => { e.stopPropagation(); deleteSession(s._id, s.name); }}><Trash2 size={13} /></button>}
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
              <button className="mini" type="button" onClick={() => { setDovFields(h); setDovSaved(true); setSettingsView('doverennost'); }}>{T('tarix_load')}</button>
              <button className="mini" type="button" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} onClick={() => { if (window.confirm(T('dov_del_confirm'))) deleteDovEntry(i); }}>{T('tarix_delete')}</button>
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
  sessions: import('@/types/domain').SessionSummary[]; dovHistory: import('@/types/domain').DovEntry[];
  qaytganInvoices: import('@/types/domain').Invoice[]; vazvratRows: import('@/types/domain').VazvratRecord[];
  expandedDates: Set<string>; toggleDateGroup: (k: string) => void;
  loadSession: (d: string) => void; deleteSession: (d: string, name?: string) => void;
  setDovFields: (h: import('@/types/domain').DovEntry) => void; setSettingsView: React.Dispatch<React.SetStateAction<SettingsView>>;
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
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: ks.color, background: ks.bg, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0 }}>{T(ks.labelKey)}</span>

                  {/* Content per kind */}
                  {ev.kind === 'nakl' && (<>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{ev.data.name || ev.data.invoiceDate}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{ev.data.invoiceCount} hujjat</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', marginLeft: 'auto' }}>{fmt0(ev.data.sumTotal)} so&apos;m</span>
                    <button className="mini" type="button" onClick={() => loadSession(ev.data._id)}>{T('lbl_restore')}</button>
                    {isAdmin && <button className="iconbtn danger" type="button" onClick={() => deleteSession(ev.data._id, ev.data.name)}><Trash2 size={14} /></button>}
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
  const [tab, setTab] = useState<'overview' | 'products' | 'markets' | 'clients' | 'savdo' | 'qaytarma'>('overview');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const toggleItem = (key: string) => setExpandedItems(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // ─── Shared date range for ALL tabs ───────────────────────────────────────
  const today = todayIso();
  const [savdoFrom, setSavdoFrom] = useState(today);
  const [savdoTo,   setSavdoTo]   = useState(today);
  const [vazvratRows, setVazvratRows] = useState<import('@/types/domain').VazvratRecord[]>([]);
  const [savdoInvoices, setSavdoInvoices] = useState<Invoice[]>([]);
  const [savdoAnalytics, setSavdoAnalytics] = useState<{ sku: string; name: string; berilganQty: number; berilganSum: number; vazvratQty: number; vazvratSum: number }[]>([]);
  const [savdoBusy, setSavdoBusy] = useState(false);
  const [savdoUploading, setSavdoUploading] = useState(false);
  const [savdoTab, setSavdoTab] = useState<'kunlik' | 'dokonlar' | 'mahsulotlar'>('kunlik');

  // ─── Session-based invoices: FAQAT Tarixda saqlangan sessionlardan ─────────
  const [sessionInvoices, setSessionInvoices] = useState<Invoice[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  // invNo -> { initSum, initQty } from session snapshot
  // Keyed by `${invNo}__${sessionDate}` so the same invNo on different days stays separate.
  const [snapInitMap, setSnapInitMap] = useState<Map<string, { sum: number; qty: number }>>(new Map());

  async function loadSessionInvoices(from: string, to: string) {
    if (!token) return;
    setSessionLoading(true);
    try {
      // MANBA: faqat Tarix tabidagi sessiyalar (snapshot)
      // Live DB ishlatilmaydi — foydalanuvchi Tarixda ko'rgan narsasi analitika manbai
      const inRange = sessions.filter(s => s.invoiceDate >= from && s.invoiceDate <= to);
      const snaps = inRange.length
        ? await Promise.all(inRange.map(s => api.session(token, s._id).catch(() => null)))
        : [];

      const invoiceMap = new Map<string, Invoice>();
      const newSnapMap = new Map<string, { sum: number; qty: number }>();

      for (const rec of snaps) {
        if (!rec?.snapshot?.invoices) continue;
        const sessionDate = rec.invoiceDate as string;
        for (const inv of rec.snapshot.invoices as Invoice[]) {
          // Berildi = snapshot dagi joriy holat.
          // Kalit = invNo + sessiya sanasi. Bir xil invNo turli kunlarda qayta
          // ishlatiladi; faqat invNo bo'yicha dedup qilsak, barcha kunlar bitta
          // kunga yig'ilib qolardi (shu sabab Savdo'da faqat 1 kun ko'rinardi).
          // Sana — FAYL NOMIDAN (sessionDate) olinadi, invoice ichidagi dateIso'dan
          // emas (u generatsiya sanasi bo'lib, fayl nomidan farq qilishi mumkin).
          const dayKey = `${inv.invNo}__${sessionDate}`;
          if (!invoiceMap.has(dayKey)) {
            invoiceMap.set(dayKey, { ...inv, dateIso: sessionDate });
          }
          // Buyurtma = SAP boshlang'ich miqdor (init field yoki qty)
          const initQty = inv.lines.reduce((s: number, l: Invoice['lines'][0]) => s + (l.init || l.qty || 0), 0);
          const initSum = inv.lines.reduce((s: number, l: Invoice['lines'][0]) => {
            const iq = l.init || l.qty || 0;
            const price = l.qty > 0 ? l.total / l.qty : (l.price || 0);
            return s + iq * price;
          }, 0);
          newSnapMap.set(dayKey, { qty: initQty, sum: initSum || inv.sumTotal });
        }
      }

      setSnapInitMap(newSnapMap);
      setSessionInvoices([...invoiceMap.values()]);
    } catch (e) { console.warn('[loadSessionInvoices] failed:', e); }
    finally { setSessionLoading(false); }
  }

  // Sana o'zgarganda avtomatik yuklash (invoices + vazvrat)
  useEffect(() => {
    void loadSessionInvoices(savdoFrom, savdoTo);
    void loadVazvrat();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savdoFrom, savdoTo, sessions.length]);

  async function loadVazvrat() {
    if (!token) return;
    setSavdoBusy(true);
    try {
      // Per-date yukla (200 limit muammosini hal qiladi)
      const dates: string[] = [];
      const cur2 = new Date(savdoFrom); const end2 = new Date(savdoTo);
      while (cur2 <= end2) { dates.push(cur2.toISOString().slice(0, 10)); cur2.setDate(cur2.getDate() + 1); }

      const [rows, analytics, ...dayResults] = await Promise.all([
        api.queryVazvrat(token, savdoFrom, savdoTo),
        api.vazvratAnalytics(token, savdoFrom, savdoTo),
        ...dates.map(d => api.invoices(token, d).catch(() => [] as Invoice[])),
      ]);
      setVazvratRows(rows);
      setSavdoAnalytics(analytics);
      const allInvoices: Invoice[] = [];
      const seen = new Set<number>();
      for (const list of dayResults as Invoice[][]) {
        for (const inv of list) { if (!seen.has(inv.invNo)) { seen.add(inv.invNo); allInvoices.push(inv); } }
      }
      setSavdoInvoices(allInvoices);
    } catch (e) { console.warn('[loadSavdo] analytics load failed:', e); onToast('err', 'Statistikani yuklashda xato'); } finally { setSavdoBusy(false); }
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

  // sessionInvoices — live status/sumTotal + snapshot init
  const filteredInvoices = useMemo(
    () => sessionInvoices.filter(inv => inv.status !== 'cancelled'),
    [sessionInvoices]
  );

  const filteredMarkets = useMemo(() => {
    const map: Record<string, { storeCode: string; label: string; qty: number; sum: number; count: number }> = {};
    for (const inv of filteredInvoices) {
      if (!map[inv.storeCode]) map[inv.storeCode] = { storeCode: inv.storeCode, label: inv.market, qty: 0, sum: 0, count: 0 };
      map[inv.storeCode].qty += inv.sumQty;
      map[inv.storeCode].sum += inv.sumTotal;
      map[inv.storeCode].count += 1;
    }
    return Object.values(map).sort((a, b) => b.sum - a.sum);
  }, [filteredInvoices]);

  const filteredProductRows = useMemo(() => {
    // Invoice lines dan to'g'ridan-to'g'ri o'qi — catalog bo'sh bo'lsa ham ishlaydi
    const map: Record<string, { product: { sku: string; name: string; unit: string; price: number }; initTotal: number; givenQty: number; givenSum: number }> = {};
    for (const inv of filteredInvoices) {
      for (const line of (inv.lines || [])) {
        if (!line.sku || !(line.qty > 0)) continue;
        if (!map[line.sku]) {
          const cat = catalog.find(p => p.sku === line.sku);
          map[line.sku] = { product: { sku: line.sku, name: cat?.name || (line as any).name || line.sku, unit: cat?.unit || (line as any).unit || '', price: cat?.price || line.price || 0 }, initTotal: 0, givenQty: 0, givenSum: 0 };
        }
        map[line.sku].givenQty += line.qty;
        map[line.sku].givenSum += line.total || 0;
        map[line.sku].initTotal += line.init || line.qty;
      }
    }
    return Object.values(map).filter(r => r.givenQty > 0).sort((a, b) => b.givenQty - a.givenQty);
  }, [filteredInvoices, catalog]);

  const fMaxMarketSum = filteredMarkets[0]?.sum || 1;
  const fMaxProductQty = filteredProductRows[0]?.givenQty || 1;

  // Top-5 leaderboards for overview
  const top5MarketsByCount = useMemo(() =>
    [...filteredMarkets].sort((a, b) => b.count - a.count).slice(0, 5),
    [filteredMarkets]);
  const top5MarketsBySum = useMemo(() =>
    [...filteredMarkets].sort((a, b) => b.sum - a.sum).slice(0, 5),
    [filteredMarkets]);

  // Vazvrat by market (filtered by date range)
  const vazvratByMarket = useMemo(() => {
    const map: Record<string, { name: string; qty: number; total: number }> = {};
    for (const vr of vazvratRows) {
      const d = vr.date.slice(0, 10);
      if (d < savdoFrom || d > savdoTo) continue;
      if (!map[vr.marketCode]) map[vr.marketCode] = { name: vr.marketName, qty: 0, total: 0 };
      map[vr.marketCode].qty += vr.qty;
      map[vr.marketCode].total += vr.totalWithVat;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [vazvratRows, savdoFrom, savdoTo]);

  // Vazvrat by product
  const vazvratByProduct = useMemo(() => {
    const map: Record<string, { name: string; qty: number; total: number }> = {};
    for (const vr of vazvratRows) {
      const d = vr.date.slice(0, 10);
      if (d < savdoFrom || d > savdoTo) continue;
      if (!map[vr.sapCode]) map[vr.sapCode] = { name: vr.productName, qty: 0, total: 0 };
      map[vr.sapCode].qty += vr.qty;
      map[vr.sapCode].total += vr.totalWithVat;
    }
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [vazvratRows, savdoFrom, savdoTo]);

  const top5ProductsByQty = useMemo(() => filteredProductRows.slice(0, 5), [filteredProductRows]);

  // Berildi = haqiqiy yetkazilgan (live DB)
  const aBerildiSum  = useMemo(() => filteredInvoices.reduce((s, inv) => s + inv.sumTotal, 0), [filteredInvoices]);
  const aBerildiDona = useMemo(() => filteredInvoices.reduce((s, inv) => s + inv.sumQty, 0), [filteredInvoices]);

  // Buyurtma = snapshot'dan SAP original; manual hujjatlar har doim sumTotal (snapshot ishonchsiz)
  const aBuyurtmaDona = useMemo(() => {
    if (!snapInitMap.size) return aBerildiDona;
    return filteredInvoices.reduce((s, inv) => {
      if (inv.manual) return s + inv.sumQty; // qo'lda: buyurtma = berildi
      return s + (snapInitMap.get(`${inv.invNo}__${inv.dateIso}`)?.qty ?? inv.sumQty);
    }, 0);
  }, [filteredInvoices, snapInitMap, aBerildiDona]);
  const aBuyurtmaSum  = useMemo(() => {
    if (!snapInitMap.size) return aBerildiSum;
    return filteredInvoices.reduce((s, inv) => {
      if (inv.manual) return s + inv.sumTotal; // qo'lda: buyurtma = berildi
      return s + (snapInitMap.get(`${inv.invNo}__${inv.dateIso}`)?.sum ?? inv.sumTotal);
    }, 0);
  }, [filteredInvoices, snapInitMap, aBerildiSum]);

  // Kamaytirildi = Buyurtma - Berildi
  const aKamaydiSum  = aBuyurtmaSum - aBerildiSum;
  const aKamaydiDona = aBuyurtmaDona - aBerildiDona;

  // Qaytarma
  const aQaytarmaSum  = vazvratByMarket.reduce((s, m) => s + m.total, 0);
  const aQaytarmaDona = vazvratByMarket.reduce((s, m) => s + m.qty, 0);

  // Savdo = Berildi - Qaytarma
  const aSavdoSum  = aBerildiSum - aQaytarmaSum;
  const aSavdoDona = aBerildiDona - aQaytarmaDona;

  const aGiven = aBerildiSum;
  const aSum   = aSavdoSum;

  return (
    <section className="pane" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 54px)', overflow: 'hidden' }}>

      {/* ── FREEZE: Statistika header — KPI chips + Mahsulot/Market toggle ── */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid rgba(var(--ink-rgb),0.08)', paddingBottom: 10, marginBottom: 0 }}>
        {/* Row 1: Title + KPI chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', marginRight: 4 }}>Statistika</span>
          {[
            { label: 'KELDI',         val: aBuyurtmaDona,  color: 'var(--ink)' },
            { label: 'KAMAYDI',       val: aKamaydiDona,   color: aKamaydiDona > 0 ? '#d97706' : 'var(--ink)' },
            { label: 'BERILDI',       val: aBerildiDona,   color: 'var(--ok)' },
            { label: 'ZAKAZ SUMMA',   val: aBuyurtmaSum,   color: 'var(--ink)', sum: true },
            { label: 'BERILGAN SUMMA',val: aBerildiSum,    color: 'var(--ok)', sum: true },
          ].map(k => (
            <div key={k.label} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--surface)', border: '1px solid rgba(var(--ink-rgb),0.1)', borderRadius: 8, padding: '4px 10px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: k.color, fontFamily: 'var(--mono)', letterSpacing: '-0.01em' }}>{fmt0(k.val)}</span>
            </div>
          ))}
        </div>
        {/* Row 2: DateRange + refresh + toggles — horizontal scroll on mobile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 2, flexWrap: 'nowrap' }}>
          <DateRangePicker from={savdoFrom} to={savdoTo} onChange={(f,t) => { setSavdoFrom(f); setSavdoTo(t); }} />
          {tab === 'savdo'
            ? <button type="button" disabled={savdoBusy} onClick={loadVazvrat}
                style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '5px 10px', border: '1px solid rgba(var(--ink-rgb),0.13)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer' }}>
                <RefreshCcw size={12} /> {savdoBusy ? '…' : 'Yuklash'}
              </button>
            : <button type="button" onClick={onRefresh}
                style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', padding: '5px 8px', border: '1px solid rgba(var(--ink-rgb),0.13)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer' }}>
                <RefreshCcw size={13} />
              </button>
          }
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button type="button" onClick={() => setTab('products')}
              style={{ flexShrink:0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: '1.5px solid', cursor: 'pointer', borderColor: tab === 'products' ? 'var(--ok)' : 'rgba(var(--ink-rgb),0.15)', background: tab === 'products' ? 'rgba(46,168,85,0.09)' : 'var(--surface)', color: tab === 'products' ? 'var(--ok)' : 'var(--ink)' }}>
              📦 Mahsulot <span style={{ background: tab === 'products' ? 'var(--ok)' : 'rgba(var(--ink-rgb),0.12)', color: tab === 'products' ? '#fff' : 'var(--ink)', borderRadius: 6, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>{filteredProductRows.length}</span>
            </button>
            <button type="button" onClick={() => setTab('markets')}
              style={{ flexShrink:0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: '1.5px solid', cursor: 'pointer', borderColor: tab === 'markets' ? '#f59e0b' : 'rgba(var(--ink-rgb),0.15)', background: tab === 'markets' ? 'rgba(245,158,11,0.09)' : 'var(--surface)', color: tab === 'markets' ? '#b45309' : 'var(--ink)' }}>
              🏪 Market <span style={{ background: tab === 'markets' ? '#f59e0b' : 'rgba(var(--ink-rgb),0.12)', color: tab === 'markets' ? '#fff' : 'var(--ink)', borderRadius: 6, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>{filteredMarkets.length}</span>
            </button>
            <button type="button" onClick={() => { setTab('savdo'); void loadVazvrat(); }}
              style={{ flexShrink:0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: '1.5px solid', cursor: 'pointer', borderColor: tab === 'savdo' ? '#6366f1' : 'rgba(var(--ink-rgb),0.15)', background: tab === 'savdo' ? 'rgba(99,102,241,0.09)' : 'var(--surface)', color: tab === 'savdo' ? '#4f46e5' : 'var(--ink)' }}>
              📊 Savdo
            </button>
            <button type="button" onClick={() => { setTab('qaytarma'); void loadVazvrat(); }}
              style={{ flexShrink:0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: '1.5px solid', cursor: 'pointer', borderColor: tab === 'qaytarma' ? '#d97706' : 'rgba(var(--ink-rgb),0.15)', background: tab === 'qaytarma' ? 'rgba(217,119,6,0.09)' : 'var(--surface)', color: tab === 'qaytarma' ? '#b45309' : 'var(--ink)' }}>
              ↩️ Qaytarma <span style={{ background: tab === 'qaytarma' ? '#d97706' : 'rgba(var(--ink-rgb),0.12)', color: tab === 'qaytarma' ? '#fff' : 'var(--ink)', borderRadius: 6, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>{vazvratRows.length}</span>
            </button>
          </div>
        </div>
      </div>

      {tab === 'overview' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* legacy overview — redirect to products */}
          {(() => { setTimeout(() => setTab('products'), 0); return null; })()}
          {/* ── Top-5 leaderboards ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>

            {/* 1. Eng ko'p zakaz: top 5 market by sum */}
            {(() => {
              return (
                <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid rgba(var(--ink-rgb),0.08)', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', borderBottom: top5MarketsBySum.length ? '1px solid rgba(var(--ink-rgb),0.06)' : 'none' }}>🏆 Eng ko'p zakaz (top 5)</div>
                  {top5MarketsBySum.length === 0 && <div style={{ padding: '10px 16px', color: 'var(--muted)', fontSize: 12 }}>Ma'lumot yo'q</div>}
                  {top5MarketsBySum.map((m, i) => (
                    <div key={m.storeCode} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 90px', gap: 6, alignItems: 'center', padding: '9px 16px', borderBottom: i < top5MarketsBySum.length - 1 ? '1px solid rgba(var(--ink-rgb),0.04)' : 'none' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? '#f59e0b' : 'var(--muted)', textAlign: 'center' }}>{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortMkt(m.label)}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right' }}>{fmt0(m.sum)}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* 2. Eng ko'p vazvrat market */}
            {(() => {
              const top5 = vazvratByMarket.slice(0, 5);
              return (
                <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid rgba(var(--ink-rgb),0.08)', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', borderBottom: top5.length ? '1px solid rgba(var(--ink-rgb),0.06)' : 'none' }}>⚠️ Eng ko'p qaytarma market (top 5)</div>
                  {top5.length === 0 && <div style={{ padding: '10px 16px', color: 'var(--muted)', fontSize: 12 }}>Qaytarma yo'q</div>}
                  {top5.map((m, i) => (
                    <div key={m.name + i} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 80px', gap: 6, alignItems: 'center', padding: '9px 16px', borderBottom: i < top5.length - 1 ? '1px solid rgba(var(--ink-rgb),0.04)' : 'none' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? '#dc2626' : 'var(--muted)', textAlign: 'center' }}>{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortMkt(m.name)}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right', color: '#dc2626' }}>{fmt0(m.total)}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* 3. Eng ko'p sotilgan tovar */}
            {(() => {
              return (
                <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid rgba(var(--ink-rgb),0.08)', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', borderBottom: top5ProductsByQty.length ? '1px solid rgba(var(--ink-rgb),0.06)' : 'none' }}>📦 Eng ko'p sotilgan tovar (top 5)</div>
                  {top5ProductsByQty.length === 0 && <div style={{ padding: '10px 16px', color: 'var(--muted)', fontSize: 12 }}>Ma'lumot yo'q</div>}
                  {top5ProductsByQty.map((r, i) => (
                    <div key={r.product.sku} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 45px 80px', gap: 6, alignItems: 'start', padding: '9px 16px', borderBottom: i < top5ProductsByQty.length - 1 ? '1px solid rgba(var(--ink-rgb),0.04)' : 'none' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? '#f59e0b' : 'var(--muted)', textAlign: 'center', paddingTop: 2 }}>{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{r.product.name}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--muted)', textAlign: 'right' }}>{fmt0(r.givenQty)}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right' }}>{fmt0(r.givenSum)}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* 4. Eng ko'p qaytarma tovar */}
            {(() => {
              const top5 = vazvratByProduct.slice(0, 5);
              return (
                <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid rgba(var(--ink-rgb),0.08)', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', borderBottom: top5.length ? '1px solid rgba(var(--ink-rgb),0.06)' : 'none' }}>🔄 Eng ko'p qaytarma tovar (top 5)</div>
                  {top5.length === 0 && <div style={{ padding: '10px 16px', color: 'var(--muted)', fontSize: 12 }}>Qaytarma yo'q</div>}
                  {top5.map((p, i) => (
                    <div key={p.name + i} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 45px 80px', gap: 6, alignItems: 'start', padding: '9px 16px', borderBottom: i < top5.length - 1 ? '1px solid rgba(var(--ink-rgb),0.04)' : 'none' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? '#f97316' : 'var(--muted)', textAlign: 'center', paddingTop: 2 }}>{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{p.name}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--muted)', textAlign: 'right' }}>{fmt0(p.qty)}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right', color: '#f97316' }}>{fmt0(p.total)}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {tab === 'products' && (
        filteredProductRows.length === 0
          ? <Empty title="Sana oralig'ida ma'lumot yo'q" />
          : <div className="tablewrap" style={{ flex: 1, overflow: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 24 }}>#</th>
                    <th>{T('lbl_product')}</th>
                    <th className="right">Zakaz</th>
                    <th className="right" style={{ color: '#d97706' }}>Kamaydi</th>
                    <th className="right" style={{ color: 'var(--ok)' }}>Berildi</th>
                    <th className="right">Summa (so'm)</th>
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
                          <td style={{ textAlign: 'center', color: open ? 'var(--ok)' : 'var(--muted)', fontWeight: 700, fontSize: 12 }}>
                            <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
                          </td>
                          <td><b>{row.product.name}</b></td>
                          <td className="right mono">{fmt0(row.initTotal)}</td>
                          <td className="right mono" style={{ color: (row.initTotal - row.givenQty) > 0 ? '#d97706' : 'var(--muted)' }}>{(row.initTotal - row.givenQty) > 0 ? fmt0(row.initTotal - row.givenQty) : '—'}</td>
                          <td className="right mono" style={{ color: 'var(--ok)', fontWeight: 600 }}>{fmt0(row.givenQty)}</td>
                          <td className="right mono">{fmt0(row.givenSum)}</td>
                        </tr>
                        {open && marketRows.map(mr => (
                          <tr key={mr.market} style={{ background: 'rgba(var(--ink-rgb),0.02)', fontSize: 12 }}>
                            <td></td>
                            <td style={{ paddingLeft: 24, color: 'var(--muted)' }}>› {shortMkt(mr.market)}</td>
                            <td></td>
                            <td className="right mono" style={{ color: 'var(--muted)' }}>{fmt0(mr.qty)}</td>
                            <td className="right mono" style={{ color: 'var(--muted)' }}>{fmt0(mr.sum)}</td>
                            <td style={{ color: 'var(--muted)', fontSize: 11 }}>{mr.invNos.length} hujjat</td>
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
          : <div className="tablewrap" style={{ flex: 1, overflow: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 24 }}>#</th>
                    <th>{T('lbl_store')}</th>
                    <th className="right">Zakaz</th>
                    <th className="right" style={{ color: 'var(--ok)' }}>Berildi</th>
                    <th className="right">Summa (so'm)</th>
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
                          <td style={{ textAlign: 'center', color: open ? 'var(--ok)' : 'var(--muted)', fontWeight: 700, fontSize: 12 }}>
                            <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
                          </td>
                          <td><b>{shortMkt(m.label)}</b></td>
                          <td className="right mono">{m.count} <span style={{ fontSize: 10, color: 'var(--muted)' }}>doc</span></td>
                          <td className="right mono" style={{ color: 'var(--ok)', fontWeight: 600 }}>{fmt0(m.qty)}</td>
                          <td className="right mono">{fmt0(m.sum)}</td>
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
                                  Hujjat #{inv.invNo} <span style={{ color: 'var(--muted)', fontSize: 11 }}>· {inv.dateIso}</span>
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
          <div className="tablewrap" style={{ flex: 1, overflow: 'auto' }}>
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

      {/* ─── QAYTARMA PIVOT TAB ─────────────────────────────────────── */}
      {tab === 'qaytarma' && (() => {
        const from = savdoFrom;
        const to   = savdoTo;
        const filtered = vazvratRows.filter(v => {
          const d = v.date.slice(0, 10);
          return (!from || d >= from) && (!to || d <= to);
        });
        const markets  = [...new Set(filtered.map(v => v.marketName || v.marketCode))].sort();
        type PCell = { qty: number; sum: number };
        const pivot: Record<string, Record<string, PCell>> = {};
        const colTotals: Record<string, PCell> = {};
        const rowTotals: Record<string, PCell> = {};
        let grandQty = 0; let grandSum = 0;
        for (const v of filtered) {
          const p = v.productName; const m = v.marketName || v.marketCode;
          if (!pivot[p]) pivot[p] = {};
          if (!pivot[p][m]) pivot[p][m] = { qty: 0, sum: 0 };
          pivot[p][m].qty += v.qty; pivot[p][m].sum += v.totalWithVat;
          if (!rowTotals[p]) rowTotals[p] = { qty: 0, sum: 0 };
          rowTotals[p].qty += v.qty; rowTotals[p].sum += v.totalWithVat;
          if (!colTotals[m]) colTotals[m] = { qty: 0, sum: 0 };
          colTotals[m].qty += v.qty; colTotals[m].sum += v.totalWithVat;
          grandQty += v.qty; grandSum += v.totalWithVat;
        }
        // Sort products by total qty descending
        const products = [...new Set(filtered.map(v => v.productName))]
          .sort((a, b) => (rowTotals[b]?.qty ?? 0) - (rowTotals[a]?.qty ?? 0));
        const thS: React.CSSProperties = { padding: '7px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', background: 'var(--surface)', border: '1px solid rgba(var(--ink-rgb),0.12)', textAlign: 'center' };
        const tdS: React.CSSProperties = { padding: '4px 8px', fontSize: 12, border: '1px solid rgba(var(--ink-rgb),0.1)', textAlign: 'center', whiteSpace: 'nowrap', width: 42 };
        const PROD_W = 220;
        const stCol: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 10, background: 'var(--surface)', fontWeight: 600, textAlign: 'left', minWidth: PROD_W, maxWidth: 300, willChange: 'transform' };
        const kpi = [
          { label: 'JAMI QAYTARMA', value: `${grandQty} dona`, sub: fmt0(grandSum) + ' so\'m', color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
          { label: 'MAHSULOT TURLARI', value: products.length, sub: 'xil tovar', color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
          { label: 'MARKETLAR', value: markets.length, sub: 'ta do\'kon', color: '#0891b2', bg: 'rgba(8,145,178,0.08)' },
          { label: 'YOZUVLAR', value: filtered.length, sub: 'ta qayd', color: '#059669', bg: 'rgba(5,150,105,0.08)' },
        ];
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
            <div className="qaytarma-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, flexShrink: 0 }}>
              {kpi.map(k => (
                <div key={k.label} style={{ padding: '10px 14px', borderRadius: 12, background: k.bg, border: `1px solid ${k.color}33`, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: k.color, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{k.label}</span>
                    <span style={{ fontSize: 22, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</span>
                    <span style={{ fontSize: 10, color: k.color, opacity: 0.65, whiteSpace: 'nowrap' }}>{k.sub}</span>
                  </div>
                </div>
              ))}
            </div>
            {products.length === 0 ? <Empty title="Sana oralig'ida qaytarma yo'q" /> : (
              <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(var(--ink-rgb),0.09)' }}>
                <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 15 }}>
                    <tr>
                      <th style={{ ...thS, ...stCol, zIndex: 25, background: 'var(--surface)', borderRight: '2px solid rgba(var(--ink-rgb),0.25)', overflow: 'hidden' }}>Mahsulot</th>
                      {markets.map(m => {
                        const short = m.replace(/^Korzinka\s*[-–]\s*/i,'').replace(/^Супермаркет\s*/i,'').replace(/^Магазин\s*/i,'');
                        return (
                          <th key={m} title={m} style={{ padding:'8px 6px', whiteSpace:'nowrap', fontSize:11, fontWeight:600, color:'var(--ink)', background:'var(--surface)', border:'none', borderBottom:'1px solid rgba(var(--ink-rgb),0.15)', borderRight:'1px solid rgba(var(--ink-rgb),0.08)', textAlign:'center', verticalAlign:'middle' }}>
                            {short}
                          </th>
                        );
                      })}
                      <th style={{ padding:'8px 10px', whiteSpace:'nowrap', fontSize:11, fontWeight:700, color:'#d97706', background:'#fffbf0', border:'none', borderBottom:'1px solid rgba(var(--ink-rgb),0.15)', borderLeft:'2px solid #e8a825', textAlign:'center', verticalAlign:'middle' }}>
                        Jami
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, pi) => {
                      const bg0 = 'var(--surface)';
                      const bg1 = 'var(--surface-hi, #1d2737)';
                      const rt = rowTotals[p] ?? { qty:0, sum:0 };
                      return (
                        <tr key={p} style={{ background: pi%2===0 ? bg0 : bg1 }}>
                          <td style={{ ...tdS, ...stCol, background: pi%2===0 ? bg0 : bg1, borderRight: '2px solid rgba(var(--ink-rgb),0.2)', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, padding: '6px 10px' }}>{p}</td>
                          {markets.map(m => { const c=pivot[p]?.[m]; return (
                            <td key={m} style={{ ...tdS, color: c ? 'var(--ink)' : 'rgba(var(--ink-rgb),0.15)' }} title={c ? `${c.qty} dona · ${fmt0(c.sum)} so'm` : '—'}>{c ? c.qty : '—'}</td>
                          );})}
                          <td style={{ ...tdS, fontWeight:800, color:'#d97706', borderLeft:'2px solid #e8a825', background:'#fffbf0', minWidth:90 }} title={`${rt.qty} dona · ${fmt0(rt.sum)} so'm`}>
                            {rt.qty} <span style={{ fontSize:10, fontWeight:400, color:'rgba(217,119,6,0.7)' }}>({fmt0(rt.sum)})</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot style={{ position:'sticky', bottom:0, zIndex:15 }}>
                    <tr style={{ borderTop:'2px solid rgba(var(--ink-rgb),0.12)' }}>
                      <td style={{ ...tdS, ...stCol, background:'var(--surface)', fontWeight:700, zIndex:25, borderRight:'2px solid rgba(var(--ink-rgb),0.2)' }}>Jami</td>
                      {markets.map(m => { const ct=colTotals[m]??{qty:0,sum:0}; return (
                        <td key={m} style={{ ...tdS, fontWeight:700, background:'#fffbf0', color:'#d97706' }} title={`${ct.qty} dona · ${fmt0(ct.sum)} so'm`}>{ct.qty}</td>
                      );})}
                      <td style={{ ...tdS, fontWeight:800, background:'#fff3d0', color:'#d97706', borderLeft:'2px solid #e8a825' }}>
                        {grandQty} <span style={{ fontSize:10, fontWeight:400 }}>({fmt0(grandSum)})</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── SAVDO TAB ─────────────────────────────────────────────── */}
      {tab === 'savdo' && <SavdoTab
        sessions={sessions} vazvratRows={vazvratRows} invoices={invoices}
        savdoFrom={savdoFrom} savdoTo={savdoTo} savdoInvoices={filteredInvoices}
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
  setRestoreModal: (v: { invNo: number; date: string; lines: { sku: string; name: string; unit: string; price: number; qty: number; initQty: number }[] } | null) => void;
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
          <DateRangePicker from={undeliveredFilter.from} to={undeliveredFilter.to}
            onChange={(f, t) => setUndeliveredFilter({ from: f, to: t })} />
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
  sessions: import('@/types/domain').SessionSummary[]; vazvratRows: import('@/types/domain').VazvratRecord[];
  invoices: Invoice[]; savdoFrom: string; savdoTo: string;
  savdoInvoices: Invoice[];
  savdoAnalytics: { sku: string; name: string; berilganQty: number; berilganSum: number; vazvratQty: number; vazvratSum: number }[];
  savdoTab: string; setSavdoTab: React.Dispatch<React.SetStateAction<'kunlik' | 'dokonlar' | 'mahsulotlar'>>;
  fmtDateRu: (d: string) => string; fmt0: (n: number) => string;
}) {
  // Berilgan = Tarix sessiyalarining snapshot'idan, har bir invoice'ning dateIso'si
  // FAYL NOMI (sessionDate) bo'yicha guruhlanadi — jonli invoice'lar invNo bo'yicha
  // ustiga yozilgani uchun ular ishlatilmaydi.
  const dayMap: Record<string, { berilgan: number; vazvrat: number; count: number }> = {};
  for (const inv of savdoInvoices) {
    const d = inv.dateIso;
    if (!dayMap[d]) dayMap[d] = { berilgan: 0, vazvrat: 0, count: 0 };
    dayMap[d].berilgan += inv.sumTotal;
    dayMap[d].count += 1;
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
  const totBerilgan = savdoInvoices.reduce((s, inv) => s + inv.sumTotal, 0);
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
  // Mahsulotlar: session invoicelardan hisoblash (savdoAnalytics live emas)
  const prodMap: Record<string, { sku: string; name: string; berilganQty: number; berilganSum: number; vazvratQty: number; vazvratSum: number }> = {};
  for (const inv of savdoInvoices) {
    for (const line of (inv.lines || [])) {
      if (!line.sku || !(line.qty > 0)) continue;
      if (!prodMap[line.sku]) prodMap[line.sku] = { sku: line.sku, name: (line as any).name || line.sku, berilganQty: 0, berilganSum: 0, vazvratQty: 0, vazvratSum: 0 };
      prodMap[line.sku].berilganQty += line.qty;
      prodMap[line.sku].berilganSum += line.total || 0;
    }
  }
  for (const vr of vazvratRows) {
    const k = vr.sapCode;
    if (!k) continue;
    if (!prodMap[k]) prodMap[k] = { sku: k, name: vr.productName || k, berilganQty: 0, berilganSum: 0, vazvratQty: 0, vazvratSum: 0 };
    prodMap[k].vazvratQty += vr.qty || 0;
    prodMap[k].vazvratSum += vr.totalWithVat || 0;
  }
  const prodRows = Object.values(prodMap).sort((a, b) => b.berilganSum - a.berilganSum);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="kpis kpis-3">
        <Kpi label="BERILGAN" value={fmt0(totBerilgan)} tone="ok" icon={<Truck size={15} />} />
        <Kpi label="QAYTARMA" value={fmt0(totVazvrat)} tone="danger" icon={<RefreshCcw size={15} />} valueStyle={totVazvrat > 0 ? { color: 'var(--danger)' } : undefined} />
        <Kpi label="SAVDO" value={fmt0(totSavdo)} accent tone="accent" icon={<TrendingUp size={15} />} />
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
            <thead><tr><th>Sana</th><th className="right">Hujjat</th><th className="right">Berilgan</th><th className="right">Qaytarma</th><th className="right">Savdo</th></tr></thead>
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
              <td className="right mono" style={{ fontWeight: 700 }}>{savdoInvoices.length}</td>
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
              {prodRows.map((r) => (
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
                <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>ZAKAZ</th>
                <th style={{ textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--danger)' }}>KAMAYDI</th>
                <th style={{ textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--ok)' }}>BERILDI</th>
                <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>SUMMA (SO'M)</th>
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
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>{fmt0(row.initTotal)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, color: row.reduced > 0 ? 'var(--danger)' : 'var(--muted)', fontWeight: row.reduced > 0 ? 800 : 400 }}>
                        {row.reduced > 0 ? `−${fmt0(row.reduced)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ok)', fontWeight: 800 }}>{fmt0(row.givenQty)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>{fmt0(row.givenSum)}</td>
                    </tr>
                    {isOpen && invRows.map(inv => {
                      const line = inv.lines[row.index];
                      const subInit = line?.init || 0;
                      const subQty = line?.qty || 0;
                      const subReduced = subInit - subQty;
                      return (
                      <tr key={`${row.index}-${inv.invNo}`} className="prod-sub-row">
                        <td />
                        <td style={{ paddingLeft: 28, fontSize: 12 }}>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--ok)', fontWeight: 700, marginRight: 6 }}>{inv.invNo}</span>
                          <span style={{ color: 'var(--muted)' }}>{inv.market}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>{fmt0(subInit)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: subReduced > 0 ? 'var(--danger)' : 'var(--muted)', fontWeight: subReduced > 0 ? 700 : 400 }}>
                          {subReduced > 0 ? `−${fmt0(subReduced)}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ok)', fontWeight: 600 }}>{fmt0(subQty)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt0(line?.total || 0)}</td>
                      </tr>
                      );
                    })}
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
                <th style={{ textAlign: 'right' }}>Hujjat</th>
                <th style={{ textAlign: 'right' }}>Dona</th>
                <th style={{ textAlign: 'right' }}>Summa (so'm)</th>
                <th style={{ textAlign: 'right' }}>Grafik</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m, i) => {
                const isOpen = peekMarket === m.storeCode;
                const mInvs = isOpen ? invoices.filter(inv => inv.storeCode === m.storeCode) : [];
                const barPct = Math.round((m.sum / (markets[0]?.sum || 1)) * 100);
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
                      <td style={{ width: 160, paddingRight: 16 }}>
                        <div style={{ height: 8, borderRadius: 4, background: 'rgba(var(--ink-rgb),0.08)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${barPct}%`, borderRadius: 4, background: 'var(--honey)', transition: 'width 0.3s' }} />
                        </div>
                      </td>
                    </tr>
                    {isOpen && mInvs.map(inv => {
                      const invOpen = peekInv === inv.invNo;
                      const invLines = catalog.map((p, pi) => ({ name: p.name, qty: inv.lines[pi]?.qty || 0, total: inv.lines[pi]?.total || 0 })).filter(l => l.qty > 0);
                      return (
                        <React.Fragment key={inv.invNo}>
                          <tr className="prod-sub-row" style={{ cursor: 'pointer' }} onClick={() => setPeekInv(invOpen ? null : inv.invNo)}>
                            <td />
                            <td style={{ paddingLeft: 28, fontSize: 12 }} colSpan={2}>
                              <span className={`prod-chevron${invOpen ? ' open' : ''}`} style={{ fontSize: 13 }}>›</span>
                              <span style={{ fontFamily: 'var(--mono)', color: 'var(--ok)', fontWeight: 700, marginRight: 8 }}>№{inv.invNo}</span>
                              <span style={{ color: 'var(--muted)', marginRight: 6 }}>{inv.dateIso}</span>
                              {inv.order && <span style={{ color: 'var(--muted)', fontSize: 11 }}>{inv.order}</span>}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ok)', fontWeight: 600 }}>{fmt0(inv.sumQty)}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{fmt0(inv.sumTotal)}</td>
                            <td />
                          </tr>
                          {invOpen && invLines.map(l => (
                            <tr key={l.name} className="prod-sub-row">
                              <td colSpan={3} style={{ paddingLeft: 56, fontSize: 11, color: 'var(--muted)' }}>{l.name}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ok)' }}>{fmt0(l.qty)}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>{fmt0(l.total)}</td>
                              <td />
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

function Kpi({ label, value, accent, valueStyle, tone, icon }: {
  label: string; value: string; accent?: boolean;
  valueStyle?: React.CSSProperties;
  tone?: 'ok' | 'danger' | 'accent';
  icon?: React.ReactNode;
}) {
  const toneClass = tone ? `tone-${tone}` : (accent ? 'tone-accent' : '');
  return (
    <div className={`kpi ${toneClass}`.trim()}>
      <div className="kpi-top">
        {icon && <span className="kpi-icon">{icon}</span>}
        <span className="kpi-label">{label}</span>
      </div>
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

// ─── Reusable date range picker with presets ──────────────────────────────────
// ─── Calendar localization ────────────────────────────────────────────────
const MONTHS_UZ_FULL = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
const MONTHS_UZ_SHORT = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek'];
const WEEKDAYS_UZ = ['Du','Se','Ch','Pa','Ju','Sh','Ya'];

function CalIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

// Single-month calendar grid with range highlighting.
function CalendarPanel({ from, to, anchor, todayStr, isoFn, parseFn, onPick }: {
  from: string; to: string; anchor: string | null; todayStr: string;
  isoFn: (d: Date) => string; parseFn: (s: string) => Date; onPick: (ds: string) => void;
}) {
  const seed = parseFn(to || from || todayStr);
  const [view, setView] = React.useState({ y: seed.getFullYear(), m: seed.getMonth() });
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const firstDow = (() => { const d = new Date(view.y, view.m, 1).getDay(); return d === 0 ? 6 : d - 1; })();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const prev = () => setView(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const next = () => setView(v => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));

  return (
    <div className="cal-panel">
      <div className="cal-nav">
        <button type="button" className="cal-arrow" onClick={prev} aria-label="Oldingi oy">‹</button>
        <span className="cal-title">{MONTHS_UZ_FULL[view.m]} {view.y}</span>
        <button type="button" className="cal-arrow" onClick={next} aria-label="Keyingi oy">›</button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS_UZ.map(w => <span key={w} className="cal-wd">{w}</span>)}
      </div>
      <div className="cal-grid">
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const ds = isoFn(new Date(view.y, view.m, d));
          const isAnchor = ds === anchor;
          const isStart = ds === from && !anchor;
          const isEnd = ds === to && !anchor;
          const inRange = !!from && !!to && !anchor && ds > from && ds < to;
          const cls = ['cal-day'];
          if (isAnchor || isStart || isEnd) cls.push('cal-day-sel');
          else if (inRange) cls.push('cal-day-range');
          if (ds === todayStr) cls.push('cal-day-today');
          return <button key={`d${i}`} type="button" className={cls.join(' ')} onClick={() => onPick(ds)}>{d}</button>;
        })}
      </div>
    </div>
  );
}

function DateRangePicker({ from, to, onChange, setFrom, setTo }: {
  from: string; to: string;
  onChange?: (from: string, to: string) => void;
  setFrom?: (v: string) => void; setTo?: (v: string) => void;
  inputStyle?: React.CSSProperties;
}) {
  const [open, setOpen] = React.useState(false);
  const [anchor, setAnchor] = React.useState<string | null>(null);

  // LOCAL date (timezone-safe) — toISOString() UTC qaytaradi va off-by-one beradi
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parse = (s: string) => { const [y, m, d] = (s || '').split('-').map(Number); return new Date(y || 2000, (m || 1) - 1, d || 1); };
  const todayStr = iso(new Date());

  const apply = React.useCallback((f: string, t: string) => {
    if (onChange) { onChange(f, t); }
    else { setFrom?.(f); setTo?.(t); }
  }, [onChange, setFrom, setTo]);

  const presets: { label: string; from: string; to: string }[] = React.useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const dayOfWeek = now.getDay() || 7;
    const monDate = new Date(now); monDate.setDate(now.getDate() - dayOfWeek + 1);
    const prevMonthStart = new Date(y, m - 1, 1);
    const prevMonthEnd   = new Date(y, m, 0);
    return [
      { label: 'Bugun',       from: todayStr,            to: todayStr },
      { label: 'Bu hafta',    from: iso(monDate),         to: todayStr },
      { label: 'Bu oy',       from: iso(new Date(y,m,1)), to: todayStr },
      { label: "O'tgan oy",   from: iso(prevMonthStart),  to: iso(prevMonthEnd) },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr]);

  const activeLabel = presets.find(p => p.from === from && p.to === to)?.label;
  const fmtShort = (s: string) => { if (!s) return '—'; const d = parse(s); return `${d.getDate()} ${MONTHS_UZ_SHORT[d.getMonth()]}`; };
  const triggerLabel = (from || to) ? `${fmtShort(from)} – ${fmtShort(to)}` : 'Sana tanlang';

  const close = () => { setOpen(false); setAnchor(null); };

  // Esc closes the modal.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const pick = (ds: string) => {
    if (!anchor) { setAnchor(ds); apply(ds, ds); }
    else {
      const lo = ds < anchor ? ds : anchor;
      const hi = ds < anchor ? anchor : ds;
      apply(lo, hi); setAnchor(null); setOpen(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', flexShrink: 0 }}>
      <button type="button" onClick={() => { setAnchor(null); setOpen(true); }} className="cal-trigger" data-active={!!(from || to)}>
        <CalIcon />
        <span className="cal-trigger-label">{activeLabel ?? triggerLabel}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div className="cal-backdrop" onMouseDown={close} />
          <div className="cal-modal" role="dialog" aria-modal="true">
            <div className="cal-modal-head">
              <span className="cal-modal-title">Sana oralig&apos;i</span>
              <button type="button" className="cal-close" onClick={close} aria-label="Yopish">×</button>
            </div>
            <div className="cal-presets-row">
              {presets.map(p => (
                <button key={p.label} type="button" className="cal-preset" data-active={from === p.from && to === p.to}
                  onClick={() => { apply(p.from, p.to); close(); }}>
                  {p.label}
                </button>
              ))}
            </div>
            <CalendarPanel from={from} to={to} anchor={anchor} todayStr={todayStr} isoFn={iso} parseFn={parse} onPick={pick} />
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ─── Excel 365 logo SVG ───────────────────────────────────────────────────────
function ExcelIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="xg1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#18884F"/>
          <stop offset="100%" stopColor="#107C41"/>
        </linearGradient>
        <linearGradient id="xg2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#33C481"/>
          <stop offset="50%" stopColor="#21A366"/>
          <stop offset="100%" stopColor="#107C41"/>
        </linearGradient>
      </defs>
      {/* White sheet background */}
      <rect x="10" y="1" width="13" height="22" rx="2" fill="#fff"/>
      {/* Grid lines */}
      <line x1="10" y1="7"  x2="23" y2="7"  stroke="#E0E0E0" strokeWidth="0.6"/>
      <line x1="10" y1="12" x2="23" y2="12" stroke="#E0E0E0" strokeWidth="0.6"/>
      <line x1="10" y1="17" x2="23" y2="17" stroke="#E0E0E0" strokeWidth="0.6"/>
      <line x1="16.5" y1="1" x2="16.5" y2="23" stroke="#E0E0E0" strokeWidth="0.6"/>
      {/* Green document overlay */}
      <rect x="10" y="1" width="13" height="22" rx="2" fill="url(#xg2)" opacity="0.15"/>
      {/* Left green panel */}
      <rect x="0" y="3" width="14" height="18" rx="2" fill="url(#xg1)"/>
      {/* X letter */}
      <text x="2.2" y="16.5" fontSize="11" fontWeight="900" fill="#fff" fontFamily="Segoe UI,Arial,sans-serif"
        style={{ letterSpacing: '-1px' }}>X</text>
    </svg>
  );
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
    nav_analytics:'Statistika', nav_settings:'Sozlamalar',
    nav_preferences:'Shaxsiy',
    pref_bg:"Orqa fon", pref_bg_hint:"Oq yoki boshqa açiq rang", pref_bg_custom:"O'z rangim", pref_reset:'Tiklash',
    pref_density:'Zichlik', pref_density_hint:"Qatorlar va elementlar orasidagi masofa",
    pref_tight:'Eng ixcham', pref_compact:'Ixcham', pref_cozy:"O'rtacha", pref_comfortable:'Keng',
    pref_accent:"Rang uslubi", pref_accent_hint:"Tugmalar va asosiy elementlar rangi",
    pref_lang:'Til', pref_lang_hint:'Interfeys tili',
    // topbar
    lbl_invoices:'hujjat', lbl_pcs:'dona', lbl_sum:"so'm", lbl_unsaved:'saqlanmagan',
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
    sap_title:'SAP import', sap_meta_ready:'hujjat tayyor', sap_meta_empty:'Excel yukla',
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
    stats_title:'Statistika', stats_invoices:'Hujjatlar',
    stats_items:'Dona', stats_sum:'Summa', stats_avg:'O\'rtacha',
    analytics_title:'Statistika',
    settings_cat:'Mahsulotlar', settings_req:'Tafsilot',
    settings_exc:'Istisno kunlar', settings_hist:'Tarix', settings_access:'Kirish',
    settings_cat_title:'Mahsulotlar', settings_req_title:'Tafsilot',
    settings_hist_title:'Sessiya tarixi', settings_users_title:'Foydalanuvchilar',
    settings_supplier:'Yetkazib beruvchi', settings_receiver:'Qabul qiluvchi',
    settings_contract:'Shartnoma',
    modal_manual:'Qo\'lda hujjat', modal_order:'Yangi buyurtma', modal_client:'Yangi mijoz',
    // tarix
    tarix_hujjat:'Hujjatlar', tarix_qaytarma:'Qaytarma', tarix_buyurtma:'Buyurtma', tarix_ishonchnoma:'Ishonchnoma',
    tarix_qaytgan:'Qaytgan',
    tarix_load:'Yuklash', tarix_delete:"O'chirish",
    tarix_restored:"tiklandi",
    // pivot / qaytarma
    pv_dan:'Dan', pv_gacha:'Gacha', pv_mahsulot:'Mahsulot', pv_jami:'Jami',
    pv_kpi_qaytarma:'Jami qaytarma', pv_kpi_mahsulot:'Mahsulot turlari',
    pv_kpi_market:'Marketlar', pv_kpi_kunlar:'Kunlar',
    pv_xil_tovar:'xil tovar', pv_ta_dokon:"ta do'kon", pv_ta_yozuv:'ta yozuv', pv_dona:'dona',
    pv_empty:"Qaytarma tarixi yo'q",
    pv_upload_btn:'Qaytarma Excel',
    pv_del_all:"Barcha qaytarma yozuvlarini o'chirish?",
    pv_del_date:"sanasidagi barcha qaytarmalarni o'chirish?",
    // dov
    dov_save:'Saqlash', dov_saved:'Saqlandi ✓', dov_print:'Chop etish',
    dov_del_confirm:"Bu ishonchnomani tarixdan o'chirmoqchimisiz?",
    // days
    days:['Du','Se','Ch','Pa','Ju','Sh','Ya'],
    days_full:['Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'],
  },
  ru: {
    nav_orders:'Заказы', nav_register:'Реестр', nav_matrix:'Таблица',
    nav_docs:'Документы', nav_dispatch:'Маршрут', nav_schedule:'График',
    nav_stats:'Статистика', nav_ops:'Операции', nav_clients:'Клиенты',
    nav_analytics:'Аналитика', nav_settings:'Настройки',
    nav_preferences:'Настройки',
    pref_bg:'Фон', pref_bg_hint:'Белый или светлый цвет фона', pref_bg_custom:'Свой цвет', pref_reset:'Сбросить',
    pref_density:'Плотность', pref_density_hint:'Расстояние между строками и элементами',
    pref_tight:'Очень плотно', pref_compact:'Компактно', pref_cozy:'Обычно', pref_comfortable:'Просторно',
    pref_accent:'Цветовой стиль', pref_accent_hint:'Цвет кнопок и основных элементов',
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
    docs_title:'Документы', docs_print_sel:'Печать выбранных',
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
    dispatch_title:'Маршрут', dispatch_empty:'Сначала сформируйте накладные',
    schedule_title:'График доставки',
    schedule_upload:'Загрузить график', schedule_view_only:'Режим просмотра',
    stats_title:'Статистика', stats_invoices:'Накладных',
    stats_items:'Позиций', stats_sum:'Сумма', stats_avg:'Средний чек',
    analytics_title:'Statistika',
    settings_cat:'Каталог', settings_req:'Реквизиты',
    settings_exc:'Исключения', settings_hist:'История', settings_access:'Доступ',
    settings_cat_title:'Каталог товаров', settings_req_title:'Реквизиты',
    settings_hist_title:'История сессий', settings_users_title:'Пользователи',
    settings_supplier:'Поставщик', settings_receiver:'Получатель',
    settings_contract:'Договор',
    modal_manual:'Накладная вручную', modal_order:'Новый заказ', modal_client:'Новый клиент',
    // tarix
    tarix_hujjat:'Документы', tarix_qaytarma:'Возвраты', tarix_buyurtma:'Заказы', tarix_ishonchnoma:'Доверенность',
    tarix_qaytgan:'Возврат',
    tarix_load:'Загрузить', tarix_delete:'Удалить',
    tarix_restored:'восстановлен',
    // pivot / qaytarma
    pv_dan:'С', pv_gacha:'По', pv_mahsulot:'Товар', pv_jami:'Итого',
    pv_kpi_qaytarma:'Всего возвратов', pv_kpi_mahsulot:'Видов товара',
    pv_kpi_market:'Магазинов', pv_kpi_kunlar:'Дней',
    pv_xil_tovar:'видов', pv_ta_dokon:'магазинов', pv_ta_yozuv:'записей', pv_dona:'шт',
    pv_empty:'Нет истории возвратов',
    pv_upload_btn:'Возврат Excel',
    pv_del_all:'Удалить все записи возвратов?',
    pv_del_date:'удалить все возвраты за эту дату?',
    // dov
    dov_save:'Сохранить', dov_saved:'Сохранено ✓', dov_print:'Печать',
    dov_del_confirm:'Удалить эту доверенность из истории?',
    // days
    days:['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],
    days_full:['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'],
  },
  en: {
    nav_orders:'Orders', nav_register:'Registry', nav_matrix:'Table',
    nav_docs:'Documents', nav_dispatch:'Dispatch', nav_schedule:'Schedule',
    nav_stats:'Statistics', nav_ops:'Operations', nav_clients:'Clients',
    nav_analytics:'Analytics', nav_settings:'Settings',
    nav_preferences:'Preferences',
    pref_bg:'Background', pref_bg_hint:'White or light background', pref_bg_custom:'Custom color', pref_reset:'Reset',
    pref_density:'Density', pref_density_hint:'Row and element spacing',
    pref_tight:'Ultra compact', pref_compact:'Compact', pref_cozy:'Normal', pref_comfortable:'Comfortable',
    pref_accent:'Color style', pref_accent_hint:'Color of buttons and key elements',
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
    docs_title:'Documents', docs_print_sel:'Print selected',
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
    analytics_title:'Statistika',
    settings_cat:'Catalog', settings_req:'Requisites',
    settings_exc:'Exceptions', settings_hist:'History', settings_access:'Access',
    settings_cat_title:'Product catalog', settings_req_title:'Requisites',
    settings_hist_title:'Session history', settings_users_title:'Users',
    settings_supplier:'Supplier', settings_receiver:'Receiver',
    settings_contract:'Contract',
    modal_manual:'Manual invoice', modal_order:'New order', modal_client:'New client',
    // tarix
    tarix_hujjat:'Documents', tarix_qaytarma:'Returns', tarix_buyurtma:'Orders', tarix_ishonchnoma:'Power of Attorney',
    tarix_qaytgan:'Returned',
    tarix_load:'Load', tarix_delete:'Delete',
    tarix_restored:'restored',
    // pivot / returns
    pv_dan:'From', pv_gacha:'To', pv_mahsulot:'Product', pv_jami:'Total',
    pv_kpi_qaytarma:'Total returns', pv_kpi_mahsulot:'Product types',
    pv_kpi_market:'Stores', pv_kpi_kunlar:'Days',
    pv_xil_tovar:'types', pv_ta_dokon:'stores', pv_ta_yozuv:'records', pv_dona:'pcs',
    pv_empty:'No return history',
    pv_upload_btn:'Returns Excel',
    pv_del_all:'Delete all return records?',
    pv_del_date:'delete all returns for this date?',
    // dov
    dov_save:'Save', dov_saved:'Saved ✓', dov_print:'Print',
    dov_del_confirm:'Remove this power of attorney from history?',
    // days
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
              </tr>
            </thead>
            <tbody>
              {scheduleRows.map((row, i) => {
                const todayOk = row.days[dow];
                const inInvoices = invoices.some((inv) => inv.storeCode === row.storeCode);
                return (
                  <tr key={i}>
                    <td className="sched-freeze sched-freeze-1" style={{ fontSize: 12, color: 'var(--muted)' }}>{row.storeCode}</td>
                    <td className="sched-freeze sched-freeze-2"><span className="sched-code-inline">{row.storeCode}</span><b>{row.market.replace(/^Korzinka\s*[-–]\s*/i, '')}</b></td>
                    <td className="sched-freeze sched-freeze-3">{row.driver}</td>
                    {row.days.map((on, di) => (
                      <td key={di} className="sched-day" style={{ background: di === dow && on ? 'rgba(34,197,94,0.15)' : di === dow && !on ? 'rgba(239,68,68,0.08)' : '' }}>
                        {on ? <span>✅</span> : <span style={{ color: '#ccc' }}>·</span>}
                      </td>
                    ))}
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

  // Total visible part columns → equal width
  const totalPartCols = useMemo(() =>
    drivers.reduce((s, _, di) => hiddenDrivers.has(di) ? s : s + (driverPartCounts[di] ?? 1), 0),
  [drivers, hiddenDrivers, driverPartCounts]);
  const marketColW = 160;
  const partColW = Math.max(36, Math.floor((Math.min(window.innerWidth, 700) - marketColW) / Math.max(1, totalPartCols)));

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
    <p>${dateFmt} · ${filteredInvoices.length} hujjat · ${grandTotal} dona</p>
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
                  <th className="dispatch-name-cell" rowSpan={2} style={{ minWidth: marketColW, width: marketColW, position: 'sticky', left: 0, zIndex: 5, top: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--muted)' }}>{T('lbl_store')}</span>
                  </th>
                  {drivers.map((d, di) => {
                    if (hiddenDrivers.has(di)) return null;
                    const partCount = driverPartCounts[di] ?? 1;
                    const clr = DISPATCH_COLORS[di % DISPATCH_COLORS.length];
                    const isExtra = di >= baseDrivers.length;
                    return (
                      <th key={di} colSpan={partCount} style={{ textAlign: 'center', width: partColW * partCount, borderLeft: '2px solid rgba(0,0,0,0.18)', background: clr.header, color: clr.text, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3, padding: '3px 6px', height: 28, verticalAlign: 'middle' }}>
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
                        <th key={`${di}-${pi}`} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: clr.dot, width: partColW, minWidth: partColW, maxWidth: partColW, borderLeft: pi === 0 ? '2px solid rgba(0,0,0,0.15)' : undefined, whiteSpace: 'nowrap', padding: '2px 2px', height: 20 }}>
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, lineHeight: 1.2 }}>
                          <span style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', fontFamily: 'var(--sans)', letterSpacing: '-0.01em' }}>
                            {mkt.market.replace(/\s*\/\d+$/, '')}<span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: 10, marginLeft: 3 }}>({mkt.storeCode})</span>
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
                                  width: 20, height: 20, borderRadius: '50%',
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
