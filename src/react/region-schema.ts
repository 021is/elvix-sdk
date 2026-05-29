import { COUNTRIES } from "./countries";
import { LANGUAGES } from "./languages";
import {
  DATE_FORMATS,
  MEASUREMENT_SYSTEMS,
  NUMBER_FORMATS,
  TIME_FORMATS,
  isKnownCurrency,
  isKnownTimeZone,
} from "./regions";
import { z } from "zod";

/**
 * Region schemas for the elvix Profile SDK.
 *
 *   `regionSchema`        — STRICT. `country` required (anchor field).
 *                            All other fields optional; defaults come
 *                            from the per-country cascade.
 *   `regionPatchSchema`   — LOOSE. Every field optional so tap-to-edit
 *                            can PATCH a single field at a time and
 *                            cross-app writers (DC etc.) can update
 *                            just what they observe.
 *
 * Codes validated against the catalogues so a malformed POST can't
 * smuggle in unknown country/locale/currency values.
 */

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));
const LOCALE_CODES = new Set(LANGUAGES.map((l) => l.code));

const countryField = z
  .string()
  .trim()
  .toUpperCase()
  .refine((c) => COUNTRY_CODES.has(c), "Unknown country code");

const uiLocaleField = z
  .string()
  .trim()
  .toLowerCase()
  .refine((c) => LOCALE_CODES.has(c), "Unknown UI locale");

const timeZoneField = z
  .string()
  .trim()
  .refine((tz) => isKnownTimeZone(tz), "Unknown IANA time zone");

const currencyField = z
  .string()
  .trim()
  .toUpperCase()
  .refine((c) => isKnownCurrency(c), "Unknown currency code");

const firstDayField = z.number().int().min(0).max(6);

const regionShape = z.object({
  country: countryField,
  uiLocale: uiLocaleField.optional().nullable(),
  timeZone: timeZoneField.optional().nullable(),
  firstDayOfWeek: firstDayField.optional(),
  timeFormat: z.enum(TIME_FORMATS).optional(),
  dateFormat: z.enum(DATE_FORMATS).optional(),
  numberFormat: z.enum(NUMBER_FORMATS).optional(),
  currency: currencyField.optional().nullable(),
  measurementSystem: z.enum(MEASUREMENT_SYSTEMS).optional(),
});

export const regionSchema = regionShape;
export const regionPatchSchema = regionShape.partial();

export type RegionInput = z.infer<typeof regionSchema>;
export type RegionPatchInput = z.infer<typeof regionPatchSchema>;

export type RegionRecord = {
  id: string;
  country: string;
  uiLocale: string | null;
  timeZone: string | null;
  firstDayOfWeek: number;
  timeFormat: string;
  dateFormat: string;
  numberFormat: string;
  currency: string | null;
  measurementSystem: string;
  createdAt: string;
  updatedAt: string;
};
