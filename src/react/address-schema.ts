import { z } from "zod";

/**
 * Address schema for the elvix Profile SDK.
 *
 * Two flavours mirror the basic-info pattern:
 *
 *   `addressSchema`        — STRICT. SDK form enforces it client-side
 *                            before submit.
 *   `addressPatchSchema`   — LOOSE. Server-side accepts partial
 *                            updates (single field PATCHs from admin
 *                            tools, Google Places merges, etc.).
 *
 * Field shape mirrors DC EventAddress: country has both ISO code and
 * human name; region has both code (ISO-3166-2) and name; coords are
 * stored alongside Google Places provenance for shipping-zone /
 * delivery-map use without re-geocoding.
 */

export const ADDRESS_KINDS = ["billing", "shipping"] as const;
export type AddressKind = (typeof ADDRESS_KINDS)[number];

// ISO-3166-1 alpha-2: 2 uppercase letters.
const COUNTRY_CODE = /^[A-Z]{2}$/;

export const addressSchema = z.object({
  kind: z.enum(ADDRESS_KINDS),
  label: z.string().trim().max(40).optional().nullable(),
  isDefault: z.boolean().optional(),

  recipientName: z.string().trim().min(1, "Required").max(120, "Keep it under 120 characters"),
  companyName: z.string().trim().max(160).optional().nullable(),

  // Loose maxes — Google's `addressComponents` produces longer strings
  // than typical postal lines for some places (especially venues with
  // long building names baked into line1, or German compound roads).
  // Tight schemas → users hit "invalid" right after the Review step
  // greenlit the address. The real ceiling is "fits on a packing slip".
  line1: z.string().trim().min(1, "Required").max(240, "Keep it under 240 characters"),
  line2: z.string().trim().max(240).optional().nullable(),

  city: z.string().trim().min(1, "Required").max(140, "Keep it under 140 characters"),
  regionName: z.string().trim().max(140).optional().nullable(),
  regionCode: z.string().trim().max(40).optional().nullable(),
  postalCode: z.string().trim().max(40).optional().nullable(),

  country: z.string().trim().regex(COUNTRY_CODE, "Pick a country"),
  countryName: z.string().trim().max(120).optional().nullable(),

  deliveryNotes: z.string().trim().max(500).optional().nullable(),
  timezone: z.string().trim().max(80).optional().nullable(),
  /// Building / business name (mirrors DC EventAddress.venueName).
  venueName: z.string().trim().max(180).optional().nullable(),

  // Google Places provenance. placeId for route-type results uses a
  // base64-encoded form that can grow to ~250 chars.
  placeId: z.string().trim().max(400).optional().nullable(),
  formattedAddress: z.string().trim().max(500).optional().nullable(),
  // Decimal lat/lng on the wire (DC EventAddressDto pattern). Server
  // packs them into a PostGIS geography(Point, 4326) column for
  // spatial queries; reads project ST_X/ST_Y back to decimals.
  latitude: z.number().finite().gte(-90).lte(90).optional().nullable(),
  longitude: z.number().finite().gte(-180).lte(180).optional().nullable(),
});

export type AddressInput = z.infer<typeof addressSchema>;

export const addressPatchSchema = addressSchema.partial();
export type AddressPatchInput = z.infer<typeof addressPatchSchema>;

/** Server response shape — adds id + audit fields. */
export type AddressRecord = AddressInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
