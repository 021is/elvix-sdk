// @vitest-environment jsdom
/**
 * A field's icon never sits on its text in a host's page (Edvard, 2026-11-13, danceclub.dev's
 * Edit username: the "@" on the "e" of "edvard"). Until 0.26.2 `<ElvixInput>` carried `px-3`
 * and a caller with an icon added `pl-9`: two utilities for one side, and which one won was the
 * order of the stylesheets. In the SDK's own CSS `pl-9` comes later; a Tailwind host emits its
 * own `.px-3` in the same `@layer utilities`, loaded after the SDK's, and the text went back to
 * 12 px, under the 16 px icon. Every Tailwind host hit it.
 *
 * A field now carries one padding class per side, chosen by the field itself from its `start`
 * and `end` slots, so no stylesheet and no load order can move its text.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { Search } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixDateInput } from "../src/react/elvix-date-input";
import { ElvixInput } from "../src/react/elvix-input";
import { ElvixTaxIdInput } from "../src/react/elvix-tax-id-input";
import { ElvixUsername } from "../src/react/elvix-username";
import { Provider } from "./helpers/card-style-mount";
import { installFakeElvix } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SIDE = {
  left: /^(p|px|pl|ps)-/,
  right: /^(p|px|pr|pe)-/,
} as const;

/** The classes that set one side's padding, variants (`md:`, `focus:`) included. */
function paddingOf(el: Element, side: keyof typeof SIDE): string[] {
  return [...el.classList].filter((c) => SIDE[side].test(c.slice(c.lastIndexOf(":") + 1)));
}

/** Every input in the render that has two classes fighting over one side. */
function conflicts(container: HTMLElement): string[] {
  return [...container.querySelectorAll("input")].flatMap((input) =>
    (["left", "right"] as const)
      .map((side) => paddingOf(input, side))
      .filter((classes) => classes.length > 1)
      .map((classes) => `${input.outerHTML.slice(0, 80)}…: ${classes.join(" ")}`),
  );
}

describe("a field's padding", () => {
  it.each([
    ["ElvixInput", <ElvixInput key="a" aria-label="f" />],
    ["ElvixInput with both slots", <ElvixInput key="b" aria-label="f" start="@" end="✓" />],
    ["ElvixDateInput", <ElvixDateInput key="c" aria-label="f" value="" onChange={() => {}} />],
    ["ElvixTaxIdInput", <ElvixTaxIdInput key="d" country="DE" value="DE123" onChange={() => {}} />],
    [
      "ElvixUsername",
      <Provider key="e">
        <ElvixUsername appId="app" appName="App" current="edvard" methodUsername />
      </Provider>,
    ],
  ])("is one class per side in %s", (_, field) => {
    installFakeElvix({ context: null });
    const { container } = render(field);
    expect(container.querySelector("input")).not.toBeNull();
    expect(conflicts(container)).toEqual([]);
  });

  it("starts the text after a start slot and stops it before an end slot", () => {
    render(<ElvixInput aria-label="q" start={<Search className="size-4" />} end="…" />);
    const input = screen.getByLabelText("q");
    expect(paddingOf(input, "left")).toEqual(["pl-9"]);
    expect(paddingOf(input, "right")).toEqual(["pr-9"]);
  });

  it("is the plain inset with no slot, and no wrapper around the input", () => {
    const { container } = render(<ElvixInput aria-label="q" />);
    const input = screen.getByLabelText("q");
    expect(container.firstElementChild).toBe(input);
    expect(paddingOf(input, "left")).toEqual(["px-3"]);
    expect(paddingOf(input, "right")).toEqual(["px-3"]);
  });
});

/** Every `<ElvixInput>` / `<ElvixDateInput>` in the SDK: none sets padding through `className`;
 *  an icon goes in `start` or `end`, which choose it. */
describe("the SDK's own fields", () => {
  const dir = join(__dirname, "../src/react");
  /** Each field's JSX, from its tag to the `/>` that closes it (props hold `=>`, so not `>`). */
  const fields = readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .flatMap((file) => {
      const source = readFileSync(join(dir, file), "utf8");
      return [...source.matchAll(/<Elvix(?:Date)?Input\b/g)].map((m) => ({
        file,
        jsx: source.slice(m.index, source.indexOf("/>", m.index)),
      }));
    });

  it("are found", () => {
    expect(fields.length).toBeGreaterThan(20);
  });

  it("pass no padding to a field", () => {
    const offenders = fields.flatMap(({ file, jsx }) =>
      [...jsx.matchAll(/className="([^"]*)"/g)]
        .filter((m) => m[1].split(/\s+/).some((c) => SIDE.left.test(c) || SIDE.right.test(c)))
        .map((m) => `${file}: className="${m[1]}"`),
    );
    expect(offenders).toEqual([]);
  });
});
