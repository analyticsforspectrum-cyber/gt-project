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
  nakl:   { labelKey: 'tag_docs',          color: '#2563eb', bg: 'rgba(37,99,235,0.09)' },
  manual: { labelKey: 'tarix_qolda',       color: '#0891b2', bg: 'rgba(8,145,178,0.09)' },
  zakas:  { labelKey: 'tarix_buyurtma',    color: '#6366f1', bg: 'rgba(99,102,241,0.09)' },
  dov:    { labelKey: 'tarix_ishonchnoma', color: '#7c3aed', bg: 'rgba(124,58,237,0.09)' },
  qayt:   { labelKey: 'tarix_qaytgan',     color: '#dc2626', bg: 'rgba(220,38,38,0.09)' },
  vazt:   { labelKey: 'tarix_qaytarma',    color: '#dc2626', bg: 'rgba(220,38,38,0.09)' },
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

export function getError(error: unknown, lang: Lang = 'ru'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return t(lang, 'err_unknown');
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
    pref_bg:"Orqa fon", pref_bg_hint:"Oq yoki boshqa ochiq rang", pref_bg_custom:"O'z rangim", pref_reset:'Tiklash',
    pref_density:'Zichlik', pref_density_hint:"Qatorlar va elementlar orasidagi masofa",
    pref_tight:'Eng ixcham', pref_compact:'Ixcham', pref_cozy:"O'rtacha", pref_comfortable:'Keng', pref_spacious:'Juda keng', pref_custom_color:'Maxsus rang', pref_custom_color_hint:'Istalgan rangni tanlang — butun ilovaga qo‘llaniladi.', pref_apply:'Qo‘llash', pref_applied:'Qo‘llandi', pref_fontsize:'Shrift o‘lchami', pref_fontsize_hint:'Butun tizim uchun yozuv kattaligi', pref_font_s:'Kichik', pref_font_m:'O‘rta', pref_font_l:'Katta', pref_font_xl:'Juda katta',
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
    err_unknown:"Noma'lum xato",
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
    tarix_hujjat:'Hujjatlar', tag_docs:'Hujjat', tarix_qaytarma:'Qaytarma', tarix_buyurtma:'Buyurtma', tarix_qolda:"Qo'lda", tarix_hammasi:'Hammasi', tarix_ishonchnoma:'Ishonchnoma',
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
    // toasts ({n}/{m}/{name} interpolated in code)
    toast_status_not_updated:'Holat yangilanmadi — tarmoq xatosi.',
    toast_data_load_failed:"Ma'lumotlar yuklanmadi. Sahifani yangilang.",
    toast_login_ok:'Tizimga kirildi',
    toast_upload_sap:'SAP faylini yuklang',
    toast_parse_ready:'Tayyor: {n} ta hujjat. "Saqlash" tugmasini bosing!',
    toast_session_saved:'Sessiya saqlandi: {name}',
    toast_no_records:'Hech qanday yozuv topilmadi',
    toast_vazvrat_loaded:'{n} ta qaytarma yozuv yuklandi',
    toast_need_store_qty:"Do'kon kodi va kamida 1 mahsulot sonini kiriting",
    toast_session_loaded:'Sessiya yuklandi: {name}',
    toast_session_deleted:"Sessiya o'chirildi",
    toast_catalog_saved:'Katalog saqlandi',
    toast_product_deleted:"Mahsulot o'chirildi",
    toast_catalog_reset:'Katalog tiklandi',
    toast_requisites_saved:'Tafsilotlar saqlandi',
    toast_requisites_reset:'Tafsilotlar tiklandi',
    toast_user_created:'Foydalanuvchi yaratildi',
    toast_import_done:'Import {name} yakunlandi',
    toast_invoice_deleted:"№ {n} hujjat o'chirildi",
    toast_invoice_restored:'№ {n} hujjat tiklandi',
    toast_comment_required:'Izoh kiritish majburiy!',
    toast_delivery_cancelled:'Yetkazib berish bekor qilindi',
    toast_order_delivered:'Buyurtma yetkazildi',
    toast_need_client_item:'Mijoz va kamida bitta mahsulot kiriting',
    toast_order_created:'Buyurtma yaratildi',
    toast_no_invoices_print:"Chop etish uchun hujjat yo'q",
    toast_file_loaded:'Fayl yuklandi: {n} qator',
    toast_file_read_error:"Faylni o'qishda xatolik",
    toast_session_name_required:'Sessiya nomini kiriting!',
    toast_invoice_added_one:"№ {n} hujjat qo'shildi", toast_invoice_added_many:"{n} ta hujjat qo'shildi: {nos}",
    // analytics
    an_title:'Analitika',
    kpi_ordered:'Zakaz · keldi', kpi_given:'Berilgan', kpi_returned:'Qaytarma', kpi_net_sales:'Sof savdo',
    an_tab_products:'Mahsulot', an_tab_market:'Market', an_tab_sales:'Savdo', an_tab_returns:'Qaytarma', an_col_ordered:'Kelgan zakaz', an_col_dqty:'Berilgan soni', an_col_dsum:'Berilgan summa', an_col_rqty:'Vazvrat soni', an_col_rsum:'Vazvrat summa', an_col_net:'Savdo summa', an_col_rate:'Rate %',
    nav_undelivered:'Qaytgan',
    preset_today:'Bugun', preset_week:'Bu hafta', preset_month:'Bu oy', preset_prev_month:"O'tgan oy",
    col_day:'Sana', col_store:"Do'kon", col_given_qty:'B.dona', col_returned_qty:'V.dona', col_product_name:'Mahsulot nomi',
    col_ordered:'Zakaz', col_decreased:'Kamaydi', col_given:'Berildi', col_sum:"Summa (so'm)", col_doc:'Hujjat', msg_no_data:"Ma'lumot yo'q",
    an_sub_daily:'Kunlik', an_sub_stores:"Do'konlar", an_sub_products:'Mahsulotlar',
    // login
    login_welcome:'Xush kelibsiz', login_subtitle:"Hisob ma'lumotlaringizni kiriting",
    login_email:'Email', login_password:'Parol', login_submit:'Kirish',
    login_tagline:'Soliq · B2B savdo platformasi', login_system:'boshqaruv tizimi',
    login_hero:'Hujjatlar, analitika, ekspeditsiya va reyestr — bir joyda, real vaqtda.',
    feat_inv:'Hujjatlar', feat_inv_sub:'Avtomatik shakllantirish',
    feat_an_sub:'Savdo · qaytarma · KPI', feat_disp:'Ekspeditsiya', feat_disp_sub:'Marshrut · haydovchilar',
    feat_reg_sub:'Tarix · arxiv · hujjatlar',
    feat_realtime:'Real vaqt', feat_realtime_sub:"Ma'lumotlar", feat_multiuser:"Ko'p foydalanuvchi", feat_multiuser_sub:'Rollar · audit',
    // tables / columns
    col_status:'Status', col_sku:'SKU', col_type:'Tur', col_ref:'Manba', col_file:'Fayl', col_err:'Xato', col_action:'Amal', col_entity:'Obyekt', col_role:'Rol', col_time:'Vaqt', col_market_name:'Market nomi', col_vat:'NDS (+12%)', col_reason:'Bekor qilish sababi', col_num:'№',
    st_cancelled:'Bekor', st_undelivered:'Yetkazilmagan', st_saved:'Saqlandi',
    // register / modals
    undeliver_warn:"Hujjat №{n} uchun yetkazish statusini o'chiryapsiz. Sabab ko'rsatish majburiy:",
    undeliver_ph:"Izoh kiriting (masalan: noto'g'ri belgilandi, mijoz rad etdi...)",
    act_confirm:'Tasdiqlash',
    restore_title:'Hujjat №{n} — tiklash', restore_date:'Yetkazib berish sanasi', restore_items:"Mahsulotlar (sonini o'zgartiring)",
    total_qty:'Jami dona', total_sum:'Jami summa', print_select_title:'Chop etish uchun tanlash', max_label:'Maks', moved_label:"Ko'chirilgan",
    // orders / import
    btn_upload_order:'Buyurtma yuklash', btn_order_history:'Buyurtma tarixi', btn_new_doc:'Yangi hujjat',
    file_choose:'Excel faylni tanlang', file_format:'.xls yoki .xlsx formatda', file_loaded_ok:'Fayl yuklandi',
    doc_from:'Hujjat № dan', session_name_label:'Sessiya nomi', session_name_ph:'— nom kiriting (majburiy)',
    sum_label:'Summa', vazvrat_choose:'Vazvrat Excel faylini tanlang', vazvrat_count:'{n} ta qaytarma yozuvi mavjud',
    loading:'Yuklanmoqda...', empty_no_orders_range:"Bu oraliqda buyurtma yo'q", sessions_count:'{n} ta sessiya',
    manuallist_title:"Qo'lda kiritilgan hujjatlar", empty_manual:"Qo'lda kiritilgan hujjat yo'q", empty_order_history:"Buyurtma tarixi yo'q",
    trash_invoices:'Hujjatlar', trash_sessions:'Sessiyalar', empty_trash_invoices:"O'chirilgan hujjatlar yo'q", empty_trash_sessions:"O'chirilgan sessiyalar yo'q", empty_no_doc_history:"Hujjat tarixi yo'q", empty_no_dov_history:"Ishonchnoma tarixi yo'q", empty_no_history:"Hali tarix yo'q", empty_no_data_range:"Sana oralig'ida ma'lumot yo'q", empty_no_returns_range:"Sana oralig'ida qaytarma yo'q", empty_no_returns:"Qaytarma yo'q", date_range:"Sana oralig'i", undeliver_title:'Yetkazib berishni bekor qilish',
    // manual / order modals
    manual_with_vat:'Narx QQS bilan', manual_add_store:"+ Do'kon", manual_qty_abbr:'Son',
    ph_store_code:'Kod', ph_market_name:'Market nomi', ph_order_no:'№ Zakaz', saving:'Saqlanmoqda…', btn_add_plus:"+ Qo'shish", ph_select_product:'Mahsulotni tanlang',
    // settings
    set_catalog_count:'{n} ta mahsulot', act_refresh:'Yangilash', act_upload:'Yuklash',
    exceptions_help:'Quyidagi sanalarda grafik buzilishlari hisoblanmaydi (bayram, maxsus kun).',
    role_user:'foydalanuvchi', role_admin:'admin', user_active:'faol', user_inactive:"o'chiq", act_enable:'Yoqish', act_disable:"O'chirish",
    tab_doverennost:'Ishonchnoma', tab_trash:'Arxiv',
    // stats
    stats_keldi:'Keldi', stats_order_sum:'Zakaz summa', stats_given_sum:'Berilgan summa', stats_col_schedule:'Grafik',
    // schedule
    sch_saved:'Saqlangan', act_clear:"O'chirish", act_view:"ko'rish", sch_excel_format:'Excel format:',
    sch_exception_day:'Bugun istisno kun — grafik buzilishi hisoblanmaydi',
    sch_off_count:"{n} ta market bugun grafikda yo'q ({day})", sch_not_loaded:'Grafik yuklanmagan',
    sch_all_ok:'Barcha marketlar grafikda ({day})', sch_not_found:'{n} ta market grafikda topilmadi',
    toast_schedule_loaded:'Grafik yuklandi: {n} market, {m} haydovchi', toast_schedule_deleted:"Grafik o'chirildi",
    // undelivered
    undeliv_title:'Yetkazilmagan hujjatlar', undeliv_empty:'Barcha hujjatlar yetkazilgan',
    // confirms / alerts
    confirm_overwrite_session:'"{name}" nomli sessiya mavjud.\n\nUstiga yozilsinmi?\n\n"Bekor" — yangi nom bilan saqlash',
    toast_registry_exists:'"{name}" nomli reestr allaqachon mavjud — qaytadan yaratilmadi',
    confirm_delete_session:"\"{name}\" sessiyasini o'chirilsinmi?", confirm_delete_product:"{name} o'chirilsinmi?",
    confirm_reset_catalog:'Katalogni dastlabki holatga qaytarilsinmi?', confirm_reset_requisites:'Tafsilotlar tiklansinmi?',
    confirm_delete_invoice:"№ {n} hujjat o'chirilsinmi?", alert_no_data_file:"Faylda ma'lumot topilmadi",
    confirm_dup_found:'⚠️ Faylda {n} ta dublikat topildi!', confirm_dup_extra_sum:"Ortiqcha summa: ~{sum} so'm", confirm_dup_auto:'Tizim dublikatlarni AVTOMATIK olib tashlab saqlaydi.\nDavom etasizmi?', dup_more:'va yana {n} ta', dup_extra:'ortiqcha', dup_label:'dublikat',
    // toasts / misc
    toast_stats_error:'Statistikani yuklashda xato', toast_rows_saved:'{n} qator saqlandi',
    aria_prev_month:'Oldingi oy', aria_next_month:'Keyingi oy', aria_close:'Yopish', pick_date:'Sana tanlang', msg_not_found:'Topilmadi', ph_search:'Qidirish...',
    months_short:['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek'],
    months_full:['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'],
    // days
    days:['Du','Se','Ch','Pa','Ju','Sh','Ya'],
    days_full:['Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'],
  },
  ru: {
    nav_orders:'Заказы', nav_register:'Реестр', nav_matrix:'Таблица',
    nav_docs:'Документы', nav_dispatch:'Маршрут', nav_schedule:'График',
    nav_stats:'Статистика', nav_ops:'Операции', nav_clients:'Клиенты',
    nav_analytics:'Аналитика', nav_settings:'Настройки',
    nav_preferences:'Личное',
    pref_bg:'Фон', pref_bg_hint:'Белый или светлый цвет фона', pref_bg_custom:'Свой цвет', pref_reset:'Сбросить',
    pref_density:'Плотность', pref_density_hint:'Расстояние между строками и элементами',
    pref_tight:'Очень плотно', pref_compact:'Компактно', pref_cozy:'Обычно', pref_comfortable:'Просторно', pref_spacious:'Очень просторно', pref_custom_color:'Свой цвет', pref_custom_color_hint:'Выберите любой цвет — применится ко всему приложению.', pref_apply:'Применить', pref_applied:'Применено', pref_fontsize:'Размер шрифта', pref_fontsize_hint:'Размер текста для всего приложения', pref_font_s:'Мелкий', pref_font_m:'Средний', pref_font_l:'Крупный', pref_font_xl:'Очень крупный',
    pref_accent:'Цветовой стиль', pref_accent_hint:'Цвет кнопок и основных элементов',
    pref_lang:'Язык', pref_lang_hint:'Язык интерфейса',
    lbl_invoices:'накл.', lbl_pcs:'шт', lbl_sum:'сум', lbl_unsaved:'не сохранено',
    lbl_logout:'Выйти', lbl_store:'Магазин', lbl_driver:'Водитель',
    lbl_print:'Печать', lbl_save:'Сохранить', lbl_add:'Добавить',
    lbl_cancel:'Отмена', lbl_date:'Дата', lbl_order:'Заказ',
    lbl_product:'Товар', lbl_unit:'Ед.', lbl_qty:'Кол-во',
    lbl_price:'Цена', lbl_total:'Итого', lbl_vat:'НДС',
    lbl_delivered:'Доставлен', lbl_selected:'Выбрано', lbl_restore:'Восстановить', lbl_delete:'Удалить',
    err_unknown:'Неизвестная ошибка',
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
    analytics_title:'Аналитика',
    settings_cat:'Каталог', settings_req:'Реквизиты',
    settings_exc:'Исключения', settings_hist:'История', settings_access:'Доступ',
    settings_cat_title:'Каталог товаров', settings_req_title:'Реквизиты',
    settings_hist_title:'История сессий', settings_users_title:'Пользователи',
    settings_supplier:'Поставщик', settings_receiver:'Получатель',
    settings_contract:'Договор',
    modal_manual:'Накладная вручную', modal_order:'Новый заказ', modal_client:'Новый клиент',
    // tarix
    tarix_hujjat:'Документы', tag_docs:'Док', tarix_qaytarma:'Возвраты', tarix_buyurtma:'Заказы', tarix_qolda:'Вручную', tarix_hammasi:'Все', tarix_ishonchnoma:'Доверенность',
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
    // toasts ({n}/{m}/{name} interpolated in code)
    toast_status_not_updated:'Статус не обновлён — ошибка сети.',
    toast_data_load_failed:'Не удалось загрузить данные. Обновите страницу.',
    toast_login_ok:'Вход выполнен',
    toast_upload_sap:'Загрузите файл SAP',
    toast_parse_ready:'Готово: {n} накл. Нажмите «Сохранить»!',
    toast_session_saved:'Сессия сохранена: {name}',
    toast_no_records:'Записи не найдены',
    toast_vazvrat_loaded:'Загружено возвратов: {n}',
    toast_need_store_qty:'Укажите код магазина и хотя бы 1 товар',
    toast_session_loaded:'Сессия загружена: {name}',
    toast_session_deleted:'Сессия удалена',
    toast_catalog_saved:'Каталог сохранён',
    toast_product_deleted:'Товар удалён',
    toast_catalog_reset:'Каталог сброшен',
    toast_requisites_saved:'Реквизиты сохранены',
    toast_requisites_reset:'Реквизиты сброшены',
    toast_user_created:'Пользователь создан',
    toast_import_done:'Импорт {name} завершён',
    toast_invoice_deleted:'Накладная № {n} удалена',
    toast_invoice_restored:'Накладная № {n} восстановлена',
    toast_comment_required:'Комментарий обязателен!',
    toast_delivery_cancelled:'Доставка отменена',
    toast_order_delivered:'Заказ доставлен',
    toast_need_client_item:'Укажите клиента и хотя бы один товар',
    toast_order_created:'Заказ создан',
    toast_no_invoices_print:'Нет накладных для печати',
    toast_file_loaded:'Файл загружен: {n} строк',
    toast_file_read_error:'Ошибка чтения файла',
    toast_session_name_required:'Введите название сессии!',
    toast_invoice_added_one:'Накладная № {n} добавлена', toast_invoice_added_many:'Добавлено накладных: {n}: {nos}',
    // analytics
    an_title:'Аналитика',
    kpi_ordered:'Заказ · поступило', kpi_given:'Выдано', kpi_returned:'Возвраты', kpi_net_sales:'Чистые продажи',
    an_tab_products:'Товары', an_tab_market:'Магазины', an_tab_sales:'Продажи', an_tab_returns:'Возвраты', an_col_ordered:'Заказ сумма', an_col_dqty:'Выдано шт', an_col_dsum:'Выдано сумма', an_col_rqty:'Возврат шт', an_col_rsum:'Возврат сумма', an_col_net:'Продажа сумма', an_col_rate:'Rate %',
    nav_undelivered:'Возвраты',
    preset_today:'Сегодня', preset_week:'Эта неделя', preset_month:'Этот месяц', preset_prev_month:'Прошлый месяц',
    col_day:'Дата', col_store:'Магазин', col_given_qty:'Выд.шт', col_returned_qty:'Возвр.шт', col_product_name:'Наименование',
    col_ordered:'Заказ', col_decreased:'Убыло', col_given:'Выдано', col_sum:'Сумма (сум)', col_doc:'Накл.', msg_no_data:'Нет данных',
    an_sub_daily:'По дням', an_sub_stores:'Магазины', an_sub_products:'Товары',
    // login
    login_welcome:'Добро пожаловать', login_subtitle:'Введите свои учётные данные',
    login_email:'Эл. почта', login_password:'Пароль', login_submit:'Войти',
    login_tagline:'Налоги · B2B платформа', login_system:'система управления',
    login_hero:'Накладные, аналитика, экспедиция и реестр — в одном месте, в реальном времени.',
    feat_inv:'Накладные', feat_inv_sub:'Автоформирование',
    feat_an_sub:'Продажи · возвраты · KPI', feat_disp:'Экспедиция', feat_disp_sub:'Маршрут · водители',
    feat_reg_sub:'История · архив · документы',
    feat_realtime:'Реальное время', feat_realtime_sub:'Данные', feat_multiuser:'Многопользоват.', feat_multiuser_sub:'Роли · аудит',
    // tables / columns
    col_status:'Статус', col_sku:'SKU', col_type:'Тип', col_ref:'Источник', col_file:'Файл', col_err:'Ошиб.', col_action:'Действие', col_entity:'Объект', col_role:'Роль', col_time:'Время', col_market_name:'Магазин', col_vat:'НДС (+12%)', col_reason:'Причина отмены', col_num:'№',
    st_cancelled:'Отменён', st_undelivered:'Не доставлен', st_saved:'Сохранён',
    // register / modals
    undeliver_warn:'Вы снимаете статус доставки для накладной №{n}. Указание причины обязательно:',
    undeliver_ph:'Введите комментарий (например: ошибочно отмечено, клиент отказался...)',
    act_confirm:'Подтвердить',
    restore_title:'Накладная №{n} — восстановить', restore_date:'Дата доставки', restore_items:'Товары (измените количество)',
    total_qty:'Всего шт', total_sum:'Всего сумма', print_select_title:'Выбрать для печати', max_label:'Макс', moved_label:'Перенесено',
    // orders / import
    btn_upload_order:'Загрузить заказ', btn_order_history:'История заказов', btn_new_doc:'Новый документ',
    file_choose:'Выберите Excel файл', file_format:'формат .xls или .xlsx', file_loaded_ok:'Файл загружен',
    doc_from:'Накладная № от', session_name_label:'Название сессии', session_name_ph:'— введите название (обяз.)',
    sum_label:'Сумма', vazvrat_choose:'Выберите Excel файл возврата', vazvrat_count:'Записей возвратов: {n}',
    loading:'Загрузка...', empty_no_orders_range:'Нет заказов в этом диапазоне', sessions_count:'Сессий: {n}',
    manuallist_title:'Документы, введённые вручную', empty_manual:'Нет документов, введённых вручную', empty_order_history:'Нет истории заказов',
    trash_invoices:'Документы', trash_sessions:'Сессии', empty_trash_invoices:'Нет удалённых накладных', empty_trash_sessions:'Нет удалённых сессий', empty_no_doc_history:'Нет истории документов', empty_no_dov_history:'Нет истории доверенностей', empty_no_history:'Истории пока нет', empty_no_data_range:'Нет данных в диапазоне дат', empty_no_returns_range:'Нет возвратов в диапазоне дат', empty_no_returns:'Нет возвратов', date_range:'Диапазон дат', undeliver_title:'Отмена доставки',
    // manual / order modals
    manual_with_vat:'Цена с НДС', manual_add_store:'+ Магазин', manual_qty_abbr:'Кол',
    ph_store_code:'Код', ph_market_name:'Название магазина', ph_order_no:'№ Заказа', saving:'Сохранение…', btn_add_plus:'+ Добавить', ph_select_product:'Выбрать товар',
    // settings
    set_catalog_count:'товаров: {n}', act_refresh:'Обновить', act_upload:'Загрузить',
    exceptions_help:'В указанные даты нарушения графика не учитываются (праздник, особый день).',
    role_user:'пользователь', role_admin:'админ', user_active:'активен', user_inactive:'выключен', act_enable:'Включить', act_disable:'Выключить',
    tab_doverennost:'Доверенность', tab_trash:'Архив',
    // stats
    stats_keldi:'Поступило', stats_order_sum:'Сумма заказа', stats_given_sum:'Сумма выдачи', stats_col_schedule:'График',
    // schedule
    sch_saved:'Сохранено', act_clear:'Очистить', act_view:'показать', sch_excel_format:'Формат Excel:',
    sch_exception_day:'Сегодня особый день — нарушение графика не учитывается',
    sch_off_count:'{n} магазинов нет в графике сегодня ({day})', sch_not_loaded:'График не загружен',
    sch_all_ok:'Все магазины в графике ({day})', sch_not_found:'{n} магазинов не найдено в графике',
    toast_schedule_loaded:'График загружен: {n} магазинов, {m} водителей', toast_schedule_deleted:'График удалён',
    // undelivered
    undeliv_title:'Недоставленные накладные', undeliv_empty:'Все накладные доставлены',
    // confirms / alerts
    confirm_overwrite_session:'Сессия с названием "{name}" уже существует.\n\nПерезаписать?\n\n"Отмена" — сохранить под новым именем',
    toast_registry_exists:'Реестр "{name}" уже существует — повторно не создан',
    confirm_delete_session:'Удалить сессию "{name}"?', confirm_delete_product:'Удалить {name}?',
    confirm_reset_catalog:'Сбросить каталог к исходному списку?', confirm_reset_requisites:'Сбросить реквизиты?',
    confirm_delete_invoice:'Удалить накладную № {n}?', alert_no_data_file:'В файле нет данных',
    confirm_dup_found:'⚠️ В файле найдено дубликатов: {n}!', confirm_dup_extra_sum:'Лишняя сумма: ~{sum} сум', confirm_dup_auto:'Система АВТОМАТИЧЕСКИ удалит дубликаты и сохранит.\nПродолжить?', dup_more:'и ещё {n}', dup_extra:'лишних', dup_label:'дубликат',
    // toasts / misc
    toast_stats_error:'Ошибка загрузки статистики', toast_rows_saved:'Сохранено строк: {n}',
    aria_prev_month:'Предыдущий месяц', aria_next_month:'Следующий месяц', aria_close:'Закрыть', pick_date:'Выберите дату', msg_not_found:'Не найдено', ph_search:'Поиск...',
    months_short:['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'],
    months_full:['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
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
    pref_tight:'Ultra compact', pref_compact:'Compact', pref_cozy:'Normal', pref_comfortable:'Comfortable', pref_spacious:'Spacious', pref_custom_color:'Custom color', pref_custom_color_hint:'Pick any color — applied across the whole app.', pref_apply:'Apply', pref_applied:'Applied', pref_fontsize:'Font size', pref_fontsize_hint:'Text size for the whole app', pref_font_s:'Small', pref_font_m:'Medium', pref_font_l:'Large', pref_font_xl:'Extra large',
    pref_accent:'Color style', pref_accent_hint:'Color of buttons and key elements',
    pref_lang:'Language', pref_lang_hint:'Interface language',
    lbl_invoices:'inv.', lbl_pcs:'pcs', lbl_sum:'UZS', lbl_unsaved:'unsaved',
    lbl_logout:'Logout', lbl_store:'Store', lbl_driver:'Driver',
    lbl_print:'Print', lbl_save:'Save', lbl_add:'Add',
    lbl_cancel:'Cancel', lbl_date:'Date', lbl_order:'Order',
    lbl_product:'Product', lbl_unit:'Unit', lbl_qty:'Qty',
    lbl_price:'Price', lbl_total:'Total', lbl_vat:'VAT',
    lbl_delivered:'Delivered', lbl_selected:'Selected', lbl_restore:'Restore', lbl_delete:'Delete',
    err_unknown:'Unknown error',
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
    analytics_title:'Analytics',
    settings_cat:'Catalog', settings_req:'Requisites',
    settings_exc:'Exceptions', settings_hist:'History', settings_access:'Access',
    settings_cat_title:'Product catalog', settings_req_title:'Requisites',
    settings_hist_title:'Session history', settings_users_title:'Users',
    settings_supplier:'Supplier', settings_receiver:'Receiver',
    settings_contract:'Contract',
    modal_manual:'Manual invoice', modal_order:'New order', modal_client:'New client',
    // tarix
    tarix_hujjat:'Documents', tag_docs:'docs', tarix_qaytarma:'Returns', tarix_buyurtma:'Orders', tarix_qolda:'Manual', tarix_hammasi:'All', tarix_ishonchnoma:'Power of Attorney',
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
    // toasts ({n}/{m}/{name} interpolated in code)
    toast_status_not_updated:'Status not updated — network error.',
    toast_data_load_failed:'Failed to load data. Refresh the page.',
    toast_login_ok:'Logged in',
    toast_upload_sap:'Upload SAP file',
    toast_parse_ready:'Ready: {n} invoices. Click "Save"!',
    toast_session_saved:'Session saved: {name}',
    toast_no_records:'No records found',
    toast_vazvrat_loaded:'Loaded {n} return records',
    toast_need_store_qty:'Enter store code and at least 1 product qty',
    toast_session_loaded:'Session loaded: {name}',
    toast_session_deleted:'Session deleted',
    toast_catalog_saved:'Catalog saved',
    toast_product_deleted:'Product deleted',
    toast_catalog_reset:'Catalog reset',
    toast_requisites_saved:'Requisites saved',
    toast_requisites_reset:'Requisites reset',
    toast_user_created:'User created',
    toast_import_done:'Import {name} completed',
    toast_invoice_deleted:'Invoice № {n} deleted',
    toast_invoice_restored:'Invoice № {n} restored',
    toast_comment_required:'Comment is required!',
    toast_delivery_cancelled:'Delivery cancelled',
    toast_order_delivered:'Order delivered',
    toast_need_client_item:'Enter a client and at least one product',
    toast_order_created:'Order created',
    toast_no_invoices_print:'No invoices to print',
    toast_file_loaded:'File loaded: {n} rows',
    toast_file_read_error:'File read error',
    toast_session_name_required:'Enter a session name!',
    toast_invoice_added_one:'Invoice № {n} added', toast_invoice_added_many:'{n} invoices added: {nos}',
    // analytics
    an_title:'Analytics',
    kpi_ordered:'Ordered · received', kpi_given:'Issued', kpi_returned:'Returns', kpi_net_sales:'Net sales',
    an_tab_products:'Products', an_tab_market:'Markets', an_tab_sales:'Sales', an_tab_returns:'Returns', an_col_ordered:'Ordered sum', an_col_dqty:'Delivered qty', an_col_dsum:'Delivered sum', an_col_rqty:'Return qty', an_col_rsum:'Return sum', an_col_net:'Net sales', an_col_rate:'Rate %',
    nav_undelivered:'Returned',
    preset_today:'Today', preset_week:'This week', preset_month:'This month', preset_prev_month:'Last month',
    col_day:'Date', col_store:'Store', col_given_qty:'Iss.qty', col_returned_qty:'Ret.qty', col_product_name:'Product name',
    col_ordered:'Ordered', col_decreased:'Decreased', col_given:'Issued', col_sum:'Sum (UZS)', col_doc:'Inv.', msg_no_data:'No data',
    an_sub_daily:'Daily', an_sub_stores:'Stores', an_sub_products:'Products',
    // login
    login_welcome:'Welcome', login_subtitle:'Enter your credentials',
    login_email:'Email', login_password:'Password', login_submit:'Sign in',
    login_tagline:'Tax · B2B sales platform', login_system:'management system',
    login_hero:'Invoices, analytics, dispatch and registry — in one place, in real time.',
    feat_inv:'Invoices', feat_inv_sub:'Auto-generation',
    feat_an_sub:'Sales · returns · KPI', feat_disp:'Dispatch', feat_disp_sub:'Route · drivers',
    feat_reg_sub:'History · archive · documents',
    feat_realtime:'Real-time', feat_realtime_sub:'Data', feat_multiuser:'Multi-user', feat_multiuser_sub:'Roles · audit',
    // tables / columns
    col_status:'Status', col_sku:'SKU', col_type:'Type', col_ref:'Ref', col_file:'File', col_err:'Err', col_action:'Action', col_entity:'Entity', col_role:'Role', col_time:'Time', col_market_name:'Market', col_vat:'VAT (+12%)', col_reason:'Cancellation reason', col_num:'№',
    st_cancelled:'Cancelled', st_undelivered:'Undelivered', st_saved:'Saved',
    // register / modals
    undeliver_warn:'You are clearing the delivery status of invoice №{n}. A reason is required:',
    undeliver_ph:'Enter a comment (e.g. marked by mistake, customer refused...)',
    act_confirm:'Confirm',
    restore_title:'Invoice №{n} — restore', restore_date:'Delivery date', restore_items:'Products (adjust quantity)',
    total_qty:'Total qty', total_sum:'Total sum', print_select_title:'Select for print', max_label:'Max', moved_label:'Rescheduled',
    // orders / import
    btn_upload_order:'Upload order', btn_order_history:'Order history', btn_new_doc:'New document',
    file_choose:'Choose Excel file', file_format:'.xls or .xlsx format', file_loaded_ok:'File loaded',
    doc_from:'Invoice № from', session_name_label:'Session name', session_name_ph:'— enter a name (required)',
    sum_label:'Sum', vazvrat_choose:'Choose returns Excel file', vazvrat_count:'{n} return records available',
    loading:'Loading...', empty_no_orders_range:'No orders in this range', sessions_count:'{n} sessions',
    manuallist_title:'Manually entered documents', empty_manual:'No manual documents', empty_order_history:'No order history',
    trash_invoices:'Documents', trash_sessions:'Sessions', empty_trash_invoices:'No deleted invoices', empty_trash_sessions:'No deleted sessions', empty_no_doc_history:'No document history', empty_no_dov_history:'No power-of-attorney history', empty_no_history:'No history yet', empty_no_data_range:'No data in the date range', empty_no_returns_range:'No returns in the date range', empty_no_returns:'No returns', date_range:'Date range', undeliver_title:'Cancel delivery',
    // manual / order modals
    manual_with_vat:'Price with VAT', manual_add_store:'+ Store', manual_qty_abbr:'Qty',
    ph_store_code:'Code', ph_market_name:'Market name', ph_order_no:'№ Order', saving:'Saving…', btn_add_plus:'+ Add', ph_select_product:'Select product',
    // settings
    set_catalog_count:'{n} products', act_refresh:'Refresh', act_upload:'Upload',
    exceptions_help:'On these dates schedule deviations are not counted (holiday, special day).',
    role_user:'user', role_admin:'admin', user_active:'active', user_inactive:'inactive', act_enable:'Enable', act_disable:'Disable',
    tab_doverennost:'Power of attorney', tab_trash:'Archive',
    // stats
    stats_keldi:'Received', stats_order_sum:'Order sum', stats_given_sum:'Issued sum', stats_col_schedule:'Schedule',
    // schedule
    sch_saved:'Saved', act_clear:'Clear', act_view:'view', sch_excel_format:'Excel format:',
    sch_exception_day:"Today is a special day — schedule deviation isn't counted",
    sch_off_count:'{n} stores not on schedule today ({day})', sch_not_loaded:'Schedule not loaded',
    sch_all_ok:'All stores on schedule ({day})', sch_not_found:'{n} stores not found in schedule',
    toast_schedule_loaded:'Schedule loaded: {n} stores, {m} drivers', toast_schedule_deleted:'Schedule deleted',
    // undelivered
    undeliv_title:'Undelivered invoices', undeliv_empty:'All invoices delivered',
    // confirms / alerts
    confirm_overwrite_session:'A session named "{name}" already exists.\n\nOverwrite?\n\n"Cancel" — save under a new name',
    toast_registry_exists:'A registry named "{name}" already exists — not created again',
    confirm_delete_session:'Delete session "{name}"?', confirm_delete_product:'Delete {name}?',
    confirm_reset_catalog:'Reset catalog to the default list?', confirm_reset_requisites:'Reset requisites?',
    confirm_delete_invoice:'Delete invoice № {n}?', alert_no_data_file:'No data found in file',
    confirm_dup_found:'⚠️ {n} duplicates found in the file!', confirm_dup_extra_sum:'Extra amount: ~{sum} UZS', confirm_dup_auto:'The system will AUTOMATICALLY remove duplicates and save.\nContinue?', dup_more:'and {n} more', dup_extra:'extra', dup_label:'duplicate',
    // toasts / misc
    toast_stats_error:'Failed to load statistics', toast_rows_saved:'{n} rows saved',
    aria_prev_month:'Previous month', aria_next_month:'Next month', aria_close:'Close', pick_date:'Pick a date', msg_not_found:'Not found', ph_search:'Search...',
    months_short:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    months_full:['January','February','March','April','May','June','July','August','September','October','November','December'],
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
export function tMonthsShort(lang: Lang): string[] { return I18N[lang].months_short as string[]; }

export const DISPATCH_COLORS = [
  { header:'rgba(76,155,234,0.85)',  text:'#ffffff', dot:'#4c9bea',  cell:'rgba(76,155,234,0.10)' },
  { header:'rgba(70,191,114,0.85)',  text:'#ffffff', dot:'#46bf72',  cell:'rgba(70,191,114,0.10)' },
  { header:'rgba(124,124,230,0.85)', text:'#ffffff', dot:'#7c7ce6',  cell:'rgba(124,124,230,0.10)' },
  { header:'rgba(233,166,58,0.85)',  text:'#ffffff', dot:'#e9a63a',  cell:'rgba(233,166,58,0.10)' },
  { header:'rgba(232,79,106,0.85)',  text:'#ffffff', dot:'#e84f6a',  cell:'rgba(232,79,106,0.10)' },
  { header:'rgba(64,191,180,0.85)',  text:'#ffffff', dot:'#40bfb4',  cell:'rgba(64,191,180,0.10)' },
];

