// @vitest-environment jsdom
/**
 * The sign-in card's head: the logo plus one line (0.25). Edvard, 2026-11-11, on DanceClub's
 * card on a phone: "too much going on here" (the logo, "Log in to DanceClub Staging", "Pick
 * how you want to continue.", the host's reason, stacked). His pick: on the entry step, the
 * host's `headline` where it knows why the person signs in, elvix's title elsewhere, and the
 * "Pick how you want to continue." line gone from every app. Later steps keep their title
 * and the one fact they need ("We sent a code to …").
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixProvider, ElvixSignInCard, ElvixSignInForm } from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix, json } from "./helpers/fake-elvix";

const PANE = { timeout: 3000 };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(node: React.ReactNode) {
  installFakeElvix({ context: null }, [
    [
      "POST",
      (u) => u.includes("/api/auth/otp/start"),
      () => json({ success: true, data: { ok: true, challengeId: "c1" } }),
    ],
  ]);
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      {node}
    </ElvixProvider>,
  );
}

describe("the sign-in head", () => {
  it.each([
    ["the card", <ElvixSignInCard key="card" navigate={false} />],
    ["the form", <ElvixSignInForm key="form" navigate={false} />],
  ])("%s: the logo and the title, no second line", async (_, node) => {
    mount(node);
    await screen.findByText("Sign in to Acme", {}, PANE);
    expect(screen.queryByText("Pick how you want to continue.")).toBeNull();
  });

  it("the host's headline takes the title's place", async () => {
    mount(<ElvixSignInCard navigate={false} headline="Save events you love" />);
    await screen.findByText("Save events you love", {}, PANE);
    expect(screen.queryByText("Sign in to Acme")).toBeNull();
  });

  it("a later step keeps its title and its fact", async () => {
    mount(<ElvixSignInCard navigate={false} headline="Save events you love" />);
    fireEvent.change(await screen.findByPlaceholderText("Enter your email"), {
      target: { value: "ada@example.test" },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Continue/ })));
    await screen.findByText(/We sent a code to/, {}, PANE);
    expect(screen.queryByText("Save events you love")).toBeNull();
  });
});
