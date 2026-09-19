/**
 * The strict legal-entity schema's per-type gates, pinned as the exact list
 * of (field, message) issues it reports, in order.
 */
import { describe, expect, it } from "vitest";
import { legalEntitySchema } from "../src/react/legal-entity-schema";

const issues = (input: Record<string, unknown>) => {
  const r = legalEntitySchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => [i.path.join("."), i.message]);
};

const base = { legalName: "Acme", addressCountry: "DE", taxCountry: "DE" };

describe("legalEntitySchema", () => {
  it("individual: natural-person fields, two-word name, local tax id", () => {
    expect(issues({ ...base, type: "individual" })).toEqual([
      ["dateOfBirth", "Required"],
      ["nationality", "Required"],
      ["placeOfBirth", "Required"],
      ["legalName", "Enter both given name and family name"],
      ["taxId", "Required"],
    ]);
  });

  it("company: VAT and registration, no natural-person fields", () => {
    expect(issues({ ...base, type: "company" })).toEqual([
      ["vatId", "Required"],
      ["registrationNumber", "Required for sole proprietorships and companies"],
      ["registrationBody", "Required — the issuing authority"],
    ]);
  });

  it("sole_prop: natural-person fields and registration, tax ids optional", () => {
    const got = issues({ ...base, type: "sole_prop", legalName: "Ada Lovelace" });
    expect(got).toEqual([
      ["dateOfBirth", "Required"],
      ["nationality", "Required"],
      ["placeOfBirth", "Required"],
      ["registrationNumber", "Required for sole proprietorships and companies"],
      ["registrationBody", "Required — the issuing authority"],
    ]);
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
