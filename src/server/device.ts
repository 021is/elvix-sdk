/**
 * OAuth 2.0 Device Authorization Grant (RFC 8628) client.
 *
 * For headless / CLI tools that can't open a browser inline (e.g. `elvix login`,
 * `plm login`): request a code, the user approves it in a browser, then poll for
 * an access token (`eak_`) bound to the approving user. Reusable by every CLI.
 *
 *   const code = await requestDeviceCode({ clientId, baseUrl });
 *   // show code.verificationUriComplete + code.userCode to the user
 *   const r = await pollDeviceToken({ clientId, deviceCode: code.deviceCode, baseUrl,
 *                                     interval: code.interval, expiresIn: code.expiresIn });
 *   if (r.ok) save(r.accessToken);
 */

const DEFAULT_BASE_URL = "https://elvix.is";

export type DeviceCode = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
};

export type RequestDeviceCodeArgs = {
  /** The Application client_id the device authenticates against. */
  clientId: string;
  /** elvix origin. Defaults to https://elvix.is. */
  baseUrl?: string;
  /** Optional space-delimited scopes. */
  scope?: string;
};

export async function requestDeviceCode(args: RequestDeviceCodeArgs): Promise<DeviceCode> {
  const baseUrl = args.baseUrl ?? DEFAULT_BASE_URL;
  const res = await fetch(`${baseUrl}/api/v1/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: args.clientId,
      ...(args.scope ? { scope: args.scope } : {}),
    }),
  });
  if (!res.ok) throw new Error(`device authorization failed (${res.status})`);
  const b = (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  };
  return {
    deviceCode: b.device_code,
    userCode: b.user_code,
    verificationUri: b.verification_uri,
    verificationUriComplete: b.verification_uri_complete,
    expiresIn: b.expires_in,
    interval: b.interval,
  };
}

export type PollDeviceTokenArgs = {
  clientId: string;
  deviceCode: string;
  baseUrl?: string;
  /** Seconds between polls (server-provided). Default 5. */
  interval?: number;
  /** Seconds until the code expires (server-provided). Default 600. */
  expiresIn?: number;
  signal?: AbortSignal;
};

export type DeviceTokenResult =
  | { ok: true; accessToken: string; tokenType: string; scope?: string }
  | { ok: false; error: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll the token endpoint until the user approves (returns the token), denies,
 * or the code expires. Honors RFC 8628 `authorization_pending` / `slow_down`.
 */
export async function pollDeviceToken(args: PollDeviceTokenArgs): Promise<DeviceTokenResult> {
  const baseUrl = args.baseUrl ?? DEFAULT_BASE_URL;
  let intervalMs = (args.interval ?? 5) * 1000;
  const deadline = Date.now() + (args.expiresIn ?? 600) * 1000;
  while (Date.now() < deadline) {
    if (args.signal?.aborted) return { ok: false, error: "aborted" };
    await sleep(intervalMs);
    const res = await fetch(`${baseUrl}/api/v1/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: args.deviceCode, client_id: args.clientId }),
    });
    const b = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      error?: string;
    };
    if (b.access_token) {
      return { ok: true, accessToken: b.access_token, tokenType: b.token_type ?? "Bearer", scope: b.scope };
    }
    if (b.error === "slow_down") {
      intervalMs += 2000;
      continue;
    }
    if (b.error === "authorization_pending") continue;
    return { ok: false, error: b.error ?? "device_login_failed" };
  }
  return { ok: false, error: "expired_token" };
}
