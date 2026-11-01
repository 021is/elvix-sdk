"use client";

/**
 * Picking one legal entity for the host: the grant, then `onPick`.
 *
 * A pick is what lets the host's backend read that one entity from elvix by
 * its id (`getElvixLegalEntity` in `@elvix.is/sdk/server`), for one purpose
 * (`invoicing`, or `payouts` with the birth data and the people). A TAP, or a
 * save in "Add a company", records the grant with elvix first, and `onPick`
 * fires with `granted: true` once elvix has it. The pre-selection (the
 * default, or the only entity) grants nothing (0.18, Edvard: no silent
 * sharing): it fires `onPick(entity, { granted: false })`, and the host
 * grants from its own Continue with `useElvixLegalEntityGrant()`. A refused
 * grant is shown on the row with its cause and a retry, and reported to
 * `onResult`.
 */

import { useEffect, useRef, useState } from "react";
import { useElvixContext } from "./elvix-provider";
import { LegalEntityPurpose, type LegalEntityRecord } from "./legal-entity-schema";
import { failureBody, humanizeApiError, jsonInit, send } from "./profile-request";
import { useStableCallback } from "./use-stable-callback";

export type ElvixLegalEntityPickerResult =
  | { ok: true; entityId: string }
  | { ok: false; error: string; message?: string };

/** What `onPick` says beside the entity: whether elvix already holds the grant. */
export type LegalEntityPick = { granted: boolean };

/** The error code a picker reports when its provider has no clientId to grant for. */
export const PICKER_MISSING_CLIENT_ID = "missing_client_id";
/** The grant never reached elvix. */
export const NETWORK = "network";

type PickError = { entityId: string | null; error: string };

type Args = {
  /** The entities the picker offers (already filtered by type). */
  offered: LegalEntityRecord[];
  /** The list has been read (not loading, not failed). */
  ready: boolean;
  selectedId: string | null | undefined;
  purpose: LegalEntityPurpose;
  onPick: (record: LegalEntityRecord, pick: LegalEntityPick) => void;
  onResult?: (result: ElvixLegalEntityPickerResult) => void;
};

/** The one entity to pre-select: the default, else the only one. */
export function autoPickOf(offered: LegalEntityRecord[]): LegalEntityRecord | undefined {
  return offered.find((e) => e.isDefault) ?? (offered.length === 1 ? offered[0] : undefined);
}

/** Records the grant with elvix; `null` on success, else the worded refusal. */
export async function grantLegalEntity(args: {
  baseUrl: string;
  clientId: string;
  entityId: string;
  purpose?: LegalEntityPurpose;
}): Promise<string | null> {
  const app = encodeURIComponent(args.clientId);
  const id = encodeURIComponent(args.entityId);
  const url = `${args.baseUrl}/api/account/apps/${app}/legal-entities/${id}/grant`;
  const body = { purpose: args.purpose ?? LegalEntityPurpose.INVOICING };
  const res = await send(url, jsonInit("POST", body));
  if (res?.ok) return null;
  return res ? humanizeApiError(await failureBody(res), "grant_failed") : NETWORK;
}

export function useLegalEntityPicks(args: Args) {
  const { offered, ready, selectedId, purpose, onPick, onResult } = args;
  const { baseUrl, clientId } = useElvixContext();
  const emitPick = useStableCallback(onPick);
  const emitResult = useStableCallback(onResult);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<PickError | null>(null);
  const autoPicked = useRef(false);

  const pick = useStableCallback(async (record: LegalEntityRecord) => {
    setError(null);
    if (!clientId) {
      setError({ entityId: record.id, error: PICKER_MISSING_CLIENT_ID });
      emitResult({ ok: false, error: PICKER_MISSING_CLIENT_ID });
      return;
    }
    setPendingId(record.id);
    const refused = await grantLegalEntity({ baseUrl, clientId, entityId: record.id, purpose });
    setPendingId(null);
    if (refused) {
      setError({ entityId: record.id, error: refused });
      emitResult({ ok: false, error: "grant_failed", message: refused });
      return;
    }
    emitPick(record, { granted: true });
    emitResult({ ok: true, entityId: record.id });
  });

  // With nothing picked yet, the default (or the only entity) is shown picked,
  // once, so the host's Continue is ready; nothing is shared until a tap or
  // the host's Continue grants it.
  useEffect(() => {
    if (!ready || autoPicked.current) return;
    autoPicked.current = true;
    if (selectedId) return;
    const auto = autoPickOf(offered);
    if (auto) emitPick(auto, { granted: false });
  }, [ready, selectedId, offered, emitPick]);

  return {
    /** Shown as picked: the one being granted, else the host's. */
    pickedId: pendingId ?? selectedId ?? null,
    pendingId,
    error,
    pick: (record: LegalEntityRecord) => void pick(record),
  };
}
