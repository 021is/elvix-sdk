/**
 * Region defaults map for the elvix Profile SDK.
 *
 * Picking a country cascades sensible per-country defaults across
 * every dependent field (uiLocale, currency, time format, etc.).
 * Each field is independently overridable on the detail view —
 * the cascade is just a smart starting point, not a hard binding.
 *
 * We curate ~60 countries by hand rather than shipping a CLDR pack:
 *   - CLDR is heavy (~10 MB) and most of it is unused here
 *   - These values are load-bearing for downstream apps, so we want
 *     them visible in version control rather than inherited from
 *     a black-box library
 *   - Unknown countries fall through to `FALLBACK_DEFAULTS`
 *
 * Keep entries terse: country (ISO-3166-1 alpha-2) → 7 fields.
 */

import { LANGUAGES } from "./languages";

// ─── Canonical enum values ──────────────────────────────────────────

export const TIME_FORMATS = ["H12", "H24"] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

export const DATE_FORMATS = ["DMY", "MDY", "YMD"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const NUMBER_FORMATS = ["EU", "US", "FR"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export const MEASUREMENT_SYSTEMS = ["METRIC", "IMPERIAL"] as const;
export type MeasurementSystem = (typeof MEASUREMENT_SYSTEMS)[number];

export const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

// Display copy for each enum.
export const TIME_FORMAT_META: Record<TimeFormat, { label: string; sample: string }> = {
  H12: { label: "12-hour", sample: "3:24 PM" },
  H24: { label: "24-hour", sample: "15:24" },
};
export const DATE_FORMAT_META: Record<DateFormat, { label: string; sample: string }> = {
  DMY: { label: "Day · Month · Year", sample: "20/05/2026" },
  MDY: { label: "Month · Day · Year", sample: "05/20/2026" },
  YMD: { label: "Year · Month · Day", sample: "2026-05-20" },
};
export const NUMBER_FORMAT_META: Record<NumberFormat, { label: string; sample: string }> = {
  EU: { label: "European", sample: "1.234,56" },
  US: { label: "American", sample: "1,234.56" },
  FR: { label: "French / Nordic", sample: "1 234,56" },
};
export const MEASUREMENT_META: Record<MeasurementSystem, { label: string; sample: string }> = {
  METRIC: { label: "Metric", sample: "km · kg · °C" },
  IMPERIAL: { label: "Imperial", sample: "mi · lb · °F" },
};
export const DAY_OF_WEEK_META: Record<DayOfWeek, { label: string; short: string }> = {
  0: { label: "Sunday", short: "Sun" },
  1: { label: "Monday", short: "Mon" },
  2: { label: "Tuesday", short: "Tue" },
  3: { label: "Wednesday", short: "Wed" },
  4: { label: "Thursday", short: "Thu" },
  5: { label: "Friday", short: "Fri" },
  6: { label: "Saturday", short: "Sat" },
};

// ─── Per-country defaults ────────────────────────────────────────────

export type RegionDefaults = {
  uiLocale: string; // BCP-47, lowercased, matches a `LANGUAGES.code`
  timeZone: string; // IANA, capital city when the country spans multiple
  firstDayOfWeek: DayOfWeek;
  timeFormat: TimeFormat;
  dateFormat: DateFormat;
  numberFormat: NumberFormat;
  currency: string; // ISO-4217 alpha-3
  measurementSystem: MeasurementSystem;
};

const D = (
  uiLocale: string,
  timeZone: string,
  firstDayOfWeek: DayOfWeek,
  timeFormat: TimeFormat,
  dateFormat: DateFormat,
  numberFormat: NumberFormat,
  currency: string,
  measurementSystem: MeasurementSystem,
): RegionDefaults => ({
  uiLocale,
  timeZone,
  firstDayOfWeek,
  timeFormat,
  dateFormat,
  numberFormat,
  currency,
  measurementSystem,
});

export const COUNTRY_DEFAULTS: Record<string, RegionDefaults> = {
  // Europe
  AT: D("de", "Europe/Vienna", 1, "H24", "DMY", "EU", "EUR", "METRIC"),
  BE: D("nl", "Europe/Brussels", 1, "H24", "DMY", "EU", "EUR", "METRIC"),
  BG: D("bg", "Europe/Sofia", 1, "H24", "DMY", "FR", "BGN", "METRIC"),
  BY: D("be", "Europe/Minsk", 1, "H24", "DMY", "FR", "BYN", "METRIC"),
  CH: D("de", "Europe/Zurich", 1, "H24", "DMY", "EU", "CHF", "METRIC"),
  CZ: D("cs", "Europe/Prague", 1, "H24", "DMY", "FR", "CZK", "METRIC"),
  DE: D("de", "Europe/Berlin", 1, "H24", "DMY", "EU", "EUR", "METRIC"),
  DK: D("da", "Europe/Copenhagen", 1, "H24", "DMY", "EU", "DKK", "METRIC"),
  EE: D("et", "Europe/Tallinn", 1, "H24", "DMY", "FR", "EUR", "METRIC"),
  ES: D("es-es", "Europe/Madrid", 1, "H24", "DMY", "EU", "EUR", "METRIC"),
  FI: D("fi", "Europe/Helsinki", 1, "H24", "DMY", "FR", "EUR", "METRIC"),
  FR: D("fr", "Europe/Paris", 1, "H24", "DMY", "FR", "EUR", "METRIC"),
  GB: D("en", "Europe/London", 1, "H12", "DMY", "US", "GBP", "IMPERIAL"),
  GR: D("el", "Europe/Athens", 1, "H24", "DMY", "EU", "EUR", "METRIC"),
  HR: D("hr", "Europe/Zagreb", 1, "H24", "DMY", "EU", "EUR", "METRIC"),
  HU: D("hu", "Europe/Budapest", 1, "H24", "YMD", "FR", "HUF", "METRIC"),
  IE: D("en", "Europe/Dublin", 1, "H24", "DMY", "US", "EUR", "METRIC"),
  IS: D("is", "Atlantic/Reykjavik", 1, "H24", "DMY", "EU", "ISK", "METRIC"),
  IT: D("it", "Europe/Rome", 1, "H24", "DMY", "EU", "EUR", "METRIC"),
  LT: D("lt", "Europe/Vilnius", 1, "H24", "YMD", "FR", "EUR", "METRIC"),
  LV: D("lv", "Europe/Riga", 1, "H24", "DMY", "FR", "EUR", "METRIC"),
  NL: D("nl", "Europe/Amsterdam", 1, "H24", "DMY", "EU", "EUR", "METRIC"),
  NO: D("nb", "Europe/Oslo", 1, "H24", "DMY", "FR", "NOK", "METRIC"),
  PL: D("pl", "Europe/Warsaw", 1, "H24", "DMY", "FR", "PLN", "METRIC"),
  PT: D("pt-pt", "Europe/Lisbon", 1, "H24", "DMY", "EU", "EUR", "METRIC"),
  RO: D("ro", "Europe/Bucharest", 1, "H24", "DMY", "EU", "RON", "METRIC"),
  RS: D("sr-latn", "Europe/Belgrade", 1, "H24", "DMY", "EU", "RSD", "METRIC"),
  RU: D("ru", "Europe/Moscow", 1, "H24", "DMY", "FR", "RUB", "METRIC"),
  SE: D("sv", "Europe/Stockholm", 1, "H24", "YMD", "FR", "SEK", "METRIC"),
  SI: D("sl", "Europe/Ljubljana", 1, "H24", "DMY", "EU", "EUR", "METRIC"),
  SK: D("sk", "Europe/Bratislava", 1, "H24", "DMY", "FR", "EUR", "METRIC"),
  UA: D("uk", "Europe/Kyiv", 1, "H24", "DMY", "FR", "UAH", "METRIC"),

  // Middle East / Caucasus
  AE: D("ar", "Asia/Dubai", 6, "H12", "DMY", "US", "AED", "METRIC"),
  AM: D("hy", "Asia/Yerevan", 1, "H24", "DMY", "EU", "AMD", "METRIC"),
  EG: D("ar", "Africa/Cairo", 6, "H12", "DMY", "US", "EGP", "METRIC"),
  GE: D("ka", "Asia/Tbilisi", 1, "H24", "DMY", "EU", "GEL", "METRIC"),
  IL: D("he", "Asia/Jerusalem", 0, "H24", "DMY", "US", "ILS", "METRIC"),
  IR: D("fa", "Asia/Tehran", 6, "H24", "YMD", "EU", "IRR", "METRIC"),
  SA: D("ar", "Asia/Riyadh", 6, "H12", "DMY", "US", "SAR", "METRIC"),
  TR: D("tr", "Europe/Istanbul", 1, "H24", "DMY", "EU", "TRY", "METRIC"),

  // Asia / Pacific
  AU: D("en", "Australia/Sydney", 1, "H12", "DMY", "US", "AUD", "METRIC"),
  CN: D("zh-hans", "Asia/Shanghai", 1, "H24", "YMD", "US", "CNY", "METRIC"),
  HK: D("zh-hant", "Asia/Hong_Kong", 0, "H12", "DMY", "US", "HKD", "METRIC"),
  ID: D("id", "Asia/Jakarta", 1, "H24", "DMY", "EU", "IDR", "METRIC"),
  IN: D("hi", "Asia/Kolkata", 0, "H12", "DMY", "US", "INR", "METRIC"),
  JP: D("ja", "Asia/Tokyo", 0, "H24", "YMD", "US", "JPY", "METRIC"),
  KR: D("ko", "Asia/Seoul", 0, "H24", "YMD", "US", "KRW", "METRIC"),
  KZ: D("kk", "Asia/Almaty", 1, "H24", "DMY", "FR", "KZT", "METRIC"),
  MY: D("ms", "Asia/Kuala_Lumpur", 1, "H12", "DMY", "US", "MYR", "METRIC"),
  NZ: D("en", "Pacific/Auckland", 1, "H12", "DMY", "US", "NZD", "METRIC"),
  PH: D("tl", "Asia/Manila", 0, "H12", "MDY", "US", "PHP", "METRIC"),
  SG: D("en", "Asia/Singapore", 1, "H12", "DMY", "US", "SGD", "METRIC"),
  TH: D("th", "Asia/Bangkok", 0, "H24", "DMY", "US", "THB", "METRIC"),
  TW: D("zh-hant", "Asia/Taipei", 0, "H12", "YMD", "US", "TWD", "METRIC"),
  UZ: D("uz", "Asia/Tashkent", 1, "H24", "DMY", "FR", "UZS", "METRIC"),
  VN: D("vi", "Asia/Ho_Chi_Minh", 1, "H24", "DMY", "EU", "VND", "METRIC"),

  // Africa
  KE: D("sw", "Africa/Nairobi", 1, "H24", "DMY", "US", "KES", "METRIC"),
  NG: D("en", "Africa/Lagos", 1, "H12", "DMY", "US", "NGN", "METRIC"),
  ZA: D("en", "Africa/Johannesburg", 0, "H24", "YMD", "US", "ZAR", "METRIC"),

  // Americas
  AR: D("es-419", "America/Argentina/Buenos_Aires", 0, "H24", "DMY", "EU", "ARS", "METRIC"),
  BR: D("pt-br", "America/Sao_Paulo", 0, "H24", "DMY", "EU", "BRL", "METRIC"),
  CA: D("en", "America/Toronto", 0, "H12", "YMD", "US", "CAD", "METRIC"),
  CL: D("es-419", "America/Santiago", 1, "H24", "DMY", "EU", "CLP", "METRIC"),
  CO: D("es-419", "America/Bogota", 0, "H12", "DMY", "US", "COP", "METRIC"),
  MX: D("es-419", "America/Mexico_City", 0, "H24", "DMY", "US", "MXN", "METRIC"),
  US: D("en", "America/New_York", 0, "H12", "MDY", "US", "USD", "IMPERIAL"),
};

/** Sensible neutral defaults when the country isn't in the curated map. */
export const FALLBACK_DEFAULTS: RegionDefaults = D(
  "en",
  "Europe/Berlin",
  1,
  "H24",
  "DMY",
  "EU",
  "USD",
  "METRIC",
);

export function defaultsFor(country: string): RegionDefaults {
  return COUNTRY_DEFAULTS[country.toUpperCase()] ?? FALLBACK_DEFAULTS;
}

// ─── Currency catalogue (subset; expand as needed) ──────────────────

/** ISO-4217 currencies the picker offers explicitly. Restrict to the
 *  set that appears as a country default plus a few major reserve
 *  currencies. */
export const CURRENCIES: ReadonlyArray<{ code: string; name: string; symbol: string }> = [
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
  { code: "AMD", name: "Armenian Dram", symbol: "֏" },
  { code: "ARS", name: "Argentine Peso", symbol: "$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "BGN", name: "Bulgarian Lev", symbol: "лв" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "BYN", name: "Belarusian Ruble", symbol: "Br" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CLP", name: "Chilean Peso", symbol: "$" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "COP", name: "Colombian Peso", symbol: "$" },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč" },
  { code: "DKK", name: "Danish Krone", symbol: "kr" },
  { code: "EGP", name: "Egyptian Pound", symbol: "ج.م" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "Pound Sterling", symbol: "£" },
  { code: "GEL", name: "Georgian Lari", symbol: "₾" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "ILS", name: "Israeli Shekel", symbol: "₪" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "IRR", name: "Iranian Rial", symbol: "﷼" },
  { code: "ISK", name: "Icelandic Króna", symbol: "kr" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "KZT", name: "Kazakhstani Tenge", symbol: "₸" },
  { code: "MXN", name: "Mexican Peso", symbol: "$" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱" },
  { code: "PLN", name: "Polish Złoty", symbol: "zł" },
  { code: "RON", name: "Romanian Leu", symbol: "lei" },
  { code: "RSD", name: "Serbian Dinar", symbol: "дин" },
  { code: "RUB", name: "Russian Ruble", symbol: "₽" },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "TWD", name: "New Taiwan Dollar", symbol: "NT$" },
  { code: "UAH", name: "Ukrainian Hryvnia", symbol: "₴" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "UZS", name: "Uzbekistani Som", symbol: "сум" },
  { code: "VND", name: "Vietnamese Đồng", symbol: "₫" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
];

const CURRENCY_CODES = new Set(CURRENCIES.map((c) => c.code));

export function isKnownCurrency(code: string): boolean {
  return CURRENCY_CODES.has(code.toUpperCase());
}

export function findCurrency(code: string | null | undefined) {
  if (!code) return null;
  return CURRENCIES.find((c) => c.code === code.toUpperCase()) ?? null;
}

// ─── Time-zone helpers ──────────────────────────────────────────────

/**
 * All IANA time-zone IDs the host runtime knows about. Pulled live
 * via `Intl.supportedValuesOf("timeZone")` (Node ≥18 + modern
 * browsers). Cached on first access.
 */
let CACHED_TIMEZONES: string[] | null = null;
export function supportedTimeZones(): string[] {
  if (CACHED_TIMEZONES) return CACHED_TIMEZONES;
  try {
    // `supportedValuesOf` is in TC39 stage 4 but TS lib types lag;
    // cast to any for the call, validate result shape afterwards.
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    if (typeof fn !== "function") throw new Error("no Intl.supportedValuesOf");
    const zones = fn("timeZone");
    if (!Array.isArray(zones)) throw new Error("not array");
    CACHED_TIMEZONES = zones;
    return zones;
  } catch {
    CACHED_TIMEZONES = ["UTC"];
    return CACHED_TIMEZONES;
  }
}

export function isKnownTimeZone(tz: string): boolean {
  return supportedTimeZones().includes(tz);
}

/** Convert "Europe/Berlin" → "Berlin · Europe" (short, readable). */
export function prettyTimeZone(tz: string): string {
  const parts = tz.split("/");
  if (parts.length < 2) return tz;
  const region = parts[0];
  const city = parts.slice(1).join(" / ").replace(/_/g, " ");
  return `${city} · ${region}`;
}

// ─── UI-locale picker source ────────────────────────────────────────

/**
 * Locales we offer for the UI dropdown. Subset of the catalog —
 * languages without enough translated UI yet are filtered upstream
 * by the consuming app. For the SDK we surface them all and let
 * each app decide whether to honour the choice or fall back.
 */
export function uiLocaleOptions(): ReadonlyArray<{ code: string; name: string; native: string }> {
  return LANGUAGES.map((l) => ({ code: l.code, name: l.name, native: l.native }));
}
