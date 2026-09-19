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

import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Drawer as Vaul } from "vaul";
import { useT } from "../locale/use-t";
import { ElvixLogo } from "./elvix-logo";
import {
  ElvixSessionStatus,
  useElvixApp,
  useElvixBrandPair,
  useElvixContext,
  useElvixHostTheme,
  useElvixResolvedTheme,
  useElvixSession,
} from "./elvix-provider";
import { ElvixSignInButton, type ElvixSignInButtonProps } from "./elvix-sign-in-button";
import {
  AuthenticatingPane,
  CodeStep,
  IdentifierStep,
  LegalFooter,
  PasskeyStep,
  RecoverStep,
  SignInHeader,
  UsernameStep,
} from "./sign-in-steps";
import type { ElvixSignInResult } from "./types";
import { Step, useOtpStart, useSignInFlow, useSignInReturns } from "./use-sign-in-flow";
import { ELVIX_SDK_VERSION } from "./version";

/** elvix marketing origin the "Secured by elvix" chip links to. In the
 *  monorepo this is `SITE_URL` (NEXT_PUBLIC_SITE_URL); here it's the
 *  canonical public origin. */
const ELVIX_SITE_URL = "https://elvix.is";

/**
 * Public ResponseDto shape surfaced to `onResult`. Single source of truth is
 * `./types` (`ElvixSignInResultOk` carries `phase: "complete"` + `method` +
 * resolved `redirect`); re-exported here for code that imported it from this
 * module.
 */
export type { ElvixSignInResult } from "./types";

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

const DrawerSide = {
  BOTTOM: "bottom",
  LEFT: "left",
  RIGHT: "right",
} as const;
type DrawerSide = (typeof DrawerSide)[keyof typeof DrawerSide];

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
  methodGithub?: boolean;
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
  /**
   * When `presentation` is "modal" or "drawer" in interactive mode, the form
   * renders a trigger and opens the card in a real overlay (portal + backdrop
   * + Escape + scroll-lock + focus-trap) on click. Custom trigger: a render
   * fn that receives `open()`. Wins over the default `<ElvixSignInButton>`.
   *
   *   <ElvixSignInForm presentation="modal"
   *     trigger={(open) => <MyButton onClick={open}>Sign in</MyButton>} />
   */
  trigger?: (open: () => void) => React.ReactNode;
  /** Label for the auto-rendered trigger button. Default: "Sign in". */
  triggerLabel?: string;
  /** Style the auto-rendered trigger (variant / shape / size / brand / etc.) —
   *  the full `<ElvixSignInButton>` prop surface. */
  triggerProps?: Partial<ElvixSignInButtonProps>;
  /** Controlled overlay open state. Omit for uncontrolled (the form owns it,
   *  e.g. opened by its own trigger). */
  open?: boolean;
  /** Uncontrolled initial open state. Default false. */
  defaultOpen?: boolean;
  /** Fires whenever the overlay opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** Drawer anchor edge. Default "bottom". */
  drawerSide?: DrawerSide;
  /** Allow backdrop-click + Escape to close the overlay. Default true. */
  dismissable?: boolean;
  /**
   * Width of the card / overlay panel. Number = px, string = any CSS length.
   * Applies to the inline card, the modal panel, AND the drawer (`maxWidth` of
   * the vaul sheet — set it to your app container's width so a bottom drawer
   * matches your shell, the way DanceClub pins it to the container). Defaults:
   * 420 (card / modal), 480 (bottom drawer), 420 (side drawer).
   */
  width?: number | string;
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
   * @deprecated Use `navigate={false}` and read the result in `onResult`
   * instead. This hook predates `onResult` carrying `method` + a resolved
   * `redirect`. It still fires on success and, for back-compat, its presence
   * implies `navigate={false}` (the SDK will NOT navigate; the host owns
   * routing). Will be removed in a future major.
   */
  onAuthenticated?: (result: { ok: true; redirect?: string; token?: string }) => void;
  /**
   * Who performs post-sign-in navigation. Default `true`: after firing
   * `onResult` the SDK navigates to `result.redirect` itself
   * (`window.location.href`). Set `false` to keep the SDK in place and route
   * yourself from `onResult` (e.g. `router.push(result.redirect)` for SPA
   * navigation, or to set a session cookie first). Passing the deprecated
   * `onAuthenticated` also forces `false`.
   */
  navigate?: boolean;
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
   * Fires EXACTLY ONCE on success — at the terminal state, AFTER any in-frame
   * onboarding panes (passkey / username / recover) the SDK renders itself.
   * The host never sees those intermediate steps, so redirecting in `onResult`
   * is always correct timing. The success payload carries `phase: "complete"`,
   * the `method` that completed, and the resolved `redirect`.
   */
  onResult?: (result: ElvixSignInResult) => void;
  /**
   * SSO silent-resume. When true and the SDK detects an ALREADY-ACTIVE elvix
   * session on mount (e.g. the user opens the sign-in page but is still signed
   * in), the form skips the sign-in UI and immediately fires `onResult` with
   * `method: "session"` + the resolved `redirect` (and navigates unless
   * `navigate={false}`), so the host lands them on the dashboard. While the
   * session probe is in flight it shows a brief loading state instead of the
   * form, so a signed-in user never sees a sign-in flash. Default `false`
   * (so "switch account" flows that intentionally show the form still work).
   */
  redirectIfAuthenticated?: boolean;
};

// Hard-coded theme values so the ElvixSignInForm's chrome can be isolated from the
// surrounding page (e.g., Console can be dark while the preview shows the
// light-theme appearance to the customer, or vice-versa). When the user
// picks "auto", we don't override — descendants inherit the host's theme.
const ELVIX_LIGHT_VARS: React.CSSProperties = {
  ["--elvix-canvas" as string]: "#fafafa",
  ["--elvix-surface" as string]: "#ffffff",
  ["--elvix-surface-2" as string]: "#f4f4f5",
  ["--elvix-surface-hover" as string]: "rgba(0, 0, 0, 0.04)",
  ["--elvix-surface-active" as string]: "rgba(0, 0, 0, 0.06)",
  ["--elvix-border" as string]: "rgba(0, 0, 0, 0.08)",
  ["--elvix-border-strong" as string]: "rgba(0, 0, 0, 0.14)",
  ["--elvix-fg-1" as string]: "#18181b",
  ["--elvix-fg-2" as string]: "#52525b",
  ["--elvix-fg-3" as string]: "#71717a",
  ["--elvix-placeholder" as string]: "#a1a1aa",
};
const ELVIX_DARK_VARS: React.CSSProperties = {
  ["--elvix-canvas" as string]: "#0a0a0b",
  ["--elvix-surface" as string]: "#0d0d10",
  ["--elvix-surface-2" as string]: "#08080a",
  ["--elvix-surface-hover" as string]: "rgba(255, 255, 255, 0.04)",
  ["--elvix-surface-active" as string]: "rgba(255, 255, 255, 0.06)",
  ["--elvix-border" as string]: "rgba(255, 255, 255, 0.06)",
  ["--elvix-border-strong" as string]: "rgba(255, 255, 255, 0.12)",
  ["--elvix-fg-1" as string]: "#fafafa",
  ["--elvix-fg-2" as string]: "#a1a1aa",
  ["--elvix-fg-3" as string]: "#71717a",
  ["--elvix-placeholder" as string]: "#52525b",
};

type AppEnvelope = ReturnType<typeof useElvixApp>;

// Every explicit prop wins (the Console live preview passes unsaved state);
// the Console envelope from <ElvixProvider clientId> fills in the rest.

function resolveIdentity(props: AuthFormProps, app: AppEnvelope) {
  return {
    mode: props.mode ?? "interactive",
    appName: props.appName ?? app?.appName ?? "your app",
    logoUrl: props.logoUrl ?? app?.logoUrl ?? null,
    logoUrlDark: props.logoUrlDark ?? app?.logoUrlDark ?? null,
    privacyPolicyUrl: props.privacyPolicyUrl ?? app?.privacyPolicyUrl ?? null,
    termsOfServiceUrl: props.termsOfServiceUrl ?? app?.termsOfServiceUrl ?? null,
    websiteUrl: props.websiteUrl ?? app?.websiteUrl ?? null,
    intent: props.intent ?? "app",
    clientId: props.clientId ?? app?.clientId ?? undefined,
  } satisfies Partial<AuthFormProps>;
}

function resolveMethods(props: AuthFormProps, app: AppEnvelope) {
  return {
    methodGoogle: props.methodGoogle ?? app?.methodGoogle ?? false,
    methodGithub: props.methodGithub ?? app?.methodGithub ?? false,
    methodEmailOtp: props.methodEmailOtp ?? app?.methodEmailOtp ?? true,
    methodPasskey: props.methodPasskey ?? app?.methodPasskey ?? false,
    methodUsername: props.methodUsername ?? app?.methodUsername ?? false,
    googleConfig:
      props.googleConfig ?? (app?.googleConfig as AuthFormProps["googleConfig"]) ?? undefined,
    googleClientId: props.googleClientId ?? app?.googleClientId ?? undefined,
  } satisfies Partial<AuthFormProps>;
}

function resolveLook(props: AuthFormProps, app: AppEnvelope) {
  return {
    layout: props.layout ?? (app?.layout as AuthFormProps["layout"]) ?? "centered",
    socialLayout:
      props.socialLayout ?? (app?.socialLayout as AuthFormProps["socialLayout"]) ?? "stacked",
    presentation:
      props.presentation ?? (app?.presentation as AuthFormProps["presentation"]) ?? "card",
    showHeader: props.showHeader ?? app?.showHeader ?? true,
    transparentBg: props.transparentBg ?? app?.transparentBg ?? false,
    signInVerb: props.signInVerb ?? (app?.signInVerb as AuthFormProps["signInVerb"]) ?? "signin",
  } satisfies Partial<AuthFormProps>;
}

export function ElvixSignInForm(props: AuthFormProps) {
  // Pull the Console-configured envelope from <ElvixProvider clientId>.
  // Every explicit prop wins (Console live-preview passes unsaved
  // state); context fills in everything the customer omitted.
  const app = useElvixApp();
  // Theme: explicit prop > the host's theme pinned on <ElvixProvider theme> >
  // the Console default. The brand pair follows the theme the card actually
  // renders in ("auto" inherits the page, so it takes the provider's), which
  // is how a Console `brandColorDark` reaches a dark card with no host props.
  const hostTheme = useElvixHostTheme();
  const providerTheme = useElvixResolvedTheme();
  const theme = props.theme ?? hostTheme ?? (app?.theme as AuthFormProps["theme"]) ?? "light";
  const brandPair = useElvixBrandPair(
    theme === Theme.AUTO ? (providerTheme ?? Theme.LIGHT) : theme,
  );
  const resolved: AuthFormProps = {
    ...props,
    ...resolveIdentity(props, app),
    ...resolveMethods(props, app),
    ...resolveLook(props, app),
    brandColor: props.brandColor ?? brandPair?.primary ?? "#5d4dff",
    onBrandColor: props.onBrandColor ?? (props.brandColor ? undefined : brandPair?.on) ?? "#ffffff",
    theme,
  };
  // `framed` defaults to the dashed "This is a preview" wrapper ONLY when
  // the form is in preview mode. Customer-host renders (zp.edvone.dev,
  // any production sign-in) default to unframed so the banner never
  // leaks. Hosts can still opt in by passing `framed={true}`.
  const { framed = resolved.mode === "preview", presentation = "card" } = resolved;

  // Interactive modal/drawer → a real, trigger-opened overlay (portal, backdrop,
  // Escape + scroll-lock + focus-trap). Preview mode falls through to the inline
  // cosmetic chrome below, so the Console can still show what the overlay looks
  // like statically.
  if (resolved.mode !== "preview" && (presentation === "modal" || presentation === "drawer")) {
    return <OverlayPresentation resolved={resolved} presentation={presentation} theme={theme} />;
  }

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

/**
 * Interactive modal/drawer: renders a trigger and mounts the auth card in a
 * real overlay (portal to `document.body`, dim backdrop, framer-motion enter /
 * exit, Escape + backdrop dismiss, body scroll-lock, focus-trap, focus restore).
 * Open state is controlled (`open` / `onOpenChange`) or uncontrolled. The card's
 * `onResult` is wrapped so a successful sign-in closes the overlay before the
 * host's own `onResult` runs.
 */
function OverlayPresentation({
  resolved,
  presentation,
  theme,
}: {
  resolved: AuthFormProps;
  presentation: Presentation;
  theme: Theme;
}) {
  const t = useT();
  const {
    open: controlledOpen,
    defaultOpen = false,
    onOpenChange,
    trigger,
    triggerLabel,
    triggerProps,
    brandColor,
    onBrandColor,
  } = resolved;

  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );
  const openFn = useCallback(() => setOpen(true), [setOpen]);

  // Close on a successful sign-in, then forward to the host's onResult.
  const hostOnResult = resolved.onResult;
  const onResult = useCallback(
    (r: ElvixSignInResult) => {
      if (r.ok) setOpen(false);
      hostOnResult?.(r);
    },
    [hostOnResult, setOpen],
  );

  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const themeVars =
    theme === "auto" ? undefined : theme === "dark" ? ELVIX_DARK_VARS : ELVIX_LIGHT_VARS;

  const triggerNode = trigger ? (
    trigger(openFn)
  ) : (
    <ElvixSignInButton
      mode="callback"
      onClick={openFn}
      label={triggerLabel ?? t("signin.titleDefault")}
      variant="filled"
      brandColor={brandColor ?? undefined}
      onBrandColor={onBrandColor ?? undefined}
      {...triggerProps}
    />
  );

  return (
    <>
      {triggerNode}
      {presentation === Presentation.DRAWER ? (
        <DrawerOverlay
          resolved={resolved}
          open={open}
          onOpenChange={setOpen}
          themeVars={themeVars}
          onResult={onResult}
        />
      ) : (
        <ModalOverlay
          resolved={resolved}
          open={open}
          onClose={() => setOpen(false)}
          themeVars={themeVars}
          onResult={onResult}
        />
      )}
    </>
  );
}

/** Centered modal overlay (framer-motion). No close button: it dismisses on a
 *  backdrop click (outside the card) + Escape. The panel width tracks the card.
 *  Owns its own scroll-lock + focus-trap (vaul handles those for the drawer). */
function ModalOverlay({
  resolved,
  open,
  onClose,
  themeVars,
  onResult,
}: {
  resolved: AuthFormProps;
  open: boolean;
  onClose: () => void;
  themeVars: React.CSSProperties | undefined;
  onResult: (r: ElvixSignInResult) => void;
}) {
  const { dismissable = true, width = 420 } = resolved;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
      else if (e.key === "Tab") trapTab(e, panelRef.current);
    };
    document.addEventListener("keydown", onKey);
    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(raf);
      restoreFocusRef.current?.focus?.();
    };
  }, [open, dismissable, onClose]);

  const overlay = (
    <AnimatePresence>
      {open && (
        <div
          className="elvix-sdk-root fixed inset-0 z-[2147483000] flex items-center justify-center p-4"
          style={themeVars}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={dismissable ? onClose : undefined}
          />
          <motion.div
            ref={panelRef}
            className="relative mx-auto w-full"
            style={{ maxWidth: width }}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <AuthCard {...resolved} onResult={onResult} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return mounted ? createPortal(overlay, document.body) : null;
}

/** Drawer overlay built on `vaul` (the same primitive shadcn/ui Drawer uses, so
 *  it drops into shadcn hosts like DanceClub unchanged): drag-to-dismiss, snap,
 *  spring, body scroll-lock, focus + Escape — all from vaul. The auth card
 *  renders transparent so it blends into the sheet surface. `width` maps to the
 *  sheet's `maxWidth` (pin it to your app container, the way DanceClub does). */
function DrawerOverlay({
  resolved,
  open,
  onOpenChange,
  themeVars,
  onResult,
}: {
  resolved: AuthFormProps;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  themeVars: React.CSSProperties | undefined;
  onResult: (r: ElvixSignInResult) => void;
}) {
  const t = useT();
  const { drawerSide = DrawerSide.BOTTOM, dismissable = true, width, appName } = resolved;
  const isBottom = drawerSide === DrawerSide.BOTTOM;
  const sideClass = isBottom
    ? "inset-x-0 bottom-0 mt-24 max-h-[92dvh] rounded-t-[22px] border-t border-border-base"
    : drawerSide === DrawerSide.LEFT
      ? "inset-y-0 left-0 w-[92vw] border-r border-border-base"
      : "inset-y-0 right-0 w-[92vw] border-l border-border-base";
  const resolvedWidth = width ?? (isBottom ? 480 : 420);

  return (
    <Vaul.Root
      open={open}
      onOpenChange={onOpenChange}
      direction={drawerSide}
      dismissible={dismissable}
      shouldScaleBackground={false}
    >
      <Vaul.Portal>
        <Vaul.Overlay className="fixed inset-0 z-[2147483000] bg-black/45 backdrop-blur-sm" />
        <Vaul.Content
          className={`elvix-sdk-root fixed z-[2147483001] flex h-auto flex-col bg-surface outline-none focus:outline-none ${sideClass}`}
          style={{
            ...themeVars,
            maxWidth: resolvedWidth,
            ...(isBottom ? { marginLeft: "auto", marginRight: "auto" } : {}),
          }}
        >
          {/* No close button on the drawer: vaul dismisses via drag-down +
              backdrop tap (matches shadcn/DanceClub). The card fills the sheet
              width (banner header bleeds edge-to-edge), no inset gutters. */}
          {isBottom && (
            <div className="mx-auto mt-3 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-border-strong" />
          )}
          <Vaul.Title className="sr-only">{t("signin.title", { app: appName ?? "" })}</Vaul.Title>
          <div className="min-h-0 overflow-y-auto pb-4">
            <AuthCard {...resolved} transparentBg width={resolvedWidth} onResult={onResult} />
          </div>
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}

/** Keep Tab focus cycling inside the open overlay panel. */
function trapTab(e: KeyboardEvent, panel: HTMLElement | null): void {
  if (!panel) return;
  const focusables = panel.querySelectorAll<HTMLElement>(
    'input:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last?.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first?.focus();
  }
}

function AuthCard(props: AuthFormProps) {
  const t = useT();
  const { transparentBg = false } = props;
  // Fixed width regardless of layout/appearance — the card never reflows wider
  // just because the header switched to "left" or "banner". One width everywhere
  // (Console preview, hosted page, customer host).
  const cardClass = transparentBg
    ? "mx-auto w-full max-w-[420px] overflow-hidden"
    : "mx-auto w-full max-w-[420px] rounded-[14px] bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.04),0_20px_40px_-20px_rgba(0,0,0,0.12)] border border-border-base overflow-hidden";
  // `width` (when set) overrides the default 420px cap — inline style wins over
  // the max-w-[420px] class. Lets a host widen the card / modal / drawer.
  const cardStyle: React.CSSProperties | undefined =
    props.width !== undefined ? { maxWidth: props.width } : undefined;
  return (
    <>
      <div className={cardClass} style={cardStyle}>
        {/* Same px-7 in both modes so the `banner` header's `-mx-7 -mt-7`
            bleed lands exactly on the card edge (drawer/transparent included)
            instead of floating inset. transparentBg only trims the bottom. */}
        <div className={transparentBg ? "px-7 pt-7 pb-3" : "px-7 py-7"}>
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
      {/* Version badge sits BELOW the card, not inside it. */}
      <div className="mt-2.5 text-center leading-none">
        <span className="text-[9px] tracking-wide text-fg-3 opacity-50 tabular-nums">
          v{ELVIX_SDK_VERSION}
        </span>
      </div>
    </>
  );
}

/**
 * The card's content: header, the current step, the host's `belowMethods`
 * slot, and the legal footer. Every step renders inside the same card, with
 * no URL hop: a host embeds `<ElvixSignInForm />` and the user finishes the
 * whole flow, onboarding included, without leaving it.
 */
function AuthBody(p: AuthFormProps) {
  const { baseUrl } = useElvixContext();
  const sessionStatus = useElvixSession();
  // The Console envelope, for what the form does not thread through as props
  // (the signinGate behind the default badge).
  const appCtx = useElvixApp();
  const t = useT();
  const isPreview = p.mode === "preview";
  const intent = p.intent ?? "app";
  const flow = useSignInFlow({
    intent,
    redirectAfterSignIn: p.redirectAfterSignIn,
    onResult: p.onResult,
    onAuthenticated: p.onAuthenticated,
    navigate: p.navigate ?? true,
  });
  useSignInReturns({
    flow,
    baseUrl,
    isPreview,
    redirectIfAuthenticated: p.redirectIfAuthenticated ?? false,
    sessionStatus,
    t,
    onResult: p.onResult,
  });
  const otp = useOtpStart({
    flow,
    baseUrl,
    intent,
    clientId: p.clientId,
    isPreview,
    methodEmailOtp: Boolean(p.methodEmailOtp),
    methodUsername: Boolean(p.methodUsername),
    t,
  });

  // SSO silent-resume: while the opted-in session probe runs, hold a loader
  // so a signed-in user never sees the form flash before being sent on.
  if (p.redirectIfAuthenticated && !isPreview && sessionStatus === ElvixSessionStatus.LOADING) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10">
        <Loader2 className="size-5 animate-spin text-fg-3" />
        <p className="text-[13px] text-fg-3">Signing you in…</p>
      </div>
    );
  }

  const cta = { brand: p.brandColor, onBrand: p.onBrandColor ?? "#ffffff" };
  const shared = { flow, baseUrl, isPreview, cta };
  return (
    <>
      {(p.showHeader ?? true) && (
        <SignInHeader p={p} flow={flow} identifier={otp.identifier} gate={appCtx?.signinGate} />
      )}
      {flow.step === Step.AUTHENTICATING ? (
        <AuthenticatingPane brandColor={p.brandColor} appName={p.appName} />
      ) : flow.step === Step.CODE ? (
        <CodeStep {...shared} otp={otp} />
      ) : flow.step === Step.USERNAME ? (
        <UsernameStep {...shared} />
      ) : flow.step === Step.PASSKEY ? (
        <PasskeyStep {...shared} p={p} />
      ) : flow.step === Step.RECOVER ? (
        <RecoverStep flow={flow} baseUrl={baseUrl} />
      ) : (
        <IdentifierStep {...shared} otp={otp} p={p} />
      )}
      {/* The host's text links for gated surfaces ("Request access"), on the
          entry step only, where they do not compete with an active flow. */}
      {flow.step === Step.IDENTIFIER && p.belowMethods}
      <LegalFooter p={p} />
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
