/**
 * Public types for the React surface. Mirrors the elvix.is bootstrap
 * envelope so customers can type their host code without importing
 * private elvix internals.
 */

export type ElvixBrand = {
  light: { primary: string; on: string };
  dark: { primary: string; on: string };
};

export type ElvixSignInMethod = "google" | "email_otp" | "passkey" | "username";

export type ElvixBootstrapEnvelope = {
  applicationId: string;
  clientId: string;
  urlSlug: string;
  appName: string;
  logoUrl: string | null;
  logoUrlDark: string | null;
  iconUrl: string | null;
  iconUrlDark: string | null;
  brand: ElvixBrand;
  methods: {
    google: boolean;
    emailOtp: boolean;
    passkey: boolean;
    username: boolean;
  };
  legal: {
    privacyPolicyUrl: string;
    termsOfServiceUrl: string;
    supportEmail: string;
    supportUrl: string | null;
  };
  signInVerb: "signin" | "login";
  signinGate: "public" | "private_beta" | "closed";
};

export type ElvixSignInResultOk = {
  ok: true;
  /** Where the host should send the user (if anywhere). */
  redirect?: string;
  /** Sign-in factor that succeeded. */
  method: ElvixSignInMethod;
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
