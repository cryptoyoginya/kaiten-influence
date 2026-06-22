// Парсеры «грязных» строк из Excel в числа. Всё best-effort: если не распарсилось — null.

function normalize(s: string): string {
  return String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

// "62 118 подписчиков" -> 62118 · "81k" -> 81000 · "34k " -> 34000 · "17 241" -> 17241
export function parseSubs(s: string): number | null {
  const t = normalize(s).toLowerCase();
  if (!t) return null;
  const kMatch = t.match(/(\d+[.,]?\d*)\s*[kк]\b/);
  if (kMatch) return Math.round(parseFloat(kMatch[1].replace(",", ".")) * 1000);
  // склеиваем число с пробелами-разрядами: "62 118" -> "62118"
  const digits = t.replace(/(\d)\s+(?=\d{3}\b)/g, "$1");
  const m = digits.match(/\d{3,}/);
  return m ? parseInt(m[0], 10) : null;
}

// "7k ERR 10,5%" -> 10.5 · "ERR 17,8%" -> 17.8
export function parseErr(s: string): number | null {
  const m = normalize(s).match(/(\d+[.,]?\d*)\s*%/);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

// средние просмотры из "7k ERR 10,5%" -> 7000 (первое число с k/тыс перед ERR)
export function parseViews(s: string): number | null {
  const t = normalize(s).toLowerCase();
  const k = t.match(/(\d+[.,]?\d*)\s*[kк]/);
  if (k) return Math.round(parseFloat(k[1].replace(",", ".")) * 1000);
  return null;
}

// "150 тыс. руб." -> 150000 · "56250.0" -> 56250 · "160 тыс" -> 160000 · "50 000 руб" -> 50000
export function parsePrice(s: string): number | null {
  const t = normalize(s).toLowerCase();
  if (!t || /usdt|usd|\$|€/.test(t)) return null; // не рубли — пропускаем
  const tys = t.match(/(\d+[.,]?\d*)\s*(тыс|т\.р|к\b|k\b)/);
  if (tys) return Math.round(parseFloat(tys[1].replace(",", ".")) * 1000);
  const digits = t.replace(/(\d)\s+(?=\d{3}\b)/g, "$1");
  const m = digits.match(/\d{4,}(?:[.,]\d+)?/);
  if (m) return Math.round(parseFloat(m[0].replace(",", ".")));
  return null;
}

export function median(nums: number[]): number | null {
  const xs = nums.filter((n) => n != null && !Number.isNaN(n)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function fmt(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

export function fmtShort(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".0", "") + " млн";
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".0", "") + "k";
  return String(Math.round(n));
}
