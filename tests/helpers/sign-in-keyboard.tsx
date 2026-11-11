/**
 * The sign-in card on a phone, for the keyboard and passkey-autofill tests (0.26): the
 * pointer, a browser with passkeys, the elvix routes a passkey and a code sign-in take, and
 * the card mounted in a provider once its envelope is in.
 */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { ElvixProvider } from "../../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix, json, type Route } from "./fake-elvix";

export const PANE = { timeout: 3000 };
const buf = (s: string) => new TextEncoder().encode(s).buffer;
export const ASSERTION = {
  id: "cred1",
  rawId: buf("raw"),
  authenticatorAttachment: "platform",
  getClientExtensionResults: () => ({}),
  response: {
    clientDataJSON: buf("cd"),
    authenticatorData: buf("ad"),
    signature: buf("sig"),
    userHandle: null,
  },
};
const ROUTES: Route[] = [
  [
    "POST",
    (u) => u.includes("/api/auth/passkey/sign-in/start"),
    () => json({ success: true, data: { options: { challenge: "Y2g" } } }),
  ],
  [
    "POST",
    (u) => u.includes("/api/auth/passkey/sign-in/finish"),
    () => json({ success: true, data: { ok: true, redirect: "/home", token: "tok_pk" } }),
  ],
  [
    "POST",
    (u) => u.includes("/api/auth/otp/start"),
    () => json({ success: true, data: { ok: true, challengeId: "c1" } }),
  ],
];

export function stubPointer(pointer: "coarse" | "fine") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("coarse") && pointer === "coarse",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

export type Get = (options: CredentialRequestOptions) => Promise<unknown>;

/** A browser with passkeys: `conditional` answers whether it offers them in a field. */
export function stubPasskeys(get: Get, conditional = true) {
  Object.defineProperty(window, "PublicKeyCredential", {
    configurable: true,
    value: { isConditionalMediationAvailable: async () => conditional },
  });
  const spy = vi.fn(get);
  Object.defineProperty(navigator, "credentials", { configurable: true, value: { get: spy } });
  return spy;
}

/** A conditional request stays open until it is aborted, like a browser's autofill offer. */
export const pendingUntilAborted: Get = (options) =>
  new Promise((_, reject) => {
    options.signal?.addEventListener("abort", () =>
      reject(new DOMException("aborted", "AbortError")),
    );
  });

/** The fake elvix stubs `matchMedia` for the colour scheme; the pointer is set after it.
 *  `first` routes win over the default ones. */
export function mount(node: ReactNode, pointer: "coarse" | "fine" = "fine", first: Route[] = []) {
  const fake = installFakeElvix({ context: null }, [...first, ...ROUTES]);
  stubPointer(pointer);
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      {node}
    </ElvixProvider>,
  );
  return fake;
}

/** The identifier field once the envelope is in: the app's clientId, which a passkey sign-in
 *  names, comes with it (before it, the offer waits for the next focus). */
export async function readyField() {
  await screen.findByText("Sign in to Acme", {}, PANE);
  return screen.getByPlaceholderText("Enter your email");
}

/** What the stubs above leave on `window` and `navigator`. */
export function resetBrowserStubs() {
  Reflect.deleteProperty(window, "matchMedia");
  Reflect.deleteProperty(window, "PublicKeyCredential");
  Reflect.deleteProperty(navigator, "credentials");
}
