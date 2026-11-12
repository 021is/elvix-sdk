/**
 * Cross-origin passkey sign-in for the SDK.
 *
 * The credential is bound to elvix's RP (`elvix.is`), NOT the host's origin.
 * A customer app on its own origin (e.g. `https://zp.edvone.dev`) can still
 * use it in the SAME window because elvix publishes that origin in its
 * `/.well-known/webauthn` Related Origin Requests manifest, and the browser
 * honours it. The assertion's `clientDataJSON.origin` is the host origin; the
 * elvix `finish` endpoint verifies it against the app's configured
 * `allowedOrigins` — never a wildcard.
 *
 * Hand-rolled `navigator.credentials.get` (no `@simplewebauthn/browser`
 * dependency — the SDK stays lean and MIT-clean). The server returns standard
 * `PublicKeyCredentialRequestOptionsJSON`; we base64url-decode the challenge +
 * `allowCredentials` ids, call the WebAuthn API, then base64url-encode the
 * assertion back into the `AuthenticationResponseJSON` shape elvix verifies.
 *
 * Both ceremonies (this sign-in, and adding a passkey in `passkey-register.ts`) are the
 * same three steps — `start` (options), the browser prompt, `finish` (verify) — built from
 * the helpers below, every wait bounded (`passkey-timeout.ts`). Nothing throws past a
 * `run*` function: every failure is a `{ ok: false, error }` code.
 */

import { elvixFetch } from "./elvix-fetch";
import { orAbort, PASSKEY_PROMPT_TIMEOUT_MS, passkeyRequestSignal } from "./passkey-timeout";
import { isSameOrigin, setElvixToken } from "./session";
import type { Landing } from "./use-sign-in-flow";

/** base64url string → ArrayBuffer. */
export function b64urlToBuf(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** ArrayBuffer → base64url string (no padding). */
export function bufToB64url(buf: ArrayBuffer): string {
  let bin = "";
  for (const byte of new Uint8Array(buf)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A failure is a code only: a browser's, an extension's or a server's own words never reach
 *  the page or `onResult` (security review 5, 2026-11-12). */
export type Failure = { ok: false; error: string };
type Step<T> = { ok: true; data: T | undefined } | Failure;

export type CredentialDescriptorJSON = { id: string; type: "public-key"; transports?: string[] };

/** What `navigator.credentials` answered, when it is a passkey credential. */
export const isPasskeyCredential = (c: Credential | null): c is PublicKeyCredential =>
  c !== null && "rawId" in c && "response" in c && "getClientExtensionResults" in c;

export const decodeDescriptors = (list: CredentialDescriptorJSON[] | undefined) =>
  list?.map((c) => ({
    id: b64urlToBuf(c.id),
    type: c.type,
    transports: c.transports as AuthenticatorTransport[] | undefined,
  }));

type Envelope<T> = { success?: boolean; data?: T; errorMessage?: unknown };

/** A refusal's code, when it is one (`passkey_verify_failed`): a 500's free text (a stack, a
 *  database address) is never a code, and never leaves this file (security review 6). */
const ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const codeOf = (value: unknown, fallback: string) =>
  typeof value === "string" && ERROR_CODE.test(value) ? value : fallback;

/** POST JSON to an elvix route with the Spine envelope, never past the passkey timeout, the
 *  body's read included. A refusal is its `errorMessage` when that is a code (else
 *  `fallback`); a network, timeout or parse failure, `network`. */
export async function postEnvelope<T>(
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<Step<T>> {
  const { signal, release } = passkeyRequestSignal(init.signal);
  try {
    const res = await orAbort(elvixFetch(url, { method: "POST", ...init, signal }), signal, null);
    if (!res) return { ok: false, error: "network" };
    const body: Envelope<T> | null = await orAbort(res.json(), signal, null);
    if (!body) return { ok: false, error: "network" };
    if (!res.ok || !body.success) return { ok: false, error: codeOf(body.errorMessage, fallback) };
    return { ok: true, data: body.data };
  } catch {
    // The browser's own words ("Failed to fetch", "signal is aborted") never reach the page.
    return { ok: false, error: "network" };
  } finally {
    release();
  }
}

/** The browser prompt failed. A dismissed or timed-out prompt (NotAllowedError)
 *  and a programmatic abort are a graceful cancel, never a crash. */
export function ceremonyFailure(e: unknown, code: string): Failure {
  // Not `instanceof Error`: some environments' DOMException does not inherit from it.
  const name = typeof e === "object" && e !== null && "name" in e ? e.name : undefined;
  if (name === "NotAllowedError" || name === "AbortError") {
    return { ok: false, error: "passkey_cancelled" };
  }
  return { ok: false, error: code };
}

// ─── Sign-in ─────────────────────────────────────────────────────────────────

/** Minimal shape of the options elvix returns from `generateAuthenticationOptions`. */
type AuthnOptionsJSON = {
  challenge: string;
  timeout?: number;
  rpId?: string;
  userVerification?: UserVerificationRequirement;
  allowCredentials?: CredentialDescriptorJSON[];
};

/** The `AuthenticationResponseJSON` shape elvix's `finish` endpoint expects. */
type AssertionJSON = {
  id: string;
  rawId: string;
  type: "public-key";
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  authenticatorAttachment?: string | null;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
};

/** A successful sign-in carries the finisher's whole landing: a passkey skips the passkey
 *  gate, not the username or restore steps; dropping `next_step` skipped them (to "/"). */
export type PasskeySignInResult = { ok: true; landing: Landing } | Failure;

/** How the browser asks: a dialog, or (0.26) the passkeys in the identifier field's autofill,
 *  which its `signal` ends (its start too, never its finish); `onPicked` runs on a choice. */
type PasskeyCeremony =
  | { kind: "dialog"; signal?: undefined }
  | { kind: "autofill"; signal: AbortSignal; onPicked: () => void };

const isAssertion = (r: AuthenticatorResponse): r is AuthenticatorAssertionResponse =>
  "authenticatorData" in r && "signature" in r;

async function promptAssertion(
  options: AuthnOptionsJSON,
  ceremony: PasskeyCeremony,
): Promise<{ ok: true; assertion: AssertionJSON } | Failure> {
  // The autofill's request lives as long as its offer; a dialog, at most the prompt timeout.
  // Raced against its signal too: an extension wrapping `get` may never honour it.
  const own = ceremony.signal ? null : passkeyRequestSignal(null, PASSKEY_PROMPT_TIMEOUT_MS);
  const signal = ceremony.signal ?? own?.signal;
  if (!signal) return { ok: false, error: "passkey_failed" };
  try {
    const asked = navigator.credentials.get({
      ...(ceremony.kind === "autofill" ? { mediation: "conditional" } : {}),
      signal,
      publicKey: {
        challenge: b64urlToBuf(options.challenge),
        timeout: options.timeout,
        rpId: options.rpId,
        userVerification: options.userVerification,
        allowCredentials: decodeDescriptors(options.allowCredentials),
      },
    });
    const cred = await orAbort(asked, signal, null);
    if (!isPasskeyCredential(cred)) return { ok: false, error: "passkey_cancelled" };
    const resp = cred.response;
    if (!isAssertion(resp)) return { ok: false, error: "passkey_failed" };
    return {
      ok: true,
      assertion: {
        id: cred.id,
        rawId: bufToB64url(cred.rawId),
        type: "public-key",
        clientExtensionResults: cred.getClientExtensionResults(),
        authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
        response: {
          clientDataJSON: bufToB64url(resp.clientDataJSON),
          authenticatorData: bufToB64url(resp.authenticatorData),
          signature: bufToB64url(resp.signature),
          userHandle: resp.userHandle ? bufToB64url(resp.userHandle) : undefined,
        },
      },
    };
  } catch (e) {
    return ceremonyFailure(e, "passkey_failed");
  } finally {
    own?.release();
  }
}

/** The full passkey sign-in against `baseUrl` for `clientId`: POST `sign-in/start`, the
 *  browser's prompt as `ceremony` says, POST `sign-in/finish` (its token kept with
 *  `setElvixToken`). A cancel, an abort or no credential is `passkey_cancelled`. Never throws. */
export async function runPasskeySignIn(
  baseUrl: string,
  clientId: string | undefined,
  intent: string = "app",
  ceremony: PasskeyCeremony = { kind: "dialog" },
): Promise<PasskeySignInResult> {
  // Only an app sign-in needs a clientId: elvix's own account and Console sign the identity in.
  if (intent === "app" && !clientId) {
    return { ok: false, error: "missing_client_id" };
  }
  if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials?.get) {
    return { ok: false, error: "passkey_unsupported" };
  }

  const init: RequestInit = {
    headers: { "content-type": "application/json" },
    credentials: isSameOrigin(baseUrl) ? "include" : "omit",
  };
  const scope = { intent, ...(clientId ? { clientId } : {}) };
  const start = await postEnvelope<{ options: AuthnOptionsJSON }>(
    `${baseUrl}/api/auth/passkey/sign-in/start`,
    { ...init, body: JSON.stringify(scope), signal: ceremony.signal },
    "passkey_start_failed",
  );
  if (!start.ok) return start;
  if (!start.data?.options) return { ok: false, error: "passkey_start_failed" };

  const prompt = await promptAssertion(start.data.options, ceremony);
  if (!prompt.ok) return prompt;
  // An offer ended (a tap, a pagehide) before its passkey arrived is abandoned: it never
  // picks and never finishes, however late a credential comes. The tap's dialog signs in.
  if (ceremony.signal?.aborted) return { ok: false, error: "passkey_cancelled" };
  if (ceremony.kind === "autofill") ceremony.onPicked();

  const finish = await postEnvelope<Landing>(
    `${baseUrl}/api/auth/passkey/sign-in/finish`,
    { ...init, body: JSON.stringify({ ...scope, ...prompt.assertion }) },
    "passkey_verify_failed",
  );
  if (!finish.ok) return finish;
  // Cross-origin the token comes in the body (no third-party cookie): every later call sends it.
  if (finish.data?.token) setElvixToken(finish.data.token);
  return { ok: true, landing: finish.data ?? {} };
}

// Adding a passkey is `passkey-register.ts`, on the helpers above.
