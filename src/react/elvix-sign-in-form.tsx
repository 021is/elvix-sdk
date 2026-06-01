"use client";

/**
 * `<ElvixSignInForm>` — moved VERBATIM (markup + Tailwind classes) from the
 * elvix monorepo (`components/sdk/elvix-sign-in-form.tsx`). This is the SAME
 * component elvix.is renders for its hosted sign-in surface, so a host that
 * imports `@elvix.is/sdk/styles.css` gets a pixel-identical form.
 *
 * Only host-coupled wiring was swapped (the visual markup is untouched):
 *   - `@/components/*` local imports → SDK-local copies (`./elvix-logo`,
 *     `./otp-input`, `./elvix-recover-gate`). The shield/badge live in the
 *     "Secured by elvix" chip via `./elvix-logo`.
 *   - `@/lib/sdk/theme` `useElvixApp` → `./elvix-provider` (`useElvixApp`,
 *     plus `useElvixContext` for the cross-origin `baseUrl`).
 *   - `@/lib/sdk/elvix-session` `setElvixToken` → `./session`.
 *   - `@/lib/sdk/username-rules` → `./username-rules` (verbatim copy).
 *   - `@/lib/spine-fetch` `unwrapEnvelope` → `./spine-fetch` (verbatim copy).
 *   - `@/lib/site` `SITE_URL` → the `ELVIX_SITE_URL` constant below.
 *   - same-origin `fetch("/api/...")` → cross-origin `${baseUrl}/api/...`
 *     using the published SDK pattern: pre-auth calls pick credentials from
 *     `isSameOrigin(baseUrl)`; post-auth calls use `authInit()` (bearer
 *     cross-origin, cookie same-origin). The session token comes back in the
 *     body cross-origin and is stored via `setElvixToken`.
 *   - passkey ceremonies use the SDK's hand-rolled cross-origin
 *     `runPasskeySignIn` / `runPasskeyRegister` (no `@simplewebauthn/browser`).
 *   - Google Identity Services is preserved verbatim (One Tap / Auto-select
 *     / Popup / FedCM via `./google-one-tap`), with the SAME conditional
 *     elvix uses: when any `googleConfig` GIS flag is on AND a Google client
 *     id is available, the form renders Google's GIS personalized button
 *     ("Continue as <name>") into a ref slot; otherwise it falls back to the
 *     static redirect anchor at `${baseUrl}/api/auth/google/start`. The only
 *     swap is the source of the public client id: elvix reads the build-time
 *     `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, the SDK reads `googleClientId` off the
 *     bootstrap envelope (`useElvixApp()`); and the GIS credential POSTs
 *     cross-origin to `${baseUrl}/api/auth/google/credential`.
 *   - `next/navigation` is never imported; the host routes via `onResult` /
 *     `onAuthenticated`. The default `window.location.href` fallback is kept.
 */

import { useT } from "../locale/use-t";
import { ArrowLeft, Check, Fingerprint, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ElvixLogo } from "./elvix-logo";
import { ElvixRecoverGate } from "./elvix-recover-gate";
import { useElvixApp, useElvixContext } from "./elvix-provider";
import { GoogleOneTap } from "./google-one-tap";
import { OtpInput } from "./otp-input";
import { runPasskeyRegister, runPasskeySignIn } from "./passkey";
import { authInit, getElvixToken, isSameOrigin, setElvixToken } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { isValidUsername } from "./username-rules";

/** elvix marketing origin the "Secured by elvix" chip links to. In the
 *  monorepo this is `SITE_URL` (NEXT_PUBLIC_SITE_URL); here it's the
 *  canonical public origin. */
const ELVIX_SITE_URL = "https://elvix.is";

/**
 * Public ResponseDto shape the SDK surfaces to `onResult` listeners.
 * Mirrors the `{ ok: true | false, ... }` envelope every elvix API
 * route returns via `withErrorHandling`. Customers branch on `ok`.
 */
export type ElvixSignInResult =
  | { ok: true; redirect?: string; token?: string }
  | { ok: false; error: string; message?: string; status?: number };

const Mode = {
  PREVIEW: "preview",
  INTERACTIVE: "interactive",
} as const;
type Mode = (typeof Mode)[keyof typeof Mode];

const Intent = {
  CONSOLE: "console",
  ACCOUNT: "account",
  APP: "app",
} as const;
type Intent = (typeof Intent)[keyof typeof Intent];

const Layout = {
  CENTERED: "centered",
  LEFT: "left",
  BANNER: "banner",
} as const;
type Layout = (typeof Layout)[keyof typeof Layout];

const SocialLayout = {
  STACKED: "stacked",
  GRID: "grid",
} as const;
type SocialLayout = (typeof SocialLayout)[keyof typeof SocialLayout];

const Presentation = {
  CARD: "card",
  DRAWER: "drawer",
  MODAL: "modal",
} as const;
type Presentation = (typeof Presentation)[keyof typeof Presentation];

const Theme = {
  LIGHT: "light",
  DARK: "dark",
  AUTO: "auto",
} as const;
type Theme = (typeof Theme)[keyof typeof Theme];

const SignInVerb = {
  SIGNIN: "signin",
  LOGIN: "login",
} as const;
type SignInVerb = (typeof SignInVerb)[keyof typeof SignInVerb];

const State = {
  INACTIVE: "inactive",
  SOFT_DELETED_BY_USER: "soft_deleted_by_user",
} as const;
type State = (typeof State)[keyof typeof State];

const NextStep = {
  DONE: "done",
  USERNAME: "username",
  PASSKEY: "passkey",
  RECOVER: "recover",
} as const;
type NextStep = (typeof NextStep)[keyof typeof NextStep];

const NextStep2 = {
  DONE: "done",
  USERNAME: "username",
  PASSKEY: "passkey",
} as const;
type NextStep2 = (typeof NextStep2)[keyof typeof NextStep2];


/**
 * One auth surface to rule them all. Same component renders:
 *
 *   - The live preview inside the Console (Create app + Sign-in configure).
 *     mode="preview" → all controls disabled, just visual.
 *
 *   - The actual hosted sign-in at /sign-in/<clientId> for any customer app.
 *     mode="interactive" + intent="app:<clientId>" → real flows.
 *
 *   - The elvix Console's own sign-in at /sign-in/console.
 *     mode="interactive" + intent="console" → dogfoods our own auth.
 *
 *   - The account surface at /sign-in/account.
 *     mode="interactive" + intent="account".
 *
 * Sign-in = Sign-up. There's no separate signup route. If you don't exist
 * yet, the first successful auth creates you.
 */
export type AuthFormProps = {
  /**
   * "interactive" (default) hits real auth endpoints.
   * "preview" renders the surface read-only — every CTA paints but
   * never makes a request. Console live-preview uses this.
   */
  mode?: Mode;
  /**
   * App display name. Optional when `<ElvixProvider clientId>` is
   * mounted — the provider fetches it from the Console-configured
   * Application row. Explicit prop wins (Console passes its unsaved
   * live state here).
   */
  appName?: string;
  logoUrl?: string | null;
  /** Optional dark-mode variant. Used when `theme="dark"`, otherwise we
   *  show the same logoUrl in both themes. */
  logoUrlDark?: string | null;
  /** Optional pre-rendered logo node. Wins over logoUrl + letter fallback. */
  logoNode?: React.ReactNode;
  brandColor?: string;
  /** Foreground colour painted on top of brandColor (CTA text/icons). */
  onBrandColor?: string;
  methodGoogle?: boolean;
  methodEmailOtp?: boolean;
  methodPasskey?: boolean;
  methodUsername?: boolean;
  privacyPolicyUrl?: string | null;
  termsOfServiceUrl?: string | null;
  framed?: boolean;
  /** Used in interactive mode to route auth requests. */
  intent?: Intent;
  /** For intent="app": the Application client_id. */
  clientId?: string;
  /** If set, the logo becomes a clickable link to this URL (the app's website). */
  websiteUrl?: string | null;
  /** Visual layout. Three variants today. */
  layout?: Layout;
  /** Social button arrangement: stacked rows (default) or 2-up grid. */
  socialLayout?: SocialLayout;
  /** Surrounding chrome — card / drawer (bottom sheet) / modal overlay. */
  presentation?: Presentation;
  /** Theme override for the form's surface tokens. */
  theme?: Theme;
  /** Hide the built-in header (logo + "Sign in to X" title + subtitle). */
  showHeader?: boolean;
  /** Which verb the customer wants on the CTA + heading. Some brands
   *  prefer "Log in" (banks, B2B legacy); SaaS defaults to "Sign in". */
  signInVerb?: SignInVerb;
  /** Strip card bg + border + shadow so the form blends into its host. */
  transparentBg?: boolean;
  /** Optional node rendered directly below the "Pick how you want to
   *  continue" subtitle. Used for gate-state badges ("Private beta",
   *  "Closed signups") so they sit inline with the form instead of
   *  competing as a separate surface above the card. */
  belowHeading?: React.ReactNode;
  /** Optional pre-rendered node injected just under the methods, on
   *  the way to the "Secured by elvix" chip. Used for the
   *  "Inform me when it goes public" + "Request access" text-links
   *  shown on gated hosted surfaces. */
  belowMethods?: React.ReactNode;
  /** Per-app Google Identity Services config. When set + `methodGoogle`
   *  is on + we're in interactive mode + a `googleClientId` is available,
   *  the ElvixSignInForm loads the GIS client lib and applies One Tap /
   *  Auto-select / FedCM / popup ux_mode based on each flag. Falls back to
   *  the plain redirect-OAuth anchor otherwise. */
  googleConfig?: {
    oneTap?: boolean;
    autoSelect?: boolean;
    popup?: boolean;
    fedcm?: boolean;
    hostedDomain?: string;
  };
  /** Public Google OAuth client id for the GIS personalized button. In the
   *  elvix monorepo this is the build-time `NEXT_PUBLIC_GOOGLE_CLIENT_ID`;
   *  the SDK reads it off the bootstrap envelope (`googleClientId`). When
   *  absent, the Google factor degrades to the static redirect anchor. */
  googleClientId?: string;
  /**
   * Fires after a successful sign-in (OTP, Google, Passkey) — BEFORE
   * the default redirect runs. When provided, the form will NOT
   * navigate; the host owns post-auth routing. Use this to keep an
   * embedded surface (Drawer/Modal/Card) in place after auth and let
   * the host call `router.push()` itself.
   *
   * Call `GET /api/me` from the host to fetch the authenticated user.
   * The v2 SDK will surface user details directly in the payload.
   */
  onAuthenticated?: (result: { ok: true; redirect?: string; token?: string }) => void;
  /**
   * Where to send the user after EVERY terminal success path. One prop, one
   * destination — no per-method customisation. Applies uniformly to:
   *
   *   - OTP verify success (with or without an onboarding step).
   *   - Google sign-in (both the GIS credential and the redirect-OAuth
   *     return path that consumes `#elvix_token=...` on mount).
   *   - Passkey sign-in.
   *   - The onboarding "Add a passkey" success.
   *   - The onboarding "Skip for now" button on the passkey step.
   *   - The onboarding username step success.
   *
   * Resolution order at the moment of navigation:
   *   `redirectAfterSignIn ?? <backend-provided redirect> ?? "/"`
   *
   * If a host wants different destinations per method, they should switch
   * on the result inside `onResult`/`onAuthenticated` and call
   * `router.push(...)` themselves; this prop is the single declarative
   * fallback that ALL success paths honour.
   */
  redirectAfterSignIn?: string;
  /**
   * Fires on every terminal outcome: success AND every error path
   * (invalid OTP, expired challenge, rate-limited, network blip,
   * passkey failure). Mirrors the ResponseDto shape the rest of the
   * elvix API surfaces, so the customer branches on `ok` the same
   * way they would for a `/api/v1/verify` call.
   *
   * Both `onResult` and `onAuthenticated` may be set. `onResult` fires
   * regardless; `onAuthenticated` only on success (legacy contract).
   */
  onResult?: (result: ElvixSignInResult) => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Hard-coded theme values so the ElvixSignInForm's chrome can be isolated from the
// surrounding page (e.g., Console can be dark while the preview shows the
// light-theme appearance to the customer, or vice-versa). When the user
// picks "auto", we don't override — descendants inherit the host's theme.
const ELVIX_LIGHT_VARS: React.CSSProperties = {
  ["--canvas" as string]: "#fafafa",
  ["--surface" as string]: "#ffffff",
  ["--surface-2" as string]: "#f4f4f5",
  ["--surface-hover" as string]: "rgba(0, 0, 0, 0.04)",
  ["--surface-active" as string]: "rgba(0, 0, 0, 0.06)",
  ["--border" as string]: "rgba(0, 0, 0, 0.08)",
  ["--border-strong" as string]: "rgba(0, 0, 0, 0.14)",
  ["--fg-1" as string]: "#18181b",
  ["--fg-2" as string]: "#52525b",
  ["--fg-3" as string]: "#71717a",
  ["--placeholder" as string]: "#a1a1aa",
};
const ELVIX_DARK_VARS: React.CSSProperties = {
  ["--canvas" as string]: "#0a0a0b",
  ["--surface" as string]: "#0d0d10",
  ["--surface-2" as string]: "#08080a",
  ["--surface-hover" as string]: "rgba(255, 255, 255, 0.04)",
  ["--surface-active" as string]: "rgba(255, 255, 255, 0.06)",
  ["--border" as string]: "rgba(255, 255, 255, 0.06)",
  ["--border-strong" as string]: "rgba(255, 255, 255, 0.12)",
  ["--fg-1" as string]: "#fafafa",
  ["--fg-2" as string]: "#a1a1aa",
  ["--fg-3" as string]: "#71717a",
  ["--placeholder" as string]: "#52525b",
};

export function ElvixSignInForm(props: AuthFormProps) {
  // Pull the Console-configured envelope from <ElvixProvider clientId>.
  // Every explicit prop wins (Console live-preview passes unsaved
  // state); context fills in everything the customer omitted.
  const app = useElvixApp();
  const resolved: AuthFormProps = {
    ...props,
    mode: props.mode ?? "interactive",
    appName: props.appName ?? app?.appName ?? "your app",
    logoUrl: props.logoUrl ?? app?.logoUrl ?? null,
    logoUrlDark: props.logoUrlDark ?? app?.logoUrlDark ?? null,
    brandColor: props.brandColor ?? app?.brandColor ?? "#5d4dff",
    onBrandColor: props.onBrandColor ?? app?.onBrandColor ?? "#ffffff",
    methodGoogle: props.methodGoogle ?? app?.methodGoogle ?? false,
    methodEmailOtp: props.methodEmailOtp ?? app?.methodEmailOtp ?? true,
    methodPasskey: props.methodPasskey ?? app?.methodPasskey ?? false,
    methodUsername: props.methodUsername ?? app?.methodUsername ?? false,
    privacyPolicyUrl: props.privacyPolicyUrl ?? app?.privacyPolicyUrl ?? null,
    termsOfServiceUrl: props.termsOfServiceUrl ?? app?.termsOfServiceUrl ?? null,
    intent: props.intent ?? "app",
    clientId: props.clientId ?? app?.clientId ?? undefined,
    layout: props.layout ?? (app?.layout as AuthFormProps["layout"]) ?? "centered",
    socialLayout:
      props.socialLayout ?? (app?.socialLayout as AuthFormProps["socialLayout"]) ?? "stacked",
    presentation:
      props.presentation ?? (app?.presentation as AuthFormProps["presentation"]) ?? "card",
    theme: props.theme ?? (app?.theme as AuthFormProps["theme"]) ?? "light",
    showHeader: props.showHeader ?? app?.showHeader ?? true,
    transparentBg: props.transparentBg ?? app?.transparentBg ?? false,
    signInVerb:
      props.signInVerb ?? (app?.signInVerb as AuthFormProps["signInVerb"]) ?? "signin",
    googleConfig:
      props.googleConfig ?? (app?.googleConfig as AuthFormProps["googleConfig"]) ?? undefined,
    googleClientId: props.googleClientId ?? app?.googleClientId ?? undefined,
    websiteUrl: props.websiteUrl ?? app?.websiteUrl ?? null,
  };
  // `framed` defaults to the dashed "This is a preview" wrapper ONLY when
  // the form is in preview mode. Customer-host renders (zp.edvone.dev,
  // any production sign-in) default to unframed so the banner never
  // leaks. Hosts can still opt in by passing `framed={true}`.
  const { framed = resolved.mode === "preview", presentation = "card", theme = "light" } = resolved;
  const card = <AuthCard {...resolved} />;
  let content: React.ReactNode = card;
  if (presentation === "drawer") {
    content = <DrawerPresentation>{card}</DrawerPresentation>;
  } else if (presentation === "modal") {
    content = <ModalPresentation>{card}</ModalPresentation>;
  }
  // Isolated theme: wrapper sets CSS vars inline so the preview never
  // inherits the host page's `.dark` cascade. `auto` skips the override.
  // The canvas paint is only applied in framed-preview mode — when the form
  // renders directly on a host page (e.g. /sign-in/console), the host owns
  // the backdrop and we must stay transparent so radial-glow + grid overlays
  // continue under the card.
  const wrapped =
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    theme === "auto" ? (
      content
    ) : (
      <div
        className={framed ? "bg-canvas" : undefined}
        // LEGACY: spine-lint-disable-next-line spine/enum-over-string
        style={theme === "dark" ? ELVIX_DARK_VARS : ELVIX_LIGHT_VARS}
      >
        {content}
      </div>
    );
  if (!framed) return wrapped;
  return <FramedPreview>{wrapped}</FramedPreview>;
}

/** Bottom-anchored drawer chrome. Card sits with a top-rounded sheet, drag
 *  handle at the very top, capped at a sensible width inside a customer
 *  client-shell. */
function DrawerPresentation({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative bg-surface-2 rounded-t-[20px] border-t border-x border-border-base shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.18)] pt-2 pb-0 overflow-hidden">
      <div className="mx-auto mt-1 mb-3 h-1 w-9 rounded-full bg-border-strong" />
      <div className="px-3 pb-3">{children}</div>
    </div>
  );
}

/** Modal chrome — dim backdrop + centered card with close affordance. */
function ModalPresentation({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute inset-0 -m-4 rounded-[18px] bg-black/30 backdrop-blur-sm pointer-events-none"
      />
      <div className="relative">{children}</div>
    </div>
  );
}

function AuthCard(props: AuthFormProps) {
  const t = useT();
  const { transparentBg = false } = props;
  const cardClass = transparentBg
    ? "overflow-hidden"
    : "rounded-[14px] bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.04),0_20px_40px_-20px_rgba(0,0,0,0.12)] border border-border-base overflow-hidden";
  return (
    <div className={cardClass}>
      <div className={transparentBg ? "px-1 py-1" : "px-7 py-7"}>
        <AuthBody {...props} />
      </div>
      <div
        className={
          (transparentBg ? "mt-3 " : "border-t border-border-base bg-surface-hover px-7 py-3 ") +
          "flex items-center justify-center"
        }
      >
        <a
          href={ELVIX_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full bg-surface ring-1 ring-border-base shadow-sm hover:bg-surface-hover hover:ring-border-strong transition"
        >
          <span className="relative inline-flex items-center">
            <ElvixLogo size={12} className="text-fg-1" />
            <span
              aria-hidden
              className="absolute -right-px -top-px size-1 rounded-full bg-emerald-500 ring-1 ring-surface"
            />
          </span>
          <span className="text-[11px] tracking-tight leading-none">
            <span className="text-fg-3">{t("signin.securedBy")}</span>
            <span className="font-semibold text-fg-1">elvix</span>
          </span>
        </a>
      </div>
    </div>
  );
}

function AuthBody({
  mode,
  appName,
  logoUrl,
  logoUrlDark,
  logoNode,
  brandColor,
  onBrandColor = "#ffffff",
  methodGoogle,
  methodEmailOtp,
  methodPasskey,
  methodUsername = false,
  privacyPolicyUrl,
  termsOfServiceUrl,
  intent = "app",
  clientId,
  websiteUrl,
  layout = "centered",
  socialLayout = "stacked",
  showHeader = true,
  theme = "light",
  signInVerb = "signin",
  belowHeading,
  belowMethods,
  googleConfig,
  googleClientId,
  redirectAfterSignIn,
  onAuthenticated,
  onResult,
}: AuthFormProps) {
  // Cross-origin elvix base URL the SDK talks to (provided by <ElvixProvider>).
  const { baseUrl } = useElvixContext();
  const t = useT();
  const isPreview = mode === "preview";
  const anyMethod = methodGoogle || methodEmailOtp || methodPasskey || methodUsername;
  const gisEnabled =
    !isPreview &&
    methodGoogle &&
    Boolean(googleConfig) &&
    Boolean(
      googleConfig?.oneTap ||
        googleConfig?.popup ||
        googleConfig?.autoSelect ||
        googleConfig?.fedcm,
    );
  const gisButtonRef = useRef<HTMLDivElement | null>(null);
  // Whenever ANY GIS flag is on, swap our custom redirect anchor for
  // Google's official renderButton output. The button morphs into the
  // personalized "Continue as <name>" surface when GIS detects an
  // active Google session — which works in modern browsers when
  // `fedcm` is on (third-party-cookie path is being sunsetted).
  //
  // CRITICAL: the GIS path renders into an (initially empty) ref slot
  // that GoogleOneTap fills client-side. GoogleOneTap only mounts when
  // a Google client id is available. In the elvix monorepo that's the
  // build-time NEXT_PUBLIC_GOOGLE_CLIENT_ID; in the published SDK it
  // arrives per-app on the bootstrap envelope (`googleClientId`). If it's
  // missing, the GIS slot would stay empty and the Google button would be
  // INVISIBLE. Require the client id here so a missing value degrades to
  // the static redirect anchor (which uses elvix's server-side
  // GOOGLE_CLIENT_ID via /api/auth/google/start and works without it).
  const useGisRenderedButton = gisEnabled && Boolean(googleClientId);
  // identifier   → email / username entry (initial)
  // code         → OTP entry
  // username     → onboarding: claim a username (form, suggestions, skip)
  // passkey      → onboarding: add a passkey (or skip)
  // All four render inside the same card chrome — no URL hop. That's the
  // whole point: developers embed <ElvixSignInForm /> and the user finishes the
  // entire flow without leaving the form.
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const [step, setStep] = useState<"identifier" | "code" | "username" | "passkey" | "recover">(
    "identifier",
  );
  // Recovery gateway: populated when the auth handler returns
  // `next_step: "recover"` because the user just signed back in to
  // an app where their membership is in a reversible off-state
  // (deactivated or soft-deleted-by-user inside 90d). The user has
  // to decide before any onward redirect — restore (resume the
  // membership) or cancel (sign out, stay off-state).
  const [recoverState, setRecoverState] = useState<{
    appId: string;
    appName: string;
    state: State;
    sinceAt: string;
  } | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  // Onboarding state — only meaningful once we're past identifier+code.
  const [usernameValue, setUsernameValue] = useState("");
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [usernameCheck, setUsernameCheck] = useState<UsernameCheckState>({ kind: "idle" });
  const [onboardingBusy, setOnboardingBusy] = useState<"claim" | "skip" | "add" | null>(null);
  /**
   * Backend-provided final destination for multi-step onboarding flows.
   * When the OTP verify (or Google return state) lands on `next_step:
   * "passkey"` / `"username"`, the verifier also returns `final` — the
   * URL the user should land on once they finish (or skip) onboarding.
   * Stored here so the username + passkey steps know where to send
   * them. Always passed through `finalRedirect(...)` so
   * `redirectAfterSignIn` wins when the host set it.
   */
  const [backendFinalRedirect, setBackendFinalRedirect] = useState<string>("/");

  /**
   * Single resolver for every terminal redirect target inside the form.
   * Resolution order: `redirectAfterSignIn` (host prop, highest) > the
   * backend's per-method `redirect` value (OTP/Passkey/Google /done/) >
   * the onboarding `final` we cached when we entered the step > `"/"`.
   *
   * Every onResult call + every `window.location.href = ...` site MUST
   * pass through this helper so behaviour is identical across methods.
   */
  const finalRedirect = useCallback(
    (backendRedirect?: string): string => {
      if (redirectAfterSignIn) return redirectAfterSignIn;
      if (backendRedirect) return backendRedirect;
      if (backendFinalRedirect) return backendFinalRedirect;
      return "/";
    },
    [redirectAfterSignIn, backendFinalRedirect],
  );

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  /**
   * Set the inline error string AND fire `onResult({ ok: false })`
   * for the host. Every catchable failure inside the form funnels
   * through here so customers never miss a terminal event.
   */
  const reportError = useCallback(
    (code: string | undefined, message: string) => {
      setError(message);
      onResult?.({
        ok: false,
        error: code ?? "unknown",
        message,
      });
    },
    [onResult],
  );

  // Apply a sign-in finisher's payload. Single funnel so OTP, passkey, and
  // the Google-return state probe all converge here. When `next_step` says
  // we're done, we navigate away — otherwise we just move the ElvixSignInForm to
  // the right step in place.
  const applyLanding = useCallback(
    (body: {
      next_step?: NextStep;
      redirect?: string;
      suggestions?: string[];
      final?: string;
      token?: string;
      recover?: {
        appId: string;
        appName: string;
        state: State;
        sinceAt: string;
      };
    }) => {
      // Cross-origin sign-in returns the session token in the body (no cookie
      // is set on a third-party origin). Store it so every subsequent SDK call
      // carries it as a bearer, and hand it to the host via onAuthenticated.
      if (body.token) setElvixToken(body.token);
      // LEGACY: spine-lint-disable-next-line spine/enum-over-string
      if (body.next_step === "username") {
        setUsernameSuggestions(body.suggestions ?? []);
        setUsernameValue(body.suggestions?.[0] ?? "");
        setBackendFinalRedirect(body.final ?? "/");
        setStep("username");
        return;
      }
      // LEGACY: spine-lint-disable-next-line spine/enum-over-string
      if (body.next_step === "passkey") {
        setBackendFinalRedirect(body.final ?? "/");
        setStep("passkey");
        return;
      }
      // LEGACY: spine-lint-disable-next-line spine/enum-over-string
      if (body.next_step === "recover" && body.recover) {
        setRecoverState(body.recover);
        setBackendFinalRedirect(body.final ?? "/");
        setStep("recover");
        return;
      }
      // "done" or legacy { redirect } shape. Funnel through finalRedirect()
      // so `redirectAfterSignIn` wins over the backend value when the host
      // set it.
      const redirect = finalRedirect(body.redirect ?? defaultRedirect(intent));
      // body.token is fresh from the verifier; getElvixToken() falls back to
      // whatever was stashed earlier in this ceremony so the host always
      // receives a bearer even on intermediate "done" landings.
      const token = body.token ?? getElvixToken() ?? undefined;
      onResult?.({ ok: true, redirect, token });
      if (onAuthenticated) {
        onAuthenticated({ ok: true, redirect, token });
        return;
      }
      window.location.href = redirect;
    },
    [intent, onAuthenticated, onResult, finalRedirect, baseUrl],
  );

  // Google OAuth lands the user back on /sign-in/<surface>?onboarding=1&next=…
  // (it's a redirect flow — can't return JSON). Pick up the onboarding step
  // from /api/onboarding/state on mount so the ElvixSignInForm renders the right
  // step inside the card, never a separate URL.
  useEffect(() => {
    if (isPreview) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("onboarding") !== "1") return;
    (async () => {
      try {
        const init = authInit();
        const res = await fetch(`${baseUrl}/api/onboarding/state`, {
          headers: init.headers,
          credentials: init.credentials,
        });
        if (!res.ok) return;
        const body = unwrapEnvelope(await res.json());
        if (body.ok) applyLanding(body);
      } catch {
        // best-effort — if the probe fails we just stay on the identifier
        // step, the user can try again.
      } finally {
        // Strip the ?onboarding query so a refresh doesn't re-trigger.
        const url = new URL(window.location.href);
        url.searchParams.delete("onboarding");
        url.searchParams.delete("next");
        window.history.replaceState({}, "", url.toString());
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-submit once the OTP input fills to 6 chars (typed or pasted). The
  // ref guards against re-firing for the same 6-char value after a verify
  // error — the user must edit before we try again.
  const autoSubmittedCodeRef = useRef<string>("");
  // Clear the guard whenever the user shortens the code, so a fresh 6-char
  // entry triggers a new submit.
  useEffect(() => {
    if (code.length < 6) autoSubmittedCodeRef.current = "";
  }, [code]);

  /** Validity branches on what's actually enabled: an email is only OK
   *  when methodEmailOtp is on, a username is only OK when methodUsername
   *  is on. If only username is enabled, typing an email shouldn't unlock
   *  Continue — the resolve route would reject it anyway. */
  const identifierValid = useMemo(() => {
    const v = identifier.trim();
    if (!v) return false;
    if (v.includes("@")) return methodEmailOtp && EMAIL_RE.test(v);
    if (methodUsername) return isValidUsername(v);
    return false;
  }, [identifier, methodEmailOtp, methodUsername]);

  // Placeholder mirrors what the user can actually type:
  //   - both on  → "Email or username"
  //   - only username → "Username"
  //   - only email → "Enter your email"
  const identifierPlaceholder =
    methodEmailOtp && methodUsername
      ? t("signin.identifierPlaceholderEmailOrUsername")
      : methodUsername
        ? t("signin.identifierPlaceholderUsername")
        : t("signin.identifierPlaceholderEmail");

  /** Continue button styling — Clerk pattern: dark by default, brand color once user changes it. */
  // CTA bg = brandColor (the "primary"), text = onBrandColor (Material's
  // "onPrimary"). Customer-picked pair — we never auto-compute the foreground
  // because contrast is on them, and dark brands need light text and v.v.
  // Hover/active states deepen the brand via color-mix in the className,
  // so light brands like #8e7dff don't read as washed-out flat blocks.
  const ctaBase = brandColor;
  const ctaFg = onBrandColor;
  // Mirrors components/elvix-primary-button.tsx (the "Create application" CTA):
  // solid brand base + subtle white-to-transparent sheen on the top 40%, plus a
  // 3-layer shadow that grounds the button without the puffy brand-glow look
  // we had before. Hover/active darken via brightness filter so any brandColor
  // (light or dark) gets a perceptible state change without us needing to
  // pre-compute hover shades.
  const ctaStyle = {
    backgroundImage: "linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0) 40%)",
    backgroundColor: ctaBase,
    color: ctaFg,
    boxShadow:
      "0 1px 0 rgba(255,255,255,0.06) inset, 0 2px 3px -1px rgba(0,0,0,0.18), 0 0 0 1px rgba(25,28,33,0.08)",
  };
  const ctaLabelStyle = {
    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.18))",
  } as React.CSSProperties;

  /** Submit identifier — figures out email vs username, dispatches accordingly. */
  const onSubmitIdentifier = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!identifierValid || isPreview || sendingOtp) return;
      setError(null);
      setSendingOtp(true);
      const v = identifier.trim();
      try {
        // Username path — single endpoint resolves to the user's bound
        // primary email and sends an OTP there. Works on console/account/app.
        if (!v.includes("@")) {
          const res = await fetch(`${baseUrl}/api/auth/identifier/resolve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: isSameOrigin(baseUrl) ? "include" : "omit",
            body: JSON.stringify({
              username: v.toLowerCase(),
              intent,
              ...(clientId ? { clientId } : {}),
            }),
          });
          const body = unwrapEnvelope(await res.json().catch(() => ({}))) as {
            ok?: boolean;
            challengeId?: string;
            error?: string;
            retryAfterSeconds?: number;
          };
          if (!res.ok || !body.ok || !body.challengeId) {
            // LEGACY: spine-lint-disable-next-line spine/enum-over-string
            if (body.error === "too_recent" || body.error === "too_many") {
              setResendIn(body.retryAfterSeconds ?? 45);
            }
            reportError(body.error, humanError(t, body.error, body.retryAfterSeconds));
            return;
          }
          setChallengeId(body.challengeId);
          setStep("code");
          setResendIn(45);
          return;
        }
        // Email path — call the unified OTP start route.
        const res = await fetch(`${baseUrl}/api/auth/otp/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: isSameOrigin(baseUrl) ? "include" : "omit",
          body: JSON.stringify({ email: v, intent, clientId }),
        });
        const body = unwrapEnvelope(await res.json().catch(() => ({}))) as {
          ok?: boolean;
          challengeId?: string;
          error?: string;
          retryAfterSeconds?: number;
        };
        if (!res.ok || !body.ok || !body.challengeId) {
          if (body.error === "too_recent" || body.error === "too_many") {
            setResendIn(body.retryAfterSeconds ?? 30);
          }
          reportError(body.error, humanError(t, body.error, body.retryAfterSeconds));
          return;
        }
        setChallengeId(body.challengeId);
        setStep("code");
        setResendIn(45);
      } catch {
        reportError("network_error", t("signin.errorNetwork"));
      } finally {
        setSendingOtp(false);
      }
    },
    [identifier, identifierValid, isPreview, sendingOtp, intent, clientId, reportError, baseUrl, t],
  );

  /** Submit the OTP code. Existing route returns { ok, redirect }. */
  const onSubmitCode = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (isPreview || verifyingOtp || code.length !== 6 || !challengeId) return;
      setError(null);
      setVerifyingOtp(true);
      try {
        const res = await fetch(`${baseUrl}/api/auth/otp/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: isSameOrigin(baseUrl) ? "include" : "omit",
          body: JSON.stringify({ challengeId, code }),
        });
        const body = unwrapEnvelope(await res.json().catch(() => ({}))) as {
          ok?: boolean;
          next_step?: NextStep2;
          redirect?: string;
          suggestions?: string[];
          final?: string;
          token?: string;
          error?: string;
        };
        if (!res.ok || !body.ok) {
          reportError(body.error, humanError(t, body.error));
          return;
        }
        applyLanding(body);
      } catch {
        reportError("network_error", t("signin.errorNetwork"));
      } finally {
        setVerifyingOtp(false);
      }
    },
    [code, challengeId, isPreview, verifyingOtp, applyLanding, reportError, baseUrl, t],
  );

  // Fire onSubmitCode exactly once when the input first reaches 6 chars.
  // Re-firing for the same string is guarded by autoSubmittedCodeRef, which
  // resets when the user shortens the code (above).
  useEffect(() => {
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    if (step !== "code") return;
    if (code.length !== 6) return;
    if (verifyingOtp || isPreview || !challengeId) return;
    if (autoSubmittedCodeRef.current === code) return;
    autoSubmittedCodeRef.current = code;
    void onSubmitCode();
  }, [code, step, verifyingOtp, isPreview, challengeId, onSubmitCode]);

  /** Real WebAuthn ceremony using the SDK's cross-origin passkey sign-in. */
  const onPasskey = useCallback(async () => {
    if (isPreview || passkeyBusy) return;
    setError(null);
    setPasskeyBusy(true);
    try {
      const result = await runPasskeySignIn(baseUrl, clientId);
      if (!result.ok) {
        if (result.error === "passkey_cancelled") {
          // user dismissed the prompt — stay quiet, report via onResult only
          onResult?.({ ok: false, error: result.error });
          return;
        }
        reportError(result.error, result.message ?? humanError(t, result.error) ?? t("signin.errorPasskeyVerify"));
        return;
      }
      // Passkey sign-in succeeded — applyLanding will run through
      // finalRedirect() so `redirectAfterSignIn` (if set) wins over
      // result.redirect.
      applyLanding({ next_step: "done", redirect: result.redirect, token: result.token });
    } finally {
      setPasskeyBusy(false);
    }
  }, [isPreview, passkeyBusy, baseUrl, clientId, applyLanding, reportError, onResult, t]);

  // Debounced live availability check for the username step. AbortController
  // ensures only the latest keystroke's verdict reaches state.
  const usernameAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (step !== "username") return;
    const candidate = usernameValue.trim().toLowerCase();
    if (!candidate) {
      setUsernameCheck({ kind: "idle" });
      return;
    }
    setUsernameCheck({ kind: "checking" });
    const t = setTimeout(() => {
      usernameAbortRef.current?.abort();
      const ctrl = new AbortController();
      usernameAbortRef.current = ctrl;
      const init = authInit();
      fetch(`${baseUrl}/api/onboarding/username/check?u=${encodeURIComponent(candidate)}`, {
        signal: ctrl.signal,
        headers: init.headers,
        credentials: init.credentials,
      })
        .then((r) => r.json())
        .then((raw) => unwrapEnvelope(raw) as { ok?: boolean; available?: boolean; reason?: string })
        .then((b) => {
          if (b.ok === false) {
            setUsernameCheck({ kind: "rejected", reason: b.reason ?? "invalid" });
            return;
          }
          if (b.available) setUsernameCheck({ kind: "available" });
          else setUsernameCheck({ kind: "rejected", reason: b.reason ?? "taken" });
        })
        .catch((err) => {
          if (err.name !== "AbortError") setUsernameCheck({ kind: "idle" });
        });
    }, 220);
    return () => clearTimeout(t);
  }, [usernameValue, step, baseUrl]);

  /**
   * Submit the username step. `auto: true` means "skip — pick one for me",
   * which lets the server auto-generate (same helper used by sign-in
   * finishers in the legacy inline path).
   */
  const onSubmitUsername = useCallback(
    async (auto: boolean) => {
      if (onboardingBusy || isPreview) return;
      setError(null);
      setOnboardingBusy(auto ? "skip" : "claim");
      try {
        const init = authInit();
        const res = await fetch(`${baseUrl}/api/onboarding/username`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...init.headers },
          credentials: init.credentials,
          body: JSON.stringify(auto ? {} : { username: usernameValue.trim().toLowerCase() }),
        });
        const body = unwrapEnvelope(await res.json().catch(() => ({}))) as {
          ok?: boolean;
          next_step?: NextStep2;
          redirect?: string;
          suggestions?: string[];
          final?: string;
          token?: string;
          error?: string;
        };
        if (!res.ok || !body.ok) {
          reportError(body.error, humanError(t, body.error));
          return;
        }
        applyLanding(body);
      } catch {
        reportError("network_error", t("signin.errorNetwork"));
      } finally {
        setOnboardingBusy(null);
      }
    },
    [usernameValue, isPreview, onboardingBusy, applyLanding, reportError, baseUrl, t],
  );

  /** Onboarding passkey step: register a new passkey for the current session. */
  const onAddPasskey = useCallback(async () => {
    if (onboardingBusy || isPreview) return;
    setError(null);
    setOnboardingBusy("add");
    try {
      const surface = intent === "app" ? "app" : intent;
      const result = await runPasskeyRegister(baseUrl, surface);
      if (!result.ok) {
        if (result.error === "passkey_cancelled") return;
        reportError(
          result.error,
          result.message ?? humanError(t, result.error) ?? t("signin.errorPasskeyAdd"),
        );
        return;
      }
      // Passkey added → done. Resolve the destination through
      // finalRedirect() so a host-supplied `redirectAfterSignIn` wins over
      // the backend-stashed `final` for this onboarding leg.
      const redirect = finalRedirect();
      const token = getElvixToken() ?? undefined;
      onResult?.({ ok: true, redirect, token });
      if (onAuthenticated) {
        onAuthenticated({ ok: true, redirect, token });
        return;
      }
      window.location.href = redirect;
    } finally {
      setOnboardingBusy(null);
    }
  }, [intent, isPreview, onboardingBusy, finalRedirect, onAuthenticated, onResult, reportError, baseUrl, t]);

  /**
   * Skip the onboarding "Add a passkey" step. The user is already
   * authenticated (OTP/Google ceremony happened to reach this step) so
   * this fires onResult({ok:true}) just like the explicit "Add a
   * passkey" success path — and routes through finalRedirect() so the
   * destination matches every other success path. Previously this just
   * navigated, leaving the host's onResult silent on Skip.
   */
  const onSkipPasskey = useCallback(() => {
    if (onboardingBusy) return;
    setOnboardingBusy("skip");
    const redirect = finalRedirect();
    const token = getElvixToken() ?? undefined;
    onResult?.({ ok: true, redirect, token });
    if (onAuthenticated) {
      onAuthenticated({ ok: true, redirect, token });
      return;
    }
    window.location.href = redirect;
  }, [onboardingBusy, finalRedirect, onAuthenticated, onResult]);

  return (
    <>
      {showHeader && (
        <div
          className={
            "gap-3 mb-6 " +
            (layout === "left"
              ? "flex items-center text-left"
              // LEGACY: spine-lint-disable-next-line spine/enum-over-string
              : layout === "banner"
                ? "-mx-7 -mt-7 px-7 py-6 flex flex-col items-center text-center border-b border-border-base"
                : "flex flex-col items-center text-center")
          }
          style={
            layout === "banner"
              ? { background: `linear-gradient(135deg, ${brandColor}24, ${brandColor}08)` }
              : undefined
          }
        >
          {(() => {
            // Logo rendering rules:
            //   1. logoNode passed (e.g. /sign-in/console with ElvixLogo) →
            //      render bare, no chrome.
            //   2. logoUrl (or dark variant when theme=dark) → render the
            //      image bare too. Height-fixed, width-auto, max width caps
            //      it. No border, no tinted backdrop — the customer's mark
            //      stands on its own, same as what they see in the email.
            //   3. Nothing available → letter placeholder on a brand-tinted
            //      square, which IS the only case where a backdrop helps
            //      readability.
            const letter = (
              <div
                className={
                  "size-12 rounded-[10px] border border-border-base grid place-items-center overflow-hidden transition" +
                  (websiteUrl ? " hover:border-border-strong hover:shadow-sm" : "")
                }
                style={{ background: `${brandColor}1a` }}
              >
                <span className="text-[18px] font-semibold" style={{ color: brandColor }}>
                  {appName?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
            );

            const bareImg = (src: string) => (
              <img src={src} alt={appName} className="h-10 w-auto max-w-[220px] object-contain" />
            );

            let inner: React.ReactNode;
            if (logoNode) {
              inner = (
                <div className="inline-flex items-center justify-center min-h-12 max-w-[220px]">
                  {logoNode}
                </div>
              );
            } else if (theme === "dark") {
              inner = logoUrlDark ? bareImg(logoUrlDark) : letter;
            } else if (theme === "auto" && logoUrlDark && logoUrl) {
              inner = (
                <picture>
                  <source srcSet={logoUrlDark} media="(prefers-color-scheme: dark)" />
                  <img
                    src={logoUrl}
                    alt={appName}
                    className="h-10 w-auto max-w-[220px] object-contain"
                  />
                </picture>
              );
            } else if (logoUrl) {
              inner = bareImg(logoUrl);
            } else {
              inner = letter;
            }

            return websiteUrl ? (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("signin.visitAppWebsite", { app: appName ?? "" })}
                className="cursor-pointer"
              >
                {inner}
              </a>
            ) : (
              inner
            );
          })()}
          <div>
            <div className="text-[18px] font-semibold tracking-tight text-fg-1">
              {step === "code"
                ? t("export.doneTitle")
                : step === "username"
                  ? t("username.title")
                  : step === "passkey"
                    ? signInVerb === "login"
                      ? t("signin.passkeyOnboardingTitleLogin")
                      : t("signin.passkeyOnboardingTitleSignin")
                    : step === "recover"
                      ? t("signin.recoverTitle", { app: recoverState?.appName ?? appName ?? t("signin.appNameFallback") })
                      // LEGACY: spine-lint-disable-next-line spine/enum-over-string
                      : signInVerb === "login"
                        ? t("signin.titleLogin", { app: appName || t("signin.appNameFallback") })
                        : t("signin.title", { app: appName || t("signin.appNameFallback") })}
            </div>
            <div className="text-[12.5px] text-fg-3 mt-0.5">
              {step === "code"
                ? t("signin.codeSentSubtitle", { email: identifier })
                : step === "username"
                  ? appName
                    ? t("username.subtitle", { app: appName })
                    : t("username.subtitleNoApp")
                  : step === "passkey"
                    ? t("signin.passkeyOnboardingSubtitle")
                    : step === "recover"
                      ? t("signin.recoverSubtitle")
                      : t("signin.identifierSubtitle")}
            </div>
            {/* Gate-state badge sits inline under the subtitle so the
              user reads consequence + badge as one unit. Only the
              "pick-a-method" step shows it; once the user is mid-flow
              (code / username / passkey) the badge would just clutter. */}
            {/* LEGACY: spine-lint-disable-next-line spine/enum-over-string */}
            {step === "identifier" && belowHeading}
          </div>
        </div>
      )}

      {step === "code" ? (
        <form onSubmit={onSubmitCode} className="space-y-3">
          <OtpInput
            value={code}
            onChange={setCode}
            disabled={isPreview || verifyingOtp}
            autoFocus
          />
          <button
            type="submit"
            disabled={verifyingOtp || code.length !== 6}
            className="cursor-pointer w-full inline-flex items-center justify-center h-9 px-4 rounded-[10px] font-semibold text-[13px] tracking-tight transition hover:brightness-[0.94] active:brightness-[0.88] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:brightness-100"
            style={ctaStyle}
          >
            <span className="inline-flex items-center gap-1.5" style={ctaLabelStyle}>
              {verifyingOtp ? <Loader2 className="size-4 animate-spin" /> : t("signin.verifyButton")}
              {!verifyingOtp && (
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
              )}
            </span>
          </button>
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                setStep("identifier");
                setCode("");
                setError(null);
              }}
              className="cursor-pointer inline-flex items-center gap-1 text-[12px] text-fg-2 hover:text-fg-1 hover:bg-surface-hover rounded-md px-2 -mx-2 py-1 transition"
            >
              <ArrowLeft className="size-3" /> {t("signin.useDifferentEmail")}
            </button>
            <button
              type="button"
              disabled={resendIn > 0 || sendingOtp}
              onClick={() => onSubmitIdentifier()}
              className="cursor-pointer text-[12px] text-fg-2 hover:text-fg-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:text-fg-3 transition"
            >
              {resendIn > 0 ? t("signin.resendInSeconds", { seconds: resendIn }) : t("signin.resendCode")}
            </button>
          </div>
          {error && <p className="text-[11.5px] text-red-400 text-center">{error}</p>}
        </form>
      ) : step === "username" ? (
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
                value={usernameValue}
                minLength={4}
                maxLength={30}
                onChange={(e) => setUsernameValue(e.target.value)}
                placeholder={t("username.exampleHandle")}
                disabled={onboardingBusy !== null}
                className="w-full h-11 pl-7 pr-10 rounded-[10px] bg-surface border border-border-strong text-[14px] text-fg-1 placeholder:text-placeholder focus:outline-none focus:border-[#8e7dff] focus:ring-2 focus:ring-[#8e7dff]/20 transition disabled:opacity-60 disabled:cursor-not-allowed"
              />
              {/* LEGACY: spine-lint-disable-next-line spine/enum-over-string */}
              {usernameCheck.kind === "checking" && (
                <Loader2 className="size-4 text-fg-3 absolute right-3 top-1/2 -translate-y-1/2 animate-spin pointer-events-none" />
              )}
              {/* LEGACY: spine-lint-disable-next-line spine/enum-over-string */}
              {usernameCheck.kind === "available" && (
                <Check className="size-4 text-emerald-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              )}
              {/* LEGACY: spine-lint-disable-next-line spine/enum-over-string */}
              {usernameCheck.kind === "rejected" && (
                <X className="size-4 text-red-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              )}
            </div>
            <p className="text-[11px] mt-1.5 leading-relaxed min-h-[14px]">
              {usernameCheck.kind === "idle" && (
                <span className="text-fg-3">
                  {t("username.rulesHint")}
                </span>
              )}
              {usernameCheck.kind === "checking" && <span className="text-fg-3">{t("username.checking")}</span>}
              {usernameCheck.kind === "available" && (
                <span className="text-emerald-500">{t("username.availableHint")}</span>
              )}
              {usernameCheck.kind === "rejected" && (
                <span className="text-red-500">{usernameReasonLabel(t, usernameCheck.reason)}</span>
              )}
            </p>
          </div>

          {usernameSuggestions.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-[0.08em] text-fg-3">{t("username.suggestionsHeading")}</div>
              {/* Horizontal chip strip. Overflows scroll horizontally for
                  long handles; the scrollbar is hidden via
                  scrollbar-none + WebkitScrollbar tweak below. The final
                  chip is Skip — same shape as a suggestion so the row
                  reads as one set of options, not separate widgets. */}
              <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {usernameSuggestions.slice(0, 3).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={onboardingBusy !== null}
                    onClick={() => setUsernameValue(s)}
                    className="cursor-pointer shrink-0 inline-flex items-center h-7 px-2.5 rounded-full bg-surface-hover border border-border-base hover:border-border-strong hover:bg-surface-active transition text-[12px] text-fg-2 font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    @{s}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onSubmitUsername(true)}
                  disabled={onboardingBusy !== null}
                  className="cursor-pointer shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-dashed border-border-base hover:border-border-strong hover:bg-surface-hover transition text-[12px] text-fg-3 hover:text-fg-1 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {onboardingBusy === "skip" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    t("common.skip")
                  )}
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-[11.5px] text-red-400">{error}</p>}

          <button
            type="button"
            onClick={() => onSubmitUsername(false)}
            disabled={onboardingBusy !== null || usernameCheck.kind !== "available"}
            className="cursor-pointer w-full inline-flex items-center justify-center h-9 px-4 rounded-[10px] font-semibold text-[13px] tracking-tight transition hover:brightness-[0.94] active:brightness-[0.88] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:brightness-100"
            style={ctaStyle}
          >
            <span className="inline-flex items-center gap-1.5" style={ctaLabelStyle}>
              {onboardingBusy === "claim" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t("username.claimCta", { handle: usernameValue || t("username.yournameFallback") })
              )}
            </span>
          </button>
        </div>
      ) : step === "passkey" ? (
        <div className="space-y-3">
          <ul className="text-[12.5px] text-fg-2 leading-relaxed space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 rounded-full" style={{ background: brandColor }} />
              <span>{t("signin.passkeyBullet1")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 rounded-full" style={{ background: brandColor }} />
              <span>{t("signin.passkeyBullet2")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 rounded-full" style={{ background: brandColor }} />
              <span>{t("signin.passkeyBullet3")}</span>
            </li>
          </ul>

          {error && <p className="text-[11.5px] text-red-400">{error}</p>}

          <button
            type="button"
            onClick={onAddPasskey}
            disabled={onboardingBusy !== null}
            className="cursor-pointer w-full inline-flex items-center justify-center h-9 px-4 rounded-[10px] font-semibold text-[13px] tracking-tight transition hover:brightness-[0.94] active:brightness-[0.88] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:brightness-100"
            style={ctaStyle}
          >
            <span className="inline-flex items-center gap-1.5" style={ctaLabelStyle}>
              {onboardingBusy === "add" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Fingerprint className="size-4" /> {t("signin.addPasskeyCta")}
                </>
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={onSkipPasskey}
            disabled={onboardingBusy !== null}
            className="cursor-pointer w-full inline-flex items-center justify-center h-9 px-3 rounded-[8px] text-[13px] text-fg-2 hover:text-fg-1 hover:bg-surface-hover transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {/* LEGACY: spine-lint-disable-next-line spine/enum-over-string */}
            {onboardingBusy === "skip" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              t("signin.skipForNow")
            )}
          </button>
        </div>
      ) : step === "recover" && recoverState ? (
        // Recovery gateway — user just signed back in to an app where
        // their membership is in a reversible off-state. Sign-in won't
        // complete until they pick Restore or Cancel. The SDK
        // component handles the API call; we just route the result
        // (final redirect on restore, sign-in URL on cancel).
        <ElvixRecoverGate
          baseUrl={baseUrl}
          appName={recoverState.appName}
          state={recoverState.state}
          sinceAt={recoverState.sinceAt}
          onRestore={({ redirect }) => {
            // Restore = successful sign-in completion. Funnel through
            // finalRedirect() so redirectAfterSignIn wins over the gate's
            // suggested target.
            const dest = finalRedirect(redirect);
            onResult?.({ ok: true, redirect: dest });
            if (onAuthenticated) {
              onAuthenticated({ ok: true, redirect: dest });
            } else {
              window.location.href = dest;
            }
          }}
          onCancel={({ redirect }) => {
            // Cancel = NOT a sign-in success; honour the gate's redirect
            // (typically /sign-in) so the user lands somewhere safe. Do
            // NOT consult redirectAfterSignIn here — that's the success
            // destination and the user just chose to back out.
            window.location.href = redirect;
          }}
        />
      ) : !anyMethod ? (
        <div className="rounded-[10px] border border-dashed border-border-base bg-surface-hover py-8 px-4 text-center">
          <p className="text-[12.5px] text-fg-3">
            {t("signin.previewEmptyMethods")}
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmitIdentifier} className="space-y-2">
          {gisEnabled && googleClientId && (
            <GoogleOneTap
              baseUrl={baseUrl}
              clientId={googleClientId}
              intent={intent}
              appClientId={clientId}
              renderButton={useGisRenderedButton}
              buttonContainerRef={gisButtonRef}
              config={{
                oneTap: googleConfig?.oneTap ?? false,
                autoSelect: googleConfig?.autoSelect ?? false,
                popup: googleConfig?.popup ?? false,
                fedcm: googleConfig?.fedcm ?? false,
                hostedDomain: googleConfig?.hostedDomain ?? "",
              }}
            />
          )}
          {(methodGoogle || methodPasskey) && (
            <div
              className={
                socialLayout === "grid" && methodGoogle && methodPasskey
                  ? "grid grid-cols-2 gap-2"
                  : "space-y-2"
              }
            >
              {methodGoogle &&
                (useGisRenderedButton ? (
                  // GIS-rendered button — respects ux_mode='popup' so the
                  // OAuth flow runs in a small window instead of a full-
                  // page redirect. Google styles this themselves; we
                  // reserve the slot at our button height so layout stays
                  // stable while GIS hydrates.
                  <div
                    ref={gisButtonRef}
                    className="w-full min-h-10"
                    aria-label={t("signin.googleButton")}
                  />
                ) : (
                  <a
                    href={isPreview ? "#" : googleStartHref(baseUrl, intent, clientId)}
                    onClick={isPreview ? (e) => e.preventDefault() : undefined}
                    className="cursor-pointer w-full inline-flex items-center justify-center gap-2 h-10 rounded-[10px] font-medium text-[13px] border border-border-base bg-surface text-fg-1 hover:bg-surface-hover transition"
                  >
                    <GoogleGlyph />
                    {/* LEGACY: spine-lint-disable-next-line spine/enum-over-string */}
                    {socialLayout === "grid" && methodPasskey ? t("signin.googleButtonShort") : t("signin.googleButton")}
                  </a>
                ))}
              {methodPasskey && (
                <button
                  type="button"
                  disabled={passkeyBusy}
                  onClick={isPreview ? undefined : onPasskey}
                  className="cursor-pointer w-full inline-flex items-center justify-center gap-2 h-10 rounded-[10px] font-medium text-[13px] border border-border-base bg-surface text-fg-1 hover:bg-surface-hover transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {passkeyBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Fingerprint className="size-4" />
                  )}
                  {socialLayout === "grid" && methodGoogle ? t("signin.passkeyButtonShort") : t("signin.passkeyButton")}
                </button>
              )}
            </div>
          )}

          {(methodEmailOtp || methodUsername) && (
            <>
              {(methodGoogle || methodPasskey) && (
                <div className="flex items-center gap-3 my-3">
                  <span className="h-px flex-1 bg-border-base" />
                  <span className="text-[11px] uppercase tracking-[0.08em] text-fg-3">{t("signin.or")}</span>
                  <span className="h-px flex-1 bg-border-base" />
                </div>
              )}
              <input
                type="text"
                disabled={sendingOtp}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={identifierPlaceholder}
                aria-label={identifierPlaceholder}
                autoComplete={methodUsername ? "username" : "email"}
                inputMode={methodUsername ? "text" : "email"}
                className="w-full h-10 px-3 rounded-[10px] bg-surface border border-border-strong text-[13px] text-fg-1 placeholder:text-placeholder focus:outline-none focus:border-[#8e7dff] focus:ring-2 focus:ring-[#8e7dff]/20 transition disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={!identifierValid || sendingOtp}
                className="cursor-pointer w-full inline-flex items-center justify-center h-9 px-4 mt-3 rounded-[10px] font-semibold text-[13px] tracking-tight transition hover:brightness-[0.94] active:brightness-[0.88] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100"
                style={ctaStyle}
              >
                <span className="inline-flex items-center gap-1.5" style={ctaLabelStyle}>
                  {sendingOtp ? <Loader2 className="size-4 animate-spin" /> : t("signin.sendCodeButton")}
                  {!sendingOtp && (
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
                  )}
                </span>
              </button>
              {error && <p className="text-[11.5px] text-red-400 text-center mt-1">{error}</p>}
            </>
          )}
        </form>
      )}

      {/* Slot for text-link affordances on gated hosted surfaces
          ("Inform me when it goes public" / "Request access to private
          beta"). Shown only on the entry step — once the user has typed
          an identifier or moved into code/onboarding the slot would
          just compete with the active flow. */}
      {step === "identifier" && belowMethods}

      <div className="text-center mt-5 leading-[1.45]">
        <div className="text-[11.5px] text-placeholder">
          {t("signin.legalIntro", { app: appName || t("signin.legalAppFallback") })}
        </div>
        <div className="text-[11.5px] mt-1 flex items-center justify-center gap-1.5">
          <LegalLink href={termsOfServiceUrl}>{t("signin.termsOfService")}</LegalLink>
          <span className="text-placeholder">·</span>
          <LegalLink href={privacyPolicyUrl}>{t("signin.privacyPolicy")}</LegalLink>
        </div>
      </div>
    </>
  );
}

export function FramedPreview({ children }: { children: React.ReactNode }) {
  const t = useT();
  const hDash = "repeating-linear-gradient(to right, rgba(0,0,0,0.22) 0 4px, transparent 4px 8px)";
  const vDash = "repeating-linear-gradient(to bottom, rgba(0,0,0,0.22) 0 4px, transparent 4px 8px)";
  const OVERSHOOT = 20;
  return (
    <div className="relative bg-[#f5f5f6] dark:bg-surface-hover px-4 pt-4 pb-2">
      <div
        aria-hidden
        className="absolute top-0 h-px pointer-events-none"
        style={{ left: -OVERSHOOT, right: -OVERSHOOT, backgroundImage: hDash }}
      />
      <div
        aria-hidden
        className="absolute bottom-0 h-px pointer-events-none"
        style={{ left: -OVERSHOOT, right: -OVERSHOOT, backgroundImage: hDash }}
      />
      <div
        aria-hidden
        className="absolute left-0 w-px pointer-events-none"
        style={{ top: -OVERSHOOT, bottom: -OVERSHOOT, backgroundImage: vDash }}
      />
      <div
        aria-hidden
        className="absolute right-0 w-px pointer-events-none"
        style={{ top: -OVERSHOOT, bottom: -OVERSHOOT, backgroundImage: vDash }}
      />
      <div className="relative">{children}</div>
      <div
        className="relative mt-3 py-2.5 text-center text-[12px] font-medium text-fg-3"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent 0 6px, rgba(0,0,0,0.06) 6px 7px)",
        }}
      >
        {t("signin.framedPreviewLabel")}
      </div>
    </div>
  );
}

function LegalLink({ href, children }: { href?: string | null; children: React.ReactNode }) {
  const base =
    "cursor-pointer font-semibold text-fg-2 underline underline-offset-2 decoration-fg-3/60 hover:text-fg-1 hover:decoration-fg-1 transition";
  if (!href) return <span className={base}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={base}>
      {children}
    </a>
  );
}

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

type Translator = (key: string, params?: Record<string, string | number>) => string;

function humanError(t: Translator, code?: string, retryAfterSeconds?: number): string {
  switch (code) {
    case "too_recent":
      return retryAfterSeconds
        ? t("signin.errorTooRecentWithSeconds", { seconds: retryAfterSeconds })
        : t("signin.errorTooRecent");
    case "too_many":
      return retryAfterSeconds
        ? t("signin.errorTooManyWithRetry", { retry: formatRetry(t, retryAfterSeconds) })
        : t("signin.errorTooMany");
    case "invalid_code":
      return t("signin.errorInvalidCode");
    case "expired":
      return t("signin.errorExpired");
    case "send_failed":
      return t("signin.errorSendFailed");
    case "user_paused":
      return t("signin.errorUserPaused");
    case "user_banned":
      return t("signin.errorUserBanned");
    case "username_not_found":
      return t("signin.errorUsernameNotFound");
    case "method_disabled":
      return t("signin.errorMethodDisabled");
    default:
      return t("signin.errorGeneric");
  }
}

function formatRetry(t: Translator, seconds: number): string {
  if (seconds < 60) return t("common.durationSeconds", { seconds });
  const m = Math.ceil(seconds / 60);
  return m === 1 ? t("common.durationOneMinute") : t("common.durationMinutes", { minutes: m });
}

/**
 * Build the `/api/auth/google/start` href for the static redirect-OAuth
 * anchor (the fallback used when GIS isn't active). For `intent="app"` the
 * cross-origin flow needs a `returnUrl` so elvix's callback can bounce the
 * user back to THIS page with the session token in the fragment — we use the
 * current page URL. elvix validates that origin against the app's
 * `allowedOrigins` and rejects anything unlisted, so this is safe to derive
 * from the live location. Non-app intents (account/console) are first-party
 * and need no returnUrl.
 */
function googleStartHref(baseUrl: string, intent?: string, clientId?: string): string {
  const params = new URLSearchParams({ intent: intent ?? "app" });
  if (clientId) params.set("clientId", clientId);
  if (intent === "app" && typeof window !== "undefined") {
    params.set("returnUrl", window.location.href);
  }
  return `${baseUrl}/api/auth/google/start?${params.toString()}`;
}

function defaultRedirect(intent?: string): string {
  switch (intent) {
    case "console":
      return "/console";
    case "account":
      return "/account";
    default:
      return "/";
  }
}

// State + label mapping for the onboarding username step's live availability
// indicator. Reason codes mirror /api/onboarding/username/check.
type UsernameCheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "rejected"; reason: string };

function usernameReasonLabel(t: Translator, reason: string): string {
  switch (reason) {
    case "blank":
      return t("username.reasonBlank");
    case "too_short":
      return t("username.reasonTooShort");
    case "too_long":
      return t("username.reasonTooLong");
    case "only_numbers":
      return t("username.reasonOnlyNumbers");
    case "bad_start":
      return t("username.reasonBadStart");
    case "bad_chars":
      return t("username.reasonBadChars");
    case "consecutive_special":
      return t("username.reasonConsecutiveSpecial");
    case "trailing_special":
      return t("username.reasonTrailingSpecial");
    case "taken":
      return t("username.reasonTaken");
    default:
      return t("username.reasonInvalid");
  }
}
