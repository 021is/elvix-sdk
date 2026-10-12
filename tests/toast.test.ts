// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { toast } from "../src/react/toast";

/**
 * The toast writes markup with `innerHTML` for its status icon. That is safe
 * only while the icon comes from the static `ICON` map and the caller's
 * message goes through `textContent`. Pinned both ways.
 */
afterEach(() => {
  document.body.innerHTML = "";
});

describe("toast", () => {
  it("renders a message as text, never as markup", () => {
    toast.error('<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>');
    const el = document.querySelector("[data-elvix-toaster] [role=alert]");
    expect(el?.querySelector("img")).toBeNull();
    expect(el?.querySelector("script")).toBeNull();
    expect(el?.textContent).toContain("<img src=x");
  });

  it("the icon is the static one for its kind", () => {
    toast.success("saved");
    const svg = document.querySelector("[data-elvix-toaster] [role=status] svg");
    expect(svg?.outerHTML).toContain("#22c55e");
  });

  it("`innerHTML` is assigned in exactly one place, from the static icon map", () => {
    const source = readFileSync(join(__dirname, "../src/react/toast.ts"), "utf8");
    const writes = source.match(/\.innerHTML\s*=/g) ?? [];
    expect(writes).toHaveLength(1);
    expect(source).toMatch(/icon\.innerHTML = ICON\[kind\];/);
  });
});
