"use client";

/**
 * The detail view's "People" section for a sole proprietor or company
 * (0.18): its representative, owners, directors and executives, each added,
 * edited or removed inline. A removal asks first; every failure stays on
 * screen with its cause.
 */

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useT } from "../locale/use-t";
import {
  emptyPerson,
  type LegalEntityPerson,
  type PersonDraft,
  personDraftFrom,
  personInputFrom,
} from "./legal-entity-person";
import { PersonForm, ROLE_KEY } from "./legal-entity-person-form";
import { DetailSection } from "./legal-entity-primitives";
import { useLegalEntityPeople } from "./use-legal-entity-people";

const Kind = { NEW: "new", EDIT: "edit" } as const;
type Editing = { kind: typeof Kind.NEW } | { kind: typeof Kind.EDIT; person: LegalEntityPerson };

export function PeopleSection({ entityId, withheld }: { entityId: string; withheld: boolean }) {
  const t = useT();
  const people = useLegalEntityPeople(entityId);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => setEditing(null);

  const save = async (draft: PersonDraft): Promise<string | null> => {
    const input = personInputFrom(draft);
    const out =
      editing?.kind === Kind.EDIT
        ? await people.update(editing.person.id, input)
        : await people.add(input);
    if (!out.ok) return out.error;
    close();
    return null;
  };
  const remove = async (id: string) => {
    const out = await people.remove(id);
    setRemoving(null);
    setError(out.ok ? null : out.error);
  };

  return (
    <DetailSection title={t("legalEntities.detailSectionPeople")}>
      {people.loadFailed && (
        <button
          type="button"
          onClick={people.reload}
          className="w-full px-3.5 py-2.5 text-left text-[12.5px] text-red-600 dark:text-red-300 cursor-pointer"
        >
          {t("legalEntities.peopleLoadFailed")}
        </button>
      )}
      {people.people.map((p) =>
        editing?.kind === Kind.EDIT && editing.person.id === p.id ? (
          <PersonForm
            key={p.id}
            initial={personDraftFrom(p)}
            withheld={Boolean(p.withheld)}
            onSave={save}
            onCancel={close}
          />
        ) : (
          <PersonRow
            key={p.id}
            person={p}
            confirming={removing === p.id}
            onOpen={() => setEditing({ kind: Kind.EDIT, person: p })}
            onAskRemove={() => setRemoving(p.id)}
            onRemove={() => void remove(p.id)}
            onKeep={() => setRemoving(null)}
          />
        ),
      )}
      {editing?.kind === Kind.NEW ? (
        <PersonForm initial={emptyPerson()} withheld={withheld} onSave={save} onCancel={close} />
      ) : (
        <AddPersonButton onAdd={() => setEditing({ kind: Kind.NEW })} />
      )}
      {error && (
        <p role="alert" className="px-3.5 py-2 text-[12px] text-red-600 dark:text-red-300">
          {error}
        </p>
      )}
    </DetailSection>
  );
}

function AddPersonButton({ onAdd }: { onAdd: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex w-full items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium text-fg-2 hover:text-[var(--elvix-primary)] cursor-pointer"
    >
      <Plus className="size-4" />
      {t("legalEntities.addPersonCta")}
    </button>
  );
}

function PersonRow(props: {
  person: LegalEntityPerson;
  confirming: boolean;
  onOpen: () => void;
  onAskRemove: () => void;
  onRemove: () => void;
  onKeep: () => void;
}) {
  const t = useT();
  const p = props.person;
  const name = `${p.givenName} ${p.familyName}`;
  const share = p.ownershipPercent !== null ? ` · ${p.ownershipPercent} %` : "";
  if (props.confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 text-[12.5px]">
        <span className="flex-1 text-fg-2">{t("legalEntities.removePersonConfirm", { name })}</span>
        <button
          type="button"
          onClick={props.onKeep}
          className="rounded-md px-2 py-1 text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={props.onRemove}
          className="rounded-md px-2 py-1 font-medium text-red-600 hover:bg-red-500/10 cursor-pointer"
        >
          {t("common.delete")}
        </button>
      </div>
    );
  }
  return (
    <div className="group flex items-center gap-2">
      <button
        type="button"
        onClick={props.onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5 text-left cursor-pointer"
      >
        <span className="w-[130px] shrink-0 text-[12px] text-fg-3">{t(ROLE_KEY[p.role])}</span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg-1">
          {name}
          {share}
        </span>
      </button>
      <button
        type="button"
        onClick={props.onAskRemove}
        aria-label={t("legalEntities.removePersonAria", { name })}
        className="mr-2 inline-flex size-8 items-center justify-center rounded-md text-fg-3 hover:bg-red-500/10 hover:text-red-600 cursor-pointer"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
