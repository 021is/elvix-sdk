/**
 * Smoke tests for the React types + the no-DOM entry of ElvixProvider.
 * Deep React tests live in the e2e suite; here we just confirm the
 * public exports + types are stable so a customer's `import` line
 * never silently breaks.
 */
import { describe, expect, it } from "vitest";

import {
  ElvixProvider,
  ElvixSignIn,
  useElvixApp,
  useElvixContext,
  type ElvixBootstrapEnvelope,
  type ElvixSignInResult,
  type ElvixTheme,
} from "../src/react";

describe("@elvix.is/sdk/react surface", () => {
  it("exports the wave-1 components", () => {
    expect(typeof ElvixProvider).toBe("function");
    expect(typeof ElvixSignIn).toBe("function");
    expect(typeof useElvixApp).toBe("function");
    expect(typeof useElvixContext).toBe("function");
  });

  it("ElvixBootstrapEnvelope shape compiles", () => {
    const env: ElvixBootstrapEnvelope = {
      applicationId: "app_1",
      clientId: "client_1",
      urlSlug: "acme",
      appName: "Acme",
      logoUrl: null,
      logoUrlDark: null,
      iconUrl: null,
      iconUrlDark: null,
      brand: {
        light: { primary: "#5d4dff", on: "#ffffff" },
        dark: { primary: "#8e7dff", on: "#0a0a0b" },
      },
      methods: { google: true, emailOtp: true, passkey: false, username: false },
      legal: {
        privacyPolicyUrl: "https://acme.test/privacy",
        termsOfServiceUrl: "https://acme.test/terms",
        supportEmail: "support@acme.test",
        supportUrl: null,
      },
      signInVerb: "signin",
      signinGate: "public",
    };
    expect(env.applicationId).toBe("app_1");
  });

  it("ElvixSignInResult is a discriminated union", () => {
    const ok: ElvixSignInResult = { ok: true, method: "email_otp" };
    const err: ElvixSignInResult = { ok: false, error: "rate_limited" };
    expect(ok.ok && ok.method).toBe("email_otp");
    expect(err.ok).toBe(false);
  });

  it("ElvixTheme accepts the three documented values", () => {
    const t: ElvixTheme[] = ["light", "dark", "system"];
    expect(t).toHaveLength(3);
  });
});
