// @vitest-environment jsdom
/**
 * Where e-invoices go is asked only of an Italian or Belgian business
 * (Edvard and DanceClub, 2026-11-01): Italy's SDI code or PEC, Belgium's
 * Peppol ID. Every other country skips the step, the counter never counts it
 * for them, and the detail view's edit still offers all four fields.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EInvoiceView, eInvoiceFieldsShown } from "../src/react/legal-entity-e-invoice-view";
import {
  asksEInvoiceAddress,
  FlowKind,
  nextView,
  previousView,
  stepsInFlow,
  View,
  walkFlow,
} from "../src/react/legal-entity-flow";
import { emptyDraft } from "../src/react/use-legal-entity-draft";

afterEach(cleanup);

const ctx = (type: "company" | "sole_prop" | "individual", country: string | null) => ({
  type,
  country,
  hasVatId: false,
  withoutVatId: false,
  kind: FlowKind.FULL,
});
const invoicing = <T extends object>(c: T) => ({ ...c, kind: FlowKind.INVOICING });

describe("the e-invoice step, Italy and Belgium only", () => {
  it("is asked of an Italian or Belgian business, in both flows", () => {
    for (const country of ["IT", "BE"]) {
      for (const type of ["company", "sole_prop"] as const) {
        const full = ctx(type, country);
        expect(asksEInvoiceAddress(type, country)).toBe(true);
        expect(nextView(View.ADDRESS_APT_FLOOR, full)).toBe(View.E_INVOICE);
        expect(nextView(View.E_INVOICE, full)).toBe(View.CONTACT_CHOICE);
        expect(previousView(View.CONTACT_CHOICE, full)).toBe(View.E_INVOICE);
        expect(nextView(View.INVOICE_EMAIL, invoicing(full))).toBe(View.E_INVOICE);
        expect(nextView(View.E_INVOICE, invoicing(full))).toBe(View.SAVING);
        expect(previousView(View.E_INVOICE, invoicing(full))).toBe(View.INVOICE_EMAIL);
      }
    }
  });

  it("is skipped everywhere else, and before a country is known", () => {
    for (const country of ["DE", "FR", "PL", "AT", null]) {
      const full = ctx("company", country);
      expect(asksEInvoiceAddress("company", country)).toBe(false);
      expect(walkFlow(full)).not.toContain(View.E_INVOICE);
      expect(walkFlow(invoicing(full))).not.toContain(View.E_INVOICE);
      expect(nextView(View.INVOICE_EMAIL, invoicing(full))).toBe(View.SAVING);
    }
  });

  it("is never asked of a private individual, even in Italy", () => {
    for (const country of ["IT", "BE"]) {
      expect(asksEInvoiceAddress("individual", country)).toBe(false);
      expect(walkFlow(ctx("individual", country))).not.toContain(View.E_INVOICE);
      expect(walkFlow(invoicing(ctx("individual", country)))).not.toContain(View.E_INVOICE);
    }
  });

  it("counts toward 'Step 1 of N' only for a country that shows it", () => {
    for (const kind of [FlowKind.INVOICING, FlowKind.FULL]) {
      const without = stepsInFlow(["company"], kind);
      expect(stepsInFlow(["company"], kind, "DE")).toBe(without);
      expect(stepsInFlow(["company"], kind, "IT")).toBe(without + 1);
      expect(stepsInFlow(["company"], kind, "BE")).toBe(without + 1);
      expect(stepsInFlow(["individual"], kind, "IT")).toBe(stepsInFlow(["individual"], kind));
    }
  });
});

describe("the e-invoice pane", () => {
  it("shows the country's own fields when adding, all four when editing", () => {
    expect(eInvoiceFieldsShown("IT", false)).toEqual(["codiceDestinatario", "pecAddress"]);
    expect(eInvoiceFieldsShown("BE", false)).toEqual(["peppolId"]);
    for (const country of ["IT", "BE", "DE", ""]) {
      expect(eInvoiceFieldsShown(country, true)).toEqual([
        "peppolId",
        "codiceDestinatario",
        "pecAddress",
        "leitwegId",
      ]);
    }
  });

  const mount = (over: Partial<ReturnType<typeof emptyDraft>>, allFields = false) => {
    const onConfirm = vi.fn();
    const draft = { ...emptyDraft(), type: "company" as const, ...over };
    render(
      <EInvoiceView
        draft={draft}
        setField={() => {}}
        onConfirm={onConfirm}
        onBack={() => {}}
        allFields={allFields}
      />,
    );
    return onConfirm;
  };
  const button = (name: string) => screen.getByText(name).closest("button") as HTMLButtonElement;

  it("Italy: says why in its own terms, SDI code and PEC, Skip while empty", () => {
    const onConfirm = mount({ taxCountry: "IT" });
    expect(screen.getByText(/Italian businesses receive invoices through SDI/)).toBeTruthy();
    expect(screen.getByText("SDI code (codice destinatario)")).toBeTruthy();
    expect(screen.getByText("PEC address")).toBeTruthy();
    expect(screen.queryByText("Peppol ID")).toBeNull();
    expect(screen.queryByText("Leitweg-ID")).toBeNull();
    fireEvent.click(button("Skip"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Belgium: the Peppol ID only, Continue once one is given", () => {
    mount({ taxCountry: "BE", peppolId: "0208:0123456789" });
    expect(screen.getByText(/Belgian businesses receive invoices over Peppol/)).toBeTruthy();
    expect(screen.getByText("Peppol ID")).toBeTruthy();
    expect(screen.queryByText("PEC address")).toBeNull();
    expect(button("Continue")).toBeTruthy();
  });

  it("from the detail view: all four fields, the generic subtitle, whatever the country", () => {
    mount({ taxCountry: "DE" }, true);
    for (const label of ["Peppol ID", "SDI code (codice destinatario)", "PEC address"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("Leitweg-ID")).toBeTruthy();
    expect(screen.queryByText(/Italian businesses/)).toBeNull();
  });

  it("carries no prose in the key chip", () => {
    mount({ taxCountry: "IT" });
    expect(screen.queryByText("Leave empty to skip")).toBeNull();
    expect(document.querySelector("kbd")?.textContent).toBe("Enter");
  });
});
