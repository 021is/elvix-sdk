// @vitest-environment jsdom
/** `<ElvixLegalEntities>`: editing one field from the detail view. */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixLegalEntities, ElvixProvider } from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const company = {
  id: "le_1",
  type: "company",
  label: null,
  isDefault: true,
  legalName: "Edvone Holding",
  tradingName: null,
  dateOfBirth: null,
  placeOfBirth: null,
  placeOfBirthPlaceId: null,
  nationality: null,
  taxCountry: "DE",
  taxId: null,
  vatId: null,
  vatIdValidation: "none",
  vatIdValidatedAt: null,
  vatIdValidatedName: null,
  registrationNumber: null,
  registrationBody: null,
  registeredSince: null,
  contactEmail: null,
  contactPhone: null,
  addressLine1: null,
  addressCity: null,
  addressCountry: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

describe("ElvixLegalEntities", () => {
  // The edit prefill left the entity type unset, so the legal-name step
  // applied the person rule ("given and family name") and a one-word
  // company name could not be saved.
  it("renames a company to a one-word legal name", async () => {
    const fake = installFakeElvix({ entities: [company] });
    const onResult = vi.fn();
    render(
      <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
        <ElvixLegalEntities onResult={onResult} />
      </ElvixProvider>,
    );

    fireEvent.click(await screen.findByText("Edvone Holding"));
    fireEvent.click(await screen.findByText("Legal name"));
    fireEvent.change(await screen.findByDisplayValue("Edvone Holding"), {
      target: { value: "Edvone" },
    });
    const save = screen.getByText("Continue").closest("button") as HTMLButtonElement;
    await act(async () => fireEvent.click(save));

    await waitFor(() => expect(fake.patches).toEqual([{ legalName: "Edvone" }]));
    expect(onResult).toHaveBeenCalledWith({ ok: true, count: 1 });
    // Back on the detail view, showing the new name.
    await waitFor(() => expect(screen.getAllByText("Edvone").length).toBeGreaterThan(0));
  });
});
