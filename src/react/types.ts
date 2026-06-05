/**
 * Public types for the React surface. Mirrors the elvix.is bootstrap
 * envelope so customers can type their host code without importing
 * private elvix internals.
 */

import type { ElvixCopy } from "./copy";

export type ElvixBrand = {
  light: { primary: string; on: string };
  dark: { primary: string; on: string };
};

export type ElvixSignInMethod = "google" | "email_otp" | "passkey" | "username";

/**
 * The public render envelope `GET /api/v1/bootstrap/<clientId>` returns. Flat
 * to match the wire shape exactly (the provider builds the {light,dark} brand
 * chord from the colour fields). Any field here is already public — it's what
 * the sign-in surface shows.
 */
export type ElvixBootstrapEnvelope = {
  applicationId: string;
  clientId: string;
  urlSlug: string;
  appName: string;
  logoUrl: string | null;
  logoUrlDark: string | null;
  iconUrl: string | null;
  iconUrlDark: string | null;
  websiteUrl: string | null;
  privacyPolicyUrl: string;
  termsOfServiceUrl: string;
  supportUrl: string | null;
  brandColor: string;
  brandColorDark: string | null;
  onBrandColor: string;
  onBrandColorDark: string | null;
  brandPreset: string;
  methodGoogle: boolean;
  methodEmailOtp: boolean;
  methodPasskey: boolean;
  methodUsername: boolean;
  layout: string;
  socialLayout: string;
  presentation: string;
  theme: "light" | "dark" | "system";
  showHeader: boolean;
  transparentBg: boolean;
  signInVerb: "signin" | "login";
  /**
   * Per-app Google Identity Services config (One Tap / Auto-select / Popup
   * / FedCM). Present on the wire; the SDK's `<ElvixSignInForm>` reads it
   * into its resolved props. When any GIS flag is on AND `googleClientId`
   * is present, the form swaps the static redirect anchor for Google's
   * GIS-rendered personalized button.
   */
  googleConfig: unknown;
  /**
   * Public Google OAuth client id for GIS (the personalized "Continue as
   * <name>" One Tap / renderButton path). In the elvix monorepo this is the
   * build-time `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; for the published SDK it
   * arrives per-app on the bootstrap envelope. When absent, the Google
   * factor degrades to the static redirect anchor (which uses elvix's
   * server-side client id via `/api/auth/google/start`).
   */
  googleClientId?: string;
  signinGate: "public" | "private_beta" | "closed";
  archivedAt: string | null;
  /**
   * Console-configured sign-in copy overrides. Any subset of the strings the
   * sign-in surface renders; missing keys fall back to the built-in English
   * defaults. A `copy` prop on the component overrides these in turn.
   */
  strings?: Partial<ElvixCopy>;
};

export type ElvixSignInResultOk = {
  ok: true;
  /**
   * Always "complete". `onResult` fires EXACTLY ONCE per sign-in, at the
   * terminal state — AFTER any in-frame onboarding panes (passkey / username
   * / recover), which the SDK renders itself. The host never sees those
   * intermediate steps. Reaching here means sign-in is fully done, so it is
   * always safe to redirect. (Reserved as a discriminator: future non-terminal
   * `onResult` events, if ever added, would carry a different `phase`.)
   */
  phase: "complete";
  /** Sign-in factor that completed the ceremony. */
  method: ElvixSignInMethod;
  /**
   * Resolved final destination — `redirectAfterSignIn` (host prop) ?? the
   * backend's per-method redirect ?? "/". The SDK navigates here itself
   * UNLESS the host passed `navigate={false}` (then the host redirects using
   * this value).
   */
  redirect: string;
  /**
   * Cross-origin only: the session token. Pass it to your backend and verify
   * it with `verifyElvixToken` from `@elvix.is/sdk/server`. Undefined for
   * same-origin sign-in (the session rides a cookie instead).
   */
  token?: string;
};

export type ElvixSignInResultErr = {
  ok: false;
  error: string;
  message?: string;
};

export type ElvixSignInResult = ElvixSignInResultOk | ElvixSignInResultErr;

/** Theme override. Omit to inherit the Console-configured pair. */
export type ElvixTheme = "light" | "dark" | "system";
