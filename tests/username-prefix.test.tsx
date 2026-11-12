// @vitest-environment jsdom
/**
 * The username field's "@" never sits on the first letter (Edvard, 2026-11-12, DanceClub's
 * card: the "@" on the "e" of "edvard"). 0.25 gave the text a fixed `pl-7` beside a prefix
 * it never measured; the text now starts at the prefix's right edge plus the gap, measured
 * again when the prefix or the field resizes, at any card spacing.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixSignInCard } from "../src/react/index";
import { PREFIX_GAP_PX, PREFIX_INSET_PX } from "../src/react/prefix-inset";
import { CARD_STYLE_RANGES, CARD_STYLE_TOKENS, type ElvixCardStyle } from "../src/types/card-style";
import { PANE, Provider } from "./helpers/card-style-mount";
import { installFakeElvix } from "./helpers/fake-elvix";

const BORDER = 1;
let prefixWidth = 13;
const resized: (() => void)[] = [];

/** A layout jsdom does not have: the prefix `prefixWidth` wide at its inset, the field at 0
 *  with a 1 px border. */
function stubLayout() {
  const isPrefix = (el: HTMLElement) => el.hasAttribute("data-elvix-prefix");
  const isField = (el: HTMLElement) => el.id === "onboarding-username";
  const getter = (name: string, value: (el: HTMLElement) => number) =>
    vi.spyOn(HTMLElement.prototype, name as "offsetWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return value(this);
    });
  getter("offsetWidth", (el) => (isPrefix(el) ? prefixWidth : isField(el) ? 300 : 0));
  getter("offsetLeft", (el) => (isPrefix(el) ? PREFIX_INSET_PX : 0));
  vi.spyOn(Element.prototype, "clientLeft", "get").mockImplementation(function (this: Element) {
    return this.id === "onboarding-username" ? BORDER : 0;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: () => void) {
        resized.push(() => this.callback());
      }
      observe() {}
      disconnect() {}
    },
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resized.length = 0;
  prefixWidth = 13;
});

const at = (end: "min" | "max"): ElvixCardStyle =>
  Object.fromEntries(CARD_STYLE_TOKENS.map((t) => [t, CARD_STYLE_RANGES[t][end]]));

async function usernameField(cardStyle?: ElvixCardStyle) {
  installFakeElvix({ context: null });
  render(
    <Provider cardStyle={cardStyle}>
      <ElvixSignInCard navigate={false} mode="preview" previewStep="username" />
    </Provider>,
  );
  return screen.findByLabelText<HTMLInputElement>("Username", {}, PANE);
}

/** Where the text starts, from the field's outer left edge. */
const textStart = (input: HTMLInputElement) => BORDER + Number.parseFloat(input.style.paddingLeft);

describe("the username field's @", () => {
  it.each(["min", "max"] as const)(
    "ends a gap before the text, at %s card spacing",
    async (end) => {
      stubLayout();
      const input = await usernameField(at(end));
      expect(textStart(input)).toBe(PREFIX_INSET_PX + prefixWidth + PREFIX_GAP_PX);
    },
  );

  it("is measured again when it grows (a web font arriving, a larger page text size)", async () => {
    stubLayout();
    const input = await usernameField();
    prefixWidth = 22;
    act(() => {
      for (const resize of resized) resize();
    });
    expect(textStart(input)).toBe(PREFIX_INSET_PX + 22 + PREFIX_GAP_PX);
  });

  it("before any layout, leaves room for an @ as wide as the field's text size", () => {
    installFakeElvix({ context: null });
    const html = renderToString(
      <Provider>
        <ElvixSignInCard navigate={false} mode="preview" previewStep="username" />
      </Provider>,
    );
    const input = html.match(/<input[^>]*id="onboarding-username"[^>]*>/)?.[0] ?? "";
    expect(input).toContain(`padding-left:calc(${PREFIX_INSET_PX}px + 1em + ${PREFIX_GAP_PX}px)`);
    expect(input).not.toMatch(/\bpl-\d/);
  });
});
