/**
 * `getElvixLegalEntity` (0.18): a host's backend reads the legal entity a
 * user picked in `<ElvixLegalEntityPicker>`, by id, with the app's API key.
 * Take only the id from the browser and read the rest here: company details
 * typed in a browser are exactly what invoice fraud is made of.
 *
 * elvix answers only while the user's grant for your app holds; a revoked,
 * never-granted or deleted entity is `not_found`. Never throws.
 */

import type { ElvixLegalEntity, ElvixLegalEntityResult } from "../types/legal-entity";

const DEFAULT_BASE_URL = "https://elvix.is";

export type GetLegalEntityArgs = {
  /** Your application's API key (Console → API credentials). Server only. */
  apiKey: string;
  /** Your application's internal id (Console → API credentials), not its clientId. */
  applicationId: string;
  /** The elvix user id (the token's `sub`, `verifyElvixToken`'s `user.id`). */
  userId: string;
  /** The id `onPick` handed the browser. */
  entityId: string;
  /** Override the elvix origin for testing / proxy setups. */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
};

const path = (a: GetLegalEntityArgs) =>
  ["api", "applications", a.applicationId, "users", a.userId, "legal-entities", a.entityId]
    .map((part, i) => (i < 2 ? part : encodeURIComponent(part)))
    .join("/");

/** The record from a Spine envelope (`{ success, data: { entity } }`) or a bare body. */
function entityOf(body: unknown): ElvixLegalEntity | null {
  const b = body as { data?: { entity?: unknown }; entity?: unknown } | null;
  const entity = b?.data?.entity ?? b?.entity;
  return entity && typeof entity === "object" ? (entity as ElvixLegalEntity) : null;
}

function failureOf(status: number): ElvixLegalEntityResult {
  if (status === 404) return { ok: false, error: "not_found" };
  if (status === 401 || status === 403) return { ok: false, error: "unauthorized" };
  return { ok: false, error: `http_${status}` };
}

/**
 * An id is a plain token. The entity id comes from a browser, and
 * `encodeURIComponent` leaves `.` and `..` alone, so `..` would move the keyed
 * request up a level to another route; it is refused before any request.
 */
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function getElvixLegalEntity(
  args: GetLegalEntityArgs,
): Promise<ElvixLegalEntityResult> {
  if (![args.applicationId, args.userId, args.entityId].every((id) => ID.test(id))) {
    return { ok: false, error: "invalid_id" };
  }
  const url = `${args.baseUrl ?? DEFAULT_BASE_URL}/${path(args)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 5000);
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${args.apiKey}`, accept: "application/json" },
      signal: ctrl.signal,
      redirect: "error",
    });
    if (!res.ok) return failureOf(res.status);
    const entity = entityOf(await res.json().catch(() => null));
    return entity ? { ok: true, entity } : { ok: false, error: `http_${res.status}` };
  } catch {
    // Shown, not swallowed: the caller gets `network` and decides.
    return { ok: false, error: "network" };
  } finally {
    clearTimeout(timer);
  }
}
