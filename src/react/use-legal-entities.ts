"use client";

/**
 * State and requests behind `<ElvixLegalEntities>` and the add wizard inside
 * `<ElvixLegalEntityPicker>`: the user's entities, the pane showing, the
 * draft, and every write. Step order comes from `legal-entity-flow.ts`, step
 * data from `legal-entity-payload.ts`, moving between steps from
 * `use-legal-entity-nav.ts`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useElvixContext } from "./elvix-provider";
import { FlowKind, View } from "./legal-entity-flow";
import { draftToEntityInput, prefillFrom } from "./legal-entity-payload";
import type { LegalEntityInput, LegalEntityRecord, LegalEntityType } from "./legal-entity-schema";
import { type Outcome, profileCollection } from "./profile-request";
import { useLegalEntityDraft } from "./use-legal-entity-draft";
import { useLegalEntityNav } from "./use-legal-entity-nav";
import { useStableCallback } from "./use-stable-callback";

export type ElvixLegalEntitiesResult =
  | { ok: true; count: number }
  | { ok: false; error: string; message?: string };

export const ReturnTo = {
  LIST: "list",
  DETAIL: "detail",
} as const;
export type ReturnTo = (typeof ReturnTo)[keyof typeof ReturnTo];

type DefaultIntent = { id: string; setting: boolean; returnTo: ReturnTo };

type Options = {
  onChange?: (entities: LegalEntityRecord[]) => void;
  onResult?: (result: ElvixLegalEntitiesResult) => void;
  /** The types the add wizard offers; all three when omitted. */
  types?: readonly LegalEntityType[];
  /** The entity the add wizard just saved, read back from elvix. */
  onCreated?: (entity: LegalEntityRecord) => void;
  /** The invoice's short add flow, or the full one (the default). */
  kind?: FlowKind;
};

const restingView = (count: number): View => (count === 0 ? View.EMPTY : View.LIST);

/** Sets or clears the default locally, ahead of the server. */
function flipDefault(list: LegalEntityRecord[], { id, setting }: DefaultIntent) {
  return list.map((e) => {
    if (setting) return { ...e, isDefault: e.id === id };
    return e.id === id ? { ...e, isDefault: false } : e;
  });
}

function useEntityList(
  api: ReturnType<typeof profileCollection<LegalEntityRecord, LegalEntityInput>>,
  onLoaded: (list: LegalEntityRecord[]) => void,
) {
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  /** The last read failed: shown, never an empty list that looks like none. */
  const [loadFailed, setLoadFailed] = useState(false);
  /** The list as read, or `null` when it could not be. */
  const refresh = useCallback(
    async (signal?: AbortSignal): Promise<LegalEntityRecord[] | null> => {
      const list = await api.list("", signal);
      if (signal?.aborted) return null;
      setLoading(false);
      setLoadFailed(!list);
      if (!list) return null;
      setEntities(list);
      onLoaded(list);
      return list;
    },
    [api, onLoaded],
  );
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  return { entities, setEntities, loading, loadFailed, refresh };
}

export function useLegalEntities({ onChange, onResult, types, onCreated, kind }: Options) {
  const { baseUrl } = useElvixContext();
  const api = useMemo(
    () => profileCollection<LegalEntityRecord, LegalEntityInput>(baseUrl, "entities"),
    [baseUrl],
  );
  const emitChange = useStableCallback(onChange);
  const emitResult = useStableCallback(onResult);
  const [view, setView] = useState<View>(View.EMPTY);
  const onLoaded = useCallback(
    (list: LegalEntityRecord[]) => {
      emitChange(list);
      setView(restingView(list.length));
    },
    [emitChange],
  );
  const { entities, setEntities, loading, loadFailed, refresh } = useEntityList(api, onLoaded);
  const emitCreated = useStableCallback(onCreated);
  const draftApi = useLegalEntityDraft();
  const { draft } = draftApi;
  const [error, setError] = useState<string | null>(null);
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  /** A detail-view field edit is running through its wizard step. */
  const [editing, setEditing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [defaultIntent, setDefaultIntent] = useState<DefaultIntent | null>(null);
  const count = entities.length;
  const find = (id: string | null | undefined) => entities.find((e) => e.id === id) ?? null;

  const report = (out: Outcome, error: string, okCount: number) => {
    if (!out.ok) setError(out.error);
    emitResult(out.ok ? { ok: true, count: okCount } : { ok: false, error, message: out.error });
  };
  const resetWizard = () => {
    draftApi.reset();
    setEditing(false);
  };

  const exclusive = useOneAtATime();

  const patch = (id: string, partial: Partial<LegalEntityInput>) =>
    exclusive(async () => {
      setView(View.SAVING);
      const out = await api.update(id, partial);
      report(out, "patch_failed", count);
      await refresh();
      resetWizard();
      setView(View.DETAIL);
    });

  /** Saves the draft; a refusal goes back to `from`, the step that saved, and shows there. */
  const commit = (from: View) =>
    exclusive(async () => {
      const input = draftToEntityInput(draft);
      if (!input) return;
      setError(null);
      setView(View.SAVING);
      const known = new Set(entities.map((e) => e.id));
      const out = await api.create(input);
      if (!out.ok) {
        report(out, "save_failed", count);
        setView(from);
        return;
      }
      const list = await refresh();
      report(out, "save_failed", count + 1);
      resetWizard();
      // The one id the list did not hold before is the entity just saved.
      const created = list?.find((e) => !known.has(e.id));
      if (created) emitCreated(created);
    });

  const nav = useLegalEntityNav({
    draftApi,
    types,
    kind,
    editingId: editing ? inspectingId : null,
    setView,
    restingView: () => restingView(count),
    resetWizard,
    patch: (id, partial) => void patch(id, partial),
    commit: (from) => void commit(from),
  });

  return {
    view,
    setView,
    kind: kind ?? FlowKind.FULL,
    loading,
    loadFailed,
    entities,
    error,
    editing,
    draftApi,
    inspecting: find(inspectingId),
    deleting: find(deletingId),
    defaultIntent,
    defaultEntity: find(defaultIntent?.id),
    ...nav,
    /** "No contact details" in the full flow's contact question saves from there. */
    commit: () => void commit(View.CONTACT_CHOICE),
    /** Reads the list again, after a failed read. */
    reload: () => void refresh(),
    openAdd: () => {
      setError(null);
      nav.openAdd();
    },
    openDetail: (id: string) => {
      setInspectingId(id);
      setView(View.DETAIL);
    },
    closeDetail: () => {
      setInspectingId(null);
      resetWizard();
      setView(View.LIST);
    },
    /** Opens one step of the add flow to edit that field of the entity. */
    editStep: (step: View) => {
      const entity = find(inspectingId);
      if (!entity) return;
      draftApi.prefill(prefillFrom(step, entity));
      setEditing(true);
      setView(step);
    },
    askDelete: (id: string) => {
      setDeletingId(id);
      setView(View.DELETE_CONFIRM);
    },
    cancelDelete: () => {
      setDeletingId(null);
      setView(inspectingId ? View.DETAIL : View.LIST);
    },
    confirmDelete: async () => {
      if (!deletingId) return;
      setView(View.DELETING);
      const out = await api.remove(deletingId);
      if (!out.ok) {
        report(out, "delete_failed", count);
        setView(View.DELETE_CONFIRM);
        return;
      }
      setDeletingId(null);
      setInspectingId(null);
      await refresh();
      report(out, "delete_failed", Math.max(0, count - 1));
    },
    askDefault: (id: string, setting: boolean, returnTo: ReturnTo) => {
      setDefaultIntent({ id, setting, returnTo });
      setView(View.DEFAULT_CONFIRM);
    },
    cancelDefault: () => {
      setDefaultIntent(null);
      setView(defaultIntent?.returnTo ?? View.LIST);
    },
    // The warning pane was the confirmation, so the flip is optimistic; a
    // failed PATCH reloads the server's truth.
    confirmDefault: async () => {
      if (!defaultIntent) return;
      setEntities((prev) => flipDefault(prev, defaultIntent));
      setView(defaultIntent.returnTo);
      setDefaultIntent(null);
      const out = await api.update(defaultIntent.id, { isDefault: defaultIntent.setting });
      if (!out.ok) await refresh();
    },
  };
}

/**
 * One save at a time: a second press, or a host's `controls.next()`, while
 * one runs would create the entity twice (0.23 review).
 */
function useOneAtATime(): (job: () => Promise<void>) => Promise<void> {
  const inFlight = useRef(false);
  return useCallback(async (job: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await job();
    } finally {
      inFlight.current = false;
    }
  }, []);
}
