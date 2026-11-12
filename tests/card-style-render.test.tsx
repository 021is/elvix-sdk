// @vitest-environment jsdom
/**
 * The card style on the card (0.26): each token reaches the one part of the card it names,
 * an app that sets nothing gets the card it had, and the layers win in their order (card
 * prop, provider, Console). jsdom cannot lay out Tailwind, so the geometry is pinned through
 * the variables and the classes that read them; `card-style-css.test.ts` pins those classes
 * in the built sheet. What no style can do is `card-style-guards.test.tsx`.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixSignInCard, ElvixSignInForm } from "../src/react/index";
import { CARD_STYLE_RANGES, CARD_STYLE_TOKENS } from "../src/types/card-style";
import { BEFORE_026, mountCard, PANE, Provider, unitOf, WHERE } from "./helpers/card-style-mount";
import { installFakeElvix } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("each token on the card", () => {
  it.each(CARD_STYLE_TOKENS)("%s reaches its part", async (token) => {
    const { min, max } = CARD_STYLE_RANGES[token];
    const step = token === "headingWeight" ? 100 : 1;
    const value = Math.round((min + max) / 2 / step) * step;
    const { part, cssVar } = await mountCard({ cardStyle: { [token]: value } });
    const where = WHERE[token];
    expect(cssVar(where.cssVar)).toBe(`${value}${unitOf(token)}`);
    if (token === "logoHeight") {
      expect(screen.getByRole("img", { name: "Acme" }).className).toContain(where.cls);
    } else if (token === "gapFieldButton") {
      expect(screen.getByRole("button", { name: "Continue" }).className).toContain(where.cls);
    } else {
      expect(part(where.part).className).toContain(where.cls);
    }
  });

  it("a host's logo node gets the logo height as its box", async () => {
    installFakeElvix({ context: null });
    render(
      <Provider>
        <ElvixSignInCard navigate={false} logoNode={<span>ACME</span>} />
      </Provider>,
    );
    const node = await screen.findByText("ACME", {}, PANE);
    expect(node.parentElement?.className).toContain("min-h-(--elvix-logo-h)");
  });
});

describe("an app that sets nothing", () => {
  it("keeps the card it had before 0.26", async () => {
    const { cssVar, part } = await mountCard();
    for (const token of CARD_STYLE_TOKENS) {
      expect(cssVar(WHERE[token].cssVar)).toBe(BEFORE_026[token]);
    }
    expect(cssVar("--elvix-font-text")).toBe("initial");
    // None of the fixed spacing 0.25 drew is left, so no token adds to an old value.
    expect(part("head").className).not.toMatch(/\b(gap-3|mb-6)\b/);
    expect(part("card-body").className).not.toMatch(/\b(px-7|pt-7|pb-3|py-7)\b/);
    expect(part("divider").className).not.toMatch(/\bmy-3\b/);
    expect(part("legal").className).not.toMatch(/\bmt-5\b/);
    expect(part("heading").className).not.toMatch(/\bfont-semibold\b/);
    expect(part("methods").closest("form")?.className).toBe("flex flex-col");
    expect(screen.getByRole("button", { name: "Continue" }).className).not.toMatch(/\bmt-3\b/);
  });

  it("elvix's bordered card keeps 28 px under the legal line", async () => {
    installFakeElvix({ context: null });
    const { container } = render(
      <Provider>
        <ElvixSignInForm navigate={false} presentation="card" transparentBg={false} />
      </Provider>,
    );
    await screen.findByText("Sign in to Acme", {}, PANE);
    const root = container.querySelector<HTMLElement>("[data-elvix-card-body]")?.parentElement;
    expect(root?.style.getPropertyValue("--elvix-gap-footer")).toBe("28px");
  });
});

describe("which layer wins", () => {
  it("the Console's style reaches the card through the provider's envelope", async () => {
    const { cssVar } = await mountCard({}, { console: { gapMethods: 12, fontText: "Urbanist" } });
    expect(cssVar("--elvix-gap-methods")).toBe("12px");
    expect(cssVar("--elvix-font-text")).toBe('"Urbanist", sans-serif');
  });

  it("the provider's over the Console's, the card's over both, key by key", async () => {
    const { cssVar } = await mountCard(
      { cardStyle: { gapMethods: 6 } },
      {
        provider: { gapMethods: 10, gapLegal: 24 },
        console: { gapMethods: 12, gapLegal: 30, paddingX: 16 },
      },
    );
    expect(cssVar("--elvix-gap-methods")).toBe("6px");
    expect(cssVar("--elvix-gap-legal")).toBe("24px");
    expect(cssVar("--elvix-card-px")).toBe("16px");
  });
});

describe("light and dark", () => {
  it.each(["light", "dark"] as const)("the same tokens in %s", async (theme) => {
    const { cssVar, container } = await mountCard({ cardStyle: { gapMethods: 12 } }, { theme });
    expect(cssVar("--elvix-gap-methods")).toBe("12px");
    const pinned = container.querySelector<HTMLElement>("[data-elvix-sign-in-card]");
    expect(pinned?.style.getPropertyValue("--elvix-surface")).toBe(
      theme === "dark" ? "#0d0d10" : "#ffffff",
    );
  });
});

describe("the form's own prop", () => {
  // The drawer draws the same AuthCard; vaul does not open in jsdom, so card and modal stand.
  it.each(["card", "modal"] as const)(
    "<ElvixSignInForm cardStyle> reaches its %s card, over the provider's",
    async (presentation) => {
      installFakeElvix({ context: null });
      render(
        <Provider cardStyle={{ gapMethods: 10, gapLegal: 30 }}>
          <ElvixSignInForm
            navigate={false}
            presentation={presentation}
            open
            onOpenChange={() => {}}
            cardStyle={{ gapMethods: 14 }}
          />
        </Provider>,
      );
      await screen.findByText("Sign in to Acme", {}, PANE);
      const root =
        document.body.querySelector<HTMLElement>("[data-elvix-card-body]")?.parentElement;
      expect(root?.style.getPropertyValue("--elvix-gap-methods")).toBe("14px");
      expect(root?.style.getPropertyValue("--elvix-gap-legal")).toBe("30px");
    },
  );
});

describe("an overlay card", () => {
  it("carries the variables itself, out of the provider's root", async () => {
    installFakeElvix({ context: null });
    render(
      <Provider cardStyle={{ gapLegal: 30 }}>
        <ElvixSignInForm navigate={false} presentation="modal" open onOpenChange={() => {}} />
      </Provider>,
    );
    await screen.findByText("Sign in to Acme", {}, PANE);
    const root = document.body.querySelector<HTMLElement>("[data-elvix-card-body]")?.parentElement;
    expect(root?.style.getPropertyValue("--elvix-gap-legal")).toBe("30px");
  });

  it("scrolls inside the viewport, so the widest spacing never pushes the legal line off it", async () => {
    installFakeElvix({ context: null });
    const max = Object.fromEntries(CARD_STYLE_TOKENS.map((t) => [t, CARD_STYLE_RANGES[t].max]));
    render(
      <Provider cardStyle={max}>
        <ElvixSignInForm navigate={false} presentation="modal" open onOpenChange={() => {}} />
      </Provider>,
    );
    await screen.findByText("Sign in to Acme", {}, PANE);
    const panel =
      document.body.querySelector<HTMLElement>("[data-elvix-card-body]")?.parentElement
        ?.parentElement;
    expect(panel?.className).toMatch(/\bmax-h-full\b/);
    expect(panel?.className).toMatch(/\boverflow-y-auto\b/);
  });
});
