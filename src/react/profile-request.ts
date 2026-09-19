/**
 * Request plumbing shared by the profile editors (addresses, languages):
 * a JSON write with the session's auth, and the error code of a failed one.
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
