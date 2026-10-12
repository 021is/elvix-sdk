// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { safeRedirect } from "../src/react/safe-redirect";

const HOST = window.location.origin;
const ALLOWED = ["https://app.example.com", "https://admin.example.com/ignored-path"];

describe("safeRedirect", () => {
  it.each([
    ["/"],
    ["/home?x=1#y"],
    ["relative/path"],
    [`${HOST}/same-origin`],
    ["https://app.example.com/dashboard"],
    ["https://admin.example.com/anything"],
  ])("allows %s", (target) => {
    expect(safeRedirect(target, ALLOWED)).toBe(target);
  });

  it.each([
    ["javascript:alert(1)"],
    ["JaVaScRiPt:alert(1)"],
    ["  javascript:alert(1)"],
    ["\tjava\nscript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["vbscript:x"],
    ["//evil.example"],
    ["///evil.example"],
    ["/\\evil.example"],
    ["\\\\evil.example"],
    ["https://evil.example/"],
    ["https://app.example.com.evil.example/"],
    ["https://evil.example/https://app.example.com"],
    ["http://app.example.com/"],
    ["https://user@evil.example/"],
    ["ftp://app.example.com/"],
  ])("sends %s to /", (target) => {
    expect(safeRedirect(target, ALLOWED)).toBe("/");
  });

  it("falls back to / for empty input", () => {
    expect(safeRedirect("", ALLOWED)).toBe("/");
    expect(safeRedirect(undefined, ALLOWED)).toBe("/");
    expect(safeRedirect(null)).toBe("/");
  });

  it("with no allow-list, only the host's own origin passes", () => {
    expect(safeRedirect("https://app.example.com/")).toBe("/");
    expect(safeRedirect("/ok")).toBe("/ok");
  });

  it("ignores allow-list entries that are not URLs", () => {
    expect(safeRedirect("https://evil.example/", ["not a url", ""])).toBe("/");
  });
});
