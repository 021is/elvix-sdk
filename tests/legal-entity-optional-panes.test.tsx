// @vitest-environment jsdom
/**
 * The panes an entity may leave empty (0.18): birth date, registration and
 * the invoice email say "Skip" while empty, the flow's last pane saves and
 * shows a refused save, and a refusal returns to the pane that saved.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowKind, View } from "../src/react/legal-entity-flow";
import { InvoiceEmailView } from "../src/react/legal-entity-invoice-email-view";
import { registrationPaneState } from "../src/react/legal-entity-registration-view";
import { DateView } from "../src/react/legal-entity-wizard-views";
import { useLegalEntityDraft } from "../src/react/use-legal-entity-draft";
import { useLegalEntityNav } from "../src/react/use-legal-entity-nav";

afterEach(cleanup);

const button = (name: string) => screen.getByText(name).closest("button") as HTMLButtonElement;

describe("panes that may be skipped", () => {
  it("an optional birth date continues empty, as Skip", () => {
    const onConfirm = vi.fn();
    const props = { title: "Born", subtitle: "", label: "Born", onChange: () => {} };
    render(<DateView {...props} value="" onConfirm={onConfirm} onBack={() => {}} optional />);
    fireEvent.click(button("Skip"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("a required birth date does not", () => {
    const props = { title: "Born", subtitle: "", label: "Born", onChange: () => {} };
    render(<DateView {...props} value="" onConfirm={() => {}} onBack={() => {}} />);
    expect(button("Continue").disabled).toBe(true);
  });

  it("registration: empty is valid, a given number must match its format", () => {
    const empty = { country: "ZZ", number: "", body: "", since: "" };
    expect(registrationPaneState(empty)).toMatchObject({ empty: true, valid: true });
    expect(registrationPaneState({ ...empty, number: "AB" }).valid).toBe(false);
    expect(registrationPaneState({ ...empty, number: "ABC123" })).toMatchObject({
      empty: false,
      valid: true,
    });
    expect(registrationPaneState({ ...empty, since: "2999-01-01" }).valid).toBe(false);
  });
});

describe("the invoice email pane", () => {
  const mount = (value: string, last: boolean, error: string | null = null) => {
    const onConfirm = vi.fn();
    render(
      <InvoiceEmailView
        value={value}
        onChange={() => {}}
        onConfirm={onConfirm}
        onBack={() => {}}
        last={last}
        error={error}
      />,
    );
    return onConfirm;
  };

  it("skips while empty, continues with an address", () => {
    const skipped = mount("", false);
    fireEvent.click(button("Skip"));
    expect(skipped).toHaveBeenCalledTimes(1);
    cleanup();
    const confirmed = mount("billing@example.com", false);
    fireEvent.click(button("Continue"));
    expect(confirmed).toHaveBeenCalledTimes(1);
  });

  it("never continues with a malformed address", () => {
    mount("billing@", false);
    expect(button("Continue").disabled).toBe(true);
    expect(screen.getByText("Enter a valid email or leave blank.")).toBeTruthy();
  });

  it("as the last pane it saves, and shows a refused save", () => {
    mount("", true, "Something went wrong");
    expect(button("Save entity")).toBeTruthy();
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });
});

function useNav(kind: FlowKind, commit: (from: View) => void) {
  const draftApi = useLegalEntityDraft();
  const nav = useLegalEntityNav({
    draftApi,
    types: undefined,
    kind,
    editingId: null,
    setView: () => {},
    restingView: () => View.EMPTY,
    resetWizard: () => {},
    patch: () => {},
    commit,
  });
  return { draftApi, nav };
}

describe("saving from the flow's last pane", () => {
  it("the invoice flow saves from the invoice email of an individual, and returns there", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useNav(FlowKind.INVOICING, commit));
    act(() => result.current.draftApi.setField("type", "individual"));
    expect(result.current.nav.isLast(View.INVOICE_EMAIL)).toBe(true);
    act(() => result.current.nav.advance(View.INVOICE_EMAIL));
    expect(commit).toHaveBeenCalledWith(View.INVOICE_EMAIL);
  });

  it("a business's invoice flow saves from its e-invoice address", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useNav(FlowKind.INVOICING, commit));
    act(() => result.current.draftApi.setField("type", "company"));
    expect(result.current.nav.isLast(View.INVOICE_EMAIL)).toBe(false);
    expect(result.current.nav.isLast(View.E_INVOICE)).toBe(true);
    act(() => result.current.nav.advance(View.E_INVOICE));
    expect(commit).toHaveBeenCalledWith(View.E_INVOICE);
  });

  it("the full flow's contact form returns a refusal to its question, which shows it", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useNav(FlowKind.FULL, commit));
    act(() => result.current.draftApi.setField("type", "company"));
    expect(result.current.nav.isLast(View.E_INVOICE)).toBe(false);
    act(() => result.current.nav.advance(View.CONTACT_INPUT));
    expect(commit).toHaveBeenCalledWith(View.CONTACT_CHOICE);
  });
});
