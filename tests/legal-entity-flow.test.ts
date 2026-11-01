import { describe, expect, it } from "vitest";

import {
  FlowKind,
  needsBusinessSteps,
  needsPersonSteps,
  nextView,
  previousView,
  stepsInFlow,
  View,
  walkFlow,
} from "../src/react/legal-entity-flow";

/**
 * The legal-entity wizard's ordering, journey by journey.
 *
 * The product rules being protected:
 *   - a business starts at its VAT ID (0.18), so the authority's answer can
 *     prefill its name and address, and is not asked for its tax country
 *   - a sole proprietor without a VAT ID gives tax country and tax number
 *   - a company is never asked for a date of birth or a nationality
 *   - a private individual is never asked for a trading name, a VAT ID
 *     first, or a company registration number
 *   - a VAT id always detours through live verification before continuing,
 *     and Back never lands on that pane (it would move on by itself)
 */

const base = { hasVatId: false, withoutVatId: false, kind: FlowKind.FULL } as const;
const individual = { ...base, type: "individual" as const };
const soleProp = { ...base, type: "sole_prop" as const };
const soleNoVat = { ...soleProp, withoutVatId: true };
const company = { ...base, type: "company" as const };
const invoicing = <T extends object>(ctx: T) => ({ ...ctx, kind: FlowKind.INVOICING });

const ADDRESS = [
  View.ADDRESS_SEARCH,
  View.ADDRESS_REVIEW,
  View.ADDRESS_APT_FLOOR,
  View.CONTACT_CHOICE,
];
/** A business is also asked where its e-invoices go, before the contact question. */
const BUSINESS_ADDRESS = [
  View.ADDRESS_SEARCH,
  View.ADDRESS_REVIEW,
  View.ADDRESS_APT_FLOOR,
  View.E_INVOICE,
  View.CONTACT_CHOICE,
];
const PERSON = [View.DOB, View.PLACE_OF_BIRTH, View.NATIONALITY];

describe("step predicates", () => {
  it("treats sole_prop as both a business and a person", () => {
    expect(needsBusinessSteps("sole_prop")).toBe(true);
    expect(needsPersonSteps("sole_prop")).toBe(true);
  });

  it("treats a company as a business only, an individual as a person only", () => {
    expect([needsBusinessSteps("company"), needsPersonSteps("company")]).toEqual([true, false]);
    expect([needsBusinessSteps("individual"), needsPersonSteps("individual")]).toEqual([
      false,
      true,
    ]);
  });

  it("treats an unchosen type as neither", () => {
    expect(needsBusinessSteps(null)).toBe(false);
    expect(needsPersonSteps(null)).toBe(false);
  });
});

describe("journeys", () => {
  it("an individual: name → personal details → tax → address, as before 0.18", () => {
    expect(walkFlow(individual)).toEqual([
      View.TYPE_CHOICE,
      View.LEGAL_NAME,
      ...PERSON,
      View.TAX_COUNTRY,
      View.TAX_IDS,
      ...ADDRESS,
    ]);
  });

  it("a company: VAT ID → verified → name → trading name → registration → address", () => {
    expect(walkFlow(company)).toEqual([
      View.TYPE_CHOICE,
      View.VAT_ID,
      View.VERIFYING_TAX_ID,
      View.LEGAL_NAME,
      View.TRADING_NAME,
      View.REGISTRATION,
      ...BUSINESS_ADDRESS,
    ]);
  });

  it("a sole prop with a VAT ID: the company's path plus the personal details", () => {
    expect(walkFlow(soleProp)).toEqual([
      View.TYPE_CHOICE,
      View.VAT_ID,
      View.VERIFYING_TAX_ID,
      View.LEGAL_NAME,
      View.TRADING_NAME,
      ...PERSON,
      View.REGISTRATION,
      ...BUSINESS_ADDRESS,
    ]);
  });

  it("a sole prop without a VAT ID: tax country and number, then the same path", () => {
    expect(walkFlow(soleNoVat)).toEqual([
      View.TYPE_CHOICE,
      View.VAT_ID,
      View.TAX_COUNTRY,
      View.TAX_IDS,
      View.LEGAL_NAME,
      View.TRADING_NAME,
      ...PERSON,
      View.REGISTRATION,
      ...BUSINESS_ADDRESS,
    ]);
  });

  it("asks a business where its e-invoices go, never an individual", () => {
    expect(walkFlow(company)).toContain(View.E_INVOICE);
    expect(walkFlow(individual)).not.toContain(View.E_INVOICE);
    expect(previousView(View.CONTACT_CHOICE, company)).toBe(View.E_INVOICE);
    expect(previousView(View.CONTACT_CHOICE, individual)).toBe(View.ADDRESS_APT_FLOOR);
  });

  it("asks a business with a VAT ID no tax country", () => {
    for (const ctx of [company, soleProp]) expect(walkFlow(ctx)).not.toContain(View.TAX_COUNTRY);
  });

  it("never asks a company for personal details, an individual for business ones", () => {
    for (const step of PERSON) expect(walkFlow(company)).not.toContain(step);
    for (const step of [View.VAT_ID, View.TRADING_NAME, View.REGISTRATION]) {
      expect(walkFlow(individual)).not.toContain(step);
    }
  });
});

describe("VAT verification detour", () => {
  it("routes a typed VAT id through live verification", () => {
    expect(nextView(View.TAX_IDS, { ...individual, hasVatId: true })).toBe(View.VERIFYING_TAX_ID);
    expect(nextView(View.TAX_IDS, { ...soleNoVat, hasVatId: true })).toBe(View.VERIFYING_TAX_ID);
  });

  it("lands on the same next step with or without the detour", () => {
    for (const ctx of [individual, soleNoVat]) {
      const direct = nextView(View.TAX_IDS, ctx);
      const viaDetour = nextView(View.VERIFYING_TAX_ID, { ...ctx, hasVatId: true });
      expect(direct).toBe(viaDetour);
    }
  });
});

describe("panes that do not advance on their own", () => {
  it("returns null for terminal and choice-driven panes", () => {
    for (const pane of [View.CONTACT_CHOICE, View.SAVING, View.DETAIL, View.LIST, View.EMPTY]) {
      expect(nextView(pane, individual)).toBeNull();
    }
  });

  it("sends the contact form to saving", () => {
    expect(nextView(View.CONTACT_INPUT, individual)).toBe(View.SAVING);
  });
});

describe("previousView", () => {
  it("undoes every forward step, for every journey, skipping verification", () => {
    for (const ctx of [individual, soleProp, soleNoVat, company]) {
      const path = walkFlow(ctx).filter((v) => v !== View.VERIFYING_TAX_ID);
      for (const [i, step] of path.entries()) {
        expect(previousView(step, ctx), `${ctx.type} ${step}`).toBe(i === 0 ? null : path[i - 1]);
      }
    }
  });

  it("leaves the verification pane to where the VAT ID was typed", () => {
    expect(previousView(View.VERIFYING_TAX_ID, company)).toBe(View.VAT_ID);
    expect(previousView(View.VERIFYING_TAX_ID, soleNoVat)).toBe(View.TAX_IDS);
    expect(previousView(View.VERIFYING_TAX_ID, individual)).toBe(View.TAX_IDS);
  });

  it("returns from the contact form to its question", () => {
    expect(previousView(View.CONTACT_INPUT, company)).toBe(View.CONTACT_CHOICE);
  });
});

/** The invoice flow's tail: the address, then where invoices go, then saving. */
const INVOICE_ADDRESS = [View.ADDRESS_SEARCH, View.ADDRESS_REVIEW, View.ADDRESS_APT_FLOOR];

describe("the invoice flow: only what an invoice needs", () => {
  it("an individual: name → tax country → tax number → address → invoice email", () => {
    expect(walkFlow(invoicing(individual))).toEqual([
      View.TYPE_CHOICE,
      View.LEGAL_NAME,
      View.TAX_COUNTRY,
      View.TAX_IDS,
      ...INVOICE_ADDRESS,
      View.INVOICE_EMAIL,
      View.SAVING,
    ]);
  });

  it("a company or a sole prop with a VAT ID: VAT ID → name → address → email → e-invoice", () => {
    for (const ctx of [company, soleProp]) {
      expect(walkFlow(invoicing(ctx)), ctx.type).toEqual([
        View.TYPE_CHOICE,
        View.VAT_ID,
        View.VERIFYING_TAX_ID,
        View.LEGAL_NAME,
        ...INVOICE_ADDRESS,
        View.INVOICE_EMAIL,
        View.E_INVOICE,
        View.SAVING,
      ]);
    }
  });

  it("a sole prop without a VAT ID: tax country and number instead of the check", () => {
    expect(walkFlow(invoicing(soleNoVat))).toEqual([
      View.TYPE_CHOICE,
      View.VAT_ID,
      View.TAX_COUNTRY,
      View.TAX_IDS,
      View.LEGAL_NAME,
      ...INVOICE_ADDRESS,
      View.INVOICE_EMAIL,
      View.E_INVOICE,
      View.SAVING,
    ]);
  });

  it("never asks the trading name, birth data, nationality, registration or contact question", () => {
    const never = [View.TRADING_NAME, ...PERSON, View.REGISTRATION, View.CONTACT_CHOICE];
    for (const ctx of [individual, soleProp, soleNoVat, company]) {
      for (const step of never) expect(walkFlow(invoicing(ctx))).not.toContain(step);
    }
  });

  it("undoes every forward step, skipping verification", () => {
    for (const ctx of [individual, soleProp, soleNoVat, company].map(invoicing)) {
      const path = walkFlow(ctx).filter((v) => v !== View.VERIFYING_TAX_ID && v !== View.SAVING);
      for (const [i, step] of path.entries()) {
        expect(previousView(step, ctx), `${ctx.type} ${step}`).toBe(i === 0 ? null : path[i - 1]);
      }
    }
  });

  it("the full flow keeps its contact question after the e-invoice step", () => {
    expect(nextView(View.E_INVOICE, company)).toBe(View.CONTACT_CHOICE);
    expect(nextView(View.E_INVOICE, invoicing(company))).toBe(View.SAVING);
  });
});

describe("stepsInFlow: the N of 'Step 1 of N'", () => {
  it("counts the answered panes of the longest route, never the check or saving", () => {
    expect(stepsInFlow(["company"], FlowKind.INVOICING)).toBe(8);
    expect(stepsInFlow(["individual"], FlowKind.INVOICING)).toBe(8);
    // "No VAT ID" adds the tax country and number, one more than the check it skips.
    expect(stepsInFlow(["sole_prop"], FlowKind.INVOICING)).toBe(10);
    expect(stepsInFlow(["sole_prop", "company"], FlowKind.INVOICING)).toBe(10);
    expect(stepsInFlow(["company"], FlowKind.FULL)).toBe(10);
    expect(stepsInFlow(["individual", "sole_prop", "company"], FlowKind.FULL)).toBe(15);
  });
});
