"use client";

import { Loader2 } from "lucide-react";
import { useT } from "../locale/use-t";
import { type FormEvent, useEffect, useState } from "react";
import { type ElvixCopy, fillCopy, resolveCopy } from "./copy";
import { useElvixApp, useElvixContext } from "./elvix-provider";
import { runPasskeySignIn } from "./passkey";
import { isSameOrigin, setElvixToken, takeJustReturnedToken } from "./session";
import { type ElvixSizeProps, sizeStyle } from "./size";
import type { ElvixSignInResult } from "./types";

/** Local helper: drop `undefined` fields so they don't shadow lower-precedence layers. */
function stripUndefinedCopy(o?: Partial<ElvixCopy> | null): Partial<ElvixCopy> {
  if (!o) return {};
  const out: Partial<ElvixCopy> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/**
 * `<ElvixSignIn>` — drop-in sign-in surface.
 *
 * Reads enabled methods from the Console-configured bootstrap envelope
 * (`<ElvixProvider clientId>` must be in scope). Renders the methods
 * the customer turned on; never invents UI the Console denied.
 *
 * MVP supports:
 *   - Email OTP (the most common path)
 *   - Google redirect ("Continue with Google")
 *
 * Passkey + username-OTP follow in 0.2.x point releases.
 *
 * `onResult({ ok, ... })` is the only post-success hook the SDK
 * exposes. Hosts navigate from the callback; this component never
 * calls `router.push` itself.
 */
export function ElvixSignIn({
  onResult,
  redirectAfterSignIn,
  copy: copyProp,
  className = "",
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
}: {
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
} & ElvixSizeProps) {
  const sized = sizeStyle({ width, height, minWidth, maxWidth, minHeight, maxHeight });
  const ctx = useElvixContext();
  const app = useElvixApp();
  const t = useT();
  // useT() forms the BOTTOM of the copy-precedence chain: catalog-driven
  // defaults that honour the host's <ElvixProvider locale="..."> setting.
  // Console-configured `strings` and the per-embed `copy` prop still win
  // on top, in that order. We layer ABOVE `resolveCopy` (which seeds the
  // built-in English defaults) so the active-locale catalog can replace
  // an English default when no Console / prop value is set, but neither
  // Console nor prop overrides are clobbered.
  const consoleStrings = stripUndefinedCopy(app?.strings);
  const propStrings = stripUndefinedCopy(copyProp);
  const baseCopy = resolveCopy(app?.strings, copyProp);
  const tDefaults: Partial<ElvixCopy> = {
    googleButton: t("signin.googleButton"),
    passkeyButton: t("signin.passkeyButton"),
    emailPlaceholder: t("signin.emailPlaceholder"),
    sendCodeButton: t("signin.sendCodeButton"),
    sendingLabel: t("signin.sendingLabel"),
    codeSentSubtitle: t("signin.codeSentSubtitle"),
    codePlaceholder: t("signin.codePlaceholder"),
    verifyingLabel: t("signin.verifyingLabel"),
  };
  const copy: ElvixCopy = {
    ...baseCopy,
    // For every catalog-backed key, the t() value wins over the built-in
    // English default, but Console and prop overrides still win over t().
    ...Object.fromEntries(
      (Object.keys(tDefaults) as (keyof ElvixCopy)[])
        .filter((k) => consoleStrings[k] === undefined && propStrings[k] === undefined)
        .map((k) => [k, tDefaults[k]]),
    ),
  };
  // Bootstrap failures bubble through context as `appError`. Without an
  // explicit error pane the form just renders empty (no buttons, no
  // copy) because `app` is null — the worst possible DX. Surface a
  // visible state instead. Cycle-2 friction #5.
  const bootstrapError = !app && ctx.appError ? ctx.appError : null;
  // On mount: drain the one-shot queue that consumeElvixReturnToken
  // fills when ElvixProvider strips `#elvix_token=...` from the URL.
  // If a token was just consumed (i.e. the page just returned from
  // the elvix Google redirect callback), fire onResult so the host's
  // existing redirect handler (router.push, cookie write) runs —
  // exactly like an in-frame OTP / passkey sign-in already does.
  useEffect(() => {
    const token = takeJustReturnedToken();
    if (!token) return;
    onResult?.({ ok: true, phase: "complete", method: "google", token, redirect: redirectAfterSignIn ?? "/" });
    // Also subscribe to LATER tokens in case the consume happens after
    // this mount (e.g. a second OAuth round-trip).
    const listener = (e: Event) => {
      const ce = e as CustomEvent<{ token: string }>;
      if (!ce.detail?.token) return;
      onResult?.({
        ok: true,
        phase: "complete",
        method: "google",
        token: ce.detail.token,
        redirect: redirectAfterSignIn ?? "/",
      });
    };
    window.addEventListener("elvix:return-token", listener);
    return () => window.removeEventListener("elvix:return-token", listener);
  }, [onResult, redirectAfterSignIn]);

  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const [step, setStep] = useState<"identify" | "code" | "authenticating" | "done">("identify");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verb =
    app?.signInVerb === "login" ? t("signin.verbLogin") : t("signin.titleDefault");
  const defaultTitle = app?.appName
    ? app?.signInVerb === "login"
      ? t("signin.titleLogin", { app: app.appName })
      : t("signin.title", { app: app.appName })
    : verb;
  const title = copy.title ? fillCopy(copy.title, { app: app?.appName ?? "" }) : defaultTitle;
  const submitLabel = copy.submitButton ?? verb;

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
    // Cross-origin: WebAuthn rpId is bound to elvix.is. Modern browsers
    // honour Related Origin Requests via /.well-known/webauthn, so we
    // try the inline ceremony first — keeps the user on the host's
    // origin and is the better UX. If the browser rejects with
    // "rp.id cannot be used with the current origin" (Firefox, older
    // Safari, Chrome without ROR rolled out), fall back to the hosted
    // passkey page on elvix.is via the redirect-OAuth-style flow that
    // returns via #elvix_token=... handled by consumeElvixReturnToken.
    const crossOrigin = !isSameOrigin(ctx.baseUrl) && ctx.clientId;
    const redirectToHosted = () => {
      if (!ctx.clientId) return;
      const returnTo = window.location.href;
      window.location.assign(
        `${ctx.baseUrl}/auth/passkey/${encodeURIComponent(ctx.clientId)}?returnUrl=${encodeURIComponent(returnTo)}`,
      );
    };
    setBusy(true);
    setError(null);
    try {
      const result = await runPasskeySignIn(ctx.baseUrl, ctx.clientId);
      if (!result.ok) {
        if (result.error === "passkey_cancelled") {
          onResult?.({ ok: false, error: result.error });
          return;
        }
        if (
          crossOrigin &&
          (/rp\.?id|RelyingParty|cannot be used with the current origin|SecurityError/i.test(
            result.message ?? "",
          ) ||
            result.error === "passkey_failed")
        ) {
          redirectToHosted();
          return;
        }
        return fail(result.error, result.message);
      }
      setStep("authenticating");
      onResult?.({
        ok: true,
        phase: "complete",
        method: "passkey",
        redirect: result.redirect ?? redirectAfterSignIn ?? "/",
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
      // Switch to the "Signing you in…" pane before the host gets the
      // success callback — the form must not sit on the stale "code"
      // step while the host navigates.
      setStep("authenticating");
      onResult?.({
        ok: true,
        phase: "complete",
        method: "email_otp",
        redirect: body.data?.redirect ?? redirectAfterSignIn ?? "/",
        token: body.data?.token,
      });
    } catch (e: unknown) {
      fail("network", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const card = `elvix-card ${className}`.trim();

  if (step === "authenticating") {
    return (
      <div
        className={card}
        style={sized}
        data-elvix-pane="authenticating"
        aria-busy
        aria-live="polite"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            padding: "32px 0",
          }}
        >
          <Loader2
            size={28}
            strokeWidth={2}
            className="animate-spin"
            style={{ color: "var(--elvix-primary, currentColor)" }}
            aria-hidden
          />
          <div style={{ fontSize: "13.5px", fontWeight: 500 }}>Signing you in…</div>
          <div className="elvix-muted" style={{ fontSize: "12px" }}>
            Hold on a second, taking you to {app?.appName ?? "your app"}.
          </div>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className={card} style={sized} data-elvix-pane="done">
        <p>{copy.signedInText}</p>
      </div>
    );
  }

  // Visible bootstrap-error pane. Renders BEFORE the form chrome when
  // the SDK can't fetch its config — most commonly an invalid clientId
  // or a host origin the Console hasn't whitelisted. Returning null /
  // empty here silently disappears the form, which is the worst
  // possible DX: the integrator stares at a blank page wondering if
  // they imported the right component. Cycle-2 Playwright scar.
  if (bootstrapError) {
    return (
      <div className={card} style={sized} data-elvix-pane="error" role="alert">
        <h2 className="elvix-h">{t("signin.bootstrapErrorTitle")}</h2>
        {/* TODO: i18n: signin.bootstrapErrorBody — catalog key exists but is a
            flat string with a {clientIdToken} placeholder; the source uses
            inline <code> styling and arrow glyphs which a flat t() call can't
            reproduce. Leave the rich English source until the key is
            restructured for rich-text rendering. */}
        <p className="elvix-muted elvix-subtitle">
          Invalid <code>clientId</code> or origin not allowed for this domain. Open Console &rarr;
          your Application &rarr; Credentials to confirm the <code>clientId</code>, then add this
          origin to Allowed origins.
        </p>
        <p className="elvix-error" data-elvix-error-code={bootstrapError}>
          {bootstrapError}
        </p>
      </div>
    );
  }

  return (
    <div className={card} style={sized} data-elvix-pane={step}>
      <h2 className="elvix-h">{title}</h2>
      {copy.subtitle && <p className="elvix-muted elvix-subtitle">{copy.subtitle}</p>}

      {step === "identify" && <GateBadge gate={app?.signinGate} />}

      {step === "identify" && (
        <>
          {app?.methodGoogle && (
            <button
              type="button"
              onClick={startGoogle}
              disabled={busy}
              className="elvix-btn elvix-btn-google"
              data-elvix-method="google"
            >
              {copy.googleButton}
            </button>
          )}
          {app?.methodPasskey && (
            <button
              type="button"
              onClick={startPasskey}
              disabled={busy}
              className="elvix-btn elvix-btn-passkey"
              data-elvix-method="passkey"
            >
              {copy.passkeyButton}
            </button>
          )}
          {app?.methodEmailOtp && (
            <form onSubmit={startOtp} data-elvix-method="email_otp" className="elvix-otp-form">
              <input
                type="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder={copy.emailPlaceholder}
                required
                disabled={busy}
                className="elvix-input"
              />
              <button type="submit" disabled={busy} className="elvix-btn elvix-btn-primary">
                {busy ? copy.sendingLabel : copy.sendCodeButton}
              </button>
            </form>
          )}
        </>
      )}

      {step === "code" && (
        <form onSubmit={verifyOtp} className="elvix-otp-form">
          <p className="elvix-muted">{fillCopy(copy.codeSentSubtitle ?? "", { email })}</p>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ""))}
            placeholder={copy.codePlaceholder}
            required
            disabled={busy}
            className="elvix-input"
          />
          <button type="submit" disabled={busy} className="elvix-btn elvix-btn-primary">
            {busy ? copy.verifyingLabel : submitLabel}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="elvix-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Auto badge painted under the heading when the Application's
 * signinGate is `private_beta` (green pill) or `closed` (red pill).
 * `public` renders nothing. Sibling of the same helper inside
 * `<ElvixSignInForm>` so both surfaces communicate the gate state
 * consistently.
 */
function GateBadge({ gate }: { gate: string | undefined }) {
  if (!gate || gate === "public") return null;
  const isBeta = gate === "private_beta";
  const label = isBeta ? "Private beta · invite only" : "Sign-ups closed";
  const bg = isBeta ? "rgba(46, 229, 168, 0.12)" : "rgba(220, 38, 38, 0.10)";
  const dot = isBeta ? "#2EE5A8" : "#DC2626";
  const color = isBeta ? "#0a8f63" : "#b91c1c";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        marginTop: "6px",
        borderRadius: "9999px",
        background: bg,
        color,
        fontSize: "11px",
        fontWeight: 500,
      }}
    >
      <span
        style={{ width: "6px", height: "6px", borderRadius: "9999px", background: dot }}
      />
      {label}
    </span>
  );
}
