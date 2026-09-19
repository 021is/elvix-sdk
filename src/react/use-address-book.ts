"use client";

/**
 * State and requests behind `<ElvixAddressBook>`: the list of one address
 * kind, the wizard reducer, and the handlers whose outcome depends on a
 * request. Plain navigation is a `dispatch` in the component.
 */

import { useCallback, useEffect, useReducer, useState } from "react";
import {
  createAddress,
  deleteAddress,
  listAddresses,
  type Outcome,
  updateAddress,
} from "./address-book-api";
import {
  type DefaultIntent,
  draftToInput,
  INITIAL_WIZARD,
  wizardReducer,
} from "./address-book-wizard";
import type { AddressInput, AddressKind, AddressRecord } from "./address-schema";
import { useElvixContext } from "./elvix-provider";
import { useStableCallback } from "./use-stable-callback";

export type ElvixAddressBookResult =
  | { ok: true; count: number }
  | { ok: false; error: string; message?: string };

type Options = {
  kind: AddressKind;
  onChange?: (addresses: AddressRecord[]) => void;
  onResult?: (result: ElvixAddressBookResult) => void;
};

/** One address kind, loaded when the kind or origin changes and reloaded
 *  on demand after a write. `onLoaded` gets every fresh list. */
function useAddressList(
  baseUrl: string,
  kind: AddressKind,
  onLoaded: (list: AddressRecord[]) => void,
) {
  const [addresses, setAddresses] = useState<AddressRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const list = await listAddresses(baseUrl, kind, signal);
      if (signal?.aborted) return;
      setLoading(false);
      if (!list) return;
      setAddresses(list);
      onLoaded(list);
    },
    [baseUrl, kind, onLoaded],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return { addresses, setAddresses, loading, refresh };
}

/** Sets or clears the default of one kind locally, ahead of the server. */
function flipDefault(list: AddressRecord[], kind: AddressKind, { id, setting }: DefaultIntent) {
  return list.map((a) => {
    if (a.kind !== kind) return a;
    if (setting) return { ...a, isDefault: a.id === id };
    return a.id === id ? { ...a, isDefault: false } : a;
  });
}

export function useAddressBook({ kind, onChange, onResult }: Options) {
  const { baseUrl } = useElvixContext();
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_WIZARD);
  const emitChange = useStableCallback(onChange);
  const emitResult = useStableCallback(onResult);
  const onLoaded = useCallback(
    (list: AddressRecord[]) => {
      emitChange(list);
      dispatch({ type: "loaded", count: list.length });
    },
    [emitChange],
  );
  const { addresses, setAddresses, loading, refresh } = useAddressList(baseUrl, kind, onLoaded);
  const count = addresses.length;
  const { draft, editing, inspectingId, deletingId, defaultIntent } = state;
  const editTarget = editing ? inspectingId : null;

  const report = useCallback(
    (out: Outcome, error: string, okCount: number) =>
      emitResult(out.ok ? { ok: true, count: okCount } : { ok: false, error, message: out.error }),
    [emitResult],
  );

  /** A detail-view field edit: PATCH the one field, back to the detail. */
  const patch = useCallback(
    async (id: string, partial: Partial<AddressInput>) => {
      dispatch({ type: "saving" });
      const out = await updateAddress(baseUrl, id, partial);
      report(out, "patch_failed", count);
      await refresh();
      dispatch({ type: "patched", error: out.ok ? null : out.error });
    },
    [baseUrl, count, refresh, report],
  );

  /** The end of the add flow: POST the assembled address. */
  const commit = useCallback(
    async (notes: string | null) => {
      const input = draftToInput(kind, draft, notes);
      if (!input) return;
      dispatch({ type: "saving" });
      const out = await createAddress(baseUrl, input);
      if (!out.ok) {
        report(out, "save_failed", count);
        dispatch({ type: "saveFailed", message: out.error });
        return;
      }
      dispatch({ type: "saved" });
      await refresh();
      report(out, "save_failed", count + 1);
    },
    [baseUrl, kind, draft, count, refresh, report],
  );

  const confirmLine2 = useCallback(
    (line2: string | null) => {
      if (editTarget) void patch(editTarget, { line2: line2 || null });
      else dispatch({ type: "line2Set", line2: line2 ?? "" });
    },
    [editTarget, patch],
  );

  // A recipient edit changes the name only; it never turns a business
  // address into a personal one, so companyName is left alone.
  const confirmRecipient = useCallback(
    (name: string) => {
      if (editTarget) void patch(editTarget, { recipientName: name });
      else dispatch({ type: "recipientSet", recipient: name, company: "" });
    },
    [editTarget, patch],
  );

  const confirmCompany = useCallback(
    (company: string) => {
      if (editTarget) void patch(editTarget, { companyName: company || null });
      else dispatch({ type: "companySet", company });
    },
    [editTarget, patch],
  );

  // Without a contact name the company is the recipient, so the invoice or
  // parcel is still addressable.
  const confirmContact = useCallback(
    (contact: string | null) =>
      dispatch({
        type: "recipientSet",
        recipient: (contact ?? "").trim() || draft.company,
        company: draft.company,
      }),
    [draft.company],
  );

  const confirmNotes = useCallback(
    (notes: string | null) => {
      if (editTarget) {
        void patch(editTarget, { deliveryNotes: notes?.trim() || null });
        return;
      }
      dispatch({ type: "notesSet", notes });
      void commit(notes);
    },
    [editTarget, patch, commit],
  );

  const confirmDelete = useCallback(async () => {
    if (!deletingId) return;
    dispatch({ type: "deleting" });
    const out = await deleteAddress(baseUrl, deletingId);
    if (!out.ok) {
      emitResult({ ok: false, error: out.error });
      dispatch({ type: "deleteFailed", error: out.error });
      return;
    }
    dispatch({ type: "deleted" });
    await refresh();
    emitResult({ ok: true, count: Math.max(0, count - 1) });
  }, [baseUrl, deletingId, count, refresh, emitResult]);

  // The warning pane was the confirmation, so the flip is optimistic; a
  // failed PATCH reloads the server's truth.
  const confirmDefault = useCallback(async () => {
    if (!defaultIntent) return;
    setAddresses((prev) => flipDefault(prev, kind, defaultIntent));
    dispatch({ type: "defaultApplied" });
    const out = await updateAddress(baseUrl, defaultIntent.id, {
      isDefault: defaultIntent.setting,
    });
    if (!out.ok) await refresh();
  }, [baseUrl, kind, defaultIntent, setAddresses, refresh]);

  const closeWizard = useCallback(() => dispatch({ type: "loaded", count }), [count]);

  return {
    state,
    dispatch,
    addresses,
    loading,
    closeWizard,
    confirmLine2,
    confirmRecipient,
    confirmCompany,
    confirmContact,
    confirmNotes,
    confirmDelete,
    confirmDefault,
  };
}
