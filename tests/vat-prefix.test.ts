import { describe, expect, it } from "vitest";
import { countryFromVatId } from "../src/react/vat-prefix";

describe("countryFromVatId", () => {
  it.each([
    ["DE129273398", "DE"],
    ["de 129 273 398", "DE"],
    ["IE6388047V", "IE"],
    ["EL123456789", "GR"],
    ["GB123456789", "GB"],
    ["CHE-123.456.789 MWST", "CH"],
    ["NO123456789MVA", "NO"],
  ])("%s names %s", (vat, country) => {
    expect(countryFromVatId(vat)).toBe(country);
  });

  it.each(["123456789", "51824753556", "GR123456789", "XX123", "", "C"])(
    "%s names no country",
    (vat) => {
      expect(countryFromVatId(vat)).toBeNull();
    },
  );
});
