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
 * Both ceremonies are the same three steps — `start` (options), the browser
 * prompt, `finish` (verify) — built from the helpers below. Nothing throws
 * past a `run*` function: every failure is a `{ ok: false, error }`.
 */

import { authInit, isSameOrigin, setElvixToken } from "./session";

/** base64url string → ArrayBuffer. */
function b64urlToBuf(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** ArrayBuffer → base64url string (no padding). */
function bufToB64url(buf: ArrayBuffer): string {
  let bin = "";
  for (const byte of new Uint8Array(buf)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Failure = { ok: false; error: string; message?: string };
type Step<T> = { ok: true; data: T | undefined } | Failure;

type CredentialDescriptorJSON = { id: string; type: "public-key"; transports?: string[] };

const decodeDescriptors = (list: CredentialDescriptorJSON[] | undefined) =>
  list?.map((c) => ({
    id: b64urlToBuf(c.id),
    type: c.type,
    transports: c.transports as AuthenticatorTransport[] | undefined,
  }));

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : undefined);

/**
 * POST JSON to an elvix route that answers with the Spine envelope. A non-2xx
 * or `success: false` becomes the envelope's `errorMessage`, else `fallback`;
 * a network or parse failure becomes `network`.
 */
async function postEnvelope<T>(url: string, init: RequestInit, fallback: string): Promise<Step<T>> {
  try {
    const res = await fetch(url, { method: "POST", ...init });
    const body = (await res.json()) as { success?: boolean; data?: T; errorMessage?: string };
    if (!res.ok || !body.success) return { ok: false, error: body.errorMessage ?? fallback };
    return { ok: true, data: body.data };
  } catch (e) {
    return { ok: false, error: "network", message: errorMessage(e) };
  }
}

/** The browser prompt failed. A dismissed or timed-out prompt (NotAllowedError)
 *  and a programmatic abort are a graceful cancel, never a crash. */
function ceremonyFailure(e: unknown, code: string): Failure {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") {
    return { ok: false, error: "passkey_cancelled" };
  }
  return { ok: false, error: code, message: errorMessage(e) };
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

export type PasskeySignInResult =
  | { ok: true; redirect?: string; token?: string }
  | { ok: false; error: string; message?: string };

async function promptAssertion(
  options: AuthnOptionsJSON,
): Promise<{ ok: true; assertion: AssertionJSON } | Failure> {
  try {
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: b64urlToBuf(options.challenge),
        timeout: options.timeout,
        rpId: options.rpId,
        userVerification: options.userVerification,
        allowCredentials: decodeDescriptors(options.allowCredentials),
      },
    })) as PublicKeyCredential | null;
    if (!cred) return { ok: false, error: "passkey_cancelled" };
    const resp = cred.response as AuthenticatorAssertionResponse;
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
  }
}

/**
 * Run the full cross-origin passkey sign-in against `baseUrl` for `clientId`.
 *
 * 1. POST `/api/auth/passkey/sign-in/start` → authentication options.
 * 2. `navigator.credentials.get` → assertion.
 * 3. POST `/api/auth/passkey/sign-in/finish` → session token (cross-origin).
 *
 * On success the token is stored via `setElvixToken` and returned. User-cancel
 * / no-credential resolve to `{ ok:false, error:"passkey_cancelled" }`; nothing
 * throws past this boundary.
 */
export async function runPasskeySignIn(
  baseUrl: string,
  clientId: string | undefined,
  intent: string = "app",
): Promise<PasskeySignInResult> {
  // First-party surfaces (elvix's own account / console sign-in on elvix.is)
  // authenticate the identity itself, not an app membership — they have no
  // external clientId. Only the external-app path requires one.
  if (intent === "app" && !clientId) {
    return { ok: false, error: "missing_client_id", message: "ElvixProvider needs a clientId." };
  }
  if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials?.get) {
    return { ok: false, error: "passkey_unsupported", message: "This browser can't use passkeys." };
  }

  const init: RequestInit = {
    headers: { "content-type": "application/json" },
    credentials: isSameOrigin(baseUrl) ? "include" : "omit",
  };
  const scope = { intent, ...(clientId ? { clientId } : {}) };

  const start = await postEnvelope<{ options: AuthnOptionsJSON }>(
    `${baseUrl}/api/auth/passkey/sign-in/start`,
    { ...init, body: JSON.stringify(scope) },
    "passkey_start_failed",
  );
  if (!start.ok) return start;
  if (!start.data?.options) return { ok: false, error: "passkey_start_failed" };

  const prompt = await promptAssertion(start.data.options);
  if (!prompt.ok) return prompt;

  const finish = await postEnvelope<{ redirect?: string; token?: string }>(
    `${baseUrl}/api/auth/passkey/sign-in/finish`,
    { ...init, body: JSON.stringify({ ...scope, ...prompt.assertion }) },
    "passkey_verify_failed",
  );
  if (!finish.ok) return finish;
  // Cross-origin: store the session token returned in the body (no cookie is
  // set on a third-party origin) so every later SDK call carries it.
  if (finish.data?.token) setElvixToken(finish.data.token);
  return { ok: true, redirect: finish.data?.redirect, token: finish.data?.token };
}

// ─── Registration ────────────────────────────────────────────────────────────

/** Minimal shape of the options elvix returns from `generateRegistrationOptions`. */
type RegOptionsJSON = {
  challenge: string;
  rp: { id?: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  timeout?: number;
  attestation?: AttestationConveyancePreference;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  excludeCredentials?: CredentialDescriptorJSON[];
  extensions?: AuthenticationExtensionsClientInputs;
};

/** The `RegistrationResponseJSON` shape elvix's register `finish` expects. */
type AttestationJSON = {
  id: string;
  rawId: string;
  type: "public-key";
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  authenticatorAttachment?: string | null;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
  };
};

export type PasskeyRegisterResult = { ok: true } | { ok: false; error: string; message?: string };

async function promptAttestation(
  options: RegOptionsJSON,
): Promise<{ ok: true; attestation: AttestationJSON } | Failure> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: b64urlToBuf(options.challenge),
        rp: options.rp,
        user: {
          id: b64urlToBuf(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName,
        },
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        attestation: options.attestation,
        authenticatorSelection: options.authenticatorSelection,
        excludeCredentials: decodeDescriptors(options.excludeCredentials),
        extensions: options.extensions,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return { ok: false, error: "passkey_cancelled" };
    const resp = cred.response as AuthenticatorAttestationResponse;
    return {
      ok: true,
      attestation: {
        id: cred.id,
        rawId: bufToB64url(cred.rawId),
        type: "public-key",
        clientExtensionResults: cred.getClientExtensionResults(),
        authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
        response: {
          clientDataJSON: bufToB64url(resp.clientDataJSON),
          attestationObject: bufToB64url(resp.attestationObject),
          transports: resp.getTransports?.() ?? undefined,
        },
      },
    };
  } catch (e) {
    return ceremonyFailure(e, "passkey_register_failed");
  }
}

/**
 * Onboarding "add a passkey" step, cross-origin aware. Mirrors
 * `runPasskeySignIn` but for `navigator.credentials.create` against the
 * register start/finish routes. The user is already authenticated at this
 * point, so requests carry the session via `authInit()` (bearer cross-origin,
 * cookie same-origin). User-cancel resolves to
 * `{ ok:false, error:"passkey_cancelled" }`; nothing throws past here.
 */
export async function runPasskeyRegister(
  baseUrl: string,
  surface: string,
  /** When set, the issued passkey is bound to this one app and can
   *  only sign the user in to it. The caller must already be a
   *  member; elvix's `register/start` enforces membership. */
  applicationId?: string,
  /** Public client id. Sent to `register/finish` so elvix can trust the app's
   *  configured allowedOrigins for an INLINE cross-origin enrollment (the
   *  credential's origin is the customer origin). Does NOT scope the passkey —
   *  that's `applicationId`. Without it, cross-origin inline finish is rejected
   *  (origin mismatch) and the caller should fall back to the hosted ceremony. */
  clientId?: string,
): Promise<PasskeyRegisterResult> {
  if (
    typeof window === "undefined" ||
    !window.PublicKeyCredential ||
    !navigator.credentials?.create
  ) {
    return { ok: false, error: "passkey_unsupported", message: "This browser can't use passkeys." };
  }

  const auth = authInit();
  const init: RequestInit = {
    headers: { "content-type": "application/json", ...auth.headers },
    credentials: auth.credentials,
  };

  const start = await postEnvelope<{ options: RegOptionsJSON }>(
    `${baseUrl}/api/auth/passkey/register/start`,
    { ...init, body: JSON.stringify(applicationId ? { surface, applicationId } : { surface }) },
    "passkey_register_failed",
  );
  if (!start.ok) return start;
  if (!start.data?.options) return { ok: false, error: "passkey_register_failed" };

  const prompt = await promptAttestation(start.data.options);
  if (!prompt.ok) return prompt;

  const finish = await postEnvelope<unknown>(
    `${baseUrl}/api/auth/passkey/register/finish`,
    {
      ...init,
      body: JSON.stringify({
        surface,
        ...(applicationId ? { applicationId } : {}),
        ...(clientId ? { clientId } : {}),
        response: prompt.attestation,
      }),
    },
    "passkey_register_failed",
  );
  return finish.ok ? { ok: true } : finish;
}
