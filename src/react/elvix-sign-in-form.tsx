"use client";

import { type CSSProperties, type FormEvent, useMemo, useState } from "react";
import { type ElvixCopy, fillCopy, resolveCopy } from "./copy";
import { ElvixSecuredBadge } from "./elvix-secured-badge";
import { useElvixApp, useElvixContext } from "./elvix-provider";
import { runPasskeySignIn } from "./passkey";
import { isSameOrigin, setElvixToken } from "./session";
import { type ElvixSizeProps, sizeStyle } from "./size";
import type { ElvixSignInResult } from "./types";

/**
 * `<ElvixSignInForm>` — the polished, fully-styled sign-in surface a
 * customer drops onto their own app.
 *
 * Where `<ElvixSignIn>` is the bare-bones flow (class-hooked, host paints
 * it), this is the finished card: rounded logo tile, "Sign in to {app}"
 * heading, "Continue with Google", an OR divider, the email→code OTP
 * flow, a legal footer, and a "Secured by elvix" badge. It ships with
 * **inline styles only** — no host CSS required, so it looks right the
 * moment it mounts on any origin.
 *
 * Cross-origin correct: OTP start/verify pick credentials from
 * `isSameOrigin(baseUrl)` exactly like `<ElvixSignIn>`; on a third-party
 * origin the session token comes back in the response body and is stored
 * via `setElvixToken`. Google is a top-level redirect.
 *
 * Reads enabled methods + branding from the Console-configured bootstrap
 * envelope (`<ElvixProvider clientId>` must be an ancestor). Renders only
 * the factors the Console turned on; never invents UI it denied.
 *
 * `onResult({ ok, ... })` fires on success AND every failure, mirroring
 * `<ElvixSignIn>`. The component never navigates the host itself.
 */

export type ElvixSignInFormProps = {
  /** Fires on every terminal outcome — success and failure — like `<ElvixSignIn>`. */
  onResult?: (r: ElvixSignInResult) => void;
  /** Default redirect target on success when the server doesn't echo one. */
  redirectAfterSignIn?: string;
  /**
   * Thin per-embed copy override. The primary way to edit copy is the elvix
   * Console (served live in the bootstrap `strings`); this prop just lets a
   * single embed tweak a string or two without a Console change.
   */
  copy?: Partial<ElvixCopy>;
  className?: string;
} & /** Sizing — applied to the card root inline style (SDK components are sizable). */
  ElvixSizeProps;

/** Simple passkey/fingerprint glyph, inline so the button needs no host assets. */
function PasskeyIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: "block" }}
    >
      <circle cx="9" cy="8" r="4" />
      <path d="M4 20c0-3 2.5-5 5-5 1 0 1.9.3 2.7.8" />
      <path d="M17 12.5a2.5 2.5 0 1 0-2.5 2.5v5l1.2-1.2 1.3 1.2v-5a2.5 2.5 0 0 0 0-2.5Z" />
    </svg>
  );
}

/** Official multi-colour Google "G", inline so the button needs no host assets. */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden style={{ display: "block" }}>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function ElvixSignInForm({
  onResult,
  redirectAfterSignIn,
  copy: copyProp,
  className = "",
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
  width,
  height,
}: ElvixSignInFormProps) {
  const ctx = useElvixContext();
  const app = useElvixApp();
  const copy = resolveCopy(app?.strings, copyProp);
  const [step, setStep] = useState<"identify" | "code" | "done">("identify");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Brand the primary button + logo tile with the app's colour pair, falling
  // back to elvix lavender when the bootstrap envelope hasn't loaded yet.
  const brand = app?.brandColor || "#6c5ce7";
  const onBrand = app?.onBrandColor || "#fff";

  const appName = app?.appName ?? "your app";
  const verb = app?.signInVerb === "login" ? "Log in" : "Sign in";
  const defaultTitle = app?.appName ? `${verb} to ${app.appName}` : verb;
  const title = copy.title ? fillCopy(copy.title, { app: app?.appName ?? "" }) : defaultTitle;
  const submitLabel = copy.submitButton ?? verb;

  const showGoogle = Boolean(app?.methodGoogle);
  const showPasskey = Boolean(app?.methodPasskey);
  const showEmail = Boolean(app?.methodEmailOtp);
  // The divider sits between the "social" factors (Google + passkey) and the
  // email form — show it whenever at least one social factor coexists with email.
  const showDivider = (showGoogle || showPasskey) && showEmail;

  const logoSrc = app?.iconUrl || app?.logoUrl || null;
  const privacyUrl = app?.privacyPolicyUrl || null;
  const termsUrl = app?.termsOfServiceUrl || null;
  const hasLegal = Boolean(privacyUrl || termsUrl);

  // Cross-origin passkey works via elvix's Related Origin Requests manifest
  // (/.well-known/webauthn): the credential stays bound to elvix's RP id while
  // the assertion is made from the host origin. See ./passkey.ts.

  const cardStyle: CSSProperties = useMemo(
    () => ({
      boxSizing: "border-box",
      // Defaults first; the shared sizeStyle() overrides only the keys the host set,
      // so the form keeps its width "100%" / maxWidth 400 defaults when unsized.
      width: "100%",
      maxWidth: 400,
      ...sizeStyle({ width, height, minWidth, maxWidth, minHeight, maxHeight }),
      margin: "0 auto",
      display: "flex",
      flexDirection: "column",
      gap: 18,
      background: "#fff",
      color: "#18181b",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: 16,
      boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 12px 32px -12px rgba(0,0,0,0.18)",
      padding: 28,
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      textAlign: "center",
    }),
    [width, maxWidth, minWidth, height, minHeight, maxHeight],
  );

  function fail(error: string, message?: string) {
    setError(message ?? error);
    onResult?.({ ok: false, error, message });
  }

  async function startGoogle() {
    if (!ctx.clientId) return fail("missing_client_id", "ElvixProvider needs a clientId.");
    window.location.assign(
      `${ctx.baseUrl}/api/auth/google/start?intent=app&clientId=${encodeURIComponent(ctx.clientId)}`,
    );
  }

  async function startPasskey() {
    setBusy(true);
    setError(null);
    try {
      const result = await runPasskeySignIn(ctx.baseUrl, ctx.clientId);
      if (!result.ok) {
        // A user-cancelled prompt isn't an error worth shouting — report it
        // through onResult but leave the card quiet (no red banner).
        if (result.error === "passkey_cancelled") {
          onResult?.({ ok: false, error: result.error });
          return;
        }
        return fail(result.error, result.message);
      }
      setStep("done");
      onResult?.({
        ok: true,
        method: "passkey",
        redirect: result.redirect ?? redirectAfterSignIn,
        token: result.token,
      });
    } finally {
      setBusy(false);
    }
  }

  async function startOtp(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return fail("invalid_input", copy.errorEnterEmail);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${ctx.baseUrl}/api/auth/otp/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: isSameOrigin(ctx.baseUrl) ? "include" : "omit",
        body: JSON.stringify({
          email: email.trim(),
          intent: "app",
          clientId: ctx.clientId,
        }),
      });
      const body = (await res.json()) as {
        success?: boolean;
        data?: { challengeId: string };
        errorMessage?: string;
      };
      if (!res.ok || !body.success || !body.data?.challengeId) {
        return fail(body.errorMessage ?? "otp_start_failed");
      }
      setChallengeId(body.data.challengeId);
      setStep("code");
    } catch (e: unknown) {
      fail("network", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    if (!challengeId) return;
    if (code.trim().length !== 6) return fail("invalid_input", copy.errorEnterCode);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${ctx.baseUrl}/api/auth/otp/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: isSameOrigin(ctx.baseUrl) ? "include" : "omit",
        body: JSON.stringify({ challengeId, code: code.trim() }),
      });
      const body = (await res.json()) as {
        success?: boolean;
        data?: { redirect?: string; token?: string };
        errorMessage?: string;
      };
      if (!res.ok || !body.success) {
        return fail(body.errorMessage ?? "otp_verify_failed");
      }
      // Cross-origin: store the session token returned in the body (no cookie
      // is set on a third-party origin) so every later SDK call carries it.
      if (body.data?.token) setElvixToken(body.data.token);
      setStep("done");
      onResult?.({
        ok: true,
        method: "email_otp",
        redirect: body.data?.redirect ?? redirectAfterSignIn,
        token: body.data?.token,
      });
    } catch (e: unknown) {
      fail("network", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const labelStyle: CSSProperties = {
    display: "block",
    textAlign: "left",
    fontSize: 12.5,
    fontWeight: 500,
    color: "#52525b",
    marginBottom: 6,
  };

  const inputStyle: CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    height: 44,
    padding: "0 14px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "#fff",
    color: "#18181b",
    fontSize: 14,
    outline: "none",
  };

  const primaryBtnStyle: CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    height: 44,
    marginTop: 10,
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 10,
    background: brand,
    color: onBrand,
    fontSize: 14,
    fontWeight: 600,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.65 : 1,
    backgroundImage:
      "linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0) 40%)",
    boxShadow:
      "0 1px 0 rgba(255,255,255,0.06) inset, 0 2px 3px -1px rgba(0,0,0,0.18), 0 0 0 1px rgba(25,28,33,0.06)",
  };

  const googleBtnStyle: CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    height: 44,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    border: "1px solid rgba(0,0,0,0.14)",
    borderRadius: 10,
    background: "#fff",
    color: "#18181b",
    fontSize: 14,
    fontWeight: 500,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.65 : 1,
  };

  // Brand-tinted "rgba" wash for the letter-fallback logo tile.
  const tileTint = hexToRgba(brand, 0.12);

  const root = `${className}`.trim() || undefined;

  return (
    <div className={root} style={cardStyle} data-elvix-pane={step}>
      {/* Header: logo tile + heading + subtitle */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            overflow: "hidden",
            background: logoSrc ? "#fff" : tileTint,
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          {logoSrc ? (
            // biome-ignore lint/a11y/useAltText: alt is set
            <img
              src={logoSrc}
              alt={appName}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ fontSize: 22, fontWeight: 700, color: brand }}>
              {appName.charAt(0).toUpperCase() || "?"}
            </span>
          )}
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {step === "code" ? "Check your inbox" : title}
          </h2>
          {step !== "done" && (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#71717a" }}>
              {step === "code"
                ? fillCopy(copy.codeSentSubtitle ?? "", { email })
                : copy.subtitle}
            </p>
          )}
        </div>
      </div>

      {step === "done" && (
        <p style={{ margin: 0, fontSize: 14, color: "#18181b" }}>{copy.signedInText}</p>
      )}

      {step === "identify" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {showGoogle && (
            <button
              type="button"
              onClick={startGoogle}
              disabled={busy}
              style={googleBtnStyle}
              data-elvix-method="google"
            >
              <GoogleG />
              <span>{copy.googleButton}</span>
            </button>
          )}

          {showPasskey && (
            <button
              type="button"
              onClick={startPasskey}
              disabled={busy}
              style={googleBtnStyle}
              data-elvix-method="passkey"
            >
              <PasskeyIcon />
              <span>{copy.passkeyButton}</span>
            </button>
          )}

          {showDivider && (
            <div
              aria-hidden
              style={{ display: "flex", alignItems: "center", gap: 12, color: "#a1a1aa" }}
            >
              <span style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em" }}>OR</span>
              <span style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }} />
            </div>
          )}

          {showEmail && (
            <form onSubmit={startOtp} data-elvix-method="email_otp">
              <label htmlFor="elvix-email" style={labelStyle}>
                Email
              </label>
              <input
                id="elvix-email"
                type="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder={copy.emailPlaceholder}
                required
                disabled={busy}
                autoComplete="email"
                style={inputStyle}
              />
              <button type="submit" disabled={busy} style={primaryBtnStyle}>
                {busy ? copy.sendingLabel : copy.sendCodeButton}
              </button>
            </form>
          )}
        </div>
      )}

      {step === "code" && (
        <form onSubmit={verifyOtp}>
          <label htmlFor="elvix-code" style={labelStyle}>
            Verification code
          </label>
          <input
            id="elvix-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ""))}
            placeholder={copy.codePlaceholder}
            required
            disabled={busy}
            autoComplete="one-time-code"
            autoFocus
            style={{ ...inputStyle, letterSpacing: "0.3em", textAlign: "center", fontSize: 18 }}
          />
          <button type="submit" disabled={busy} style={primaryBtnStyle}>
            {busy ? copy.verifyingLabel : submitLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("identify");
              setCode("");
              setError(null);
            }}
            disabled={busy}
            style={{
              marginTop: 12,
              background: "none",
              border: "none",
              color: "#71717a",
              fontSize: 12.5,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Use a different email
          </button>
        </form>
      )}

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "#dc2626" }}>
          {error}
        </p>
      )}

      {/* Legal footer — only the URLs the Console actually configured. */}
      {hasLegal && step !== "done" && (
        <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: "#a1a1aa" }}>
          By continuing, you agree to {appName}&apos;s{" "}
          {termsUrl && (
            <a
              href={termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#71717a", textDecoration: "underline" }}
            >
              Terms of Service
            </a>
          )}
          {termsUrl && privacyUrl && " · "}
          {privacyUrl && (
            <a
              href={privacyUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#71717a", textDecoration: "underline" }}
            >
              Privacy Policy
            </a>
          )}
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "center", paddingTop: 2 }}>
        <ElvixSecuredBadge variant="outline" theme="light" size="sm" accentColor={brand} />
      </div>
    </div>
  );
}

/** Hex (#rgb / #rrggbb) → rgba() string. Falls back to the input on a miss. */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1]!;
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = Number.parseInt(h, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
