// @vitest-environment jsdom
/**
 * The tax pane's label says "(optional)" only when Continue does not wait for
 * the number. Found on the dev mirror (2026-11-01): a sole proprietor who
 * said "No VAT ID" saw "Local tax number (optional)" over a field Continue
 * required. Label and gate now ask one helper (`localTaxIdRequired`).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TaxIdValidationState } from "../src/react/elvix-tax-id-input";
import { localTaxIdRequired } from "../src/react/legal-entity-payload";
import { TaxIdsView } from "../src/react/legal-entity-wizard-views";

afterEach(cleanup);

const none: TaxIdValidationState = {
  level: "none",
  name: null,
  authority: null,
  normalisedId: "",
};
const noop = () => undefined;

function renderPane(type: "individual" | "sole_prop" | "company", vatId: string) {
  render(
    <TaxIdsView
      entityType={type}
      showVat={false}
      country="DE"
      taxId=""
      vatId={vatId}
      vatValidation={none}
      setTaxId={noop}
      setVatId={noop}
      setVatValidation={noop}
      onConfirm={noop}
      onBack={noop}
    />,
  );
  return screen.getByText(/Local tax number/, { selector: "span" }).textContent ?? "";
}

describe("the local tax number's label", () => {
  it("is not optional for a sole proprietor without a VAT ID", () => {
    expect(renderPane("sole_prop", "")).not.toMatch(/optional/);
  });

  it("is optional once a VAT ID is given, and for a company", () => {
    expect(renderPane("sole_prop", "DE129273398")).toMatch(/optional/);
    cleanup();
    expect(renderPane("company", "DE129273398")).toMatch(/optional/);
  });

  it("agrees with the gate for every type", () => {
    expect(localTaxIdRequired("individual", "")).toBe(true);
    expect(localTaxIdRequired("sole_prop", "")).toBe(true);
    expect(localTaxIdRequired("sole_prop", "DE1")).toBe(false);
    expect(localTaxIdRequired("company", "")).toBe(false);
  });
});
