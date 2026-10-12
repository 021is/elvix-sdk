// @vitest-environment jsdom
/**
 * `previewStep`: render a post-redirect onboarding step inline, in preview mode,
 * with no session, no network and no URL. It exists so documentation (and design
 * tools) can show what `<ElvixOnboarding>` opens on, without faking a redirect
 * return (which would store a bearer token in the page).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixProvider, ElvixSignInForm } from "../src/react/index";
import { getElvixToken } from "../src/react/session";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(props: Parameters<typeof ElvixSignInForm>[0]) {
  const fake = installFakeElvix({ context: null });
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <ElvixSignInForm appName="Acme" methodPasskey methodEmailOtp {...props} />
    </ElvixProvider>,
  );
  return fake;
}

describe("previewStep", () => {
  it("shows the passkey step in preview mode", async () => {
    mount({ mode: "preview", previewStep: "passkey" });
    expect(await screen.findByText("Sign in faster next time")).toBeTruthy();
  });

  it("shows the username step with suggestions", async () => {
    mount({ mode: "preview", previewStep: "username" });
    expect(await screen.findByText("Pick a username")).toBeTruthy();
  });

  it("shows the recover step with the app's name", async () => {
    mount({ mode: "preview", previewStep: "recover" });
    expect(await screen.findByText(/Acme/)).toBeTruthy();
    expect(screen.queryByText("Sign in faster next time")).toBeNull();
  });

  it("is inert: no token, no sign-in request", async () => {
    const fake = mount({ mode: "preview", previewStep: "passkey" });
    await screen.findByText("Sign in faster next time");
    expect(getElvixToken()).toBeNull();
    expect(fake.calls("/api/auth/")).toBe(0);
    expect(fake.calls("/api/onboarding/")).toBe(0);
  });

  it("is ignored outside preview mode: a real sign-in starts at the identifier", async () => {
    mount({ mode: "interactive", previewStep: "passkey" });
    expect(await screen.findByPlaceholderText("Enter your email")).toBeTruthy();
    expect(screen.queryByText("Sign in faster next time")).toBeNull();
  });
});
