/**
 * ISO-3166-1 alpha-2 country catalogue used by the elvix SDK.
 *
 * Two things live here:
 *   1. The full list of recognised countries (used by nationality
 *      pickers, country selects in addresses, etc.).
 *   2. `TAX_VALIDATABLE_COUNTRIES` — the subset of countries where
 *      we have a real-time tax-ID validation authority wired in
 *      (`lib/tax-validation.ts`). The Legal Entities wizard gates
 *      the tax-country picker by this allowlist; anything outside
 *      is flagged "coming soon".
 *
 * Flag glyphs are derived from the ISO code via Unicode regional
 * indicator symbols — no image assets needed.
 */

export type Country = {
  /** ISO-3166-1 alpha-2. Uppercase. */
  code: string;
  /** English short name. */
  name: string;
  /** Unicode flag emoji (regional-indicator pair). */
  flag: string;
};

/**
 * Convert an ISO alpha-2 code into the matching emoji flag by
 * mapping each letter to its regional indicator symbol.
 * Returns an empty string for malformed input rather than throwing,
 * because country pickers can render partial input mid-keystroke.
 */
export function countryCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  const A = 0x41;
  const RI_A = 0x1f1e6;
  const up = code.toUpperCase();
  const c0 = up.charCodeAt(0);
  const c1 = up.charCodeAt(1);
  if (c0 < A || c0 > A + 25 || c1 < A || c1 > A + 25) return "";
  return String.fromCodePoint(RI_A + (c0 - A)) + String.fromCodePoint(RI_A + (c1 - A));
}

/** Helper — builds a Country entry with the flag derived from the code. */
function c(code: string, name: string): Country {
  return { code, name, flag: countryCodeToFlag(code) };
}

/**
 * Full ISO-3166-1 alpha-2 list. Names are short-form English (per the
 * UK Foreign Office / ISO short name where they differ from the long
 * official name). Sorted alphabetically by `name` for consistent
 * combobox rendering.
 */
export const COUNTRIES: readonly Country[] = [
  c("AF", "Afghanistan"),
  c("AL", "Albania"),
  c("DZ", "Algeria"),
  c("AD", "Andorra"),
  c("AO", "Angola"),
  c("AG", "Antigua and Barbuda"),
  c("AR", "Argentina"),
  c("AM", "Armenia"),
  c("AU", "Australia"),
  c("AT", "Austria"),
  c("AZ", "Azerbaijan"),
  c("BS", "Bahamas"),
  c("BH", "Bahrain"),
  c("BD", "Bangladesh"),
  c("BB", "Barbados"),
  c("BY", "Belarus"),
  c("BE", "Belgium"),
  c("BZ", "Belize"),
  c("BJ", "Benin"),
  c("BT", "Bhutan"),
  c("BO", "Bolivia"),
  c("BA", "Bosnia and Herzegovina"),
  c("BW", "Botswana"),
  c("BR", "Brazil"),
  c("BN", "Brunei"),
  c("BG", "Bulgaria"),
  c("BF", "Burkina Faso"),
  c("BI", "Burundi"),
  c("CV", "Cabo Verde"),
  c("KH", "Cambodia"),
  c("CM", "Cameroon"),
  c("CA", "Canada"),
  c("CF", "Central African Republic"),
  c("TD", "Chad"),
  c("CL", "Chile"),
  c("CN", "China"),
  c("CO", "Colombia"),
  c("KM", "Comoros"),
  c("CG", "Congo"),
  c("CD", "Congo (DRC)"),
  c("CR", "Costa Rica"),
  c("CI", "Côte d'Ivoire"),
  c("HR", "Croatia"),
  c("CU", "Cuba"),
  c("CY", "Cyprus"),
  c("CZ", "Czechia"),
  c("DK", "Denmark"),
  c("DJ", "Djibouti"),
  c("DM", "Dominica"),
  c("DO", "Dominican Republic"),
  c("EC", "Ecuador"),
  c("EG", "Egypt"),
  c("SV", "El Salvador"),
  c("GQ", "Equatorial Guinea"),
  c("ER", "Eritrea"),
  c("EE", "Estonia"),
  c("SZ", "Eswatini"),
  c("ET", "Ethiopia"),
  c("FJ", "Fiji"),
  c("FI", "Finland"),
  c("FR", "France"),
  c("GA", "Gabon"),
  c("GM", "Gambia"),
  c("GE", "Georgia"),
  c("DE", "Germany"),
  c("GH", "Ghana"),
  c("GR", "Greece"),
  c("GD", "Grenada"),
  c("GT", "Guatemala"),
  c("GN", "Guinea"),
  c("GW", "Guinea-Bissau"),
  c("GY", "Guyana"),
  c("HT", "Haiti"),
  c("HN", "Honduras"),
  c("HK", "Hong Kong"),
  c("HU", "Hungary"),
  c("IS", "Iceland"),
  c("IN", "India"),
  c("ID", "Indonesia"),
  c("IR", "Iran"),
  c("IQ", "Iraq"),
  c("IE", "Ireland"),
  c("IL", "Israel"),
  c("IT", "Italy"),
  c("JM", "Jamaica"),
  c("JP", "Japan"),
  c("JO", "Jordan"),
  c("KZ", "Kazakhstan"),
  c("KE", "Kenya"),
  c("KI", "Kiribati"),
  c("KW", "Kuwait"),
  c("KG", "Kyrgyzstan"),
  c("LA", "Laos"),
  c("LV", "Latvia"),
  c("LB", "Lebanon"),
  c("LS", "Lesotho"),
  c("LR", "Liberia"),
  c("LY", "Libya"),
  c("LI", "Liechtenstein"),
  c("LT", "Lithuania"),
  c("LU", "Luxembourg"),
  c("MO", "Macao"),
  c("MG", "Madagascar"),
  c("MW", "Malawi"),
  c("MY", "Malaysia"),
  c("MV", "Maldives"),
  c("ML", "Mali"),
  c("MT", "Malta"),
  c("MH", "Marshall Islands"),
  c("MR", "Mauritania"),
  c("MU", "Mauritius"),
  c("MX", "Mexico"),
  c("FM", "Micronesia"),
  c("MD", "Moldova"),
  c("MC", "Monaco"),
  c("MN", "Mongolia"),
  c("ME", "Montenegro"),
  c("MA", "Morocco"),
  c("MZ", "Mozambique"),
  c("MM", "Myanmar"),
  c("NA", "Namibia"),
  c("NR", "Nauru"),
  c("NP", "Nepal"),
  c("NL", "Netherlands"),
  c("NZ", "New Zealand"),
  c("NI", "Nicaragua"),
  c("NE", "Niger"),
  c("NG", "Nigeria"),
  c("KP", "North Korea"),
  c("MK", "North Macedonia"),
  c("NO", "Norway"),
  c("OM", "Oman"),
  c("PK", "Pakistan"),
  c("PW", "Palau"),
  c("PS", "Palestine"),
  c("PA", "Panama"),
  c("PG", "Papua New Guinea"),
  c("PY", "Paraguay"),
  c("PE", "Peru"),
  c("PH", "Philippines"),
  c("PL", "Poland"),
  c("PT", "Portugal"),
  c("QA", "Qatar"),
  c("RO", "Romania"),
  c("RU", "Russia"),
  c("RW", "Rwanda"),
  c("KN", "Saint Kitts and Nevis"),
  c("LC", "Saint Lucia"),
  c("VC", "Saint Vincent and the Grenadines"),
  c("WS", "Samoa"),
  c("SM", "San Marino"),
  c("ST", "Sao Tome and Principe"),
  c("SA", "Saudi Arabia"),
  c("SN", "Senegal"),
  c("RS", "Serbia"),
  c("SC", "Seychelles"),
  c("SL", "Sierra Leone"),
  c("SG", "Singapore"),
  c("SK", "Slovakia"),
  c("SI", "Slovenia"),
  c("SB", "Solomon Islands"),
  c("SO", "Somalia"),
  c("ZA", "South Africa"),
  c("KR", "South Korea"),
  c("SS", "South Sudan"),
  c("ES", "Spain"),
  c("LK", "Sri Lanka"),
  c("SD", "Sudan"),
  c("SR", "Suriname"),
  c("SE", "Sweden"),
  c("CH", "Switzerland"),
  c("SY", "Syria"),
  c("TW", "Taiwan"),
  c("TJ", "Tajikistan"),
  c("TZ", "Tanzania"),
  c("TH", "Thailand"),
  c("TL", "Timor-Leste"),
  c("TG", "Togo"),
  c("TO", "Tonga"),
  c("TT", "Trinidad and Tobago"),
  c("TN", "Tunisia"),
  c("TR", "Türkiye"),
  c("TM", "Turkmenistan"),
  c("TV", "Tuvalu"),
  c("UG", "Uganda"),
  c("UA", "Ukraine"),
  c("AE", "United Arab Emirates"),
  c("GB", "United Kingdom"),
  c("US", "United States"),
  c("UY", "Uruguay"),
  c("UZ", "Uzbekistan"),
  c("VU", "Vanuatu"),
  c("VA", "Vatican City"),
  c("VE", "Venezuela"),
  c("VN", "Vietnam"),
  c("YE", "Yemen"),
  c("ZM", "Zambia"),
  c("ZW", "Zimbabwe"),
] as const;

/** O(1) lookup helper. Returns `null` for unknown / malformed codes. */
const BY_CODE = new Map(COUNTRIES.map((co) => [co.code, co]));
export function findCountry(code: string | null | undefined): Country | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase()) ?? null;
}

/**
 * Countries where `lib/tax-validation.ts` can do a REAL live lookup
 * against the issuing authority's API. Anything outside this list is
 * gated on the Legal Entities wizard with a "coming soon" message
 * so the user never registers a tax-residence we can't service.
 *
 * Authorities used:
 *   EU 27 → VIES (`ec.europa.eu/.../checkVatService`)
 *   GB    → HMRC Check-a-VAT-Number
 *   AU    → ABR Lookup (Australian Business Register)
 *   CH    → UID Register
 *   BR    → Receita Federal CNPJ
 *   NO    → Brønnøysund (BRREG)
 */
export const TAX_VALIDATABLE_COUNTRIES: readonly string[] = [
  // EU 27
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  // Outside the EU
  "GB",
  "AU",
  "CH",
  "BR",
  "NO",
] as const;

const TAX_VALIDATABLE_SET = new Set(TAX_VALIDATABLE_COUNTRIES);
export function isTaxValidatableCountry(code: string | null | undefined): boolean {
  if (!code) return false;
  return TAX_VALIDATABLE_SET.has(code.toUpperCase());
}

/** Subset of COUNTRIES filtered to the tax-validatable allowlist. */
export const TAX_COUNTRIES: readonly Country[] = COUNTRIES.filter((co) =>
  TAX_VALIDATABLE_SET.has(co.code),
);
