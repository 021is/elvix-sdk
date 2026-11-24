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
import { elvixFetch } from "./elvix-fetch";
import { useElvixContext, useElvixRefresh } from "./elvix-provider";
import type { ElvixSaveState } from "./elvix-save-button";
import { safeParseForm } from "./form";
import type { Gender, IdentityInput, IdentityPatchInput, Pronouns } from "./identity-schema";
import { givenNameSchema, identitySchema } from "./identity-schema";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { toast } from "./toast";
import { useSaveShortcut } from "./use-save-shortcut";

export type ElvixIdentityFormResult = { ok: true } | { ok: false; error: string; message?: string };

/** Form values as the inputs hold them; `""` = not set. */
export type IdentityDraft = {
  givenName: string;
  familyName: string;
  /** What others see in the app (0.27); `""` and never sent where the form shows no field. */
  displayName: string;
  birthdate: string;
  gender: Gender | "";
  pronouns: Pronouns | "";
};
type Field = keyof IdentityDraft;
const FIELDS: readonly Field[] = [
  "givenName",
  "familyName",
  "displayName",
  "birthdate",
  "gender",
  "pronouns",
];

/** The identity's rules plus the app's display name, a name like the given one. */
const formSchema = identitySchema.extend({
  displayName: givenNameSchema.optional().nullable(),
});
type FormInput = IdentityInput & { displayName?: string | null };

function toDraft(initial: Partial<IdentityInput>, displayName: string | null): IdentityDraft {
  return {
    givenName: initial.givenName ?? "",
    familyName: initial.familyName ?? "",
    displayName: displayName ?? "",
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
    displayName: d.displayName.trim() === "" ? null : d.displayName,
    birthdate: d.birthdate || null,
    gender: d.gender || null,
    pronouns: d.pronouns || null,
  };
}

/** Only what differs from the baseline; a cleared field is sent as `null`. */
function changedFields(
  next: FormInput,
  baseline: IdentityDraft,
): IdentityPatchInput & { displayName?: string | null } {
  const patch: Record<string, string | null> = {};
  for (const key of FIELDS) {
    const value = next[key] ?? null;
    if ((value ?? "") !== baseline[key]) patch[key] = value;
  }
  return patch as IdentityPatchInput & { displayName?: string | null };
}

/**
 * `displayName` is the app's display name the field starts from (its stored one, else the given
 * name), or `null` where the form shows no such field: elvix's own account has no app to save
 * one on.
 */
export function useIdentityDraft(
  initial: Partial<IdentityInput>,
  displayName: string | null,
  onResult?: (result: ElvixIdentityFormResult) => void,
) {
  const ctx = useElvixContext();
  const refresh = useElvixRefresh();
  const t = useT();
  const [baseline, setBaseline] = useState(() => toDraft(initial, displayName));
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
  const parse = useMemo(() => safeParseForm(formSchema, toInput(draft)), [draft]);
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
      const res = await elvixFetch(`${ctx.baseUrl}/api/account/profile/identity`, {
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
