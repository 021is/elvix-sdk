/**
 * Adding a passkey (out of `passkey.ts` in 0.26): `register/start`, the browser's
 * `navigator.credentials.create`, `register/finish`, on the same wire helpers as the
 * sign-in. It holds the page's one passkey request (`passkey-lock.ts`), so a `create()`
 * never opens beside another card's autofill offer or dialog, and every wait in it is
 * bounded (`passkey-timeout.ts`).
 */

import {
  b64urlToBuf,
  bufToB64url,
  type CredentialDescriptorJSON,
  ceremonyFailure,
  decodeDescriptors,
  type Failure,
  isPasskeyCredential,
  postEnvelope,
} from "./passkey";
import { holdCeremony, releaseCeremony } from "./passkey-lock";
import { orAbort, PASSKEY_PROMPT_TIMEOUT_MS, passkeyRequestSignal } from "./passkey-timeout";
import { authInit } from "./session";

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

/** A code only, as every passkey failure (`passkey_busy` while another passkey request is
 *  open on the page). */
export type PasskeyRegisterResult = { ok: true } | Failure;

const isAttestation = (r: AuthenticatorResponse): r is AuthenticatorAttestationResponse =>
  "attestationObject" in r;

async function promptAttestation(
  options: RegOptionsJSON,
): Promise<{ ok: true; attestation: AttestationJSON } | Failure> {
  const signal = passkeyRequestSignal(null, PASSKEY_PROMPT_TIMEOUT_MS);
  try {
    const asked = navigator.credentials.create({
      signal,
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
    });
    const cred = await orAbort(asked, signal, null);
    if (!isPasskeyCredential(cred)) return { ok: false, error: "passkey_cancelled" };
    const resp = cred.response;
    if (!isAttestation(resp)) return { ok: false, error: "passkey_register_failed" };
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

/** Where a passkey is added, and for whom. */
type RegisterScope = {
  baseUrl: string;
  surface: string;
  /** When set, the issued passkey is bound to this one app and can only sign the user in
   *  to it. The caller must already be a member; elvix's `register/start` enforces it. */
  applicationId?: string;
  /** Public client id, sent to `register/finish` so elvix can trust the app's configured
   *  allowedOrigins for an INLINE cross-origin enrollment (the credential's origin is the
   *  customer origin). Does NOT scope the passkey: that is `applicationId`. Without it, a
   *  cross-origin inline finish is refused and the caller falls back to the hosted page. */
  clientId?: string;
};

async function register({
  baseUrl,
  surface,
  applicationId,
  clientId,
}: RegisterScope): Promise<PasskeyRegisterResult> {
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

/**
 * Onboarding "add a passkey" step and the account's app passkeys, cross-origin aware. The
 * user is already signed in, so requests carry the session via `authInit()` (bearer
 * cross-origin, cookie same-origin). A cancel is `passkey_cancelled`; nothing throws.
 */
export async function runPasskeyRegister(
  baseUrl: string,
  surface: string,
  applicationId?: string,
  clientId?: string,
): Promise<PasskeyRegisterResult> {
  if (
    typeof window === "undefined" ||
    !window.PublicKeyCredential ||
    !navigator.credentials?.create
  ) {
    return { ok: false, error: "passkey_unsupported" };
  }
  if (!(await holdCeremony())) return { ok: false, error: "passkey_busy" };
  try {
    return await register({ baseUrl, surface, applicationId, clientId });
  } finally {
    releaseCeremony();
  }
}
