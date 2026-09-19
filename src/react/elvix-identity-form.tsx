"use client";

/**
 * `<ElvixIdentityForm />` — identity form for the elvix Profile SDK.
 *
 * Renders inside `<ElvixCard />`. Captures the core "who are you"
 * fields every elvix-powered app reads when it first onboards a user:
 *
 *   • given name (required)
 *   • family name, date of birth, gender (4-way enum), pronouns — all
 *     optional and labelled so
 *
 * Renamed from `<BasicInfoForm>` on 2026-05-20 so the SDK surface
 * reads as "Identity" — single cross-app source of truth.
 *
 * UX:
 *   • Client-side zod validation. Save disabled until something changed
 *     and the form is valid — and whenever it is disabled by an invalid
 *     field, that field's error is on screen (errors show once a field
 *     is touched OR anything in the form changed).
 *   • Saves only the fields that changed; clearing an optional field
 *     sends `null`, which clears it on the server.
 *   • Enter submits (native form behaviour) — `<ElvixSaveButton>`
 *     shows an Enter kbd chip so the keyboard path is discoverable.
 *   • Cmd/Ctrl+S also submits (via `useSaveShortcut`).
 *   • Save button transitions idle → saving → saved → idle so the
 *     user gets a confirmation flash without a toast.
 *   • Save errors surface as a toast (loud); success stays silent.
 *
 * State and save live in `useIdentityDraft`; this file is the markup.
 */

import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { useT } from "../locale/use-t";
import { MaybeCard } from "./elvix-card";
import { ElvixChipGroup } from "./elvix-chip-group";
import { ElvixDateInput } from "./elvix-date-input";
import { ElvixInput } from "./elvix-input";
import { useElvixContext } from "./elvix-provider";
import { ElvixSaveButton } from "./elvix-save-button";
import type { Gender, IdentityInput, Pronouns } from "./identity-schema";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { type ElvixIdentityFormResult, useIdentityDraft } from "./use-identity-draft";

export type { ElvixIdentityFormResult } from "./use-identity-draft";

export function ElvixIdentityForm({
  initial,
  onResult,
  card,
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
  /** Render inside an <ElvixCard>. Default true; pass false for bare. */
  card?: boolean;
}) {
  const ctx = useElvixContext();
  const t = useT();
  const [hydrated, setHydrated] = useState<Partial<IdentityInput> | null>(initial ?? null);

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

  // Self-wrap in <ElvixCard> so the form ships its own chrome, consistent
  // with ElvixRegion / ElvixLanguages / ElvixAddressBook (which all self-wrap).
  return (
    <MaybeCard card={card} className="h-full">
      {!hydrated ? (
        <div className="w-full h-48 grid place-items-center text-[12.5px] text-fg-3">
          {t("common.loading")}
        </div>
      ) : (
        <ElvixIdentityFormInner initial={hydrated} onResult={onResult} />
      )}
    </MaybeCard>
  );
}

// Pills are content-sized + flex-wrap, so labels can be their full natural
// length without breaking layout (long German/French strings wrap). Built per
// render via t() so they follow the active locale.
function useChipOptions() {
  const t = useT();
  return useMemo(
    () => ({
      gender: [
        { value: "male" as Gender, label: t("identity.genderMale") },
        { value: "female" as Gender, label: t("identity.genderFemale") },
        { value: "non_binary" as Gender, label: t("identity.genderNonBinary") },
        { value: "prefer_not_to_say" as Gender, label: t("identity.genderPreferNotToSay") },
      ],
      pronouns: [
        { value: "she_her" as Pronouns, label: t("identity.pronounSheHer") },
        { value: "he_him" as Pronouns, label: t("identity.pronounHeHim") },
        { value: "they_them" as Pronouns, label: t("identity.pronounTheyThem") },
        { value: "other" as Pronouns, label: t("identity.pronounOther") },
        { value: "prefer_not_to_say" as Pronouns, label: t("identity.pronounPreferNotToSay") },
      ],
    }),
    [t],
  );
}

function ElvixIdentityFormInner({
  initial,
  onResult,
}: {
  initial: Partial<IdentityInput>;
  onResult?: (result: ElvixIdentityFormResult) => void;
}) {
  const t = useT();
  const options = useChipOptions();
  const { draft, setField, markTouched, errorFor, canSave, state, save } = useIdentityDraft(
    initial,
    onResult,
  );
  // Only the given name is required; every other label says so.
  const optional = (key: string) => `${t(key)}${t("common.optionalSuffix")}`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t("identity.givenName")} error={errorFor("givenName")}>
          {(a11y) => (
            <ElvixInput
              {...a11y}
              type="text"
              value={draft.givenName}
              onChange={(e) => setField("givenName", e.target.value)}
              onBlur={() => markTouched("givenName")}
              required
              aria-required
              autoComplete="given-name"
              placeholder={t("identity.givenNamePlaceholder")}
              maxLength={80}
              hasError={Boolean(errorFor("givenName"))}
            />
          )}
        </Field>
        <Field label={optional("identity.familyName")} error={errorFor("familyName")}>
          {(a11y) => (
            <ElvixInput
              {...a11y}
              type="text"
              value={draft.familyName}
              onChange={(e) => setField("familyName", e.target.value)}
              onBlur={() => markTouched("familyName")}
              autoComplete="family-name"
              placeholder={t("identity.familyNamePlaceholder")}
              maxLength={80}
              hasError={Boolean(errorFor("familyName"))}
            />
          )}
        </Field>
      </div>

      <Field label={optional("identity.birthdate")} error={errorFor("birthdate")}>
        {(a11y) => (
          <ElvixDateInput
            {...a11y}
            value={draft.birthdate}
            onChange={(v) => setField("birthdate", v)}
            onBlur={() => markTouched("birthdate")}
            hasError={Boolean(errorFor("birthdate"))}
          />
        )}
      </Field>

      <div>
        <ElvixChipGroup
          legend={optional("identity.gender")}
          legendClassName={LABEL_CLASS}
          variant="pills"
          options={options.gender}
          value={draft.gender}
          onChange={(v) => {
            setField("gender", v);
            markTouched("gender");
          }}
        />
        <FieldError error={errorFor("gender")} />
      </div>

      <ElvixChipGroup
        legend={t("identity.pronounsOptional")}
        legendClassName={LABEL_CLASS}
        variant="pills"
        options={options.pronouns}
        value={draft.pronouns}
        onChange={(v) => setField("pronouns", v)}
      />

      <div className="pt-1">
        <ElvixSaveButton state={state} disabled={!canSave} onClick={save} />
      </div>
    </form>
  );
}

const LABEL_CLASS = "block text-[13px] font-medium text-fg-2 mb-1.5";

type FieldA11y = { id: string; "aria-invalid": boolean; "aria-describedby"?: string };

/** A labelled single control: the label names it (`htmlFor`), and the error
 *  is announced with it (`aria-describedby`). The control spreads `a11y`. */
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: string | undefined;
  children: (a11y: FieldA11y) => ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": error ? errorId : undefined,
      })}
      <FieldError id={errorId} error={error} />
    </div>
  );
}

function FieldError({ id, error }: { id?: string; error: string | undefined }) {
  if (!error) return null;
  return (
    <span id={id} className="block mt-1 text-[12px] text-red-600 dark:text-red-400">
      {error}
    </span>
  );
}

// Re-export the enums so SDK consumers can
// `import type { Gender, Pronouns } from "@elvix.is/sdk/react"`
// without reaching into the schema module directly.
export type { Gender, Pronouns } from "./identity-schema";
