/**
 * The address book's four requests against `/api/account/profile/addresses`.
 * Each resolves to a plain outcome; none rejects, not even on a network error.
 */

import type { AddressInput, AddressKind, AddressRecord } from "./address-schema";
import { failureBody, jsonInit, send } from "./profile-request";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";

export type Outcome = { ok: true } | { ok: false; error: string };

const path = (baseUrl: string) => `${baseUrl}/api/account/profile/addresses`;

async function outcome(res: Response | null, fallback: string): Promise<Outcome> {
  if (res?.ok) return { ok: true };
  if (!res) return { ok: false, error: fallback };
  return { ok: false, error: humanizeApiError(await failureBody(res), fallback) };
}

/** `null` when the list could not be read. */
export async function listAddresses(
  baseUrl: string,
  kind: AddressKind,
  signal?: AbortSignal,
): Promise<AddressRecord[] | null> {
  const res = await send(`${path(baseUrl)}?kind=${kind}`, {
    cache: "no-store",
    signal,
    ...authInit(),
  });
  if (!res?.ok) return null;
  const body = unwrapEnvelope(await res.json().catch(() => null)) as {
    ok?: boolean;
    addresses?: AddressRecord[];
  } | null;
  return body?.ok && body.addresses ? body.addresses : null;
}

export async function createAddress(baseUrl: string, input: AddressInput): Promise<Outcome> {
  return outcome(await send(path(baseUrl), jsonInit("POST", input)), "save_failed");
}

export async function updateAddress(
  baseUrl: string,
  id: string,
  partial: Partial<AddressInput>,
): Promise<Outcome> {
  return outcome(
    await send(`${path(baseUrl)}?id=${id}`, jsonInit("PATCH", partial)),
    "save_failed",
  );
}

export async function deleteAddress(baseUrl: string, id: string): Promise<Outcome> {
  const res = await send(`${path(baseUrl)}?id=${id}`, { method: "DELETE", ...authInit() });
  if (res?.ok) return { ok: true };
  const body = res ? await failureBody(res) : {};
  return { ok: false, error: typeof body.error === "string" ? body.error : "delete_failed" };
}

/**
 * The route answers a zod failure with
 * `{ ok: false, error: "invalid", issues: { fieldErrors: { ... } } }`. The flat
 * "invalid" says nothing, so surface the first field error instead.
 */
export function humanizeApiError(body: Record<string, unknown>, fallback = "save_failed"): string {
  const b = body as {
    error?: string;
    issues?: { fieldErrors?: Record<string, string[] | undefined> };
  };
  const [field, messages] = Object.entries(b.issues?.fieldErrors ?? {})[0] ?? [];
  if (field) return `${field}: ${messages?.[0] ?? "invalid"}`;
  return b.error ?? fallback;
}
