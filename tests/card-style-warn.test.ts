/**
 * A host's refused `cardStyle` value is said to the developer (0.26, the tower's call,
 * 2026-11-12): in development only, once per token, naming the token, the value and what is
 * allowed; never in production, never for the Console's value, never a broken card.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardLook } from "../src/react/card-look";
import { allowedRange, HOST_FONT_RULE } from "../src/react/card-style-warn";
import { CARD_STYLE_RANGES } from "../src/types/card-style";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const warnings = () => vi.spyOn(console, "warn").mockImplementation(() => {});

describe("in development", () => {
  it("says a clamped number once, with its range and what the card uses", () => {
    const warn = warnings();
    const { max } = CARD_STYLE_RANGES.gapLegal;
    const look = CardLook.merge({ card: { gapLegal: 999 } });
    CardLook.merge({ provider: { gapLegal: 1000 } });
    expect(look.values.gapLegal).toBe(max);
    expect(warn.mock.calls).toEqual([
      [
        `[elvix] cardStyle.gapLegal: 999 is not allowed (allowed: ${allowedRange("gapLegal")}); the card uses ${max}.`,
      ],
    ]);
  });

  it("says a refused font, and what a family may be", () => {
    const warn = warnings();
    expect(CardLook.merge({ card: { fontText: "url(x)" } }).values.fontText).toBeUndefined();
    expect(warn.mock.calls).toEqual([
      [
        `[elvix] cardStyle.fontText: "url(x)" is not allowed (allowed: ${HOST_FONT_RULE}); the page's font stays.`,
      ],
    ]);
  });

  it("says nothing for a value taken as given, or for the Console's", () => {
    const warn = warnings();
    CardLook.merge({ card: { gapMethods: CARD_STYLE_RANGES.gapMethods.min } });
    CardLook.merge({ console: { gapDivider: 999, fontDisplay: "Wingdings" } });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("in production", () => {
  it("says nothing, and the card still takes the clamped value", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = warnings();
    const look = CardLook.merge({ card: { paddingTop: 999, fontDisplay: "url(x)" } });
    expect(look.values.paddingTop).toBe(CARD_STYLE_RANGES.paddingTop.max);
    expect(warn).not.toHaveBeenCalled();
  });
});
