import { describe, expect, it } from "vitest";

import {
  needsBusinessSteps,
  needsPersonSteps,
  nextView,
  View,
  walkFlow,
} from "../src/react/legal-entity-flow";

/**
 * Characterization tests for the legal-entity wizard ordering.
 *
 * These were written by reading the sixteen `afterX()` callbacks the
 * component used to carry, BEFORE that logic moved here, so they pin the
 * behaviour that already shipped rather than the behaviour the refactor
 * happens to produce. If a step disappears for one entity type, this is what
 * catches it.
 *
 * The product rules being protected:
 *   - a company is never asked for a date of birth or a nationality
 *   - a private individual is never asked for a trading name or a company
 *     registration number
 *   - a sole proprietorship is both, and walks the longest path
 *   - a VAT id always detours through live verification before continuing
 */

const individual = { type: "individual" as const, hasVatId: false };
const soleProp = { type: "sole_prop" as const, hasVatId: false };
const company = { type: "company" as const, hasVatId: false };

describe("step predicates", () => {
  it("treats sole_prop as both a business and a person", () => {
    // The awkward case, and the reason both predicates exist.
    expect(needsBusinessSteps("sole_prop")).toBe(true);
    expect(needsPersonSteps("sole_prop")).toBe(true);
  });

  it("treats a company as a business only", () => {
    expect(needsBusinessSteps("company")).toBe(true);
    expect(needsPersonSteps("company")).toBe(false);
  });

  it("treats an individual as a person only", () => {
    expect(needsBusinessSteps("individual")).toBe(false);
    expect(needsPersonSteps("individual")).toBe(true);
  });

  it("treats an unchosen type as neither", () => {
    expect(needsBusinessSteps(null)).toBe(false);
    expect(needsPersonSteps(null)).toBe(false);
  });
});

describe("individual journey", () => {
  it("walks name → personal details → tax → address → contact", () => {
    expect(walkFlow(individual)).toEqual([
      View.TYPE_CHOICE,
      View.LEGAL_NAME,
      View.DOB,
      View.PLACE_OF_BIRTH,
      View.NATIONALITY,
      View.TAX_COUNTRY,
      View.TAX_IDS,
      View.ADDRESS_SEARCH,
      View.ADDRESS_REVIEW,
      View.ADDRESS_APT_FLOOR,
      View.CONTACT_CHOICE,
    ]);
  });

  it("never asks an individual for business-only steps", () => {
    const path = walkFlow(individual);
    expect(path).not.toContain(View.TRADING_NAME);
    expect(path).not.toContain(View.REGISTRATION);
  });
});

describe("company journey", () => {
  it("walks name → trading name → tax → registration → address", () => {
    expect(walkFlow(company)).toEqual([
      View.TYPE_CHOICE,
      View.LEGAL_NAME,
      View.TRADING_NAME,
      View.TAX_COUNTRY,
      View.TAX_IDS,
      View.REGISTRATION,
      View.ADDRESS_SEARCH,
      View.ADDRESS_REVIEW,
      View.ADDRESS_APT_FLOOR,
      View.CONTACT_CHOICE,
    ]);
  });

  it("never asks a company for personal details", () => {
    const path = walkFlow(company);
    expect(path).not.toContain(View.DOB);
    expect(path).not.toContain(View.PLACE_OF_BIRTH);
    expect(path).not.toContain(View.NATIONALITY);
  });
});

describe("sole proprietorship journey", () => {
  it("walks the longest path, covering both business and personal steps", () => {
    expect(walkFlow(soleProp)).toEqual([
      View.TYPE_CHOICE,
      View.LEGAL_NAME,
      View.TRADING_NAME,
      View.DOB,
      View.PLACE_OF_BIRTH,
      View.NATIONALITY,
      View.TAX_COUNTRY,
      View.TAX_IDS,
      View.REGISTRATION,
      View.ADDRESS_SEARCH,
      View.ADDRESS_REVIEW,
      View.ADDRESS_APT_FLOOR,
      View.CONTACT_CHOICE,
    ]);
  });

  it("is a superset of both other journeys", () => {
    const path = walkFlow(soleProp);
    for (const step of walkFlow(individual)) expect(path).toContain(step);
    for (const step of walkFlow(company)) expect(path).toContain(step);
  });
});

describe("VAT verification detour", () => {
  it("routes through live verification when a VAT id was entered", () => {
    expect(nextView(View.TAX_IDS, { ...individual, hasVatId: true })).toBe(View.VERIFYING_TAX_ID);
  });

  it("skips verification when no VAT id was entered", () => {
    expect(nextView(View.TAX_IDS, individual)).toBe(View.ADDRESS_SEARCH);
  });

  it("rejoins the normal path after verifying, per type", () => {
    // The detour must not change WHERE the user ends up, only how they got there.
    expect(nextView(View.VERIFYING_TAX_ID, individual)).toBe(View.ADDRESS_SEARCH);
    expect(nextView(View.VERIFYING_TAX_ID, company)).toBe(View.REGISTRATION);
    expect(nextView(View.VERIFYING_TAX_ID, soleProp)).toBe(View.REGISTRATION);
  });

  it("lands on the same next step with or without the detour", () => {
    for (const ctx of [individual, soleProp, company]) {
      const direct = nextView(View.TAX_IDS, ctx);
      const viaDetour = nextView(View.VERIFYING_TAX_ID, { ...ctx, hasVatId: true });
      expect(direct).toBe(viaDetour);
    }
  });
});

describe("panes that do not advance on their own", () => {
  it("returns null for terminal and choice-driven panes", () => {
    // contact-choice branches on the user's yes/no, not on completion;
    // saving and detail are terminal.
    for (const pane of [View.CONTACT_CHOICE, View.SAVING, View.DETAIL, View.LIST, View.EMPTY]) {
      expect(nextView(pane, individual)).toBeNull();
    }
  });

  it("sends the contact form to saving", () => {
    expect(nextView(View.CONTACT_INPUT, individual)).toBe(View.SAVING);
  });
});
