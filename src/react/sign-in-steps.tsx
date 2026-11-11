"use client";

/**
 * The panes of `<ElvixSignInForm>`: header, code, the username and passkey onboarding steps,
 * the recovery gate, and the legal footer; the entry step is `sign-in-identifier-step.tsx`
 * (0.26). State and requests come from `use-sign-in-flow.ts`; a step keeps only what dies
 * with it (the typed code, the username being checked).
 */

import { ArrowLeft, Check, Fingerprint, Loader2, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useT } from "../locale/use-t";
import { ElvixRecoverGate } from "./elvix-recover-gate";
import type { AuthFormProps } from "./elvix-sign-in-form";
import { useCanAutoFocus } from "./keyboard";
import { OtpInput } from "./otp-input";
import { STACK_2, STACK_3, STACK_4 } from "./pane-layout";
import { runPasskeyRegister } from "./passkey";
import { send } from "./profile-request";
import { authInit, getElvixToken, isSameOrigin } from "./session";
import { type Cta, CtaButton, ErrorLine } from "./sign-in-controls";
import {
  hostedCeremonyUrl,
  humanError,
  type Translator,
  usernameReasonLabel,
} from "./sign-in-copy";
import { headerSubtitle, headerTitle } from "./sign-in-header-copy";
import { unwrapEnvelope } from "./spine-fetch";
import { type OtpStart, useOtpVerify } from "./use-otp";
import { postJson, type SignInFlow, Step } from "./use-sign-in-flow";

// ─── Header ──────────────────────────────────────────────────────────

/** The app's mark: a host-passed node as is; else the logo image for the theme (a `<picture>`
 *  when "auto" has both); else the app's initial on a brand-tinted square, the one case a
 *  backdrop helps. Linked to the app's website when it has one. */
function BrandMark({ p }: { p: AuthFormProps }) {
  const t = useT();
  const { appName, brandColor, theme, logoUrl, logoUrlDark, logoNode, websiteUrl } = p;
  const img = (src: string) => (
    <img
      src={src}
      alt={appName}
      className="h-(--elvix-logo-h) w-auto max-w-[220px] object-contain"
    />
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
      <div className="inline-flex items-center justify-center min-h-(--elvix-logo-h) max-w-[220px]">
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

/** The default badge under the heading when the app's signinGate is `private_beta` or
 *  `closed` and the host passed no `belowHeading`. */
function GateBadge({ gate, t }: { gate: string | undefined; t: Translator }) {
  if (!gate || gate === "public") return null;
  const isBeta = gate === "private_beta";
  const label = isBeta ? t("signin.gateBadgePrivateBeta") : t("signin.gateBadgeClosed");
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

/** The banner bleeds to the card's edge by the card's own inset (`--elvix-card-px/pt`). */
const HEADER_LAYOUT: Record<string, string> = {
  left: "flex items-center text-left",
  banner:
    "-mx-(--elvix-card-px) -mt-(--elvix-card-pt) px-(--elvix-card-px) py-6 flex flex-col items-center text-center border-b border-border-base",
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
  const entry = flow.step === Step.IDENTIFIER;
  const subtitle = headerSubtitle(flow.step, p, identifier, t);
  return (
    <div
      data-elvix-head=""
      className={`gap-(--elvix-gap-logo-title) mb-(--elvix-gap-title-methods) ${HEADER_LAYOUT[layout] ?? HEADER_LAYOUT.centered}`}
      style={
        layout === "banner"
          ? { background: `linear-gradient(135deg, ${p.brandColor}24, ${p.brandColor}08)` }
          : undefined
      }
    >
      <BrandMark p={p} />
      <div>
        <div
          data-elvix-heading=""
          className="text-[18px] [font-weight:var(--elvix-heading-weight)] [font-family:var(--elvix-font-display)] tracking-tight text-fg-1"
        >
          {(entry && p.headline) || headerTitle(flow.step, p, flow.recover?.appName, t)}
        </div>
        {subtitle && <div className="text-[12.5px] text-fg-3 mt-0.5">{subtitle}</div>}
        {/* Only on the pick-a-method step; the host's belowHeading wins, and
            belowHeading={null} opts out of the default gate badge. */}
        {entry && (p.belowHeading !== undefined ? p.belowHeading : <GateBadge gate={gate} t={t} />)}
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
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <Loader2 className="size-7 animate-spin" style={{ color: brandColor }} />
      <div className="text-[13.5px] font-medium text-fg-1">{t("signin.signingYouIn")}</div>
      <div className="text-[12px] text-fg-3">
        {t("signin.takingYouTo", { app: appName || t("signin.appNameFallback") })}
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
    <div data-elvix-legal="" className="text-center mt-(--elvix-gap-legal) leading-[1.45]">
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
  const autoFocus = useCanAutoFocus();
  return (
    <form onSubmit={(e) => void verify(e)} className={STACK_3}>
      <OtpInput
        value={code}
        onChange={setCode}
        disabled={isPreview || verifying}
        autoFocus={autoFocus}
      />
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

type CheckAnswer = { ok?: boolean; available?: boolean; reason?: string } | null;

/** What elvix's answer makes of the check: no answer, free, or refused with its reason. */
function checkOf(b: CheckAnswer): UsernameCheck {
  if (!b) return { kind: UsernameCheck.IDLE };
  if (b.ok !== false && b.available) return { kind: UsernameCheck.AVAILABLE };
  const fallback = b.ok === false ? "invalid" : "taken";
  return { kind: UsernameCheck.REJECTED, reason: b.reason ?? fallback };
}

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
      const b = res ? (unwrapEnvelope(await res.json().catch(() => null)) as CheckAnswer) : null;
      if (controller.signal.aborted) return;
      setCheck(checkOf(b));
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
  const autoFocus = useCanAutoFocus();

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
    <div className={STACK_4}>
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
            autoFocus={autoFocus}
            autoComplete="username"
            enterKeyHint="go"
            value={value}
            minLength={4}
            maxLength={30}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("username.exampleHandle")}
            disabled={busy !== null}
            className="elvix-field w-full h-11 pl-7 pr-10 text-[14px] disabled:cursor-not-allowed"
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
    <div className={STACK_2}>
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
  const url = hostedCeremonyUrl(baseUrl, "passkey-register", clientId);
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
    <div className={STACK_3}>
      <ul className="text-[12.5px] text-fg-2 leading-relaxed flex flex-col gap-1.5">
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
      onCancel={({ redirect }) => flow.leaveTo(redirect)}
    />
  );
}
