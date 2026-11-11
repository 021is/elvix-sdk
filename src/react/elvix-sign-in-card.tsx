"use client";

import { type CSSProperties, useRef } from "react";
import { useT } from "../locale/use-t";
import { cardLookVars, mergeCardStyle } from "./card-look";
import { ElvixLogo } from "./elvix-logo";
import { brandCssVars, useElvixApp, useElvixCardStyle } from "./elvix-provider";
import type { AuthFormProps } from "./elvix-sign-in-form";
import { useKeepFieldsInView } from "./keyboard";
import { SignInCardBody } from "./sign-in-card-body";
import { type Theme, themeVars, useSignInTheme } from "./sign-in-theme";
import { ELVIX_SDK_VERSION } from "./version";

/** elvix's public origin, where the "Secured by elvix" chip links. */
const ELVIX_SITE_URL = "https://elvix.is";

/** What only a container decides: the form's presentations, its overlay and its trigger.
 *  `mode="preview"` and `previewStep` stay: docs and design tools show the card inert. */
type ContainerProps =
  | "framed"
  | "presentation"
  | "transparentBg"
  | "width"
  | "trigger"
  | "triggerLabel"
  | "triggerProps"
  | "open"
  | "defaultOpen"
  | "onOpenChange"
  | "drawerSide"
  | "dismissable"
  | "resumeOnReturn";

/** `<ElvixSignInForm>`'s props without the container's: the card, its brand and its flow. */
export type ElvixSignInCardProps = Omit<AuthFormProps, ContainerProps>;

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

/** The props with the Console's envelope filled in, the brand pair and the theme. */
export function useResolvedSignIn(props: AuthFormProps): { resolved: AuthFormProps; theme: Theme } {
  const app = useElvixApp();
  const { theme, brandPair } = useSignInTheme(props.theme);
  const resolved: AuthFormProps = {
    ...props,
    ...resolveIdentity(props, app),
    ...resolveMethods(props, app),
    ...resolveLook(props, app),
    brandColor: props.brandColor ?? brandPair?.primary ?? "#5d4dff",
    onBrandColor: props.onBrandColor ?? (props.brandColor ? undefined : brandPair?.on) ?? "#ffffff",
    theme,
  };
  return { resolved, theme };
}

/**
 * elvix's sign-in card with no container: for a host's own sheet, page or dialog (0.25).
 *
 *   <YourSheet open={open} onClose={close}>
 *     <ElvixSignInCard onResult={(r) => r.ok && close()} />
 *   </YourSheet>
 *
 * elvix ships the card and its brand (your logo and title, every method enabled in the
 * Console, every step incl. the username and passkey ones, the legal links, "Secured by
 * elvix"); you own the container, its grabber, its close and its scroll, so a change to
 * your sheet never waits for an elvix release. The card fills its parent's width, never
 * scrolls itself, draws no background of its own, and stays a card whatever the Console's
 * presentation says. After a redirect sign-in (Google, GitHub, the hosted passkey page),
 * open your container while `useElvixOnboarding().pending` and call its `dismiss()` when
 * the person closes it; that surface alone, not also `<ElvixOnboarding>` or a sign-in left
 * mounted on the page, or two surfaces show the step. Inside `<ElvixProvider>`; mounted
 * after the provider has loaded, it sends nothing until the person acts (a Google return on
 * `?onboarding=1` asks elvix for its pending step once).
 */
export function ElvixSignInCard(props: ElvixSignInCardProps) {
  const { resolved, theme } = useResolvedSignIn(props);
  return (
    <div data-elvix-sign-in-card="" className="w-full" style={themeVars(theme)}>
      <AuthCard {...resolved} presentation="card" transparentBg surface={CardSurface.FILL} />
    </div>
  );
}

/** The SDK version, one component for every presentation. */
function VersionLabel() {
  return (
    <span className="text-[9px] tracking-wide text-fg-3 opacity-60 tabular-nums">
      v{ELVIX_SDK_VERSION}
    </span>
  );
}

function SecuredChip() {
  const t = useT();
  return (
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
  );
}

/**
 * Where the card sits. `INLINE`: on the host's page, the version below it. `OVERLAY`: on a
 * dimmed backdrop (elvix's modal, drawer), where the version would be unreadable below it, so
 * it sits on the card. `FILL`: inside a host's own container, as wide as it, version inside.
 */
export const CardSurface = {
  INLINE: "inline",
  OVERLAY: "overlay",
  FILL: "fill",
} as const;
export type CardSurface = (typeof CardSurface)[keyof typeof CardSurface];

/** The card's own box: elvix's 420 px card, or the host's full width. */
function cardClass(transparentBg: boolean, surface: CardSurface): string {
  if (surface === CardSurface.FILL) return "w-full overflow-hidden";
  return transparentBg
    ? "mx-auto w-full max-w-[420px] overflow-hidden"
    : "mx-auto w-full max-w-[420px] rounded-[14px] bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.04),0_20px_40px_-20px_rgba(0,0,0,0.12)] border border-border-base overflow-hidden";
}

/** The card's type and spacing variables: the card's `cardStyle`, the provider's, the
 *  Console's, key by key (0.26), every one set so no ancestor's value reaches the card. */
function useCardLookVars(own: AuthFormProps["cardStyle"], bordered: boolean) {
  const provider = useElvixCardStyle();
  const app = useElvixApp();
  return cardLookVars(mergeCardStyle({ card: own, provider, console: app?.cardStyle }), bordered);
}

/** The card every presentation shows, on its `surface`. */
export function AuthCard(props: AuthFormProps & { surface: CardSurface }) {
  const { transparentBg = false, surface } = props;
  const versionInside = surface !== CardSurface.INLINE;
  const lookVars = useCardLookVars(props.cardStyle, !transparentBg);
  const body = useRef<HTMLDivElement | null>(null);
  useKeepFieldsInView(body);
  // The brand and look variables ride on the card itself: the modal and drawer portal out of
  // the provider's root, where `--elvix-primary` would not exist. `width` overrides 420 px.
  const cardStyle: CSSProperties = {
    ...lookVars,
    ...(props.brandColor ? brandCssVars(props.brandColor, props.onBrandColor ?? "#ffffff") : {}),
    ...(props.width !== undefined && surface !== CardSurface.FILL ? { maxWidth: props.width } : {}),
  };
  return (
    <>
      <div className={cardClass(transparentBg, surface)} style={cardStyle}>
        {/* One inset in every mode, so the `banner` header's bleed lands on the card edge.
            The app's text font is the body's; the chip below keeps the page's, it is elvix's. */}
        <div
          ref={body}
          data-elvix-card-body=""
          className="px-(--elvix-card-px) pt-(--elvix-card-pt) pb-(--elvix-gap-footer) [font-family:var(--elvix-font-text)]"
        >
          <SignInCardBody p={props} />
        </div>
        <div
          data-elvix-card-footer=""
          className={
            (transparentBg ? "" : "border-t border-border-base bg-surface-hover px-7 py-3 ") +
            "flex flex-col items-center justify-center gap-2"
          }
        >
          <SecuredChip />
          {versionInside && <VersionLabel />}
        </div>
      </div>
      {!versionInside && (
        <div className="mt-2.5 text-center leading-none">
          <VersionLabel />
        </div>
      )}
    </>
  );
}
