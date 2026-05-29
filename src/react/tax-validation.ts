/**
 * Client-safe tax / VAT identifier FORMAT checks — moved VERBATIM from the
 * elvix monorepo (`lib/tax-validation.ts`, the pure client-callable half) so
 * the SDK's `<ElvixTaxIdInput>` + `legal-entity-schema` validate identically
 * to elvix.is without dragging in the server-only authority lookups (VIES,
 * HMRC, ABR, …). Those live behind elvix's own `/public/api/tax/validate`
 * proxy; the SDK calls that endpoint for the live check and uses these pure
 * regex/checksum helpers for the inline format gate. No host dependencies.
 *
 * Country routing for the format regexes:
 *   EU 27 → VAT prefix + national number (length varies)
 *   GB/AU/CH/BR/NO → national org/VAT shapes
 */

import { TAX_VALIDATABLE_COUNTRIES } from "./countries";
import type { TaxValidationLevel } from "./legal-entity-schema";

export type TaxValidationResult = {
  level: TaxValidationLevel;
  /** Authority-returned official entity name on a live lookup. */
  name: string | null;
  /** Server-side normalised form (uppercased, dashes/spaces removed). */
  normalisedId: string;
  /** Which authority returned the verdict, if any. */
  authority: string | null;
};

/** Strip whitespace + common separators, uppercase letters. */
function normalise(input: string): string {
  return input.replace(/[\s.\-/]/g, "").toUpperCase();
}

/**
 * Country-by-country format regex. Format pass = the value LOOKS LIKE
 * the right shape for that country. Always followed by a live lookup
 * when the country has a free authority API.
 */
const FORMAT_RX: Record<string, RegExp> = {
  // EU VAT format: ISO country prefix + national number (length varies).
  AT: /^ATU\d{8}$/,
  BE: /^BE0\d{9}$/,
  BG: /^BG\d{9,10}$/,
  HR: /^HR\d{11}$/,
  CY: /^CY\d{8}[A-Z]$/,
  CZ: /^CZ\d{8,10}$/,
  DK: /^DK\d{8}$/,
  EE: /^EE\d{9}$/,
  FI: /^FI\d{8}$/,
  FR: /^FR[A-Z0-9]{2}\d{9}$/,
  DE: /^DE\d{9}$/,
  GR: /^EL\d{9}$/,
  HU: /^HU\d{8}$/,
  IE: /^IE\d{7}[A-Z]{1,2}$/,
  IT: /^IT\d{11}$/,
  LV: /^LV\d{11}$/,
  LT: /^LT(\d{9}|\d{12})$/,
  LU: /^LU\d{8}$/,
  MT: /^MT\d{8}$/,
  NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/,
  PT: /^PT\d{9}$/,
  RO: /^RO\d{2,10}$/,
  SK: /^SK\d{10}$/,
  SI: /^SI\d{8}$/,
  ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
  SE: /^SE\d{12}$/,
  // Non-EU
  GB: /^GB\d{9}(\d{3})?$/,
  AU: /^\d{11}$/, // ABN
  CH: /^CHE\d{9}(MWST|TVA|IVA)?$/, // UID — store with or without VAT suffix
  BR: /^\d{14}$/, // CNPJ
  NO: /^\d{9}(MVA)?$/, // orgnr — optional MVA suffix
};

function formatMatches(country: string, id: string): boolean {
  const rx = FORMAT_RX[country];
  if (!rx) return false;
  return rx.test(id);
}

/** Public: client-safe VAT format check. Caller normalises however
 *  it wants; we re-normalise to be defensive. */
export function vatIdFormatMatches(country: string, raw: string): boolean {
  const id = normalise(raw);
  if (!id) return false;
  return formatMatches(country.toUpperCase(), id);
}

/** Public: client-safe VAT id normaliser (strips separators, uppercases). */
export function normaliseTaxId(raw: string): string {
  return normalise(raw);
}

/**
 * Per-country format check for the LOCAL tax number (Steuernummer DE,
 * NINO/UTR GB, CPF/CNPJ BR, …). Independent of the VAT identifier —
 * different authority, different shape. We only enforce a format when
 * the country is known; unknown countries get a permissive
 * length-only check at the schema layer.
 *
 * The input is normalised (`/[\s.\-/]/` stripped, uppercased) before
 * testing — matches the same normalisation `validateTaxId` runs on
 * VAT IDs.
 */
const LOCAL_TAX_ID_RX: Record<string, RegExp> = {
  // DE: Steuernummer (10-13 digits, regional formats with /).
  DE: /^\d{10,13}$/,
  // AT: Steuernummer (9 digits) OR ATU (VAT-as-tax-no).
  AT: /^\d{9}$/,
  // BE: 10 digits.
  BE: /^\d{10}$/,
  BG: /^\d{9,10}$/,
  HR: /^\d{11}$/, // OIB
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DK: /^\d{10}$/, // CPR
  EE: /^\d{11}$/,
  FI: /^\d{6,9}[A-Z]?$/,
  FR: /^\d{13}$/, // SPI/NIF
  GR: /^\d{9}$/, // AFM
  HU: /^\d{10}$/,
  IE: /^\d{7}[A-Z]{1,2}$/,
  IT: /^[A-Z0-9]{11,16}$/, // codice fiscale (CF 16 or P.IVA 11)
  LV: /^\d{11}$/,
  LT: /^\d{11}$/,
  LU: /^\d{11,13}$/,
  MT: /^\d{7}[A-Z]?$/,
  NL: /^\d{9}$/, // BSN
  PL: /^\d{10,11}$/, // NIP/PESEL
  PT: /^\d{9}$/, // NIF
  RO: /^\d{13}$/, // CNP
  SK: /^\d{10}$/,
  SI: /^\d{8}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/, // NIE/DNI/CIF
  SE: /^\d{10,12}$/,
  // Non-EU
  GB: /^([A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]|\d{10})$/, // NINO or UTR
  AU: /^\d{8,9}$/, // TFN
  CH: /^\d{13}$/, // AHV/AVS
  BR: /^(\d{11}|\d{14})$/, // CPF or CNPJ
  NO: /^\d{11}$/, // fødselsnummer
};

/** Public: format-check a local tax number against its country.
 *  Returns true if the country has no format defined (lenient). */
export function localTaxIdMatches(country: string, raw: string): boolean {
  const id = normalise(raw);
  if (!id) return false;
  const c = country.toUpperCase();
  const rx = LOCAL_TAX_ID_RX[c];
  if (!rx) return id.length >= 4; // unknown country — at least look non-trivial
  if (!rx.test(id)) return false;
  // Layer 2: deterministic checksum. Several countries pack a check
  // digit/letter into the tax ID so we can detect typos and fakes
  // without calling an authority. No live API exists for personal
  // tax numbers (privacy laws), so the checksum is the strongest
  // offline gate we get.
  const checksum = LOCAL_TAX_ID_CHECKSUM[c];
  if (checksum && !checksum(id)) return false;
  return true;
}

// ─── Local-tax-id checksum validators ───────────────────────────────
//
// Each function receives the already-normalised ID (separators stripped,
// uppercased) and returns true iff the embedded check digit/letter is
// consistent with the number's other digits.

/** Italian Codice Fiscale (16-char personal CF). Check character is
 *  position 16, computed from a weighted lookup over chars 1-15. */
function checksumIT(id: string): boolean {
  if (id.length === 11) return checksumITPiva(id); // P.IVA short form
  if (id.length !== 16) return true;
  const odd: Record<string, number> = {
    "0": 1,
    "1": 0,
    "2": 5,
    "3": 7,
    "4": 9,
    "5": 13,
    "6": 15,
    "7": 17,
    "8": 19,
    "9": 21,
    A: 1,
    B: 0,
    C: 5,
    D: 7,
    E: 9,
    F: 13,
    G: 15,
    H: 17,
    I: 19,
    J: 21,
    K: 2,
    L: 4,
    M: 18,
    N: 20,
    O: 11,
    P: 3,
    Q: 6,
    R: 8,
    S: 12,
    T: 14,
    U: 16,
    V: 10,
    W: 22,
    X: 25,
    Y: 24,
    Z: 23,
  };
  const even: Record<string, number> = {
    "0": 0,
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    A: 0,
    B: 1,
    C: 2,
    D: 3,
    E: 4,
    F: 5,
    G: 6,
    H: 7,
    I: 8,
    J: 9,
    K: 10,
    L: 11,
    M: 12,
    N: 13,
    O: 14,
    P: 15,
    Q: 16,
    R: 17,
    S: 18,
    T: 19,
    U: 20,
    V: 21,
    W: 22,
    X: 23,
    Y: 24,
    Z: 25,
  };
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const ch = id[i]!;
    const v = (i % 2 === 0 ? odd : even)[ch];
    if (v === undefined) return false;
    sum += v;
  }
  const expected = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[sum % 26];
  return id[15] === expected;
}

/** Italian P.IVA (11 digits) — Luhn-style mod-10. */
function checksumITPiva(id: string): boolean {
  if (!/^\d{11}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let d = Number(id[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10 === Number(id[10]);
}

/** Brazil CPF/CNPJ — mod-11 with weighted sums. */
function checksumBR(id: string): boolean {
  if (id.length === 11) return checksumBRCpf(id);
  if (id.length === 14) return checksumBRCnpj(id);
  return true;
}

function checksumBRCpf(cpf: string): boolean {
  if (/^(\d)\1{10}$/.test(cpf)) return false; // all-same-digit rejection
  const calc = (slice: string, factor: number) => {
    let sum = 0;
    for (const d of slice) sum += Number(d) * factor--;
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return (
    calc(cpf.slice(0, 9), 10) === Number(cpf[9]) && calc(cpf.slice(0, 10), 11) === Number(cpf[10])
  );
}

function checksumBRCnpj(cnpj: string): boolean {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, ...weights1];
  const calc = (slice: string, weights: number[]) => {
    const sum = slice.split("").reduce((a, d, i) => a + Number(d) * weights[i]!, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return (
    calc(cnpj.slice(0, 12), weights1) === Number(cnpj[12]) &&
    calc(cnpj.slice(0, 13), weights2) === Number(cnpj[13])
  );
}

/** Spain DNI/NIE — single check letter, lookup table over n mod 23. */
function checksumES(id: string): boolean {
  const table = "TRWAGMYFPDXBNJZSQVHLCKE";
  // NIE prefix X/Y/Z map to 0/1/2 in the numeric computation.
  let numeric = id.slice(0, -1);
  if (/^[XYZ]/.test(numeric)) {
    numeric = String("XYZ".indexOf(numeric[0]!)) + numeric.slice(1);
  }
  if (!/^\d{1,8}$/.test(numeric)) return true; // CIF (companies) — skip
  const expected = table[Number(numeric) % 23];
  return id[id.length - 1] === expected;
}

/** Netherlands BSN — "11-test" (weighted sum mod 11 === 0). */
function checksumNL(id: string): boolean {
  if (!/^\d{9}$/.test(id)) return false;
  const weights = [9, 8, 7, 6, 5, 4, 3, 2, -1];
  const sum = id.split("").reduce((a, d, i) => a + Number(d) * weights[i]!, 0);
  return sum % 11 === 0;
}

/** Norway fødselsnummer — two check digits over weighted sums. */
function checksumNO(id: string): boolean {
  if (!/^\d{11}$/.test(id)) return false;
  const w1 = [3, 7, 6, 1, 8, 9, 4, 5, 2];
  const w2 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum1 = w1.reduce((a, w, i) => a + w * Number(id[i]), 0);
  const k1 = (11 - (sum1 % 11)) % 11;
  if (k1 === 10) return false;
  if (k1 !== Number(id[9])) return false;
  const sum2 = w2.reduce((a, w, i) => a + w * Number(id[i]), 0);
  const k2 = (11 - (sum2 % 11)) % 11;
  if (k2 === 10) return false;
  return k2 === Number(id[10]);
}

/** Germany Steuer-IdNr. (11 digits) — ISO/IEC 7064 MOD 11,10. */
function checksumDE(id: string): boolean {
  if (!/^\d{11}$/.test(id)) return true; // 10/12/13-digit Steuernummer has no defined checksum
  let product = 10;
  for (let i = 0; i < 10; i++) {
    let sum = (Number(id[i]) + product) % 10;
    if (sum === 0) sum = 10;
    product = (sum * 2) % 11;
  }
  const check = (11 - product) % 10;
  return check === Number(id[10]);
}

const LOCAL_TAX_ID_CHECKSUM: Record<string, (id: string) => boolean> = {
  IT: checksumIT,
  BR: checksumBR,
  ES: checksumES,
  NL: checksumNL,
  NO: checksumNO,
  DE: checksumDE,
};

/**
 * Per-country format check for the company REGISTRATION NUMBER
 * (Handelsregister DE, Companies House GB, KvK NL, SIREN/SIRET FR, …).
 * Each country's central register has its own shape — we only enforce
 * the tightly-shaped ones and fall back to a generic "≥4 alphanumeric"
 * gate for the variable ones (DE Handelsregister is too heterogeneous
 * to regex usefully — HRA/HRB/GnR/Partnerschaftsregister + court
 * prefix).
 */
const REG_NUMBER_RX: Record<string, RegExp> = {
  GB: /^([A-Z]{2}\d{6}|\d{8})$/, // Companies House (post-2011 + Scotland prefix)
  NL: /^\d{8}$/, // KvK
  FR: /^(\d{9}|\d{14})$/, // SIREN or SIRET
  BE: /^\d{10}$/, // BCE / KBO
  IE: /^\d{5,7}$/, // CRO
  PL: /^\d{10}$/, // KRS
  PT: /^\d{9}$/, // NIPC
  SE: /^\d{10}$/, // Organisationsnummer
  DK: /^\d{8}$/, // CVR
  FI: /^\d{7}-\d$|^\d{8}$/, // Y-tunnus
  NO: /^\d{9}$/, // brreg orgnr (no MVA suffix)
  BR: /^\d{14}$/, // CNPJ
  AU: /^\d{9}$/, // ACN
  CH: /^CHE\d{9}$/, // UID (without VAT suffix)
};

/** Public: format-check a registration number against its country.
 *  Lenient fallback (≥3 chars) for countries with too-varied formats
 *  to regex usefully (DE, AT, IT, ES, etc.). */
export function registrationNumberMatches(country: string, raw: string): boolean {
  const id = normalise(raw);
  if (!id) return false;
  const rx = REG_NUMBER_RX[country.toUpperCase()];
  if (!rx) return id.length >= 3;
  return rx.test(id);
}

// Reference the allowlist so the import isn't dropped — the schema gates
// `taxCountry` against it; re-exported here so ported modules can reach it
// from the same place the monorepo's `tax-validation` did.
void TAX_VALIDATABLE_COUNTRIES;
