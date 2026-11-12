// @vitest-environment jsdom
/**
 * The username step's live check reads elvix's answer field by field (0.26, the branch
 * review): `available` must be `true`, `reason` a string, and a reason that is not one of
 * the step's own (`constructor`) gets the generic line, never something off the prototype.
 * No answer (the network, a refused request, not JSON) says so: the field never sits on its
 * rules hint with Continue off and no reason.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixSignInCard } from "../src/react/index";
import { PANE, Provider } from "./helpers/card-style-mount";
import { installFakeElvix, json } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function checkWith(answer: unknown) {
  await checkAnswered(() => json({ success: true, data: answer }));
}

async function checkAnswered(respond: () => Response | Promise<Response>) {
  installFakeElvix({ context: null }, [
    ["GET", (u) => u.includes("/api/onboarding/username/check"), respond],
  ]);
  render(
    <Provider>
      <ElvixSignInCard navigate={false} mode="preview" previewStep="username" />
    </Provider>,
  );
  fireEvent.change(await screen.findByLabelText("Username", {}, PANE), {
    target: { value: "adalovelace" },
  });
}

describe("the username check's answer", () => {
  it("is free only when `available` is true", async () => {
    await checkWith({ ok: true, available: true });
    expect(await screen.findByText("Looks good. This one's yours.", {}, PANE)).toBeTruthy();
  });

  it.each([
    ["`available` that is not true", { ok: true, available: "yes" }, "That one's taken."],
    [
      "a reason that is not a string",
      { ok: false, reason: { html: "<b>x</b>" } },
      "That username isn't valid.",
    ],
    [
      "a reason off the prototype",
      { ok: false, reason: "constructor" },
      "That username isn't valid.",
    ],
    ["the server's own reason", { ok: false, reason: "taken" }, "That one's taken."],
  ])("refuses with %s", async (_, answer, line) => {
    await checkWith(answer);
    expect(await screen.findByText(line, {}, PANE)).toBeTruthy();
  });

  it.each([
    ["the network fails", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["elvix refuses the request", () => json({ success: false, errorKey: "rate_limited" }, 429)],
    ["the answer is not JSON", () => new Response("<html>", { status: 200 })],
  ])("says so when %s, never that the name is invalid", async (_, respond) => {
    await checkAnswered(respond);
    expect(await screen.findByText("Network hiccup. Try again.", {}, PANE)).toBeTruthy();
    expect(screen.queryByText("That username isn't valid.")).toBeNull();
  });
});
