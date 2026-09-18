"use client";

/**
 * `<ElvixIdentityForm>`'s state and save, apart from its markup.
 *
 * The form is ONE draft object compared against ONE baseline (what is on
 * disk), which is what makes the two rules below cheap to keep:
 *   - a save sends only the fields that differ, with a cleared field as
 *     `null` — the server takes a partial patch;
 *   - every error blocking Save is visible: shown once its field was left,
 *     or as soon as anything in the form changed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../locale/use-t";
import { useElvixContext, useElvixRefresh } from "./elvix-provider";
import type { ElvixSaveState } from "./elvix-save-button";
import { safeParseForm } from "./form";
import type { Gender, IdentityInput, IdentityPatchInput, Pronouns } from "./identity-schema";
import { identitySchema } from "./identity-schema";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { toast } from "./toast";
import { useSaveShortcut } from "./use-save-shortcut";

export type ElvixIdentityFormResult = { ok: true } | { ok: false; error: string; message?: string };

/** Form values as the inputs hold them; `""` = not set. */
export type IdentityDraft = {
  givenName: string;
  familyName: string;
  birthdate: string;
  gender: Gender | "";
  pronouns: Pronouns | "";
};
type Field = keyof IdentityDraft;
const FIELDS: readonly Field[] = ["givenName", "familyName", "birthdate", "gender", "pronouns"];

function toDraft(initial: Partial<IdentityInput>): IdentityDraft {
  return {
    givenName: initial.givenName ?? "",
    familyName: initial.familyName ?? "",
    birthdate: initial.birthdate ?? "",
    gender: initial.gender ?? "",
    pronouns: initial.pronouns ?? "",
  };
}

/** The schema's view of a draft: blanks become `null` ("not declared"). */
function toInput(d: IdentityDraft): Record<Field, string | null> {
  return {
    givenName: d.givenName,
    familyName: d.familyName.trim() === "" ? null : d.familyName,
    birthdate: d.birthdate || null,
    gender: d.gender || null,
    pronouns: d.pronouns || null,
  };
}

/** Only what differs from the baseline; a cleared field is sent as `null`. */
function changedFields(next: IdentityInput, baseline: IdentityDraft): IdentityPatchInput {
  const patch: Record<string, string | null> = {};
  for (const key of FIELDS) {
    const value = next[key] ?? null;
    if ((value ?? "") !== baseline[key]) patch[key] = value;
  }
  return patch as IdentityPatchInput;
}

export function useIdentityDraft(
  initial: Partial<IdentityInput>,
  onResult?: (result: ElvixIdentityFormResult) => void,
) {
  const ctx = useElvixContext();
  const refresh = useElvixRefresh();
  const t = useT();
  const [baseline, setBaseline] = useState(() => toDraft(initial));
  const [draft, setDraft] = useState(baseline);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [state, setState] = useState<ElvixSaveState>("idle");

  const setField = useCallback(<K extends Field>(key: K, value: IdentityDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);
  const markTouched = useCallback((key: Field) => {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const dirty = FIELDS.some((k) => draft[k] !== baseline[k]);
  const parse = useMemo(() => safeParseForm(identitySchema, toInput(draft)), [draft]);
  const errorFor = (key: Field) => (touched[key] || dirty ? parse.errors[key] : undefined);

  const fail = useCallback(
    (error: string) => {
      const message = t("identity.errorSaveFailed");
      setState("idle");
      toast.error(message);
      onResult?.({ ok: false, error, message });
    },
    [onResult, t],
  );

  const save = useCallback(async () => {
    setTouched({ givenName: true, familyName: true, birthdate: true, gender: true });
    if (!parse.ok || state === "saving") return;
    setState("saving");
    try {
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/profile/identity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth.headers },
        credentials: auth.credentials,
        body: JSON.stringify(changedFields(parse.data, baseline)),
      });
      const body = unwrapEnvelope(await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !body?.ok) return fail(body?.error ?? "save_failed");
      setBaseline(draft);
      setState("saved");
      // The name is part of every host's `useElvixAppContext()`.
      void refresh();
      onResult?.({ ok: true });
    } catch {
      fail("network_error");
    }
  }, [parse, state, baseline, draft, ctx.baseUrl, fail, refresh, onResult]);

  // Drop "saved" back to "idle" after a brief celebration so the button is
  // usable again for follow-up edits.
  useEffect(() => {
    if (state !== "saved") return;
    const timer = setTimeout(() => setState("idle"), 1400);
    return () => clearTimeout(timer);
  }, [state]);

  useSaveShortcut(save);

  return { draft, setField, markTouched, errorFor, canSave: parse.ok && dirty, state, save };
}
