/**
 * The strict legal-entity schema's per-type gates, pinned as the exact list
 * of (field, message) issues it reports, in order.
 */
import { describe, expect, it } from "vitest";
import { legalEntityPatchSchema, legalEntitySchema } from "../src/react/legal-entity-schema";

const issues = (input: Record<string, unknown>) => {
  const r = legalEntitySchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => [i.path.join("."), i.message]);
};

const base = { legalName: "Acme", addressCountry: "DE", taxCountry: "DE" };

describe("legalEntitySchema", () => {
  // What an invoice needs, nothing more: birth date, place, nationality and the
  // register number are a payment provider's to ask (2026-11-01).
  it("individual: the name in two parts and the local tax id, no birth data", () => {
    expect(issues({ ...base, type: "individual" })).toEqual([
      ["givenName", "Required"],
      ["familyName", "Required"],
      ["legalName", "Enter both given name and family name"],
      ["taxId", "Required"],
    ]);
  });

  // EU VAT Directive art. 226(5): an invoice carries the buyer's full address.
  const INVOICE_ADDRESS = [
    ["addressLine1", "Required for an invoice"],
    ["addressPostalCode", "Required for an invoice"],
    ["addressCity", "Required for an invoice"],
  ];

  it("company: the VAT ID and the full address, no registration", () => {
    expect(issues({ ...base, type: "company" })).toEqual([
      ["vatId", "Required"],
      ...INVOICE_ADDRESS,
    ]);
  });

  it("sole_prop: the name in two parts, the tax number and the full address", () => {
    const got = issues({ ...base, type: "sole_prop", legalName: "Ada Lovelace" });
    expect(got).toEqual([
      ["givenName", "Required"],
      ["familyName", "Required"],
      // No VAT ID, so the invoice prints the tax number.
      ["taxId", "Required"],
      ...INVOICE_ADDRESS,
    ]);
  });

  it("checks a register number that is given against its country", () => {
    const got = issues({ ...base, type: "company", taxCountry: "NL", registrationNumber: "12" });
    expect(got).toContainEqual(["registrationNumber", "Doesn't match the expected format for NL"]);
  });

  it("a business with the full address passes, and the country is asked too", () => {
    const company = {
      ...base,
      type: "company",
      vatId: "DE129273398",
      addressLine1: "Unter den Linden 1",
      addressPostalCode: "10117",
      addressCity: "Berlin",
    };
    expect(issues(company)).toEqual([]);
    expect(issues({ ...company, addressCountry: null })).toEqual([
      ["addressCountry", "Required for an invoice"],
    ]);
  });

  it("an individual is not held to the invoice address", () => {
    const got = issues({ ...base, type: "individual" }).map(([field]) => field);
    expect(got).not.toContain("addressPostalCode");
  });

  // Until 0.18 the verdict was input, so a browser could save "live" with any name.
  it("drops a VAT verdict sent from the browser", () => {
    const parsed = legalEntityPatchSchema.parse({
      vatId: "DE129273398",
      vatIdValidation: "live",
      vatIdValidatedAt: new Date(0).toISOString(),
      vatIdValidatedName: "Forged GmbH",
    });
    expect(parsed).toEqual({ vatId: "DE129273398" });
  });

  it("checks a supplied tax id against its country", () => {
    const got = issues({
      ...base,
      type: "company",
      vatId: "DE123",
      registrationNumber: "HRB 1",
      registrationBody: "AG Berlin",
      taxId: "12345678A",
      taxCountry: "ES",
    });
    expect(got).toContainEqual(["taxId", "Doesn't match the expected format for ES"]);
  });
});
