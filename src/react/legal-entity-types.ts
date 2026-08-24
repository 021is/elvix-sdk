/**
 * Address shapes returned by the Places proxy.
 *
 * Their own module because the wizard panes, the detail views and the
 * component that owns the draft all need them, and any of those three
 * importing from another would be a cycle.
 */

export type PlaceDetails = {
  placeId: string;
  formattedAddress: string;
  displayName: string;
  line1: string;
  city: string;
  regionName: string | null;
  regionCode: string | null;
  postalCode: string | null;
  country: string;
  countryName: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
};

export type PlaceSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
};

/**
 * Google Places bills an autocomplete "session" as one unit: every keystroke
 * plus the final details lookup, provided they share a token. A fresh token
 * per address the user starts entering is what keeps that billing correct.
 */
export function newSessionToken(): string {
  return crypto.randomUUID();
}
