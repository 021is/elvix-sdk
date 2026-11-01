"use client";

/**
 * Picking one legal entity for the host: the grant, then `onPick`.
 *
 * A pick is what lets the host's backend read that one entity from elvix by
 * its id (`getElvixLegalEntity` in `@elvix.is/sdk/server`), so every pick,
 * tapped, pre-selected or just added, first records the grant with elvix,
 * and `onPick` fires only once elvix has it: a host that moved on before
 * would send its backend an id it cannot read. A refused grant is shown on
 * the row with its cause and a retry, and reported to `onResult`.
 */

import { useEffect, useRef, useState } from "react";
import { useElvixContext } from "./elvix-provider";
import type { LegalEntityRecord } from "./legal-entity-schema";
import { failureBody, humanizeApiError, jsonInit, send } from "./profile-request";
import { useStableCallback } from "./use-stable-callback";

export type ElvixLegalEntityPickerResult =
  | { ok: true; entityId: string }
  | { ok: false; error: string; message?: string };

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
  onPick: (record: LegalEntityRecord) => void;
  onResult?: (result: ElvixLegalEntityPickerResult) => void;
};

/** The one entity to pre-select: the default, else the only one. */
export function autoPickOf(offered: LegalEntityRecord[]): LegalEntityRecord | undefined {
  return offered.find((e) => e.isDefault) ?? (offered.length === 1 ? offered[0] : undefined);
}

async function grant(baseUrl: string, clientId: string, entityId: string): Promise<string | null> {
  const app = encodeURIComponent(clientId);
  const url = `${baseUrl}/api/account/apps/${app}/legal-entities/${encodeURIComponent(entityId)}/grant`;
  const res = await send(url, jsonInit("POST", {}));
  if (res?.ok) return null;
  return res ? humanizeApiError(await failureBody(res), "grant_failed") : NETWORK;
}

export function useLegalEntityPicks({ offered, ready, selectedId, onPick, onResult }: Args) {
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
    const refused = await grant(baseUrl, clientId, record.id);
    setPendingId(null);
    if (refused) {
      setError({ entityId: record.id, error: refused });
      emitResult({ ok: false, error: "grant_failed", message: refused });
      return;
    }
    emitPick(record);
    emitResult({ ok: true, entityId: record.id });
  });

  // With nothing picked yet, the default (or the only entity) is, once, so
  // the host's Continue is ready without a tap.
  useEffect(() => {
    if (!ready || autoPicked.current) return;
    autoPicked.current = true;
    if (selectedId) return;
    const auto = autoPickOf(offered);
    if (auto) void pick(auto);
  }, [ready, selectedId, offered, pick]);

  return {
    /** Shown as picked: the one being granted, else the host's. */
    pickedId: pendingId ?? selectedId ?? null,
    pendingId,
    error,
    pick: (record: LegalEntityRecord) => void pick(record),
  };
}
