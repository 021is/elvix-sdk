/**
 * `approveDevice` — POST elvix's device/approve with the session token obtained
 * from signing in on the host's own `<ElvixDeviceApproval>` page. Pure network
 * helper (no React) so the surface stays a thin view and the approval contract
 * is unit-testable.
 *
 * Contract (RFC 8628 §3.3, elvix flavour): `POST {baseUrl}/api/v1/device/approve`
 * with `Authorization: Bearer <session-token>` and a JSON `{ user_code }`. A 2xx
 * means the pending device authorization flipped to approved; the CLI's next
 * poll mints its token.
 */

const DEFAULT_BASE_URL = "https://elvix.is";

export type ApproveDeviceResult = { ok: true } | { ok: false; error: string };

export async function approveDevice(args: {
  /** elvix origin. Defaults to https://elvix.is. */
  baseUrl?: string;
  /** The session token from sign-in (ElvixSignInForm onAuthenticated). */
  token: string;
  /** The short user_code the CLI showed in the terminal. */
  userCode: string;
}): Promise<ApproveDeviceResult> {
  const origin = args.baseUrl ?? DEFAULT_BASE_URL;
  try {
    const res = await fetch(`${origin}/api/v1/device/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${args.token}` },
      body: JSON.stringify({ user_code: args.userCode }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as
      | { errorMessage?: string; error?: string }
      | null;
    return { ok: false, error: body?.errorMessage ?? body?.error ?? "Approval failed." };
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
}
