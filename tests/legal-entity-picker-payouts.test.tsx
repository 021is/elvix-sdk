// @vitest-environment jsdom
/**
 * `<ElvixLegalEntityPicker purpose="payouts">` says what a pick shares before
 * the user picks, naming the app; an invoicing picker says nothing. The host
 * chooses the purpose, so the user must see it (second security review,
 * 2026-11-01).
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixLegalEntityPicker, ElvixProvider, LegalEntityPurpose } from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const grei = {
  id: "le_grei",
  type: "company",
  label: null,
  isDefault: true,
  legalName: "Grei Events GmbH",
  tradingName: null,
  taxCountry: "DE",
  taxId: null,
  vatId: null,
  vatIdValidation: "none",
  vatIdValidatedAt: null,
  vatIdValidatedName: null,
  addressCity: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

function mount(purpose?: LegalEntityPurpose) {
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <ElvixLegalEntityPicker types={["company"]} purpose={purpose} onPick={vi.fn()} />
    </ElvixProvider>,
  );
}

describe("ElvixLegalEntityPicker: what a payouts pick shares", () => {
  it("payouts: a note above the list names the app and what it reads", async () => {
    installFakeElvix({ entities: [grei] });
    mount(LegalEntityPurpose.PAYOUTS);
    await screen.findByText("Grei Events GmbH");
    await waitFor(() =>
      expect(screen.getByRole("note").textContent).toBe(
        "Picking a company here lets Acme read the birth date, place of birth, nationality and phone you saved, to fill in its payout form.",
      ),
    );
  });

  it("payouts without an app name: says this app", async () => {
    const fake = installFakeElvix({ entities: [grei] });
    fake.state.bootstrap = { ...fake.state.bootstrap, appName: "  " };
    mount(LegalEntityPurpose.PAYOUTS);
    await screen.findByText("Grei Events GmbH");
    expect(screen.getByRole("note").textContent).toMatch(
      /^Picking a company here lets this app read/,
    );
  });

  it("invoicing (the default): no note", async () => {
    installFakeElvix({ entities: [grei] });
    mount();
    await screen.findByText("Grei Events GmbH");
    expect(screen.queryByRole("note")).toBeNull();
  });
});
