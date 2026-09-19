/**
 * Offline tax-ID checksums, pinned with published valid IDs and one-digit
 * typos of them. These catch a fake or mistyped ID before any authority is
 * asked, so a refactor that changes the arithmetic must fail here.
 */
import { describe, expect, it } from "vitest";
import { localTaxIdMatches } from "../src/react/tax-validation";

describe("localTaxIdMatches checksums", () => {
  it.each([
    ["IT", "RSSMRA85T10A562S"], // codice fiscale
    ["ES", "12345678Z"], // DNI
    ["ES", "X1234567L"], // NIE (X → 0)
    ["NL", "111222333"], // BSN 11-test
    ["BR", "11222333000181"], // CNPJ
  ])("accepts a valid %s id %s", (country, id) => {
    expect(localTaxIdMatches(country, id)).toBe(true);
  });

  it.each([
    ["IT", "RSSMRA85T10A562T"],
    ["ES", "12345678A"],
    ["NL", "111222334"],
    ["BR", "11222333000182"],
  ])("rejects a mistyped %s id %s", (country, id) => {
    expect(localTaxIdMatches(country, id)).toBe(false);
  });
});
