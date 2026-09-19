"use client";

/**
 * State and requests behind `<ElvixLanguages>`: the user's languages, the
 * pane showing, and the add / change-level / remove flows.
 */

import { useCallback, useEffect, useState } from "react";
import { useElvixContext, useElvixRefresh } from "./elvix-provider";
import type { LanguageRecord } from "./language-schema";
import type { LanguageLevel } from "./languages";
import { failureBody, jsonInit, send } from "./profile-request";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { useStableCallback } from "./use-stable-callback";

export type ElvixLanguagesResult =
  | { ok: true; count: number }
  | { ok: false; error: string; message?: string };

export const View = {
  LOADING: "loading",
  EMPTY: "empty",
  LIST: "list",
  LANGUAGE_PICK: "language-pick",
  LEVEL_PICK: "level-pick",
  SAVING: "saving",
  DELETE_CONFIRM: "delete-confirm",
  DELETING: "deleting",
} as const;
export type View = (typeof View)[keyof typeof View];

const DEFAULT_LEVEL: LanguageLevel = "INTERMEDIATE";

const restingView = (count: number): View => (count === 0 ? View.EMPTY : View.LIST);

type Options = {
  onChange?: (languages: LanguageRecord[]) => void;
  onResult?: (result: ElvixLanguagesResult) => void;
};

/** The list, loaded once per origin. `reload` resolves to the fresh list,
 *  or `null` when it could not be read. */
function useLanguageList(baseUrl: string, onLoaded: (list: LanguageRecord[]) => void) {
  const [languages, setLanguages] = useState<LanguageRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const res = await send(`${baseUrl}/api/account/profile/languages`, {
        cache: "no-store",
        signal,
        ...authInit(),
      });
      const body = res?.ok
        ? (unwrapEnvelope(await res.json().catch(() => null)) as { languages?: LanguageRecord[] })
        : null;
      if (signal?.aborted) return null;
      setLoaded(true);
      const list = body?.languages ?? null;
      if (list) {
        setLanguages(list);
        onLoaded(list);
      }
      return list;
    },
    [baseUrl, onLoaded],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  return { languages, loaded, reload };
}

export function useLanguagesEditor({ onChange, onResult }: Options) {
  const { baseUrl } = useElvixContext();
  const refreshContext = useElvixRefresh();
  const emitChange = useStableCallback(onChange);
  const emitResult = useStableCallback(onResult);
  const { languages, loaded, reload } = useLanguageList(baseUrl, emitChange);

  // `null` = no pane chosen yet; the first load picks empty or list.
  const [chosen, setChosen] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const [pickedLevel, setPickedLevel] = useState<LanguageLevel>(DEFAULT_LEVEL);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const view = chosen ?? (loaded ? restingView(languages.length) : View.LOADING);

  const pick = (code: string | null, level: LanguageLevel, id: string | null) => {
    setPickedCode(code);
    setPickedLevel(level);
    setEditingId(id);
  };

  // After a write: this list, and the provider's envelope, so a host reading
  // `useElvixAppContext().user.languages` sees the change too.
  const afterWrite = async () => {
    const list = await reload();
    void refreshContext();
    return list;
  };

  const fail = (code: string, back: View) => {
    setError(code);
    emitResult({ ok: false, error: code });
    setChosen(back);
  };

  /** Adds the picked language, or changes the level of the one being edited. */
  const confirmLevel = async () => {
    if (!pickedCode) return;
    setChosen(View.SAVING);
    const url = `${baseUrl}/api/account/profile/languages`;
    const res = editingId
      ? await send(`${url}?id=${editingId}`, jsonInit("PATCH", { level: pickedLevel }))
      : await send(url, jsonInit("POST", { code: pickedCode, level: pickedLevel }));
    if (!res?.ok) {
      const body = res ? await failureBody(res) : {};
      fail(typeof body.error === "string" ? body.error : "save_failed", View.LEVEL_PICK);
      return;
    }
    const list = await afterWrite();
    emitResult({ ok: true, count: list?.length ?? languages.length + (editingId ? 0 : 1) });
    pick(null, DEFAULT_LEVEL, null);
    setChosen(View.LIST);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    setChosen(View.DELETING);
    const res = await send(`${baseUrl}/api/account/profile/languages?id=${deletingId}`, {
      method: "DELETE",
      ...authInit(),
    });
    if (!res?.ok) {
      fail("delete_failed", View.DELETE_CONFIRM);
      return;
    }
    setDeletingId(null);
    const list = await afterWrite();
    const count = list?.length ?? Math.max(0, languages.length - 1);
    emitResult({ ok: true, count });
    setChosen(restingView(count));
  };

  return {
    view,
    languages,
    error,
    pickedCode,
    pickedLevel,
    editing: editingId !== null,
    deletingRecord: languages.find((l) => l.id === deletingId) ?? null,
    setLevel: setPickedLevel,
    openAdd: () => {
      pick(null, DEFAULT_LEVEL, null);
      setError(null);
      setChosen(View.LANGUAGE_PICK);
    },
    closeAdd: () => {
      pick(null, DEFAULT_LEVEL, null);
      setChosen(restingView(languages.length));
    },
    pickLanguage: (code: string) => {
      pick(code, DEFAULT_LEVEL, null);
      setChosen(View.LEVEL_PICK);
    },
    openEdit: (record: LanguageRecord) => {
      pick(record.code, record.level, record.id);
      setChosen(View.LEVEL_PICK);
    },
    backFromLevel: () => setChosen(editingId ? View.LIST : View.LANGUAGE_PICK),
    confirmLevel,
    askDelete: (id: string) => {
      setDeletingId(id);
      setChosen(View.DELETE_CONFIRM);
    },
    cancelDelete: () => {
      setDeletingId(null);
      setChosen(restingView(languages.length));
    },
    confirmDelete,
  };
}
