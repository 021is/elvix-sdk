/**
 * An app's type and spacing on the sign-in card (0.26, Edvard 2026-11-11: "it must be super
 * adaptive elvix, I may even ask to change the padding or gaps"). The tokens, their ranges,
 * the checks every value passes where it enters, and the order the layers win in.
 */
import { describe, expect, it } from "vitest";
import {
  BORDERED_DEFAULTS,
  cardLookVars,
  consoleFontFamily,
  hostFontFamily,
  mergeCardStyle,
} from "../src/react/card-look";
import {
  CARD_STYLE_RANGES,
  CARD_STYLE_TOKENS,
  type CardStyleToken,
  CONSOLE_FONTS,
  clampCardToken,
  isCardTokenInRange,
  isConsoleFontName,
} from "../src/types/card-style";
import { BEFORE_026, WHERE } from "./helpers/card-style-mount";

/** The variable each token sets: one spec on the test side (`WHERE`), which the render tests
 *  also hold against the markup's classes and `card-style-css.test.ts` against the sheet, so
 *  a name changed in one place alone fails. */
const VAR_OF = (token: CardStyleToken) => WHERE[token].cssVar;

describe("the card style tokens", () => {
  it("lists every token once, top to bottom", () => {
    expect([...CARD_STYLE_TOKENS]).toEqual(Object.keys(CARD_STYLE_RANGES));
    expect(Object.keys(BEFORE_026).sort()).toEqual([...CARD_STYLE_TOKENS].sort());
  });

  it("an app that sets nothing keeps the card it had before 0.26", () => {
    const vars = cardLookVars({});
    for (const token of CARD_STYLE_TOKENS) expect(vars[VAR_OF(token)]).toBe(BEFORE_026[token]);
    // elvix's bordered card kept 28 px under the legal line, above its footer bar (py-7).
    expect(cardLookVars({}, BORDERED_DEFAULTS)["--elvix-gap-footer"]).toBe("28px");
    expect(cardLookVars({ gapFooter: 16 }, BORDERED_DEFAULTS)["--elvix-gap-footer"]).toBe("16px");
    expect(vars["--elvix-font-text"]).toBe("initial");
    expect(vars["--elvix-font-display"]).toBe("initial");
  });

  describe.each(CARD_STYLE_TOKENS)("%s", (token) => {
    const { min, max, default: fallback } = CARD_STYLE_RANGES[token];

    it("holds its default inside its range", () => {
      expect(fallback).toBeGreaterThanOrEqual(min);
      expect(fallback).toBeLessThanOrEqual(max);
    });

    it("clamps to its range and ignores what is not a number", () => {
      expect(clampCardToken(token, min - 100)).toBe(min);
      expect(clampCardToken(token, max + 100)).toBe(max);
      expect(clampCardToken(token, -1)).toBe(min);
      for (const junk of [Number.NaN, Number.POSITIVE_INFINITY, "12px", "12", null, undefined, {}])
        expect(clampCardToken(token, junk)).toBeUndefined();
    });

    it("reaches the card as its own variable, clamped", () => {
      const unit = token === "headingWeight" ? "" : "px";
      expect(cardLookVars(mergeCardStyle({ card: { [token]: max + 50 } }))[VAR_OF(token)]).toBe(
        `${max}${unit}`,
      );
      expect(cardLookVars(mergeCardStyle({ card: { [token]: min - 50 } }))[VAR_OF(token)]).toBe(
        `${min}${unit}`,
      );
    });

    it("the API takes only a value already in range", () => {
      expect(isCardTokenInRange(token, fallback)).toBe(true);
      expect(isCardTokenInRange(token, max + 1)).toBe(false);
      expect(isCardTokenInRange(token, min - 1)).toBe(false);
      expect(isCardTokenInRange(token, String(fallback))).toBe(false);
      // Not a number at all is never in range (a missing value is the API's "leave it").
      for (const junk of [undefined, null, Number.NaN, {}]) {
        expect(isCardTokenInRange(token, junk)).toBe(false);
      }
    });
  });

  it("weights move by 100 and never go thinner than 400 (legibility at 18 px)", () => {
    expect(clampCardToken("headingWeight", 540)).toBe(500);
    expect(clampCardToken("headingWeight", 100)).toBe(400);
    expect(clampCardToken("headingWeight", 950)).toBe(800);
    expect(isCardTokenInRange("headingWeight", 550)).toBe(false);
    expect(clampCardToken("gapMethods", 9.6)).toBe(10);
  });

  it("the legal line and the chip keep a floor of 12 px above them", () => {
    expect(CARD_STYLE_RANGES.gapLegal.min).toBeGreaterThanOrEqual(12);
    expect(CARD_STYLE_RANGES.gapFooter.min).toBeGreaterThanOrEqual(12);
    expect(clampCardToken("gapLegal", 0)).toBe(12);
    expect(clampCardToken("gapFooter", -40)).toBe(12);
  });
});

describe("fonts", () => {
  it("a host names a family its page loads, any CSS family list or var()", () => {
    expect(hostFontFamily("Inter")).toBe("Inter, sans-serif");
    expect(hostFontFamily(' "Plus Jakarta Sans", Inter ')).toBe(
      '"Plus Jakarta Sans", Inter, sans-serif',
    );
    expect(hostFontFamily("var(--font-inter)")).toBe("var(--font-inter), sans-serif");
  });

  it.each([
    ["a URL", 'url("https://fonts.example/x.woff2")'],
    ["a declaration after it", "Inter; background: red"],
    ["a block", "Inter} .x{color:red"],
    ["an escape", "In\\74 er"],
    ["an at-rule", "@import 'x'"],
    ["a comment", "Inter /* x */"],
    ["markup", "Inter<script>"],
    ["!important", "Inter !important"],
    ["another function", "image(x)"],
    ["attr()", "attr(data-x)"],
    ["a broken var()", "var(--x"],
    ["nothing", "  "],
    ["too long", "A".repeat(201)],
    ["not a string", 12],
    ["an open double quote", '"Inter'],
    ["an open single quote", "'Inter, sans"],
    ["a newline", "Inter\nfoo"],
    ["a tab", "Inter\tfoo"],
    ["a NUL", "Inter\u0000"],
    ["a DEL", "Inter\u007f"],
  ])("a host family with %s is refused", (_, value) => {
    expect(hostFontFamily(value)).toBeUndefined();
  });

  it("a host family with its quotes closed passes", () => {
    expect(hostFontFamily("'Inter', \"Urbanist\"")).toBe("'Inter', \"Urbanist\", sans-serif");
  });

  it("a Console family is one of the fonts elvix serves, quoted by the card", () => {
    expect(consoleFontFamily("Urbanist")).toBe('"Urbanist", sans-serif');
    expect(consoleFontFamily("Plus Jakarta Sans")).toBe('"Plus Jakarta Sans", sans-serif');
    for (const font of CONSOLE_FONTS) expect(isConsoleFontName(font)).toBe(true);
    for (const bad of [
      "Wingdings",
      "Webdings",
      "Adobe Blank",
      "inter",
      "var(--x)",
      "Inter, Arial",
      '"Inter"',
      "url(x)",
      " Inter",
      "A".repeat(65),
    ])
      expect(isConsoleFontName(bad)).toBe(false);
  });

  it("the heading takes the text font unless it has its own", () => {
    const vars = cardLookVars(mergeCardStyle({ card: { fontText: "Inter" } }));
    expect(vars["--elvix-font-text"]).toBe("Inter, sans-serif");
    expect(vars["--elvix-font-display"]).toBe("Inter, sans-serif");
    const both = cardLookVars(
      mergeCardStyle({ card: { fontText: "Inter", fontDisplay: "Urbanist" } }),
    );
    expect(both["--elvix-font-display"]).toBe("Urbanist, sans-serif");
  });
});

describe("which layer wins", () => {
  it("the card's prop over the provider's over the Console's, key by key", () => {
    const look = mergeCardStyle({
      console: { gapMethods: 12, gapLegal: 30, paddingX: 16, fontText: "Urbanist" },
      provider: { gapMethods: 10, gapLegal: 24 },
      card: { gapMethods: 6 },
    });
    expect(look).toEqual({
      gapMethods: 6,
      gapLegal: 24,
      paddingX: 16,
      fontText: '"Urbanist", sans-serif',
    });
  });

  it("a refused value leaves the layer under it in place", () => {
    const look = mergeCardStyle({
      console: { fontText: "Urbanist", gapMethods: 12 },
      card: { fontText: "url(x)", gapMethods: Number.NaN },
    });
    expect(look).toEqual({ fontText: '"Urbanist", sans-serif', gapMethods: 12 });
  });

  it("the Console's wire data is checked like any other input", () => {
    expect(mergeCardStyle({ console: "gapMethods: 99" })).toEqual({});
    expect(mergeCardStyle({ console: null })).toEqual({});
    expect(mergeCardStyle({ console: { fontText: "var(--x)", gapMethods: "16" } })).toEqual({});
    expect(mergeCardStyle({ console: { gapMethods: 99 } })).toEqual({ gapMethods: 16 });
  });
});
