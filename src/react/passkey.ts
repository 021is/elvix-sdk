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
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Minimal shape of the options elvix returns from `generateAuthenticationOptions`. */
type AuthnOptionsJSON = {
  challenge: string;
  timeout?: number;
  rpId?: string;
  userVerification?: UserVerificationRequirement;
  allowCredentials?: { id: string; type: "public-key"; transports?: string[] }[];
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
): Promise<PasskeySignInResult> {
  if (!clientId) return { ok: false, error: "missing_client_id", message: "ElvixProvider needs a clientId." };
  if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials?.get) {
    return { ok: false, error: "passkey_unsupported", message: "This browser can't use passkeys." };
  }

  const credentials: RequestCredentials = isSameOrigin(baseUrl) ? "include" : "omit";

  // ── 1. start ──────────────────────────────────────────────────────────────
  let options: AuthnOptionsJSON;
  try {
    const res = await fetch(`${baseUrl}/api/auth/passkey/sign-in/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials,
      body: JSON.stringify({ intent: "app", clientId }),
    });
    const body = (await res.json()) as {
      success?: boolean;
      data?: { options: AuthnOptionsJSON };
      errorMessage?: string;
    };
    if (!res.ok || !body.success || !body.data?.options) {
      return { ok: false, error: body.errorMessage ?? "passkey_start_failed" };
    }
    options = body.data.options;
  } catch (e) {
    return { ok: false, error: "network", message: e instanceof Error ? e.message : undefined };
  }

  // ── 2. browser WebAuthn ─────────────────────────────────────────────────────
  let assertion: AssertionJSON;
  try {
    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge: b64urlToBuf(options.challenge),
      timeout: options.timeout,
      rpId: options.rpId,
      userVerification: options.userVerification,
      allowCredentials: options.allowCredentials?.map((c) => ({
        id: b64urlToBuf(c.id),
        type: c.type,
        transports: c.transports as AuthenticatorTransport[] | undefined,
      })),
    };
    const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
    if (!cred) return { ok: false, error: "passkey_cancelled" };

    const resp = cred.response as AuthenticatorAssertionResponse;
    assertion = {
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
    };
  } catch (e) {
    // NotAllowedError = user dismissed the prompt or it timed out; AbortError =
    // programmatic abort. Treat both as a graceful cancel, never a crash.
    const name = (e as { name?: string })?.name;
    if (name === "NotAllowedError" || name === "AbortError") {
      return { ok: false, error: "passkey_cancelled" };
    }
    return { ok: false, error: "passkey_failed", message: e instanceof Error ? e.message : undefined };
  }

  // ── 3. finish ───────────────────────────────────────────────────────────────
  try {
    const res = await fetch(`${baseUrl}/api/auth/passkey/sign-in/finish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials,
      body: JSON.stringify({ intent: "app", clientId, ...assertion }),
    });
    const body = (await res.json()) as {
      success?: boolean;
      data?: { redirect?: string; token?: string };
      errorMessage?: string;
    };
    if (!res.ok || !body.success) {
      return { ok: false, error: body.errorMessage ?? "passkey_verify_failed" };
    }
    // Cross-origin: store the session token returned in the body (no cookie is
    // set on a third-party origin) so every later SDK call carries it.
    if (body.data?.token) setElvixToken(body.data.token);
    return { ok: true, redirect: body.data?.redirect, token: body.data?.token };
  } catch (e) {
    return { ok: false, error: "network", message: e instanceof Error ? e.message : undefined };
  }
}

/** Minimal shape of the options elvix returns from `generateRegistrationOptions`. */
type RegOptionsJSON = {
  challenge: string;
  rp: { id?: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  timeout?: number;
  attestation?: AttestationConveyancePreference;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  excludeCredentials?: { id: string; type: "public-key"; transports?: string[] }[];
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

export type PasskeyRegisterResult =
  | { ok: true }
  | { ok: false; error: string; message?: string };

/**
 * Onboarding "add a passkey" step, cross-origin aware. Mirrors
 * `runPasskeySignIn` but for `navigator.credentials.create` against the
 * register start/finish routes. Hand-rolled (no `@simplewebauthn/browser`)
 * so the SDK stays lean + MIT-clean. The user is already authenticated at
 * this point, so requests carry the session via `authInit()` (bearer
 * cross-origin, cookie same-origin). User-cancel resolves to
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
  if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials?.create) {
    return { ok: false, error: "passkey_unsupported", message: "This browser can't use passkeys." };
  }

  const init = authInit();
  const reqInit = {
    headers: { "content-type": "application/json", ...init.headers },
    credentials: init.credentials,
  };

  // ── 1. start ──────────────────────────────────────────────────────────────
  let options: RegOptionsJSON;
  try {
    const res = await fetch(`${baseUrl}/api/auth/passkey/register/start`, {
      method: "POST",
      ...reqInit,
      body: JSON.stringify(
        applicationId ? { surface, applicationId } : { surface },
      ),
    });
    const body = (await res.json()) as {
      success?: boolean;
      data?: { options: RegOptionsJSON };
      errorMessage?: string;
    };
    if (!res.ok || !body.success || !body.data?.options) {
      return { ok: false, error: body.errorMessage ?? "passkey_register_failed" };
    }
    options = body.data.options;
  } catch (e) {
    return { ok: false, error: "network", message: e instanceof Error ? e.message : undefined };
  }

  // ── 2. browser WebAuthn ─────────────────────────────────────────────────────
  let attestation: AttestationJSON;
  try {
    const publicKey: PublicKeyCredentialCreationOptions = {
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
      excludeCredentials: options.excludeCredentials?.map((c) => ({
        id: b64urlToBuf(c.id),
        type: c.type,
        transports: c.transports as AuthenticatorTransport[] | undefined,
      })),
      extensions: options.extensions,
    };
    const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
    if (!cred) return { ok: false, error: "passkey_cancelled" };

    const resp = cred.response as AuthenticatorAttestationResponse;
    attestation = {
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
    };
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "NotAllowedError" || name === "AbortError") {
      return { ok: false, error: "passkey_cancelled" };
    }
    return { ok: false, error: "passkey_register_failed", message: e instanceof Error ? e.message : undefined };
  }

  // ── 3. finish ───────────────────────────────────────────────────────────────
  try {
    const res = await fetch(`${baseUrl}/api/auth/passkey/register/finish`, {
      method: "POST",
      ...reqInit,
      body: JSON.stringify({
        surface,
        ...(applicationId ? { applicationId } : {}),
        ...(clientId ? { clientId } : {}),
        response: attestation,
      }),
    });
    const body = (await res.json()) as { success?: boolean; errorMessage?: string };
    if (!res.ok || !body.success) {
      return { ok: false, error: body.errorMessage ?? "passkey_register_failed" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "network", message: e instanceof Error ? e.message : undefined };
  }
}
