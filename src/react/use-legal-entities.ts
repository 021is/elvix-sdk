"use client";

/**
 * State and requests behind `<ElvixLegalEntities>`: the user's entities, the
 * pane showing, the draft, and every write. Step order comes from
 * `legal-entity-flow.ts`, step data from `legal-entity-payload.ts`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useElvixContext } from "./elvix-provider";
import { nextView, previousView, View } from "./legal-entity-flow";
import { draftToEntityInput, prefillFrom, stepPatch, stepReady } from "./legal-entity-payload";
import type { LegalEntityInput, LegalEntityRecord, LegalEntityType } from "./legal-entity-schema";
import { type Outcome, profileCollection } from "./profile-request";
import { useLegalEntityDraft } from "./use-legal-entity-draft";
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
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const list = await api.list("", signal);
      if (signal?.aborted) return;
      setLoading(false);
      if (!list) return;
      setEntities(list);
      onLoaded(list);
    },
    [api, onLoaded],
  );
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  return { entities, setEntities, loading, refresh };
}

export function useLegalEntities({ onChange, onResult }: Options) {
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
  const { entities, setEntities, loading, refresh } = useEntityList(api, onLoaded);
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

  const patch = async (id: string, partial: Partial<LegalEntityInput>) => {
    setView(View.SAVING);
    const out = await api.update(id, partial);
    report(out, "patch_failed", count);
    await refresh();
    resetWizard();
    setView(View.DETAIL);
  };

  const commit = async () => {
    const input = draftToEntityInput(draft);
    if (!input) return;
    setError(null);
    setView(View.SAVING);
    const out = await api.create(input);
    if (!out.ok) {
      report(out, "save_failed", count);
      setView(View.CONTACT_CHOICE);
      return;
    }
    await refresh();
    report(out, "save_failed", count + 1);
    resetWizard();
  };

  /** Leaves `step` forwards: PATCHes it when editing, else the next pane. */
  const advance = (step: View) => {
    if (!stepReady(step, draft)) return;
    const next = nextView(step, { type: draft.type, hasVatId: draft.vatId.trim() !== "" });
    const partial = stepPatch(step, draft);
    if (editing && inspectingId && partial && next !== View.VERIFYING_TAX_ID) {
      void patch(inspectingId, partial);
    } else if (next === View.SAVING) {
      void commit();
    } else if (next) {
      setView(next);
    }
  };

  return {
    view,
    setView,
    loading,
    entities,
    error,
    editing,
    draftApi,
    inspecting: find(inspectingId),
    deleting: find(deletingId),
    defaultIntent,
    defaultEntity: find(defaultIntent?.id),
    advance,
    commit: () => void commit(),
    /** Back from an add-flow step; while editing, back to the detail view. */
    back: (step: View) => {
      if (editing) {
        resetWizard();
        setView(View.DETAIL);
        return;
      }
      const previous = previousView(step, draft.type);
      if (!previous) resetWizard();
      setView(previous ?? restingView(count));
    },
    openAdd: () => {
      resetWizard();
      setError(null);
      setView(View.TYPE_CHOICE);
    },
    pickType: (type: LegalEntityType) => {
      draftApi.setField("type", type);
      setView(View.LEGAL_NAME);
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
