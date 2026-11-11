// @vitest-environment jsdom
/**
 * What no card style can do (0.26, Edvard's "make sure no illegality or leak happens"): hide
 * the legal line or "Secured by elvix" (elvix's own mark, 2026-11-02), push a value past its
 * range, or carry CSS or a URL in a font. The SDK never loads a font: a family is a name the
 * page already serves.
 */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CARD_STYLE_RANGES, CARD_STYLE_TOKENS, type ElvixCardStyle } from "../src/types/card-style";
import { mountCard, unitOf, WHERE } from "./helpers/card-style-mount";

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
  it("the text font is the card body's, the heading's its own, the chip keeps the page's", async () => {
    const { part, cssVar } = await mountCard({
      cardStyle: { fontText: "Inter", fontDisplay: "Urbanist" },
    });
    expect(cssVar("--elvix-font-text")).toBe("Inter, sans-serif");
    expect(cssVar("--elvix-font-display")).toBe("Urbanist, sans-serif");
    expect(part("card-body").className).toContain("[font-family:var(--elvix-font-text)]");
    expect(part("heading").className).toContain("[font-family:var(--elvix-font-display)]");
    const chip = screen.getByRole("link", { name: /Secured by/ });
    expect(part("card-body").contains(chip)).toBe(false);
  });

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
