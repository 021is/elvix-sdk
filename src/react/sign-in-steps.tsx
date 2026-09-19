"use client";

/**
 * The panes of `<ElvixSignInForm>`: header, identifier (social buttons and
 * email / username), code, the username and passkey onboarding steps, the
 * recovery gate, and the legal footer. State and requests come from
 * `use-sign-in-flow.ts`; a step keeps only what dies with it (the typed code,
 * the username being checked).
 */

import { ArrowLeft, Check, Fingerprint, Loader2, X } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { useT } from "../locale/use-t";
import { ElvixRecoverGate } from "./elvix-recover-gate";
import type { AuthFormProps } from "./elvix-sign-in-form";
import { GoogleOneTap } from "./google-one-tap";
import { OtpInput } from "./otp-input";
import { runPasskeyRegister, runPasskeySignIn } from "./passkey";
import { send } from "./profile-request";
import { authInit, getElvixToken, isSameOrigin } from "./session";
import {
  humanError,
  OAuthProvider,
  oauthStartHref,
  type Translator,
  tOrFallback,
  usernameReasonLabel,
} from "./sign-in-copy";
import { unwrapEnvelope } from "./spine-fetch";
import { type OtpStart, postJson, type SignInFlow, Step, useOtpVerify } from "./use-sign-in-flow";

// ─── The branded call to action ──────────────────────────────────────

/** Brand pair for the primary button: the customer picks both colours, so
 *  contrast is theirs; hover and press only change brightness. */
export type Cta = { brand?: string; onBrand?: string };

const CTA_CLASS =
  "cursor-pointer w-full inline-flex items-center justify-center h-9 px-4 rounded-[10px] font-semibold text-[13px] tracking-tight transition hover:brightness-[0.94] active:brightness-[0.88] disabled:cursor-not-allowed disabled:hover:brightness-100";

function ArrowGlyph() {
  return (
    <svg width="11" height="10" viewBox="0 0 11 10" fill="none" aria-hidden>
      <path
        d="M7.75 5L4.25 2.75V7.25L7.75 5Z"
        fill="currentColor"
        stroke="currentColor"
        opacity="0.6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Solid brand fill with a soft top sheen and a grounded three-layer shadow,
 *  matching the Console's primary button. */
function CtaButton({
  cta,
  busy,
  disabled,
  arrow = false,
  faint = false,
  submit = false,
  className = "",
  onClick,
  children,
}: {
  cta: Cta;
  busy: boolean;
  disabled: boolean;
  arrow?: boolean;
  /** Disabled at half opacity rather than 60%: the identifier step's look. */
  faint?: boolean;
  submit?: boolean;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    backgroundImage: "linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0) 40%)",
    backgroundColor: cta.brand,
    color: cta.onBrand,
    boxShadow:
      "0 1px 0 rgba(255,255,255,0.06) inset, 0 2px 3px -1px rgba(0,0,0,0.18), 0 0 0 1px rgba(25,28,33,0.08)",
  };
  return (
    <button
      type={submit ? "submit" : "button"}
      onClick={onClick}
      disabled={disabled}
      className={`${CTA_CLASS} ${faint ? "disabled:opacity-50" : "disabled:opacity-60"} ${className}`}
      style={style}
    >
      <span
        className="inline-flex items-center gap-1.5"
        style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.18))" }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : children}
        {arrow && !busy && <ArrowGlyph />}
      </span>
    </button>
  );
}

function ErrorLine({ error, center = false }: { error: string | null; center?: boolean }) {
  if (!error) return null;
  return <p className={`text-[11.5px] text-red-400${center ? " text-center" : ""}`}>{error}</p>;
}

// ─── Header ──────────────────────────────────────────────────────────

/**
 * The app's mark: a host-passed node as is; else the logo image for the
 * theme (a `<picture>` when "auto" has both); else the app's initial on a
 * brand-tinted square, the one case a backdrop helps. Linked to the app's
 * website when it has one.
 */
function BrandMark({ p }: { p: AuthFormProps }) {
  const t = useT();
  const { appName, brandColor, theme, logoUrl, logoUrlDark, logoNode, websiteUrl } = p;
  const img = (src: string) => (
    <img src={src} alt={appName} className="h-12 w-auto max-w-[220px] object-contain" />
  );
  const letter = (
    <div
      className={
        "size-14 rounded-[12px] border border-border-base grid place-items-center overflow-hidden transition" +
        (websiteUrl ? " hover:border-border-strong hover:shadow-sm" : "")
      }
      style={{ background: `${brandColor}1a` }}
    >
      <span className="text-[18px] font-semibold" style={{ color: brandColor }}>
        {appName?.[0]?.toUpperCase() ?? "?"}
      </span>
    </div>
  );
  let mark: ReactNode = logoUrl ? img(logoUrl) : letter;
  if (logoNode) {
    mark = (
      <div className="inline-flex items-center justify-center min-h-12 max-w-[220px]">
        {logoNode}
      </div>
    );
  } else if (theme === "dark") {
    mark = logoUrlDark ? img(logoUrlDark) : letter;
  } else if (theme === "auto" && logoUrlDark && logoUrl) {
    mark = (
      <picture>
        <source srcSet={logoUrlDark} media="(prefers-color-scheme: dark)" />
        {img(logoUrl)}
      </picture>
    );
  }
  if (!websiteUrl) return mark;
  return (
    <a
      href={websiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("signin.visitAppWebsite", { app: appName ?? "" })}
      className="cursor-pointer"
    >
      {mark}
    </a>
  );
}

/**
 * The default badge under the heading when the app's signinGate is
 * `private_beta` or `closed` and the host passed no `belowHeading`.
 */
function GateBadge({ gate, t }: { gate: string | undefined; t: Translator }) {
  if (!gate || gate === "public") return null;
  const isBeta = gate === "private_beta";
  const label = isBeta
    ? tOrFallback(t, "signin.gateBadgePrivateBeta", "Private beta · invite only")
    : tOrFallback(t, "signin.gateBadgeClosed", "Sign-ups closed");
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{
        background: isBeta ? "rgba(46, 229, 168, 0.12)" : "rgba(220, 38, 38, 0.10)",
        color: isBeta ? "#0a8f63" : "#b91c1c",
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: isBeta ? "#2EE5A8" : "#DC2626" }}
      />
      {label}
    </span>
  );
}

function headerTitle(step: Step, p: AuthFormProps, recoverApp: string | undefined, t: Translator) {
  const app = p.appName || t("signin.appNameFallback");
  switch (step) {
    case Step.CODE:
      return t("export.doneTitle");
    case Step.USERNAME:
      return t("username.title");
    case Step.PASSKEY:
      return t(
        p.signInVerb === "login"
          ? "signin.passkeyOnboardingTitleLogin"
          : "signin.passkeyOnboardingTitleSignin",
      );
    case Step.RECOVER:
      return t("signin.recoverTitle", {
        app: recoverApp ?? p.appName ?? t("signin.appNameFallback"),
      });
    default:
      return t(p.signInVerb === "login" ? "signin.titleLogin" : "signin.title", { app });
  }
}

function headerSubtitle(step: Step, p: AuthFormProps, identifier: string, t: Translator) {
  switch (step) {
    case Step.CODE:
      return t("signin.codeSentSubtitle", { email: identifier });
    case Step.USERNAME:
      return p.appName ? t("username.subtitle", { app: p.appName }) : t("username.subtitleNoApp");
    case Step.PASSKEY:
      return t("signin.passkeyOnboardingSubtitle");
    case Step.RECOVER:
      return t("signin.recoverSubtitle");
    default:
      return t("signin.identifierSubtitle");
  }
}

const HEADER_LAYOUT: Record<string, string> = {
  left: "flex items-center text-left",
  banner:
    "-mx-7 -mt-7 px-7 py-6 flex flex-col items-center text-center border-b border-border-base",
  centered: "flex flex-col items-center text-center",
};

export function SignInHeader({
  p,
  flow,
  identifier,
  gate,
}: {
  p: AuthFormProps;
  flow: SignInFlow;
  identifier: string;
  gate: string | undefined;
}) {
  const t = useT();
  const layout = p.layout ?? "centered";
  return (
    <div
      className={`gap-3 mb-6 ${HEADER_LAYOUT[layout] ?? HEADER_LAYOUT.centered}`}
      style={
        layout === "banner"
          ? { background: `linear-gradient(135deg, ${p.brandColor}24, ${p.brandColor}08)` }
          : undefined
      }
    >
      <BrandMark p={p} />
      <div>
        <div className="text-[18px] font-semibold tracking-tight text-fg-1">
          {headerTitle(flow.step, p, flow.recover?.appName, t)}
        </div>
        <div className="text-[12.5px] text-fg-3 mt-0.5">
          {headerSubtitle(flow.step, p, identifier, t)}
        </div>
        {/* Only on the pick-a-method step; the host's belowHeading wins, and
            belowHeading={null} opts out of the default gate badge. */}
        {flow.step === Step.IDENTIFIER &&
          (p.belowHeading !== undefined ? p.belowHeading : <GateBadge gate={gate} t={t} />)}
      </div>
    </div>
  );
}

// ─── Terminal and footer ─────────────────────────────────────────────

export function AuthenticatingPane({
  brandColor,
  appName,
}: {
  brandColor?: string;
  appName?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <Loader2 className="size-7 animate-spin" style={{ color: brandColor }} />
      <div className="text-[13.5px] font-medium text-fg-1">Signing you in…</div>
      <div className="text-[12px] text-fg-3">
        Hold on a second, taking you to {appName || "your app"}.
      </div>
    </div>
  );
}

function LegalLink({ href, children }: { href?: string | null; children: ReactNode }) {
  const base =
    "cursor-pointer font-semibold text-fg-2 underline underline-offset-2 decoration-fg-3/60 hover:text-fg-1 hover:decoration-fg-1 transition";
  if (!href) return <span className={base}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={base}>
      {children}
    </a>
  );
}

export function LegalFooter({ p }: { p: AuthFormProps }) {
  const t = useT();
  return (
    <div className="text-center mt-5 leading-[1.45]">
      <div className="text-[11.5px] text-placeholder">
        {t("signin.legalIntro", { app: p.appName || t("signin.legalAppFallback") })}
      </div>
      <div className="text-[11.5px] mt-1 flex items-center justify-center gap-1.5">
        <LegalLink href={p.termsOfServiceUrl}>{t("signin.termsOfService")}</LegalLink>
        <span className="text-placeholder">·</span>
        <LegalLink href={p.privacyPolicyUrl}>{t("signin.privacyPolicy")}</LegalLink>
      </div>
    </div>
  );
}

// ─── Code ────────────────────────────────────────────────────────────

export function CodeStep({
  flow,
  otp,
  baseUrl,
  isPreview,
  cta,
}: {
  flow: SignInFlow;
  otp: OtpStart;
  baseUrl: string;
  isPreview: boolean;
  cta: Cta;
}) {
  const t = useT();
  const { code, setCode, verifying, verify } = useOtpVerify({
    flow,
    baseUrl,
    challengeId: otp.challengeId,
    isPreview,
    t,
  });
  return (
    <form onSubmit={(e) => void verify(e)} className="space-y-3">
      <OtpInput value={code} onChange={setCode} disabled={isPreview || verifying} autoFocus />
      <CtaButton cta={cta} submit busy={verifying} disabled={verifying || code.length !== 6} arrow>
        {t("signin.verifyButton")}
      </CtaButton>
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => {
            flow.setStep(Step.IDENTIFIER);
            flow.setError(null);
          }}
          className="cursor-pointer inline-flex items-center gap-1 text-[12px] text-fg-2 hover:text-fg-1 hover:bg-surface-hover rounded-md px-2 -mx-2 py-1 transition"
        >
          <ArrowLeft className="size-3" /> {t("signin.useDifferentEmail")}
        </button>
        <button
          type="button"
          disabled={otp.resendIn > 0 || otp.sending}
          onClick={() => void otp.start()}
          className="cursor-pointer text-[12px] text-fg-2 hover:text-fg-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:text-fg-3 transition"
        >
          {otp.resendIn > 0
            ? t("signin.resendInSeconds", { seconds: otp.resendIn })
            : t("signin.resendCode")}
        </button>
      </div>
      <ErrorLine error={flow.error} center />
    </form>
  );
}

// ─── Username onboarding ─────────────────────────────────────────────

const UsernameCheck = {
  IDLE: "idle",
  CHECKING: "checking",
  AVAILABLE: "available",
  REJECTED: "rejected",
} as const;
type CheckKind = (typeof UsernameCheck)[keyof typeof UsernameCheck];
type UsernameCheck =
  | { kind: Exclude<CheckKind, typeof UsernameCheck.REJECTED> }
  | { kind: typeof UsernameCheck.REJECTED; reason: string };

const CHECK_DEBOUNCE_MS = 220;

/** Live availability of `value`, debounced; only the latest answer lands. */
function useUsernameCheck(baseUrl: string, value: string): UsernameCheck {
  const [check, setCheck] = useState<UsernameCheck>({ kind: UsernameCheck.IDLE });
  useEffect(() => {
    const candidate = value.trim().toLowerCase();
    if (!candidate) {
      setCheck({ kind: UsernameCheck.IDLE });
      return;
    }
    setCheck({ kind: UsernameCheck.CHECKING });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const res = await send(
        `${baseUrl}/api/onboarding/username/check?u=${encodeURIComponent(candidate)}`,
        { signal: controller.signal, ...authInit() },
      );
      if (controller.signal.aborted) return;
      const b = res
        ? (unwrapEnvelope(await res.json().catch(() => null)) as {
            ok?: boolean;
            available?: boolean;
            reason?: string;
          } | null)
        : null;
      if (controller.signal.aborted) return;
      if (!b) setCheck({ kind: UsernameCheck.IDLE });
      else if (b.ok !== false && b.available) setCheck({ kind: UsernameCheck.AVAILABLE });
      else {
        const fallback = b.ok === false ? "invalid" : "taken";
        setCheck({ kind: UsernameCheck.REJECTED, reason: b.reason ?? fallback });
      }
    }, CHECK_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [baseUrl, value]);
  return check;
}

function UsernameStatus({ check }: { check: UsernameCheck }) {
  const icon = "size-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none";
  switch (check.kind) {
    case UsernameCheck.CHECKING:
      return <Loader2 className={`${icon} text-fg-3 animate-spin`} />;
    case UsernameCheck.AVAILABLE:
      return <Check className={`${icon} text-emerald-500`} />;
    case UsernameCheck.REJECTED:
      return <X className={`${icon} text-red-500`} />;
    default:
      return null;
  }
}

function UsernameHint({ check }: { check: UsernameCheck }) {
  const t = useT();
  switch (check.kind) {
    case UsernameCheck.CHECKING:
      return <span className="text-fg-3">{t("username.checking")}</span>;
    case UsernameCheck.AVAILABLE:
      return <span className="text-emerald-500">{t("username.availableHint")}</span>;
    case UsernameCheck.REJECTED:
      return <span className="text-red-500">{usernameReasonLabel(t, check.reason)}</span>;
    default:
      return <span className="text-fg-3">{t("username.rulesHint")}</span>;
  }
}

const Busy = { CLAIM: "claim", SKIP: "skip", ADD: "add" } as const;
type Busy = (typeof Busy)[keyof typeof Busy];

export function UsernameStep({
  flow,
  baseUrl,
  isPreview,
  cta,
}: {
  flow: SignInFlow;
  baseUrl: string;
  isPreview: boolean;
  cta: Cta;
}) {
  const t = useT();
  const [value, setValue] = useState(flow.suggestions[0] ?? "");
  const [busy, setBusy] = useState<Busy | null>(null);
  const check = useUsernameCheck(baseUrl, value);

  // `auto` is "skip, pick one for me": the server generates it.
  const submit = async (auto: boolean) => {
    if (busy || isPreview) return;
    flow.setError(null);
    setBusy(auto ? Busy.SKIP : Busy.CLAIM);
    const out = await postJson(
      `${baseUrl}/api/onboarding/username`,
      auto ? {} : { username: value.trim().toLowerCase() },
      true,
    );
    setBusy(null);
    if (!out) flow.reportError("network_error", t("signin.errorNetwork"));
    else if (!out.ok) flow.reportError(out.body.error, humanError(t, out.body.error));
    else flow.applyLanding(out.body);
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="onboarding-username" className="block text-[12px] text-fg-3 mb-1.5">
          {t("username.label")}
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-fg-3 pointer-events-none">
            @
          </span>
          <input
            id="onboarding-username"
            type="text"
            autoFocus
            autoComplete="username"
            value={value}
            minLength={4}
            maxLength={30}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("username.exampleHandle")}
            disabled={busy !== null}
            className="w-full h-11 pl-7 pr-10 rounded-[10px] bg-surface border border-border-strong text-[14px] text-fg-1 placeholder:text-placeholder focus:outline-none focus:border-[#8e7dff] focus:ring-2 focus:ring-[#8e7dff]/20 transition disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <UsernameStatus check={check} />
        </div>
        <p className="text-[11px] mt-1.5 leading-relaxed min-h-[14px]">
          <UsernameHint check={check} />
        </p>
      </div>
      {flow.suggestions.length > 0 && (
        <UsernameSuggestions
          suggestions={flow.suggestions}
          disabled={busy !== null}
          skipping={busy === Busy.SKIP}
          onPick={setValue}
          onSkip={() => void submit(true)}
        />
      )}
      <ErrorLine error={flow.error} />
      <CtaButton
        cta={cta}
        busy={busy === Busy.CLAIM}
        disabled={busy !== null || check.kind !== UsernameCheck.AVAILABLE}
        onClick={() => void submit(false)}
      >
        {t("username.claimCta", { handle: value || t("username.yournameFallback") })}
      </CtaButton>
    </div>
  );
}

/** A horizontal strip of suggested handles, ending in Skip, which is the
 *  same shape so the row reads as one set of options. */
function UsernameSuggestions({
  suggestions,
  disabled,
  skipping,
  onPick,
  onSkip,
}: {
  suggestions: string[];
  disabled: boolean;
  skipping: boolean;
  onPick: (s: string) => void;
  onSkip: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.08em] text-fg-3">
        {t("username.suggestionsHeading")}
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {suggestions.slice(0, 3).map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="cursor-pointer shrink-0 inline-flex items-center h-7 px-2.5 rounded-full bg-surface-hover border border-border-base hover:border-border-strong hover:bg-surface-active transition text-[12px] text-fg-2 font-mono disabled:opacity-60 disabled:cursor-not-allowed"
          >
            @{s}
          </button>
        ))}
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          className="cursor-pointer shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-dashed border-border-base hover:border-border-strong hover:bg-surface-hover transition text-[12px] text-fg-3 hover:text-fg-1 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {skipping ? <Loader2 className="size-3.5 animate-spin" /> : t("common.skip")}
        </button>
      </div>
    </div>
  );
}

// ─── Passkey onboarding ──────────────────────────────────────────────

/** The hosted enrollment page on elvix.is, where the rpId matches. The user
 *  is signed in, so the bearer rides in the fragment; the page returns here
 *  with `#elvix_token`, which completes sign-in like any redirect return. */
function hostedRegisterUrl(baseUrl: string, clientId: string): string {
  const url = `${baseUrl}/auth/passkey-register/${encodeURIComponent(clientId)}?returnUrl=${encodeURIComponent(window.location.href)}`;
  const token = getElvixToken();
  return token ? `${url}#elvix_token=${encodeURIComponent(token)}` : url;
}

export function PasskeyStep({
  flow,
  p,
  baseUrl,
  isPreview,
  cta,
}: {
  flow: SignInFlow;
  p: AuthFormProps;
  baseUrl: string;
  isPreview: boolean;
  cta: Cta;
}) {
  const t = useT();
  const [busy, setBusy] = useState<Busy | null>(null);

  // Inline first: works when the browser honours elvix's Related Origin
  // Requests manifest and this origin is in the app's allowedOrigins
  // (register/finish trusts them via clientId). Any other failure on a
  // cross-origin host falls back to the hosted page; same-origin is always
  // inline. Adding a passkey is onboarding, so the reported method stays the
  // factor that signed the user in.
  const add = async () => {
    if (busy || isPreview) return;
    flow.setError(null);
    setBusy(Busy.ADD);
    const intent = p.intent ?? "app";
    const result = await runPasskeyRegister(baseUrl, intent, undefined, p.clientId ?? undefined);
    setBusy(null);
    if (result.ok) {
      flow.finishOnboarding();
      return;
    }
    if (result.error === "passkey_cancelled") return;
    if (!isSameOrigin(baseUrl) && p.clientId) {
      window.location.assign(hostedRegisterUrl(baseUrl, p.clientId));
      return;
    }
    flow.reportError(
      result.error,
      result.message ?? humanError(t, result.error) ?? t("signin.errorPasskeyAdd"),
    );
  };

  const skip = () => {
    if (busy) return;
    setBusy(Busy.SKIP);
    flow.finishOnboarding();
  };

  return (
    <div className="space-y-3">
      <ul className="text-[12.5px] text-fg-2 leading-relaxed space-y-1.5">
        {["signin.passkeyBullet1", "signin.passkeyBullet2", "signin.passkeyBullet3"].map((key) => (
          <li key={key} className="flex items-start gap-2">
            <span className="mt-1.5 size-1 rounded-full" style={{ background: p.brandColor }} />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>
      <ErrorLine error={flow.error} />
      <CtaButton
        cta={cta}
        busy={busy === Busy.ADD}
        disabled={busy !== null}
        onClick={() => void add()}
      >
        <Fingerprint className="size-4" /> {t("signin.addPasskeyCta")}
      </CtaButton>
      <button
        type="button"
        onClick={skip}
        disabled={busy !== null}
        className="cursor-pointer w-full inline-flex items-center justify-center h-9 px-3 rounded-[8px] text-[13px] text-fg-2 hover:text-fg-1 hover:bg-surface-hover transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy === Busy.SKIP ? <Loader2 className="size-4 animate-spin" /> : t("signin.skipForNow")}
      </button>
    </div>
  );
}

// ─── Recovery gate ───────────────────────────────────────────────────

/**
 * The user signed back in to an app where their membership is in a
 * reversible off-state; sign-in completes only if they restore it. Cancel is
 * not a success, so it follows the gate's redirect (typically the sign-in
 * page), never `redirectAfterSignIn`.
 */
export function RecoverStep({ flow, baseUrl }: { flow: SignInFlow; baseUrl: string }) {
  if (!flow.recover) return null;
  return (
    <ElvixRecoverGate
      baseUrl={baseUrl}
      appName={flow.recover.appName}
      state={flow.recover.state}
      sinceAt={flow.recover.sinceAt}
      onRestore={({ redirect }) => flow.finishOnboarding(redirect)}
      onCancel={({ redirect }) => {
        window.location.href = redirect;
      }}
    />
  );
}

// ─── Identifier: social buttons, then email / username ────────────────

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M16.51 8.18c0-.58-.05-1.13-.15-1.66H9v3.14h4.21a3.6 3.6 0 0 1-1.56 2.36v1.96h2.52c1.47-1.36 2.34-3.36 2.34-5.8z"
      />
      <path
        fill="#34A853"
        d="M9 17c2.1 0 3.87-.7 5.17-1.9l-2.52-1.96c-.7.47-1.6.74-2.65.74-2.04 0-3.77-1.38-4.38-3.23H2.02v2.03A8 8 0 0 0 9 17z"
      />
      <path
        fill="#FBBC05"
        d="M4.62 10.65A4.8 4.8 0 0 1 4.36 9c0-.57.1-1.12.26-1.65V5.32H2.02A8 8 0 0 0 1 9c0 1.29.31 2.5.86 3.58l2.51-1.93z"
      />
      <path
        fill="#EA4335"
        d="M9 4.77c1.14 0 2.17.4 2.98 1.17l2.23-2.23A7.84 7.84 0 0 0 9 1 8 8 0 0 0 1.86 5.32l2.51 1.93C5.23 5.17 6.96 4.77 9 4.77z"
      />
    </svg>
  );
}

function GithubGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.96c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const SOCIAL_CLASS =
  "cursor-pointer w-full inline-flex items-center justify-center gap-2 h-10 rounded-[10px] font-medium text-[13px] border border-border-base bg-surface text-fg-1 hover:bg-surface-hover transition";

/** An error from the inline ceremony that the hosted page on elvix.is
 *  (where the rpId matches) gets past: a browser without Related Origin
 *  Requests support. */
const RP_ID_MISMATCH = /rp\.?id|RelyingParty|cannot be used with the current origin|SecurityError/i;

/** The passkey sign-in button's handler: the inline ceremony, falling back
 *  to the hosted one cross-origin, whose return arrives as `#elvix_token`. */
function usePasskeySignIn(flow: SignInFlow, p: AuthFormProps, baseUrl: string, isPreview: boolean) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (isPreview || busy) return;
    flow.setError(null);
    setBusy(true);
    const result = await runPasskeySignIn(baseUrl, p.clientId, p.intent ?? "app");
    setBusy(false);
    if (result.ok) {
      flow.methodRef.current = "passkey";
      flow.applyLanding({ next_step: "done", redirect: result.redirect, token: result.token });
      return;
    }
    if (result.error === "passkey_cancelled") {
      // The user dismissed the prompt: nothing to show, but the host hears it.
      p.onResult?.({ ok: false, error: result.error });
      return;
    }
    const hostedHelps =
      RP_ID_MISMATCH.test(result.message ?? "") || result.error === "passkey_failed";
    if (!isSameOrigin(baseUrl) && p.clientId && hostedHelps) {
      window.location.assign(
        `${baseUrl}/auth/passkey/${encodeURIComponent(p.clientId)}?returnUrl=${encodeURIComponent(window.location.href)}`,
      );
      return;
    }
    flow.reportError(
      result.error,
      result.message ?? humanError(t, result.error) ?? t("signin.errorPasskeyVerify"),
    );
  };
  return { busy, run };
}

/**
 * Google, GitHub and passkey in importance order. In grid mode they tile
 * two-up with short labels; an odd one out, always the last, spans the row
 * and keeps its long label.
 */
function SocialButtons({
  flow,
  p,
  baseUrl,
  isPreview,
  gisSlot,
}: {
  flow: SignInFlow;
  p: AuthFormProps;
  baseUrl: string;
  isPreview: boolean;
  /** Where Google Identity Services renders its own button, when it does. */
  gisSlot: RefObject<HTMLDivElement | null> | null;
}) {
  const t = useT();
  const passkey = usePasskeySignIn(flow, p, baseUrl, isPreview);
  const [redirecting, setRedirecting] = useState(false);
  const shown = [p.methodGoogle, p.methodGithub, p.methodPasskey].filter(Boolean).length;
  const grid = p.socialLayout === "grid" && shown >= 2;
  const last = p.methodPasskey ? "passkey" : p.methodGithub ? "github" : "google";
  /** Spans the row and keeps the long label when it is the odd one out. */
  const wide = (which: string) => grid && shown % 2 === 1 && which === last;
  const label = (which: string, short: string, long: string) =>
    grid && !wide(which) ? short : long;
  const span = (which: string) => (wide(which) ? " col-span-2" : "");
  const intent = p.intent ?? "app";

  return (
    <div className={grid ? "grid grid-cols-2 gap-2" : "space-y-2"}>
      {p.methodGoogle &&
        (gisSlot ? (
          // GIS renders its own button here, with its own accessible name;
          // the slot only reserves the height while it hydrates.
          <div ref={gisSlot} className={`w-full min-h-10${span("google")}`} />
        ) : (
          <a
            href={
              isPreview ? "#" : oauthStartHref(OAuthProvider.GOOGLE, baseUrl, intent, p.clientId)
            }
            onClick={isPreview ? (e) => e.preventDefault() : undefined}
            className={`${SOCIAL_CLASS}${span("google")}`}
          >
            <GoogleGlyph />
            {label("google", t("signin.googleButtonShort"), t("signin.googleButton"))}
          </a>
        ))}
      {p.methodGithub && (
        <button
          type="button"
          disabled={isPreview || redirecting}
          onClick={
            isPreview
              ? undefined
              : () => {
                  // Paint "Signing in…" before the browser leaves for GitHub.
                  setRedirecting(true);
                  const href = oauthStartHref(OAuthProvider.GITHUB, baseUrl, intent, p.clientId);
                  requestAnimationFrame(() => window.location.assign(href));
                }
          }
          aria-label={t("signin.githubButton")}
          className={`${SOCIAL_CLASS} disabled:cursor-not-allowed disabled:opacity-70${span("github")}`}
        >
          {redirecting ? <Loader2 className="size-4 animate-spin" /> : <GithubGlyph />}
          {redirecting
            ? t("signin.signingIn")
            : label("github", "GitHub", t("signin.githubButton"))}
        </button>
      )}
      {p.methodPasskey && (
        <button
          type="button"
          disabled={passkey.busy}
          onClick={isPreview ? undefined : () => void passkey.run()}
          className={`${SOCIAL_CLASS} disabled:cursor-not-allowed disabled:opacity-60${span("passkey")}`}
        >
          {passkey.busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Fingerprint className="size-4" />
          )}
          {label("passkey", t("signin.passkeyButtonShort"), t("signin.passkeyButton"))}
        </button>
      )}
    </div>
  );
}

/**
 * Whether Google Identity Services runs (any One Tap / popup / auto-select /
 * FedCM flag), and whether it renders Google's own "Continue as <name>"
 * button. That button needs a Google client id (per app, on the bootstrap
 * envelope) AND the SDK running on the elvix origin: elsewhere GIS does not
 * run, its slot stays empty and the Google button would vanish. Short of
 * both, the static redirect link stays, which uses elvix's server-side
 * client id and always works.
 */
function googleIdentityServices(p: AuthFormProps, baseUrl: string, isPreview: boolean) {
  const cfg = p.googleConfig;
  const flags = Boolean(cfg?.oneTap || cfg?.popup || cfg?.autoSelect || cfg?.fedcm);
  const enabled = !isPreview && Boolean(p.methodGoogle) && flags;
  const onElvix = typeof window !== "undefined" && window.location.origin === baseUrl;
  return { enabled, button: enabled && Boolean(p.googleClientId) && onElvix };
}

/** What the identifier field accepts, as its placeholder says. */
function identifierPlaceholderKey(p: AuthFormProps): string {
  if (p.methodEmailOtp && p.methodUsername) return "signin.identifierPlaceholderEmailOrUsername";
  return p.methodUsername
    ? "signin.identifierPlaceholderUsername"
    : "signin.identifierPlaceholderEmail";
}

export function IdentifierStep({
  flow,
  otp,
  p,
  baseUrl,
  isPreview,
  cta,
}: {
  flow: SignInFlow;
  otp: OtpStart;
  p: AuthFormProps;
  baseUrl: string;
  isPreview: boolean;
  cta: Cta;
}) {
  const t = useT();
  const gisSlot = useRef<HTMLDivElement | null>(null);
  const cfg = p.googleConfig;
  const gis = googleIdentityServices(p, baseUrl, isPreview);
  const social = p.methodGoogle || p.methodPasskey || p.methodGithub;
  const typed = p.methodEmailOtp || p.methodUsername;
  const placeholder = t(identifierPlaceholderKey(p));

  if (!social && !typed) {
    return (
      <div className="rounded-[10px] border border-dashed border-border-base bg-surface-hover py-8 px-4 text-center">
        <p className="text-[12.5px] text-fg-3">{t("signin.previewEmptyMethods")}</p>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => void otp.start(e)} className="space-y-2">
      {gis.enabled && p.googleClientId && (
        <GoogleOneTap
          baseUrl={baseUrl}
          clientId={p.googleClientId}
          intent={p.intent ?? "app"}
          appClientId={p.clientId}
          renderButton={gis.button}
          buttonContainerRef={gisSlot}
          config={{
            oneTap: cfg?.oneTap ?? false,
            autoSelect: cfg?.autoSelect ?? false,
            popup: cfg?.popup ?? false,
            fedcm: cfg?.fedcm ?? false,
            hostedDomain: cfg?.hostedDomain ?? "",
          }}
        />
      )}
      {social && (
        <SocialButtons
          flow={flow}
          p={p}
          baseUrl={baseUrl}
          isPreview={isPreview}
          gisSlot={gis.button ? gisSlot : null}
        />
      )}
      {typed && (
        <>
          {social && (
            <div className="flex items-center gap-3 my-3">
              <span className="h-px flex-1 bg-border-base" />
              <span className="text-[11px] uppercase tracking-[0.08em] text-fg-3">
                {t("signin.or")}
              </span>
              <span className="h-px flex-1 bg-border-base" />
            </div>
          )}
          <input
            type="text"
            disabled={otp.sending}
            value={otp.identifier}
            onChange={(e) => otp.setIdentifier(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            autoComplete={p.methodUsername ? "username" : "email"}
            inputMode={p.methodUsername ? "text" : "email"}
            className="w-full h-10 px-3 rounded-[10px] bg-surface border border-border-strong text-[13px] text-fg-1 placeholder:text-placeholder focus:outline-none focus:border-[#8e7dff] focus:ring-2 focus:ring-[#8e7dff]/20 transition disabled:cursor-not-allowed"
          />
          <CtaButton
            cta={cta}
            submit
            faint
            className="mt-3"
            busy={otp.sending}
            disabled={!otp.valid || otp.sending}
            arrow
          >
            {t("signin.sendCodeButton")}
          </CtaButton>
          {flow.error && (
            <p className="text-[11.5px] text-red-400 text-center mt-1">{flow.error}</p>
          )}
        </>
      )}
    </form>
  );
}
