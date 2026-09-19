// @vitest-environment jsdom
/** `<ElvixAddressBook>`: the wizard reducer, and the manage flows end to end. */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  draftToInput,
  EMPTY_DRAFT,
  INITIAL_WIZARD,
  type PlaceDetails,
  wizardReducer,
} from "../src/react/address-book-wizard";
import { ElvixAddressBook, ElvixProvider } from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const seed: PlaceDetails = {
  placeId: "p1",
  formattedAddress: "1 Main St, Berlin",
  displayName: "",
  line1: "1 Main St",
  city: "Berlin",
  regionName: null,
  regionCode: null,
  postalCode: "10115",
  country: "DE",
  countryName: "Germany",
  latitude: null,
  longitude: null,
  timezone: null,
};

describe("wizardReducer", () => {
  it("walks the business branch and keeps the company as recipient when no contact is given", () => {
    let s = wizardReducer(INITIAL_WIZARD, { type: "placePicked", seed });
    s = wizardReducer(s, { type: "reviewConfirmed" });
    s = wizardReducer(s, { type: "line2Set", line2: "Apt 4" });
    s = wizardReducer(s, { type: "businessStart" });
    s = wizardReducer(s, { type: "companySet", company: "Acme" });
    expect(s.view).toBe("recipient-business-contact");
    s = wizardReducer(s, { type: "recipientSet", recipient: "Acme", company: "Acme" });
    expect(s.view).toBe("note-choice");
    expect(draftToInput("billing", s.draft, "  gate 3 ")).toMatchObject({
      recipientName: "Acme",
      companyName: "Acme",
      line2: "Apt 4",
      deliveryNotes: "gate 3",
      city: "Berlin",
    });
  });

  it("returns a field edit to the detail view with a clean draft", () => {
    let s = wizardReducer(INITIAL_WIZARD, { type: "openDetail", id: "a1" });
    s = wizardReducer(s, { type: "edit", field: "notes", value: "old" });
    expect(s).toMatchObject({ view: "note-input", editing: true });
    expect(s.draft.notes).toBe("old");
    s = wizardReducer(s, { type: "patched", error: null });
    expect(s).toMatchObject({ view: "detail", editing: false, draft: EMPTY_DRAFT });
  });

  it("goes back to where a default change was asked from", () => {
    let s = wizardReducer(INITIAL_WIZARD, {
      type: "askDefault",
      intent: { id: "a1", setting: true, returnTo: "detail" },
    });
    expect(s.view).toBe("default-confirm");
    s = wizardReducer(s, { type: "cancelDefault" });
    expect(s).toMatchObject({ view: "detail", defaultIntent: null });
  });

  it("has nothing to commit before a place is picked", () => {
    expect(draftToInput("shipping", EMPTY_DRAFT, null)).toBeNull();
  });
});

const address = (id: string, isDefault: boolean) => ({
  id,
  kind: "shipping",
  isDefault,
  label: "",
  recipientName: `Ada ${id}`,
  companyName: null,
  line1: `${id} Main St`,
  line2: null,
  city: "Berlin",
  regionName: null,
  regionCode: null,
  postalCode: "10115",
  country: "DE",
  countryName: "Germany",
  deliveryNotes: null,
  timezone: null,
  venueName: null,
});

function mount() {
  const fake = installFakeElvix({ addresses: [address("a1", true), address("a2", false)] });
  const onResult = vi.fn();
  const onChange = vi.fn();
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <ElvixAddressBook kind="shipping" onResult={onResult} onChange={onChange} />
    </ElvixProvider>,
  );
  return { fake, onResult, onChange };
}

describe("ElvixAddressBook", () => {
  it("deletes an address after the confirmation pane", async () => {
    const { fake, onResult } = mount();
    const trash = await screen.findAllByTitle("Delete address");
    fireEvent.click(trash[1] as HTMLElement);
    await act(async () => fireEvent.click(await screen.findByText("Yes, delete")));

    await waitFor(() => expect(screen.queryAllByTitle("Delete address")).toHaveLength(1));
    expect(fake.state.addresses.map((a) => a.id)).toEqual(["a1"]);
    expect(onResult).toHaveBeenCalledWith({ ok: true, count: 1 });
  });

  it("edits one field from the detail view and PATCHes only that field", async () => {
    const { fake, onResult } = mount();
    fireEvent.click(await screen.findByText("Ada a2"));
    fireEvent.click(await screen.findByText("Delivery notes"));
    fireEvent.change(await screen.findByPlaceholderText(/Ring buzzer 3/), {
      target: { value: "Leave at the door" },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Save/ })));

    await screen.findByText("Leave at the door");
    expect(fake.patches).toEqual([{ deliveryNotes: "Leave at the door" }]);
    expect(onResult).toHaveBeenCalledWith({ ok: true, count: 2 });
  });

  it("moves the default optimistically and persists it", async () => {
    const { fake } = mount();
    const stars = await screen.findAllByTitle("Set as default");
    fireEvent.click(stars[0] as HTMLElement);
    // The pane's eyebrow repeats the verb; the confirm is the one in a button.
    const labels = await screen.findAllByText("Set as default");
    const confirm = labels.map((l) => l.closest("button")).find(Boolean) as HTMLElement;
    await act(async () => fireEvent.click(confirm));

    await waitFor(() => expect(fake.patches).toEqual([{ isDefault: true }]));
    expect(fake.state.addresses.find((a) => a.id === "a2")?.isDefault).toBe(true);
    expect(screen.getAllByTitle("Remove default")).toHaveLength(1);
  });
});
