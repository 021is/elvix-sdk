import { TAX_VALIDATABLE_COUNTRIES } from "./countries";
import { normaliseTaxId } from "./tax-validation";

/**
 * The tax country a VAT ID names by its own prefix, or `null` when it names
 * none. EU VAT IDs start with the member state (Greece's with `EL`, not its
 * ISO `GR`), British ones with `GB`, Swiss UIDs with `CHE`. Norway's, Australia's
 * and Brazil's numbers are bare digits, so the wizard asks for the country
 * beside them instead.
 *
 * This is what lets a business skip the tax-country step: typing
 * `DE129273398` already said Germany.
 */
export function countryFromVatId(raw: string): string | null {
  const id = normaliseTaxId(raw);
  if (/^CHE\d/.test(id)) return "CH";
  const prefix = id.slice(0, 2);
  if (!/^[A-Z]{2}$/.test(prefix)) return null;
  if (prefix === "EL") return "GR";
  // `GR` is Greece's ISO code but never its VAT prefix: a GR… VAT ID names no country.
  if (prefix === "GR" || prefix === "CH") return null;
  return TAX_VALIDATABLE_COUNTRIES.includes(prefix) ? prefix : null;
}
