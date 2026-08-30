/**
 * URL builder for elvix's Google Places proxy (`/public/api/maps/*`).
 *
 * The proxy fronts a metered Google API on elvix's own key, so since
 * 2026-08-30 it requires a `clientId` identifying which application is
 * spending. Requests without one are refused — that is the point, not a
 * regression.
 *
 * `<ElvixProvider clientId>` is optional (a host can let the bootstrap
 * envelope supply it), so the caller may genuinely not have one yet. This
 * returns `null` in that case rather than building a URL that is certain to
 * 403, letting the component say something the developer can act on instead
 * of surfacing "http 403" from a request that never had a chance.
 */

export type MapsEndpoint = "autocomplete" | "place-details";

export type MapsUrlContext = {
  baseUrl: string;
  clientId: string | undefined;
};

/**
 * Build a maps proxy URL, or `null` when no `clientId` is available.
 * Every parameter is encoded by `URLSearchParams` — never hand-roll it.
 */
export function mapsUrl(
  ctx: MapsUrlContext,
  endpoint: MapsEndpoint,
  params: Record<string, string>,
): string | null {
  if (!ctx.clientId) return null;
  const query = new URLSearchParams({ ...params, clientId: ctx.clientId });
  return `${ctx.baseUrl}/public/api/maps/${endpoint}?${query.toString()}`;
}

/** Error key components surface when the provider has no clientId to send. */
export const MAPS_MISSING_CLIENT_ID = "missing_client_id";
