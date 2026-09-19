/** The tax-identifiers pane's continue gate, per entity type. */
import { describe, expect, it } from "vitest";
import { taxIdsBlockReason } from "../src/react/legal-entity-wizard-views";

// Returns the key, so each case asserts which rule blocked it.
const t = ((key: string) => key) as Parameters<typeof taxIdsBlockReason>[1];
const gate = (v: Partial<Parameters<typeof taxIdsBlockReason>[0]>) =>
  taxIdsBlockReason(
    { type: "company", country: "DE", taxId: "", vatId: "", vatLevel: "none", ...v },
    t,
  );

describe("taxIdsBlockReason", () => {
  it("requires the local tax number of an individual, and nothing else", () => {
    expect(gate({ type: "individual" })).toBe("legalEntities.blockReasonTaxIdRequired");
    expect(gate({ type: "individual", taxId: "1234567890" })).toBeNull();
    // An individual has no VAT id, so an invalid one cannot block them.
    expect(gate({ type: "individual", taxId: "1234567890", vatLevel: "invalid" })).toBeNull();
  });

  it("requires a company's VAT id and rejects a malformed one", () => {
    expect(gate({})).toBe("legalEntities.blockReasonVatRequired");
    expect(gate({ vatId: "DE12", vatLevel: "invalid" })).toBe("legalEntities.blockReasonVatFormat");
    expect(gate({ vatId: "DE123456789", vatLevel: "format" })).toBeNull();
  });

  it("lets a sole proprietor continue with neither", () => {
    expect(gate({ type: "sole_prop" })).toBeNull();
  });

  it("checks the local number's format whenever one is entered", () => {
    expect(gate({ type: "sole_prop", taxId: "12" })).toBe("legalEntities.blockReasonTaxIdFormat");
  });
});
