import { describe, expect, it } from "vitest";
import { View } from "../src/react/legal-entity-flow";
import { draftToEntityInput, stepPatch, stepReady } from "../src/react/legal-entity-payload";
import { emptyDraft } from "../src/react/use-legal-entity-draft";

/**
 * Until 0.18 the save carried the level the browser said its VAT check
 * reached, and elvix stored it: "verified" was whatever a script sent.
 * elvix now asks the authority itself, so the SDK sends the VAT ID only.
 */
const checked = {
  ...emptyDraft(),
  type: "company" as const,
  legalName: "Google Ireland Limited",
  taxCountry: "IE",
  vatId: "IE6388047V",
  vatValidation: {
    level: "live" as const,
    name: "GOOGLE IRELAND LIMITED",
    authority: "VIES",
    normalisedId: "IE6388047V",
  },
};

describe("legal-entity payload", () => {
  it("never sends the VAT check's verdict", () => {
    const body = draftToEntityInput(checked) as Record<string, unknown>;
    expect(body.vatId).toBe("IE6388047V");
    for (const key of ["vatIdValidation", "vatIdValidatedAt", "vatIdValidatedName"]) {
      expect(key in body, key).toBe(false);
    }
    expect(stepPatch(View.TAX_IDS, checked)).toEqual({ taxId: null, vatId: "IE6388047V" });
  });

  it("leaves the VAT ID pane with a VAT ID and its country, or with none", () => {
    expect(stepReady(View.VAT_ID, checked)).toBe(true);
    expect(stepReady(View.VAT_ID, { ...checked, taxCountry: "" })).toBe(false);
    expect(stepReady(View.VAT_ID, { ...checked, vatId: "", withoutVatId: true })).toBe(true);
  });
});
