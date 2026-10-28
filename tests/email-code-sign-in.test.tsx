// @vitest-environment jsdom
/**
 * `<ElvixEmailCodeSignIn>` against a fake elvix: the one code its mount sends
 * (and never twice: a remount, StrictMode, a reload), the code, "Send again",
 * "Use another email", the onboarding steps and `deferOnboarding`, every error
 * with its own words, and preview mode, which asks nothing.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixEmailCodeSignIn, ElvixProvider } from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix, json, type Route } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

const PANE = { timeout: 3000 };
const ADA = "ada@example.test";
type Body = Record<string, unknown>;
type Reply = Body | "offline";

/** otp/start and otp/verify answering with the test's replies; `sent` holds each body. */
function codeRoutes(replies: { start?: Reply; verify?: Reply }) {
  const sent: { start: Body[]; verify: Body[] } = { start: [], verify: [] };
  const route = (name: "start" | "verify", fallback: Body): Route => [
    "POST",
    (url) => url.includes(`/api/auth/otp/${name}`),
    (_url, init) => {
      sent[name].push(JSON.parse(String(init?.body)) as Body);
      const body = replies[name] ?? fallback;
      if (body === "offline") throw new TypeError("Failed to fetch");
      return json({ success: true, data: body }, body.ok === false ? 400 : 200);
    },
  ];
  return {
    routes: [
      route("start", { ok: true, challengeId: `c${sent.start.length + 1}` }),
      route("verify", { ok: true, redirect: "/ticket", token: "tok_1" }),
    ],
    sent,
  };
}

type Props = Partial<Parameters<typeof ElvixEmailCodeSignIn>[0]>;

function block(props: Props, onResult: (r: unknown) => void) {
  return (
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <ElvixEmailCodeSignIn email={ADA} onResult={onResult} {...props} />
    </ElvixProvider>
  );
}

function mount(replies: Parameters<typeof codeRoutes>[0] = {}, props: Props = {}) {
  const { routes, sent } = codeRoutes(replies);
  installFakeElvix({ context: null }, routes);
  const onResult = vi.fn();
  const view = render(block(props, onResult));
  return { onResult, sent, view };
}

async function enterCode(code = "123456") {
  await screen.findByText(`We sent a code to ${ADA}`, {}, PANE);
  await act(async () =>
    fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: code } }),
  );
}

describe("ElvixEmailCodeSignIn", () => {
  it("sends one code on mount and signs in at the sixth digit", async () => {
    const { onResult, sent } = mount();
    const line = await screen.findByText(`We sent a code to ${ADA}`, {}, PANE);
    // The code group is read with the line that says where the code went.
    const group = screen.getByRole("group", { name: "Verification code" });
    expect(group.getAttribute("aria-describedby")).toBe(line.id);
    await enterCode();
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        ok: true,
        phase: "complete",
        method: "email_otp",
        redirect: "/ticket",
        token: "tok_1",
      }),
    );
    expect(sent.start).toEqual([{ email: ADA, intent: "app", clientId: CLIENT_ID }]);
    expect(sent.verify).toEqual([{ challengeId: "c1", code: "123456" }]);
    await screen.findByText("Signing you in…");
  });

  it("never sends a second code for a remount or StrictMode's double effect", async () => {
    const { routes, sent } = codeRoutes({});
    installFakeElvix({ context: null }, routes);
    const first = render(<StrictMode>{block({}, vi.fn())}</StrictMode>);
    await screen.findByText(`We sent a code to ${ADA}`, {}, PANE);
    first.unmount();
    render(block({}, vi.fn()));
    await screen.findByText(`We sent a code to ${ADA}`, {}, PANE);
    expect(sent.start).toHaveLength(1);
  });

  it("picks up the code a reload left behind, and Send again sends a new one", async () => {
    const key = `${BASE}|${CLIENT_ID}|${ADA}`;
    const sentAt = Date.now() - 60_000; // past the 45 s cooldown, inside the code's life
    const kept = { [key]: { challengeId: "kept", sentAt } };
    window.sessionStorage.setItem("elvix-email-code", JSON.stringify(kept));
    const { sent } = mount();
    const again = await screen.findByRole("button", { name: "Send again" }, PANE);
    expect(sent.start).toHaveLength(0);
    await act(async () => fireEvent.click(again));
    await screen.findByRole("button", { name: /Send again in \d+s/ }, PANE);
    expect(sent.start).toHaveLength(1);
  });

  it("Use another email sends the code to the address typed instead", async () => {
    const { sent } = mount();
    await screen.findByText(`We sent a code to ${ADA}`, {}, PANE);
    fireEvent.click(screen.getByRole("button", { name: "Use another email" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.test" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue" })));
    await screen.findByText("We sent a code to ana@example.test", {}, PANE);
    expect(sent.start.map((b) => b.email)).toEqual([ADA, "ana@example.test"]);
  });

  it("Back from the email field returns to the code already sent", async () => {
    const { sent } = mount();
    await screen.findByText(`We sent a code to ${ADA}`, {}, PANE);
    fireEvent.click(screen.getByRole("button", { name: "Use another email" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText(`We sent a code to ${ADA}`, {}, PANE);
    expect(sent.start).toHaveLength(1);
  });

  it("shows the app's onboarding step inside the block", async () => {
    const { onResult } = mount({
      verify: { ok: true, next_step: "username", suggestions: ["ada"], final: "/ticket" },
    });
    await enterCode();
    await screen.findByText("Pick a username", {}, PANE);
    expect(onResult).not.toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it("deferOnboarding signs in at once and names the step it put off", async () => {
    const verify = { ok: true, next_step: "passkey", final: "/ticket", token: "tok_2" };
    const { onResult } = mount({ verify }, { deferOnboarding: true });
    await enterCode();
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        ok: true,
        phase: "complete",
        method: "email_otp",
        redirect: "/ticket",
        token: "tok_2",
        deferred: "passkey",
      }),
    );
    expect(screen.queryByText("Skip for now")).toBeNull();
  });

  it("never defers restoring a membership", async () => {
    const recover = { appId: "app_1", appName: "Acme", state: "inactive", sinceAt: "2026-01-01" };
    const verify = { ok: true, next_step: "recover", recover, final: "/ticket" };
    const { onResult } = mount({ verify }, { deferOnboarding: true });
    await enterCode();
    await screen.findAllByText(/Acme/, {}, PANE);
    expect(onResult).not.toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it.each([
    ["invalid_code", "That code didn't work. Try again."],
    ["expired", "That code expired. Send a new one."],
    ["too_many_attempts", "Too many wrong codes. Send a new one."],
    ["already_used", "That code was already used. Send a new one."],
  ])("a %s code says why and what to do", async (error, message) => {
    const { onResult } = mount({ verify: { ok: false, error } });
    await enterCode();
    expect((await screen.findByRole("alert", {}, PANE)).textContent).toBe(message);
    expect(onResult).toHaveBeenCalledWith({ ok: false, error, message });
  });

  it("a send that fails says no code went out, and why", async () => {
    const { onResult } = mount({ start: "offline" });
    await screen.findByText(`We couldn't send a code to ${ADA}`, {}, PANE);
    expect(screen.getByRole("alert").textContent).toBe("Network hiccup. Try again.");
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ error: "network_error" }));
    expect(screen.getByRole("button", { name: "Send again" })).toHaveProperty("disabled", false);
  });

  it("a rate limit counts down on Send again", async () => {
    mount({ start: { ok: false, error: "too_recent", retryAfterSeconds: 20 } });
    await screen.findByRole("button", { name: /Send again in (20|19)s/ }, PANE);
  });

  it("an address that is not one opens on the email field and sends nothing", async () => {
    const { sent } = mount({}, { email: "ada@" });
    expect((await screen.findByLabelText("Email", {}, PANE)).getAttribute("type")).toBe("email");
    expect(sent.start).toHaveLength(0);
  });

  it("preview draws the code step with demo digits and asks elvix nothing", async () => {
    const { sent } = mount({}, { mode: "preview" });
    await screen.findByText(`We sent a code to ${ADA}`, {}, PANE);
    expect((screen.getByLabelText("Digit 1 of 6") as HTMLInputElement).value).toBe("4");
    expect(sent.start).toHaveLength(0);
    expect(sent.verify).toHaveLength(0);
  });

  it("preview draws an onboarding step on request", async () => {
    mount({}, { mode: "preview", previewStep: "username" });
    await screen.findByText("Pick a username", {}, PANE);
  });
});
