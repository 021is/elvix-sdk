/**
 * The address book's four requests against `/api/account/profile/addresses`.
 * Each resolves to a plain outcome; none throws on an HTTP error.
 */

import type { AddressInput, AddressKind, AddressRecord } from "./address-schema";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";

export type Outcome = { ok: true } | { ok: false; error: string };

const path = (baseUrl: string) => `${baseUrl}/api/account/profile/addresses`;

function jsonInit(method: string, body: unknown): RequestInit {
  const auth = authInit();
  return {
    method,
    headers: { "Content-Type": "application/json", ...auth.headers },
    credentials: auth.credentials,
    body: JSON.stringify(body),
  };
}

async function failure(res: Response): Promise<Outcome> {
  return { ok: false, error: humanizeApiError(unwrapEnvelope(await res.json().catch(() => ({})))) };
}

/** `null` when the list could not be read. */
export async function listAddresses(
  baseUrl: string,
  kind: AddressKind,
  signal?: AbortSignal,
): Promise<AddressRecord[] | null> {
  const res = await fetch(`${path(baseUrl)}?kind=${kind}`, {
    cache: "no-store",
    signal,
    ...authInit(),
  });
  if (!res.ok) return null;
  const body = unwrapEnvelope(await res.json()) as { ok: boolean; addresses: AddressRecord[] };
  return body.ok ? body.addresses : null;
}

export async function createAddress(baseUrl: string, input: AddressInput): Promise<Outcome> {
  const res = await fetch(path(baseUrl), jsonInit("POST", input));
  return res.ok ? { ok: true } : failure(res);
}

export async function updateAddress(
  baseUrl: string,
  id: string,
  partial: Partial<AddressInput>,
): Promise<Outcome> {
  const res = await fetch(`${path(baseUrl)}?id=${id}`, jsonInit("PATCH", partial));
  return res.ok ? { ok: true } : failure(res);
}

export async function deleteAddress(baseUrl: string, id: string): Promise<Outcome> {
  const res = await fetch(`${path(baseUrl)}?id=${id}`, { method: "DELETE", ...authInit() });
  if (res.ok) return { ok: true };
  const body = unwrapEnvelope(await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: body.error ?? "delete_failed" };
}

/**
 * The route answers a zod failure with
 * `{ ok: false, error: "invalid", issues: { fieldErrors: { ... } } }`. The flat
 * "invalid" says nothing, so surface the first field error instead.
 */
export function humanizeApiError(body: unknown): string {
  if (!body || typeof body !== "object") return "save_failed";
  const b = body as {
    error?: string;
    issues?: { fieldErrors?: Record<string, string[] | undefined> };
  };
  const [field, messages] = Object.entries(b.issues?.fieldErrors ?? {})[0] ?? [];
  if (field) return `${field}: ${messages?.[0] ?? "invalid"}`;
  return b.error ?? "save_failed";
}
