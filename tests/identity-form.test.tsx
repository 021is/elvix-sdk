// @vitest-environment jsdom
/**
 * `<ElvixIdentityForm>` (0.12 batch #5).
 *
 * On 0.11 the form required birthdate AND gender while labelling only pronouns
 * "(optional)", showed errors only on touched fields, and sent the whole row.
 * So anyone who had never disclosed a birthdate could not save a name change,
 * and the Save button stayed disabled with no visible reason. The server has
 * always accepted a partial patch; the requirement was the form's alone.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixIdentityForm, ElvixProvider } from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

function Provider({ children }: { children: ReactNode }) {
  return (
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      {children}
    </ElvixProvider>
  );
}

const saveButton = () => screen.getByRole("button", { name: /save/i }) as HTMLButtonElement;
const givenName = () => screen.getByPlaceholderText("Jane") as HTMLInputElement;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderForm(identity: Record<string, unknown>) {
  const fake = installFakeElvix({ identity: { ...identity } });
  render(
    <Provider>
      <ElvixIdentityForm card={false} />
    </Provider>,
  );
  await waitFor(() => expect(givenName().value).toBe(identity.givenName ?? ""));
  return fake;
}

describe("#5 ElvixIdentityForm", () => {
  it("saves a name change for someone with no birthdate or gender, sending only the name", async () => {
    const fake = await renderForm({ givenName: "Ada", familyName: "Lovelace" });

    fireEvent.change(givenName(), { target: { value: "Augusta" } });
    expect(saveButton().disabled).toBe(false);
    await act(async () => fireEvent.click(saveButton()));

    await waitFor(() => expect(fake.patches).toEqual([{ givenName: "Augusta" }]));
  });

  it("labels every field but the given name as optional", async () => {
    await renderForm({ givenName: "Ada" });

    for (const label of ["Family name", "Birthdate", "Gender", "Pronouns"]) {
      expect(screen.getByText(new RegExp(`^${label} \\(optional\\)$`))).toBeTruthy();
    }
    expect(screen.getByText("Given name")).toBeTruthy();
    expect(givenName().required).toBe(true);
  });

  it("shows why Save is disabled without waiting for a blur", async () => {
    await renderForm({ givenName: "Ada" });

    fireEvent.change(givenName(), { target: { value: "" } });

    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText("Required")).toBeTruthy();
  });

  it("clears an optional field by sending null", async () => {
    const fake = await renderForm({ givenName: "Ada", familyName: "Lovelace" });

    fireEvent.change(screen.getByPlaceholderText("Doe"), { target: { value: "" } });
    await act(async () => fireEvent.click(saveButton()));

    await waitFor(() => expect(fake.patches).toEqual([{ familyName: null }]));
  });

  it("refreshes the provider's user envelope after a save (#9)", async () => {
    const fake = await renderForm({ givenName: "Ada" });
    const before = fake.calls("/sdk-context");

    fireEvent.change(givenName(), { target: { value: "Augusta" } });
    await act(async () => fireEvent.click(saveButton()));

    await waitFor(() => expect(fake.calls("/sdk-context")).toBe(before + 1));
  });
});
