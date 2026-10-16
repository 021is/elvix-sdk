// @vitest-environment jsdom
/**
 * `<ElvixLogo>` is public (0.14.5): hosts mark what elvix handles with it, in
 * light and dark, so the shield must follow the host's text colour and the
 * mark must reach screen readers by name.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ElvixLogo } from "../src/react/index";

afterEach(cleanup);

describe("ElvixLogo", () => {
  it("is exported, named for screen readers, and sized by `size`", () => {
    render(<ElvixLogo size={14} />);
    const mark = screen.getByRole("img", { name: "elvix" });
    const svg = mark.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("14");
    expect(svg?.getAttribute("height")).toBe("14");
  });

  it("paints the shield in currentColor, so it works on light and dark", () => {
    render(<ElvixLogo className="text-foreground" />);
    const mark = screen.getByRole("img", { name: "elvix" });
    expect(mark.className).toContain("text-foreground");
    expect(mark.querySelector("path")?.getAttribute("fill")).toBe("currentColor");
  });

  it("shows the wordmark only when asked", () => {
    render(<ElvixLogo />);
    expect(screen.queryByText("elvix")).toBeNull();
    cleanup();
    render(<ElvixLogo withText />);
    expect(screen.getByText("elvix")).toBeTruthy();
  });
});
