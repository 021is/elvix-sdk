import { findCountry } from "./countries";
import type { View } from "./legal-entity-flow";
import type { LegalEntityType } from "./legal-entity-schema";

/**
 * Copy, placeholders and formatting for legal entities.
 *
 * These are pure string functions with no React and no state, and they were
 * the last 190 lines of a 3,292-line component file. Nothing about
 * "what does a Portuguese VAT number look like" belongs next to a wizard's
 * state machine, and keeping them together meant the country tables could
 * only be read by scrolling past six hundred lines of JSX.
 *
 * Pure on purpose: every one of these is directly testable without rendering
 * anything, which is what `tests/legal-entity-copy.test.ts` does.
 */

export function humanType(
  type: LegalEntityType,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (type === "individual") return t("legalEntities.kindIndividual");
  if (type === "sole_prop") return t("legalEntities.kindSoleProp");
  return t("legalEntities.kindCompany");
}

export function typeTitleCopy(
  type: LegalEntityType | null,
  view: View,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (view === "legal-name") {
    if (type === "individual") return t("legalEntities.legalNameTitleIndividual");
    if (type === "sole_prop") return t("legalEntities.legalNameTitleSoleProp");
    return t("legalEntities.legalNameTitleCompany");
  }
  return "";
}

export function vatPlaceholder(country: string): string {
  switch (country) {
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "DE":
      return "DE129273398";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "GB":
      return "GB123456789";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "FR":
      return "FR40303265045";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "NL":
      return "NL813195779B01";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "AU":
      return "51824753556";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "CH":
      return "CHE-101.731.823";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "BR":
      return "00000000000191";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "NO":
      return "974760673";
    default:
      return `${country}…`;
  }
}

export function taxIdPlaceholder(country: string): string {
  switch (country) {
    case "DE":
      return "Steuernummer · 10-13 digits";
    case "GB":
      return "UTR (10 digits) or NINO";
    case "US":
      return "EIN · 12-3456789";
    case "FR":
      return "NIF · 13 digits";
    case "NL":
      return "BSN · 9 digits";
    case "ES":
      return "NIE / DNI / CIF";
    case "IT":
      return "Codice Fiscale (11 or 16 chars)";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "PT":
      return "NIF · 9 digits";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "PL":
      return "NIP · 10 digits";
    case "GR":
      return "AFM · 9 digits";
    case "AT":
      return "Steuernummer · 9 digits";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "BE":
      return "10 digits";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "IE":
      return "7 digits + letter";
    case "AU":
      return "TFN · 8-9 digits";
    case "CH":
      return "AHV / AVS · 13 digits";
    case "BR":
      return "CPF (11) or CNPJ (14)";
    case "NO":
      return "Fødselsnummer · 11 digits";
    default:
      return "Local tax number";
  }
}

/** Human-readable hint for the format gate inline error. */
export function taxIdFormatHint(
  country: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  return t("legalEntities.taxIdFormatHint", { placeholder: taxIdPlaceholder(country) });
}

export function regNumberPlaceholder(country: string): string {
  switch (country) {
    case "DE":
      return "HRB 12345 · GnR 7821 …";
    case "GB":
      return "Companies House · 8 digits or SC123456";
    case "NL":
      return "KvK · 8 digits";
    case "FR":
      return "SIREN (9 digits) or SIRET (14)";
    case "BE":
      return "BCE · 10 digits";
    case "IE":
      return "CRO · 5-7 digits";
    case "PL":
      return "KRS · 10 digits";
    case "PT":
      return "NIPC · 9 digits";
    case "SE":
      return "Org.nr · 10 digits";
    case "DK":
      return "CVR · 8 digits";
    case "FI":
      return "Y-tunnus · 1234567-8";
    case "NO":
      return "Orgnr · 9 digits";
    case "BR":
      return "CNPJ · 14 digits";
    case "AU":
      return "ACN · 9 digits";
    case "CH":
      return "UID · CHE-123.456.789";
    default:
      return "Local register number";
  }
}

export function regNumberFormatHint(
  country: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  return t("legalEntities.regNumberFormatHint", { placeholder: regNumberPlaceholder(country) });
}

export function formatIsoDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function renderNationality(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts
    .map((code) => {
      const c = findCountry(code);
      return c ? `${c.flag} ${c.name}` : code;
    })
    .join(" · ");
}

export function humanizeApiError(body: unknown): string {
  if (!body || typeof body !== "object") return "save_failed";
  const b = body as {
    error?: string;
    issues?: { fieldErrors?: Record<string, string[] | undefined> };
  };
  const fieldErrors = b.issues?.fieldErrors ?? {};
  const firstField = Object.keys(fieldErrors)[0];
  if (firstField) {
    const msgs = fieldErrors[firstField] ?? [];
    return `${firstField}: ${msgs[0] ?? "invalid"}`;
  }
  return b.error ?? "save_failed";
}
