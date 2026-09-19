/**
 * Request plumbing shared by the profile editors (addresses, legal entities,
 * languages, region): a JSON write with the session's auth, a fetch that
 * never rejects, and the CRUD of a profile collection.
 */

import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";

export function jsonInit(method: string, body: unknown): RequestInit {
  const auth = authInit();
  return {
    method,
    headers: { "Content-Type": "application/json", ...auth.headers },
    credentials: auth.credentials,
    body: JSON.stringify(body),
  };
}

/** The unwrapped body of a failed response; `{}` when it is not JSON. */
export async function failureBody(res: Response): Promise<Record<string, unknown>> {
  const body = unwrapEnvelope(await res.json().catch(() => ({})));
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

/** `fetch` that resolves to `null` on a network error instead of rejecting. */
export function send(url: string, init: RequestInit): Promise<Response | null> {
  return fetch(url, init).catch(() => null);
}

/**
 * The routes answer a zod failure with
 * `{ ok: false, error: "invalid", issues: { fieldErrors: { ... } } }`. The flat
 * "invalid" says nothing, so surface the first field error instead.
 */
export function humanizeApiError(body: Record<string, unknown>, fallback: string): string {
  const b = body as {
    error?: string;
    issues?: { fieldErrors?: Record<string, string[] | undefined> };
  };
  const [field, messages] = Object.entries(b.issues?.fieldErrors ?? {})[0] ?? [];
  if (field) return `${field}: ${messages?.[0] ?? "invalid"}`;
  return b.error ?? fallback;
}

export type Outcome = { ok: true } | { ok: false; error: string };

async function outcome(res: Response | null, fallback: string): Promise<Outcome> {
  if (res?.ok) return { ok: true };
  return { ok: false, error: res ? humanizeApiError(await failureBody(res), fallback) : fallback };
}

/**
 * CRUD for one collection under `/api/account/profile/<resource>`: the list
 * reads `{ ok, <resource>: [...] }`, writes address a row by `?id=`. Nothing
 * rejects; a failed write resolves to its worded error.
 */
export function profileCollection<Row, Input>(baseUrl: string, resource: string) {
  const path = `${baseUrl}/api/account/profile/${resource}`;
  const row = (id: string) => `${path}?id=${encodeURIComponent(id)}`;
  return {
    /** `null` when the list could not be read. */
    async list(query = "", signal?: AbortSignal): Promise<Row[] | null> {
      const res = await send(`${path}${query}`, { cache: "no-store", signal, ...authInit() });
      if (!res?.ok) return null;
      const body = unwrapEnvelope(await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      const rows = body?.[resource];
      return body?.ok && Array.isArray(rows) ? (rows as Row[]) : null;
    },
    async create(input: Input): Promise<Outcome> {
      return outcome(await send(path, jsonInit("POST", input)), "save_failed");
    },
    async update(id: string, partial: Partial<Input>): Promise<Outcome> {
      return outcome(await send(row(id), jsonInit("PATCH", partial)), "save_failed");
    },
    async remove(id: string): Promise<Outcome> {
      return outcome(await send(row(id), { method: "DELETE", ...authInit() }), "delete_failed");
    },
  };
}
