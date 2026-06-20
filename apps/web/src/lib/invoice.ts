import { CatalogProduct, DaySnapshot, Invoice, InvoiceLine, Requisites } from '@/types/domain';

export const VAT = 0.12;

export const DEFAULT_REQUISITES: Requisites = {
  supplier: {
    name: 'ООО «DRUZYA»',
    addr: 'г.Ташкент, Юнусабадский р-н, кв-л 15, дом 23, кв 37',
    inn: '305 991 552',
    vat: '326010038806'
  },
  receiver: {
    name: 'ИП ООО "ANGLESEY FOOD"',
    inn: '202 099 756',
    vat: '326060002860'
  },
  contract: 'к товарно-отгрузочным документам, договор № 1 от 07.09.2022 г.'
};

export const fmt = (value: number) =>
  (Math.round(value * 100) / 100).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

export const fmt0 = (value: number) => Math.round(value).toLocaleString('ru-RU');

export const r2 = (value: number) => Math.round(value * 100) / 100;

export function parseNum(value: string | number | undefined): number {
  if (value == null) return 0;
  const parsed = Number.parseFloat(String(value).replace(/\u00a0/g, '').replace(/\s/g, '').replace(',', '.'));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function fmtDateRu(value: string): string {
  const parts = value.split('-');
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : value;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function lineTotal(line: InvoiceLine): InvoiceLine {
  const cost = r2(line.qty * line.price);
  const vat = r2(cost * VAT);
  return {
    ...line,
    cost,
    vat,
    total: r2(cost + vat)
  };
}

export function recomputeInvoice(invoice: Invoice): Invoice {
  const lines = invoice.lines.map(lineTotal);
  const sumCost = r2(lines.reduce((sum, line) => sum + line.cost, 0));
  const sumVat = r2(lines.reduce((sum, line) => sum + line.vat, 0));
  return {
    ...invoice,
    lines,
    sumCost,
    sumVat,
    sumTotal: r2(sumCost + sumVat),
    sumQty: lines.reduce((sum, line) => sum + line.qty, 0)
  };
}

export function buildSnapshot(input: {
  invoiceDate: string;
  startId: number;
  sapRaw: string;
  catalog: CatalogProduct[];
  invoices: Invoice[];
}): DaySnapshot {
  // Strip sapRaw from snapshot to keep payload small (can be several MB of raw Excel text)
  return {
    app: 'gdetort',
    v: 7,
    savedAt: new Date().toISOString(),
    invoiceDate: input.invoiceDate,
    startId: input.startId,
    sapRaw: '',
    catalog: input.catalog,
    // Only keep fields needed for restore — drop heavy unused fields
    invoices: input.invoices.map((inv) => ({
      invNo: inv.invNo,
      order: inv.order,
      storeCode: inv.storeCode,
      short: inv.short,
      seq: inv.seq,
      market: inv.market,
      label: inv.label,
      address: inv.address,
      dateIso: inv.dateIso,
      manual: inv.manual,
      lines: inv.lines,
      sumCost: inv.sumCost,
      sumVat: inv.sumVat,
      sumTotal: inv.sumTotal,
      sumQty: inv.sumQty,
      status: inv.status
    }))
  };
}

const ONES = [
  '',
  'один',
  'два',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
  'десять',
  'одиннадцать',
  'двенадцать',
  'тринадцать',
  'четырнадцать',
  'пятнадцать',
  'шестнадцать',
  'семнадцать',
  'восемнадцать',
  'девятнадцать'
];
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUND = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function triad(value: number, feminine: boolean): string {
  const result: string[] = [];
  const h = Math.floor(value / 100);
  const t = Math.floor((value % 100) / 10);
  const o = value % 10;
  if (h) result.push(HUND[h]);
  if (t > 1) {
    result.push(TENS[t]);
    if (o) result.push((feminine ? ONES_F : ONES)[o]);
  } else if (t === 1) result.push(ONES[10 + o]);
  else if (o) result.push((feminine ? ONES_F : ONES)[o]);
  return result.join(' ');
}

function plural(value: number, forms: [string, string, string]): string {
  const n = Math.abs(value) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

export function amountWords(total: number): string {
  let som = Math.floor(total);
  let tiyin = Math.round((total - som) * 100);
  if (tiyin === 100) {
    tiyin = 0;
    som += 1;
  }
  if (som === 0) return `ноль сум ${String(tiyin).padStart(2, '0')} тийин`;

  const scales: Array<{ divisor: number; forms?: [string, string, string]; feminine: boolean }> = [
    { divisor: 1_000_000_000, forms: ['миллиард', 'миллиарда', 'миллиардов'], feminine: false },
    { divisor: 1_000_000, forms: ['миллион', 'миллиона', 'миллионов'], feminine: false },
    { divisor: 1000, forms: ['тысяча', 'тысячи', 'тысяч'], feminine: true },
    { divisor: 1, feminine: false }
  ];

  let remainder = som;
  const parts: string[] = [];
  for (const scale of scales) {
    const chunk = Math.floor(remainder / scale.divisor);
    remainder %= scale.divisor;
    if (!chunk) continue;
    parts.push(triad(chunk, scale.feminine));
    if (scale.forms) parts.push(plural(chunk, scale.forms));
  }

  const words = parts.join(' ').replace(/\s+/g, ' ').trim();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} сум ${String(tiyin).padStart(2, '0')} тийин`;
}

export function downloadBlob(blob: Blob, name: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}
