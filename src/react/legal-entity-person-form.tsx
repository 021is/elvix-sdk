"use client";

/**
 * One person of a business, added or edited inline in its detail view: the
 * role first (an owner also gives their share), the name, then what a
 * payment provider checks. Everything after the name is optional here and
 * can be completed later; inside an app the personal fields open empty and
 * are write-only (`personInputFrom` leaves an empty field untouched).
 */

import { useState } from "react";
import { useT } from "../locale/use-t";
import { ElvixCountrySelect } from "./elvix-country-select";
import { ElvixSaveButton, ElvixSaveRow, ElvixSaveState } from "./elvix-save-button";
import { FormField } from "./legal-entity-form-field";
import {
  PERSON_ROLES,
  type PersonDraft,
  type PersonProblem,
  PersonRole,
  personProblem,
} from "./legal-entity-person";
import { STACK_3 } from "./pane-layout";

export const ROLE_KEY: Record<PersonRole, string> = {
  representative: "legalEntities.personRoleRepresentative",
  owner: "legalEntities.personRoleOwner",
  director: "legalEntities.personRoleDirector",
  executive: "legalEntities.personRoleExecutive",
};

const PROBLEM_KEY: Record<PersonProblem, string> = {
  name: "legalEntities.personNameRequired",
  ownership: "legalEntities.personOwnershipInvalid",
  email: "legalEntities.contactEmailInvalid",
  date: "legalEntities.personDateInvalid",
};

type SetField = <K extends keyof PersonDraft>(k: K, v: PersonDraft[K]) => void;

export function PersonForm(props: {
  initial: PersonDraft;
  withheld: boolean;
  onSave: (draft: PersonDraft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const t = useT();
  const [d, setD] = useState(props.initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set: SetField = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const problem = personProblem(d);
  const save = async () => {
    if (problem || saving) return;
    setSaving(true);
    setError(await props.onSave(d));
    setSaving(false);
  };
  const message = error ?? (problem ? t(PROBLEM_KEY[problem]) : null);
  return (
    <form
      className={`elvix-tile ${STACK_3} px-3.5 py-3`}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <RolePicker value={d.role} onChange={(r) => set("role", r)} />
      <PersonFields d={d} set={set} withheld={props.withheld} />
      {message && (
        <p role="alert" className="text-[12px] text-red-600 dark:text-red-300">
          {message}
        </p>
      )}
      <ElvixSaveRow
        leading={
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 hover:text-fg-1 cursor-pointer"
          >
            {t("common.cancel")}
          </button>
        }
      >
        <ElvixSaveButton
          state={saving ? ElvixSaveState.SAVING : ElvixSaveState.IDLE}
          disabled={Boolean(problem) || saving}
          onClick={() => void save()}
          label={t("legalEntities.personSaveCta")}
          savedLabel={t("common.saved")}
          hint={null}
          className="!w-auto !px-5"
        />
      </ElvixSaveRow>
    </form>
  );
}

/** The person's fields after the role. A withheld field says where its value is shown. */
function PersonFields({ d, set, withheld }: { d: PersonDraft; set: SetField; withheld: boolean }) {
  const t = useT();
  const hint = withheld ? t("legalEntities.withheldInApps") : undefined;
  const field = (label: string, key: keyof PersonDraft, extra: Partial<FieldExtra> = {}) => (
    <FormField
      label={t(label)}
      value={String(d[key])}
      onChange={(v) => set(key, v)}
      maxLength={extra.maxLength ?? 120}
      type={extra.type}
      hint={extra.personal ? hint : undefined}
    />
  );
  return (
    <>
      {d.role === PersonRole.OWNER &&
        field("legalEntities.personOwnershipLabel", "ownershipPercent", { maxLength: 6 })}
      {field("legalEntities.givenNameLabel", "givenName")}
      {field("legalEntities.familyNameLabel", "familyName")}
      {field("legalEntities.personTitleLabel", "title")}
      {field("legalEntities.dobTitle", "dateOfBirth", { type: "date", personal: true })}
      <CountryField
        label={t("legalEntities.detailNationality")}
        value={d.nationality}
        onChange={(v) => set("nationality", v)}
      />
      {field("legalEntities.contactEmailLabel", "email", { type: "email", personal: true })}
      {field("legalEntities.contactPhoneLabel", "phone", { type: "tel", personal: true })}
      {field("legalEntities.detailStreet", "addressLine1", { personal: true })}
      {field("legalEntities.detailPostalCode", "addressPostalCode", { maxLength: 40 })}
      {field("legalEntities.detailCity", "addressCity", { maxLength: 140 })}
      <CountryField
        label={t("legalEntities.detailCountry")}
        value={d.addressCountry}
        onChange={(v) => set("addressCountry", v)}
      />
    </>
  );
}

type FieldExtra = { maxLength: number; type: string; personal: boolean };

function RolePicker({ value, onChange }: { value: PersonRole; onChange: (r: PersonRole) => void }) {
  const t = useT();
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="mb-1.5 text-[13px] font-medium text-fg-2">
        {t("legalEntities.personRoleLabel")}
      </legend>
      {PERSON_ROLES.map((role) => (
        <button
          key={role}
          type="button"
          aria-pressed={value === role}
          onClick={() => onChange(role)}
          className="elvix-row px-3 py-1.5 text-[12.5px] font-medium text-fg-1 cursor-pointer aria-pressed:bg-[var(--elvix-picked)] aria-pressed:text-[var(--elvix-picked-text)]"
        >
          {t(ROLE_KEY[role])}
        </button>
      ))}
    </fieldset>
  );
}

function CountryField(props: { label: string; value: string; onChange: (code: string) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{props.label}</span>
      <ElvixCountrySelect value={props.value || null} onChange={props.onChange} />
    </div>
  );
}
