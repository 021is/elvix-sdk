"use client";

/**
 * `<ElvixIdentityForm />` — identity form for the elvix Profile SDK.
 *
 * Renders inside `<ElvixCard />`. Captures the core "who are you"
 * fields every elvix-powered app reads when it first onboards a user:
 *
 *   • given name + family name
 *   • date of birth
 *   • gender (4-way enum)
 *   • pronouns (optional, opt-in)
 *
 * Renamed from `<BasicInfoForm>` on 2026-05-20 so the SDK surface
 * reads as "Identity" — single cross-app source of truth.
 *
 * UX:
 *   • Strict client-side zod validation. Save disabled until valid.
 *   • Enter submits (native form behaviour) — `<ElvixSaveButton>`
 *     shows an Enter kbd chip so the keyboard path is discoverable.
 *   • Cmd/Ctrl+S also submits (via `useSaveShortcut`).
 *   • Save button transitions idle → saving → saved → idle so the
 *     user gets a confirmation flash without a toast.
 *   • Save errors surface as a toast (loud); success stays silent.
 */

import { ElvixChipGroup } from "./elvix-chip-group";
import { ElvixDateInput } from "./elvix-date-input";
import { ElvixInput } from "./elvix-input";
import { ElvixSaveButton, type ElvixSaveState } from "./elvix-save-button";
import { useElvixContext } from "./elvix-provider";
import { authInit } from "./session";
import { useSaveShortcut } from "./use-save-shortcut";
import { safeParseForm } from "./form";
import {
  GENDER_VALUES,
  type Gender,
  type IdentityInput,
  PRONOUN_VALUES,
  type Pronouns,
  identitySchema,
} from "./identity-schema";
import { unwrapEnvelope } from "./spine-fetch";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../locale/use-t";
import { toast } from "./toast";

// Pills are content-sized + flex-wrap, so labels can be their full
// natural length without breaking layout. Translations safe — long
// German/French strings just push chips onto a second line.
// Option labels are built per-render via t() inside the component
// so they pick up the active locale.

export type ElvixIdentityFormResult =
  | { ok: true }
  | { ok: false; error: string; message?: string };

export function ElvixIdentityForm({
  initial,
  onResult,
}: {
  /**
   * Pre-loaded identity fields. Optional — when omitted, the SDK
   * fetches `/api/account/profile/identity` on mount so the
   * customer doesn't have to thread server-side state in.
   */
  initial?: Partial<IdentityInput>;
  /** Fires on every terminal save outcome. Safe payload: no PII —
   *  identity edits are saved, not echoed back to the host. */
  onResult?: (result: ElvixIdentityFormResult) => void;
}) {
  const ctx = useElvixContext();
  const t = useT();
  const [hydrated, setHydrated] = useState<Partial<IdentityInput> | null>(
    initial ?? null,
  );

  useEffect(() => {
    if (initial !== undefined) return;
    let aborted = false;
    fetch(`${ctx.baseUrl}/api/account/profile/identity`, { cache: "no-store", ...authInit() })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (aborted || !body) return;
        const envelope = unwrapEnvelope(body) as
          | { ok: true; identity?: Partial<IdentityInput> }
          | { ok: false };
        if (envelope.ok && envelope.identity) setHydrated(envelope.identity);
      })
      .catch(() => {});
    return () => {
      aborted = true;
    };
  }, [initial, ctx.baseUrl]);

  if (!hydrated) {
    return (
      <div className="w-full h-48 grid place-items-center text-[12.5px] text-fg-3">
        {t("common.loading")}
      </div>
    );
  }
  return <ElvixIdentityFormInner initial={hydrated} onResult={onResult} />;
}

function ElvixIdentityFormInner({
  initial,
  onResult,
}: {
  initial: Partial<IdentityInput>;
  onResult?: (result: ElvixIdentityFormResult) => void;
}) {
  const ctx = useElvixContext();
  const t = useT();
  const [givenName, setGivenName] = useState(initial.givenName ?? "");
  const [familyName, setFamilyName] = useState(initial.familyName ?? "");
  const [birthdate, setBirthdate] = useState(initial.birthdate ?? "");
  const [gender, setGender] = useState<Gender | "">((initial.gender as Gender | undefined) ?? "");
  const [pronouns, setPronouns] = useState<Pronouns | "">(
    (initial.pronouns as Pronouns | undefined) ?? "",
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [state, setState] = useState<ElvixSaveState>("idle");

  const GENDER_OPTIONS = useMemo(
    () => [
      { value: "male" as Gender, label: t("identity.genderMale") },
      { value: "female" as Gender, label: t("identity.genderFemale") },
      { value: "non_binary" as Gender, label: t("identity.genderNonBinary") },
      { value: "prefer_not_to_say" as Gender, label: t("identity.genderPreferNotToSay") },
    ],
    [t],
  );

  const PRONOUN_OPTIONS = useMemo(
    () => [
      { value: "she_her" as Pronouns, label: t("identity.pronounSheHer") },
      { value: "he_him" as Pronouns, label: t("identity.pronounHeHim") },
      { value: "they_them" as Pronouns, label: t("identity.pronounTheyThem") },
      { value: "other" as Pronouns, label: t("identity.pronounOther") },
      { value: "prefer_not_to_say" as Pronouns, label: t("identity.pronounPreferNotToSay") },
    ],
    [t],
  );

  // Baseline snapshot of "what's already on disk." Save button stays
  // disabled until at least one field diverges from the baseline.
  // After a successful save we refresh the baseline so the button
  // re-disables itself — no point saving the same data twice.
  const [baseline, setBaseline] = useState(() => ({
    givenName: initial.givenName ?? "",
    familyName: initial.familyName ?? "",
    birthdate: initial.birthdate ?? "",
    gender: ((initial.gender as Gender | undefined) ?? "") as Gender | "",
    pronouns: ((initial.pronouns as Pronouns | undefined) ?? "") as Pronouns | "",
  }));

  const dirty =
    givenName !== baseline.givenName ||
    familyName !== baseline.familyName ||
    birthdate !== baseline.birthdate ||
    gender !== baseline.gender ||
    pronouns !== baseline.pronouns;

  const parse = useMemo(
    () =>
      safeParseForm(identitySchema, {
        givenName,
        familyName,
        birthdate,
        gender,
        // Empty string is "not declared" — coerce to null so the
        // optional/nullable schema branch accepts it.
        pronouns: pronouns === "" ? null : pronouns,
      }),
    [givenName, familyName, birthdate, gender, pronouns],
  );

  const errs = parse.errors;

  function show(field: string) {
    return touched[field] ? errs[field] : undefined;
  }
  function markTouched(field: string) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  const doSave = useCallback(async () => {
    setTouched({
      givenName: true,
      familyName: true,
      birthdate: true,
      gender: true,
    });
    if (!parse.ok) return;
    if (state === "saving") return;

    setState("saving");
    try {
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/profile/identity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth.headers },
        credentials: auth.credentials,
        body: JSON.stringify(parse.data),
      });
      const body = unwrapEnvelope(await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !body?.ok) {
        setState("idle");
        toast.error(body?.error ?? t("identity.errorSaveFailed"));
        onResult?.({
          ok: false,
          error: body?.error ?? "save_failed",
          message: t("identity.errorSaveFailed"),
        });
        return;
      }
      setBaseline({
        givenName: parse.data.givenName,
        familyName: parse.data.familyName,
        birthdate: parse.data.birthdate,
        gender: parse.data.gender,
        pronouns: (parse.data.pronouns ?? "") as Pronouns | "",
      });
      setState("saved");
      onResult?.({ ok: true });
      // Intentionally NOT calling router.refresh() — the form's
      // local state already reflects the saved values, and a refresh
      // would re-mount the AccountStage and re-trigger the
      // typewriter animation. The PATCH already revalidates the
      // SSR caches for `/account/*` so the next navigation is fresh.
    } catch {
      setState("idle");
      toast.error(t("identity.errorSaveFailed"));
      onResult?.({ ok: false, error: "network_error", message: t("identity.errorSaveFailed") });
    }
  }, [parse, state, onResult, ctx.baseUrl, t]);

  // Drop "saved" back to "idle" after a brief celebration so the
  // button is usable again for follow-up edits.
  useEffect(() => {
    if (state !== "saved") return;
    const t = setTimeout(() => setState("idle"), 1400);
    return () => clearTimeout(t);
  }, [state]);

  useSaveShortcut(doSave);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        doSave();
      }}
      className="space-y-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t("identity.givenName")} error={show("givenName")}>
          <ElvixInput
            type="text"
            value={givenName}
            onChange={(e) => setGivenName(e.target.value)}
            onBlur={() => markTouched("givenName")}
            autoComplete="given-name"
            placeholder={t("identity.givenNamePlaceholder")}
            maxLength={80}
            hasError={Boolean(show("givenName"))}
          />
        </Field>
        <Field label={t("identity.familyName")} error={show("familyName")}>
          <ElvixInput
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            onBlur={() => markTouched("familyName")}
            autoComplete="family-name"
            placeholder={t("identity.familyNamePlaceholder")}
            maxLength={80}
            hasError={Boolean(show("familyName"))}
          />
        </Field>
      </div>

      <Field label={t("identity.birthdate")} error={show("birthdate")}>
        <ElvixDateInput
          value={birthdate}
          onChange={(v) => setBirthdate(v)}
          onBlur={() => markTouched("birthdate")}
          hasError={Boolean(show("birthdate"))}
        />
      </Field>

      <Field label={t("identity.gender")} error={show("gender")}>
        <ElvixChipGroup
          variant="pills"
          options={GENDER_OPTIONS}
          value={gender}
          onChange={(v) => {
            setGender(v);
            markTouched("gender");
          }}
        />
      </Field>

      <Field label={t("identity.pronounsOptional")} error={undefined}>
        <ElvixChipGroup
          variant="pills"
          options={PRONOUN_OPTIONS}
          value={pronouns}
          onChange={(v) => setPronouns(v)}
        />
      </Field>

      <div className="pt-1">
        <ElvixSaveButton state={state} disabled={!parse.ok || !dirty} onClick={doSave} />
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-fg-2 mb-1.5">{label}</span>
      {children}
      {error ? (
        <span className="block mt-1 text-[12px] text-red-600 dark:text-red-400">{error}</span>
      ) : null}
    </label>
  );
}

// Re-export enums from the schema so SDK consumers can
// `import { Gender, Pronouns } from "@elvix.is/sdk/react"`
// without reaching into the schema module directly.
export type { Gender, Pronouns } from "./identity-schema";

// Reference the enums so tree-shaking doesn't drop them; the chip
// options use them implicitly via the const objects above.
void GENDER_VALUES;
void PRONOUN_VALUES;
