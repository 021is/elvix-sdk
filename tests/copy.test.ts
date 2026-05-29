/**
 * Tests for the editable sign-in copy resolver. Precedence is
 * defaults < Console bootstrap < per-embed prop, and `undefined` must never
 * clobber an earlier layer — that's what lets a prop override one string
 * without resupplying the rest.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_COPY, fillCopy, resolveCopy } from "../src/react/copy";

describe("resolveCopy", () => {
  it("returns the built-in defaults with no overrides", () => {
    const c = resolveCopy();
    expect(c.googleButton).toBe(DEFAULT_COPY.googleButton);
    expect(c.subtitle).toBe("Pick how you want to continue.");
  });

  it("lets Console bootstrap override a default", () => {
    const c = resolveCopy({ subtitle: "Choose a method" });
    expect(c.subtitle).toBe("Choose a method");
    expect(c.googleButton).toBe(DEFAULT_COPY.googleButton);
  });

  it("lets a prop win over bootstrap", () => {
    const c = resolveCopy({ subtitle: "from console" }, { subtitle: "from prop" });
    expect(c.subtitle).toBe("from prop");
  });

  it("does not let an undefined override clobber an earlier layer", () => {
    const c = resolveCopy({ subtitle: "from console" }, { subtitle: undefined });
    expect(c.subtitle).toBe("from console");
  });
});

describe("fillCopy", () => {
  it("replaces a known token", () => {
    expect(fillCopy("Sign in to {app}", { app: "Zeropost" })).toBe("Sign in to Zeropost");
  });

  it("replaces multiple occurrences and tokens", () => {
    expect(fillCopy("{a}-{b}-{a}", { a: "1", b: "2" })).toBe("1-2-1");
  });

  it("leaves unknown tokens untouched", () => {
    expect(fillCopy("code to {email}", {})).toBe("code to {email}");
  });
});
