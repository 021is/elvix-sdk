// @vitest-environment jsdom
/**
 * What no card style can do (0.26, Edvard's "make sure no illegality or leak happens"): hide
 * the legal line or "Secured by elvix" (elvix's own mark, 2026-11-02), push a value past its
 * range, or carry CSS or a URL in a font. The SDK never loads a font: a family is a name the
 * page already serves.
 */
import { cleanup, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixSignInCard } from "../src/react/index";
import { CARD_STYLE_RANGES, CARD_STYLE_TOKENS, type ElvixCardStyle } from "../src/types/card-style";
import { mountCard, Provider, unitOf, WHERE } from "./helpers/card-style-mount";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the legal line and Secured by elvix", () => {
  const every = (pick: "min" | "max"): ElvixCardStyle =>
    Object.fromEntries(CARD_STYLE_TOKENS.map((t) => [t, CARD_STYLE_RANGES[t][pick]]));

  it.each(["min", "max"] as const)(
    "stay in the card's flow, visible, in order, at every %s",
    async (pick) => {
      const { part, root } = await mountCard({ cardStyle: every(pick) });
      const legal = part("legal");
      const chip = screen.getByRole("link", { name: /Secured by/ });
      expect(screen.getByText(/By continuing/)).toBeTruthy();
      for (const el of [legal, chip]) {
        expect(root.contains(el)).toBe(true);
        expect(el.className).not.toMatch(
          /\b(hidden|invisible|sr-only|opacity-0|absolute|fixed|sticky)\b/,
        );
        expect(el.style.display).not.toBe("none");
      }
      // The chip in the card's own footer, under the body no token reaches into.
      expect(part("card-footer").contains(chip)).toBe(true);
      // Legal line, then the chip, both after the host's slot.
      const slot = part("below-methods");
      expect(slot.compareDocumentPosition(legal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(legal.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // The gaps above them never go under their floor.
      const floor = (v: string) => Number.parseInt(v, 10);
      expect(floor(root.style.getPropertyValue("--elvix-gap-legal"))).toBeGreaterThanOrEqual(12);
      expect(floor(root.style.getPropertyValue("--elvix-gap-footer"))).toBeGreaterThanOrEqual(12);
    },
  );

  it("a value past every range is held at its edge", async () => {
    const huge = Object.fromEntries(CARD_STYLE_TOKENS.map((t) => [t, 10_000]));
    const { cssVar } = await mountCard({ cardStyle: huge });
    for (const token of CARD_STYLE_TOKENS) {
      expect(cssVar(WHERE[token].cssVar)).toBe(`${CARD_STYLE_RANGES[token].max}${unitOf(token)}`);
    }
  });
});

describe("fonts", () => {
  it("the app's fonts reach the head, the step and the host's line, never the legal line or the chip", async () => {
    const { part, root, cssVar } = await mountCard({
      cardStyle: { fontText: "Inter", fontDisplay: "Urbanist" },
    });
    expect(cssVar("--elvix-font-text")).toBe("Inter, sans-serif");
    expect(cssVar("--elvix-font-display")).toBe("Urbanist, sans-serif");
    const appType = part("app-type");
    expect(appType.className).toContain("[font-family:var(--elvix-font-text)]");
    for (const name of ["head", "methods", "below-methods"]) {
      expect(appType.contains(part(name))).toBe(true);
    }
    expect(part("heading").className).toContain("[font-family:var(--elvix-font-display)]");
    // The legal line and the chip: no element between them and the card's root reads a font
    // variable, so a symbol or a blank font set as the app's can never reach them.
    const chip = screen.getByRole("link", { name: /Secured by/ });
    for (const el of [part("legal"), chip]) {
      for (let node: HTMLElement | null = el; node && node !== root; node = node.parentElement) {
        expect(node.className).not.toMatch(/font-family|--elvix-font/);
        expect(node.style.fontFamily).toBe("");
      }
    }
  });

  it("a Console font is one of the fonts elvix serves, never a free name", async () => {
    const { cssVar } = await mountCard({}, { console: { fontText: "Wingdings" } });
    expect(cssVar("--elvix-font-text")).toBe("initial");
  });

  it.each([['"Inter'], [`"a'b" 'c`]])(
    "a host font with an open quote (%s) never breaks the server-written style",
    (fontText) => {
      const html = renderToString(
        <Provider>
          <ElvixSignInCard navigate={false} cardStyle={{ fontText, gapLegal: 30 }} />
        </Provider>,
      );
      const style = html.match(/style="([^"]*--elvix-font-text[^"]*)"/)?.[1] ?? "";
      expect(style).toContain("--elvix-font-text:initial");
      expect(style).toContain("--elvix-gap-legal:30px");
      expect(style).toContain("--elvix-primary:");
    },
  );

  it("a host font with a URL in it is refused", async () => {
    const { cssVar } = await mountCard({ cardStyle: { fontText: "url(https://e.test/f.woff2)" } });
    expect(cssVar("--elvix-font-text")).toBe("initial");
  });

  it("a Console font that is CSS, not a name, never reaches the card", async () => {
    const { cssVar } = await mountCard(
      {},
      { console: { fontText: "x; background:url(//e.test)" } },
    );
    expect(cssVar("--elvix-font-text")).toBe("initial");
  });

  it("no font is ever requested: the card names a family, it loads nothing", async () => {
    await mountCard({ cardStyle: { fontText: "Inter", fontDisplay: "Urbanist" } });
    // `fetch` is the fake elvix's mock: every request the card made is in its calls.
    const urls = vi.mocked(globalThis.fetch).mock.calls.map(([u]) => String(u));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => /font|woff|googleapis|gstatic/i.test(u))).toEqual([]);
    expect(document.querySelector("link")).toBeNull();
    const styles = [...document.querySelectorAll("style")].map((s) => s.textContent ?? "");
    expect(styles.filter((s) => /@font-face|@import|url\(/i.test(s))).toEqual([]);
  });
});
