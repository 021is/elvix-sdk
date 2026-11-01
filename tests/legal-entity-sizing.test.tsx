// @vitest-environment jsdom
/**
 * `sizing` on the legal-entity components (0.18): fixed keeps one height for
 * the list and every add step, flexible grows with each pane and scrolls
 * only under a `maxHeight`.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ElvixLegalEntities,
  ElvixLegalEntityPicker,
  type ElvixLegalEntityPickerProps,
  ElvixProvider,
} from "../src/react/index";
import { frameScrolls, frameStyle, Sizing } from "../src/react/legal-entity-frame";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DEFAULTS = { height: "min(520px, 70dvh)", minHeight: 300, maxHeight: 700 };

describe("frameStyle", () => {
  it("fixed: the defaults without a height, bounds the host passes win", () => {
    expect(frameStyle(Sizing.FIXED, {}, DEFAULTS)).toEqual(DEFAULTS);
    expect(frameStyle(Sizing.FIXED, { maxHeight: 400 }, DEFAULTS)).toEqual({
      ...DEFAULTS,
      maxHeight: 400,
    });
  });

  it("fixed: an explicit height brings only the host's own bounds", () => {
    expect(frameStyle(Sizing.FIXED, { height: 640 }, DEFAULTS)).toEqual({ height: 640 });
  });

  it("flexible: never a height, only the host's bounds", () => {
    expect(frameStyle(Sizing.FLEXIBLE, { height: 640 }, DEFAULTS)).toEqual({});
    expect(frameStyle(Sizing.FLEXIBLE, { minHeight: 200, maxHeight: 480 }, DEFAULTS)).toEqual({
      minHeight: 200,
      maxHeight: 480,
    });
  });

  it("only a capped flexible frame scrolls as a whole", () => {
    expect(frameScrolls(Sizing.FLEXIBLE, { maxHeight: 480 })).toBe(true);
    expect(frameScrolls(Sizing.FLEXIBLE, {})).toBe(false);
    expect(frameScrolls(Sizing.FIXED, { maxHeight: 480 })).toBe(false);
  });
});

function mountPicker(props: Partial<ElvixLegalEntityPickerProps> = {}) {
  installFakeElvix({ entities: [] });
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <ElvixLegalEntityPicker types={["sole_prop", "company"]} onPick={() => {}} {...props} />
    </ElvixProvider>,
  );
}

const frame = () => document.querySelector("[data-elvix-sizing]") as HTMLElement;

describe("ElvixLegalEntityPicker sizing", () => {
  it("in a card: fixed, the list and the first add step in one frame of one height", async () => {
    mountPicker();
    const add = await screen.findByText("Add a company");
    expect(frame().dataset.elvixSizing).toBe("fixed");
    expect(frame().style.height).toBe("min(520px, 70dvh)");
    fireEvent.click(add);
    await screen.findByText("What kind of entity is this?");
    expect(frame().style.height).toBe("min(520px, 70dvh)");
    // The panes stack inside the fixed frame and scroll there.
    expect((frame().firstElementChild as HTMLElement).className).toContain("absolute");
  });

  it("fixed: height overrides the default, maxHeight caps it", async () => {
    mountPicker({ height: 600, maxHeight: 480 });
    await screen.findByText("Add a company");
    expect(frame().style.height).toBe("600px");
    expect(frame().style.maxHeight).toBe("480px");
  });

  it("without a card: flexible, no height, the pane in normal flow", async () => {
    mountPicker({ card: false });
    fireEvent.click(await screen.findByText("Add a company"));
    await screen.findByText("What kind of entity is this?");
    expect(frame().dataset.elvixSizing).toBe("flexible");
    expect(frame().style.height).toBe("");
    expect(frame().className).not.toContain("overflow");
    expect((frame().firstElementChild as HTMLElement).className).not.toContain("absolute");
  });

  it("flexible with maxHeight: capped, and scrolls", async () => {
    mountPicker({ sizing: "flexible", maxHeight: 360 });
    await screen.findByText("Add a company");
    expect(frame().style.maxHeight).toBe("360px");
    expect(frame().className).toContain("overflow-y-auto");
  });
});

describe("ElvixLegalEntities sizing", () => {
  const mount = (props: Parameters<typeof ElvixLegalEntities>[0]) => {
    installFakeElvix({ entities: [] });
    render(
      <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
        <ElvixLegalEntities {...props} />
      </ElvixProvider>,
    );
    // The outer frame: the one the width and the height sit on.
    return frame().closest(".mx-auto") as HTMLElement;
  };

  it("fixed by default, clamped to the viewport as before", () => {
    const outer = mount({});
    expect(outer.style.height).toBe("min(540px, 66dvh)");
    expect(outer.style.minHeight).toBe("340px");
    expect(outer.style.maxHeight).toBe("700px");
  });

  it("flexible: no height, capped and scrolling under maxHeight", () => {
    const outer = mount({ sizing: "flexible", maxHeight: 500 });
    expect(outer.style.height).toBe("");
    expect(outer.style.maxHeight).toBe("500px");
    expect(outer.className).toContain("overflow-y-auto");
    expect(frame().dataset.elvixSizing).toBe("flexible");
  });
});
