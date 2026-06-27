// Shared UI types, constants, and pure helpers extracted from app/page.tsx.
import { CatalogProduct } from '@/types/domain';
import { ApiError } from './api';

export type View = 'register' | 'matrix' | 'documents' | 'stats' | 'settings' | 'operations' | 'customers' | 'analytics' | 'orders' | 'schedule' | 'dispatch' | 'undelivered' | 'preferences' | 'manual-list';
export type SettingsView = 'catalog' | 'requisites' | 'sessions' | 'users' | 'exceptions' | 'doverennost' | 'trash';
export type Theme = 'dark' | 'light';
export type Density = 'tight' | 'compact' | 'cozy' | 'comfortable' | 'spacious';

/** "#rrggbb" → "r,g,b" channel string for rgba(var(--x-rgb), …) tokens. */
export function hexToRgbChannels(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '14,95,191';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** Darken/lighten a "#rrggbb" by `percent` (-1..1; negative = darker). */
export function shadeHexColor(hex: string, percent: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const f = (c: number) => clamp(c + (percent < 0 ? c : 255 - c) * percent);
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Curated backgrounds guaranteed to match the rest of the UI. `theme` is the
// readable text/surface theme each background pairs with.
export const BG_PRESETS: { id: string; label: string; value: string; theme: Theme }[] = [
  { id: 'white',    label: 'Oq',       value: '#ffffff', theme: 'light' },
  { id: 'paper',    label: 'Paper',    value: 'linear-gradient(180deg, #eef1f6 0%, #e4e9f1 100%)', theme: 'light' },
];

// Relative luminance of a #rrggbb color → decide light vs dark text/surfaces.
export function isLightColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6;
}
export type AnalyticsTab = 'overview' | 'products' | 'inventory' | 'customers';
export type Toast = { kind: 'ok' | 'err' | 'info'; text: string } | null;

export const TOKEN_KEY = 'gde_tort_token';
/** Initial vazvrat fetch window. Shown in the UI so users know the visible range. */
export const VAZVRAT_DEFAULT_DAYS = 90;

/** "Korzinka Go - Bashlyk /1" → "Bashlyk" */
export function shortMkt(name: string): string {
  // Remove "korzinka" word and its separators (case-insensitive)
  // e.g. "korzinka - Abay /1" → "Abay", "korzinka Abay" → "Abay", "Abay /1" → "Abay"
  let s = name.replace(/^korzinka\s*[-,]?\s*/i, '').trim();
  // Remove trailing store number like "/1", "/2"
  s = s.replace(/\s*\/\d+$/, '').trim();
  return s || name.replace(/\s*\/\d+$/, '').trim();
}

export function groupByDateKey<T>(items: T[], getDate: (item: T) => string): { dateKey: string; items: T[] }[] {
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

export type HistoryEvent =
  | { kind: 'nakl'; dateKey: string; data: import('@/types/domain').SessionSummary }
  | { kind: 'dov';  dateKey: string; data: import('@/types/domain').DovEntry }
  | { kind: 'qayt'; dateKey: string; data: import('@/types/domain').Invoice }
  | { kind: 'vazt'; dateKey: string; data: import('@/types/domain').VazvratRecord };

export const KIND_STYLE: Record<string, { labelKey: string; color: string; bg: string }> = {
  nakl: { labelKey: 'tarix_hujjat',      color: '#2563eb', bg: 'rgba(37,99,235,0.09)' },
  dov:  { labelKey: 'tarix_ishonchnoma', color: '#7c3aed', bg: 'rgba(124,58,237,0.09)' },
  qayt: { labelKey: 'tarix_qaytgan',     color: '#dc2626', bg: 'rgba(220,38,38,0.09)' },
  vazt: { labelKey: 'tarix_qaytarma',    color: '#d97706', bg: 'rgba(217,119,6,0.09)' },
};

// ─── TarixPane: tabbed history ────────────────────────────────────────────────
export type TarixTab = 'nakl' | 'vazvrat' | 'zakas' | 'dov';

export function updateCatalogDraft(
  current: CatalogProduct[],
  index: number,
  patch: Partial<CatalogProduct>
): CatalogProduct[] {
  return current.map((product, productIndex) => (productIndex === index ? { ...product, ...patch } : product));
}


export const MONTHS_UZ_FULL = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
export const MONTHS_UZ_SHORT = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek'];
export const WEEKDAYS_UZ = ['Du','Se','Ch','Pa','Ju','Sh','Ya'];

export function getError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Неизвестная ошибка';
}


export type Lang = 'uz' | 'ru' | 'en';
export const I18N: Record<Lang, Record<string, string | string[]>> = {
  uz: {
    // nav
    nav_orders:'Buyurtmalar', nav_register:"Ro'yxat", nav_matrix:'Jadval',
    nav_docs:'Hujjatlar', nav_dispatch:'Marshrut', nav_schedule:'Grafik',
    nav_stats:'Statistika', nav_ops:'Operatsiyalar', nav_clients:'Mijozlar',
    nav_analytics:'Statistika', nav_settings:'Sozlamalar',
    nav_preferences:'Shaxsiy',
    pref_bg:"Orqa fon", pref_bg_hint:"Oq yoki boshqa açiq rang", pref_bg_custom:"O'z rangim", pref_reset:'Tiklash',
    pref_density:'Zichlik', pref_density_hint:"Qatorlar va elementlar orasidagi masofa",
    pref_tight:'Eng ixcham', pref_compact:'Ixcham', pref_cozy:"O'rtacha", pref_comfortable:'Keng', pref_spacious:'Juda keng', pref_custom_color:'Maxsus rang', pref_custom_color_hint:'Istalgan rangni tanlang — butun ilovaga qo‘llaniladi.', pref_apply:'Qo‘llash', pref_applied:'Qo‘llandi',
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
    pref_tight:'Очень плотно', pref_compact:'Компактно', pref_cozy:'Обычно', pref_comfortable:'Просторно', pref_spacious:'Очень просторно', pref_custom_color:'Свой цвет', pref_custom_color_hint:'Выберите любой цвет — применится ко всему приложению.', pref_apply:'Применить', pref_applied:'Применено',
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
    pref_tight:'Ultra compact', pref_compact:'Compact', pref_cozy:'Normal', pref_comfortable:'Comfortable', pref_spacious:'Spacious', pref_custom_color:'Custom color', pref_custom_color_hint:'Pick any color — applied across the whole app.', pref_apply:'Apply', pref_applied:'Applied',
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
export function t(lang: Lang, key: string): string {
  const val = I18N[lang][key];
  return Array.isArray(val) ? val.join(',') : (val ?? key);
}
export function tDays(lang: Lang): string[] { return I18N[lang].days as string[]; }
export function tDaysFull(lang: Lang): string[] { return I18N[lang].days_full as string[]; }

export const DISPATCH_COLORS = [
  { header:'rgba(76,155,234,0.85)',  text:'#ffffff', dot:'#4c9bea',  cell:'rgba(76,155,234,0.10)' },
  { header:'rgba(70,191,114,0.85)',  text:'#ffffff', dot:'#46bf72',  cell:'rgba(70,191,114,0.10)' },
  { header:'rgba(124,124,230,0.85)', text:'#ffffff', dot:'#7c7ce6',  cell:'rgba(124,124,230,0.10)' },
  { header:'rgba(233,166,58,0.85)',  text:'#ffffff', dot:'#e9a63a',  cell:'rgba(233,166,58,0.10)' },
  { header:'rgba(232,79,106,0.85)',  text:'#ffffff', dot:'#e84f6a',  cell:'rgba(232,79,106,0.10)' },
  { header:'rgba(64,191,180,0.85)',  text:'#ffffff', dot:'#40bfb4',  cell:'rgba(64,191,180,0.10)' },
];

