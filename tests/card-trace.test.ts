/** The card's border-trace geometry: it must meet the badge gap on any size. */
import { describe, expect, it } from "vitest";
import { traceFractions } from "../src/react/elvix-card";

const perimeter = (width: number, height: number) => {
  const r = 17;
  return 2 * (width - 1.5 + (height - 1.5)) - 8 * r + 2 * Math.PI * r;
};

describe("traceFractions", () => {
  it.each([
    [432, 300],
    [432, 700],
    [320, 520],
  ])("starts at the gap's right edge and skips exactly the gap on %ix%i", (width, height) => {
    const gap = { left: 20, width: 120 };
    const t = traceFractions({ width, height }, gap);
    const p = perimeter(width, height);
    // Path starts 0.75 + 17 along the top edge; the gap's right edge is 140.
    expect(t.start * p).toBeCloseTo(140 - 17.75, 6);
    expect(t.drawn * p).toBeCloseTo(p - 120, 6);
  });

  it("never goes negative for a gap that starts before the path", () => {
    expect(traceFractions({ width: 100, height: 100 }, { left: 0, width: 5 }).start).toBe(0);
  });
});
