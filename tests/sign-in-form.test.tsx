// @vitest-environment jsdom
/**
 * `<ElvixSignInForm>` flows, end to end against a fake elvix: email code,
 * username identifier, the two onboarding steps, errors, and the redirect
 * resolution every success funnels through.
 *
 * Written as characterization tests before the form was split into hooks and
 * step components, and run against both.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixProvider, ElvixSignInForm } from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix, json, type Route } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

const PANE = { timeout: 3000 };
type Body = Record<string, unknown>;

type Endpoint = "start" | "resolve" | "verify" | "check" | "claim";

/** [name, method, path, default reply]; the most specific path first. */
const ENDPOINTS: [Endpoint, string, string, Body][] = [
  ["start", "POST", "/api/auth/otp/start", { ok: true, challengeId: "c1" }],
  ["resolve", "POST", "/api/auth/identifier/resolve", { ok: true, challengeId: "c2" }],
  ["verify", "POST", "/api/auth/otp/verify", { ok: true, redirect: "/home", token: "tok_1" }],
  ["check", "GET", "/api/onboarding/username/check", { ok: true, available: true }],
  ["claim", "POST", "/api/onboarding/username", { ok: true, redirect: "/claimed" }],
];

/** Sign-in endpoints answering with the test's reply, else the default;
 *  `seen` holds the body each one was last sent. */
function signInRoutes(replies: Partial<Record<Endpoint, Body>>) {
  const seen: Partial<Record<Endpoint, Body>> = {};
  const routes: Route[] = ENDPOINTS.map(([name, method, path, fallback]) => [
    method,
    (url) => url.includes(path),
    (_url, init) => {
      seen[name] = init?.body ? (JSON.parse(String(init.body)) as Body) : {};
      const body = replies[name] ?? fallback;
      return json({ success: true, data: body }, body.ok === false ? 400 : 200);
    },
  ]);
  return { routes, seen };
}

function mount(
  replies: Parameters<typeof signInRoutes>[0] = {},
  props: Partial<Parameters<typeof ElvixSignInForm>[0]> = {},
) {
  const { routes, seen } = signInRoutes(replies);
  installFakeElvix({ context: null }, routes);
  const onResult = vi.fn();
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <ElvixSignInForm navigate={false} onResult={onResult} {...props} />
    </ElvixProvider>,
  );
  return { onResult, seen };
}

async function sendCodeTo(identifier: string, placeholder = "Enter your email") {
  fireEvent.change(await screen.findByPlaceholderText(placeholder), {
    target: { value: identifier },
  });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Continue/ })));
}

async function enterCode(code = "123456") {
  await screen.findByText(/We sent a code to/, {}, PANE);
  const first = screen.getByLabelText("Digit 1 of 6");
  expect(screen.getByRole("group", { name: "Verification code" })).toBeTruthy();
  await act(async () => fireEvent.change(first, { target: { value: code } }));
}

describe("ElvixSignInForm", () => {
  it("signs in with an emailed code, auto-submitting the sixth digit", async () => {
    const { onResult, seen } = mount();
    await sendCodeTo("ada@example.test");
    expect(seen.start).toMatchObject({ email: "ada@example.test", clientId: CLIENT_ID });

    await enterCode();
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        ok: true,
        phase: "complete",
        method: "email_otp",
        redirect: "/home",
        token: "tok_1",
      }),
    );
    expect(seen.verify).toEqual({ challengeId: "c1", code: "123456" });
    await screen.findByText("Signing you in…");
  });

  it("resolves a username to its email and sends the code there", async () => {
    const { seen } = mount({}, { methodUsername: true });
    await sendCodeTo("ada_l", "Email or username");
    await screen.findByText(/We sent a code to/, {}, PANE);
    expect(seen.resolve).toMatchObject({ username: "ada_l", intent: "app", clientId: CLIENT_ID });
  });

  it("reports a rate limit and stays on the identifier", async () => {
    const tooRecent = { ok: false, error: "too_recent", retryAfterSeconds: 20 };
    const { onResult } = mount({ start: tooRecent });
    await sendCodeTo("ada@example.test");
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, error: "too_recent" }),
      ),
    );
    expect(screen.getByPlaceholderText("Enter your email")).toBeTruthy();
  });

  it("claims a username during onboarding", async () => {
    const { onResult, seen } = mount({
      verify: { ok: true, next_step: "username", suggestions: ["ada", "ada1"], final: "/welcome" },
    });
    await sendCodeTo("ada@example.test");
    await enterCode();

    await screen.findByText("Pick a username", {}, PANE);
    await screen.findByText("Looks good. This one's yours.", {}, PANE);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Claim @ada" })));

    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true, method: "email_otp", redirect: "/claimed" }),
      ),
    );
    expect(seen.claim).toEqual({ username: "ada" });
  });

  it("skipping the passkey step finishes at the onboarding destination", async () => {
    const { onResult } = mount({
      verify: { ok: true, next_step: "passkey", final: "/after-passkey", token: "tok_2" },
    });
    await sendCodeTo("ada@example.test");
    await enterCode();

    const skip = await screen.findByText("Skip for now", {}, PANE);
    await act(async () => fireEvent.click(skip));
    expect(onResult).toHaveBeenCalledWith({
      ok: true,
      phase: "complete",
      method: "email_otp",
      redirect: "/after-passkey",
      token: "tok_2",
    });
  });

  it("the host's redirectAfterSignIn wins over the server's redirect", async () => {
    const { onResult } = mount({}, { redirectAfterSignIn: "/dashboard" });
    await sendCodeTo("ada@example.test");
    await enterCode();
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ redirect: "/dashboard" })),
    );
  });

  it("surfaces a blocked OAuth redirect from ?elvix_error and strips it", async () => {
    window.history.replaceState({}, "", "/sign-in?elvix_error=user_banned");
    const { onResult } = mount();
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, error: "user_banned" }),
      ),
    );
    expect(window.location.search).toBe("");
  });
});
