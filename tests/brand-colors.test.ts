import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A customer picks their brand colour in the Console. The OTP boxes and the
 * sign-in inputs painted a hard-coded purple focus ring over it. Every
 * interactive state that shows colour (focus, hover, selection) must read
 * `--elvix-primary`; the only literal purples allowed are elvix's own mark
 * and the default brand itself.
 */
const DIR = new URL("../src/react/", import.meta.url);
const files = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f));

/** Purples that are elvix's identity, not a state colour: the default brand
 *  pair, the logo / shield accent dot, the device-approval fallbacks. */
const ALLOWED: Record<string, RegExp> = {
  "elvix-provider.tsx": /#5d4dff|#8e7dff/,
  "elvix-logo.tsx": /#8e7dff/,
  "elvix-secured-badge.tsx": /#8e7dff/,
  // The documented fallback when neither a prop nor the Console brand exists.
  "elvix-sign-in-button.tsx": /#8e7dff|#6c5ce7/,
  "elvix-sign-out-button.tsx": /var\(--elvix-primary,#6c5ce7\)|lavender/,
  "elvix-sign-in-form.tsx": /#5d4dff/,
  "elvix-card.tsx": /#5d4dff/,
  "elvix-app-passkeys.tsx": /#5d4dff/,
  "elvix-device-approval.tsx": /#7c6cff|124,108,255/,
};

describe("brand colours", () => {
  it.each(files)("%s hard-codes no purple outside elvix's own identity", (file) => {
    const source = readFileSync(new URL(file, DIR), "utf8");
    const allowed = ALLOWED[file];
    const offenders = source
      .split("\n")
      .filter((line) => /#(8e7dff|5d4dff|6c5ce7|7c6cff|8b5cf6)/i.test(line))
      .filter((line) => !allowed?.test(line));
    expect(offenders).toEqual([]);
  });

  it("every bordered control focuses with the shared brand ring", () => {
    for (const file of ["otp-input.tsx", "sign-in-steps.tsx"]) {
      const source = readFileSync(new URL(file, DIR), "utf8");
      expect(source, file).toContain("BRAND_FOCUS");
      expect(source, file).not.toMatch(/focus:(border|ring)-\[#/);
    }
  });
});
