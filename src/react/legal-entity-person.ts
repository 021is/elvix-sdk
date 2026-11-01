/**
 * The people behind a business (0.18): its legal representative, owners,
 * directors and executives, as payment providers ask for them before paying
 * a business out (Stripe Connect's representative and owners). Pure: the
 * shape, the roles, what a form needs before it can save, and the body it
 * sends. `use-legal-entity-people.ts` does the requests.
 */

import type { ElvixLegalEntityPerson } from "../types/legal-entity";

export const PersonRole = {
  REPRESENTATIVE: "representative",
  OWNER: "owner",
  DIRECTOR: "director",
  EXECUTIVE: "executive",
} as const;
export type PersonRole = (typeof PersonRole)[keyof typeof PersonRole];

export const PERSON_ROLES: readonly PersonRole[] = Object.values(PersonRole);

/** One person as elvix answers it. Inside an app the personal fields are null, `withheld: true`. */
export type LegalEntityPerson = ElvixLegalEntityPerson & { withheld?: boolean };

/** What the form edits: every value as typed. */
export type PersonDraft = {
  role: PersonRole;
  givenName: string;
  familyName: string;
  title: string;
  ownershipPercent: string;
  dateOfBirth: string;
  nationality: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressPostalCode: string;
  addressCity: string;
  addressCountry: string;
};

export type PersonInput = Omit<
  LegalEntityPerson,
  "id" | "entityId" | "createdAt" | "updatedAt" | "withheld"
>;

export function emptyPerson(): PersonDraft {
  return {
    role: PersonRole.REPRESENTATIVE,
    givenName: "",
    familyName: "",
    title: "",
    ownershipPercent: "",
    dateOfBirth: "",
    nationality: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressPostalCode: "",
    addressCity: "",
    addressCountry: "",
  };
}

/** The form for an existing person; a withheld field opens empty (write-only in apps). */
export function personDraftFrom(p: LegalEntityPerson): PersonDraft {
  const s = (v: string | null) => v ?? "";
  return {
    role: p.role,
    givenName: p.givenName,
    familyName: p.familyName,
    title: s(p.title),
    ownershipPercent: p.ownershipPercent === null ? "" : String(p.ownershipPercent),
    dateOfBirth: s(p.dateOfBirth)?.slice(0, 10) ?? "",
    nationality: s(p.nationality),
    email: s(p.email),
    phone: s(p.phone),
    addressLine1: s(p.addressLine1),
    addressPostalCode: s(p.addressPostalCode),
    addressCity: s(p.addressCity),
    addressCountry: s(p.addressCountry),
  };
}

export const PersonProblem = {
  NAME: "name",
  OWNERSHIP: "ownership",
  EMAIL: "email",
  DATE: "date",
} as const;
export type PersonProblem = (typeof PersonProblem)[keyof typeof PersonProblem];

const LETTER = /\p{L}/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Why the form cannot save yet, or null. An owner needs a share of 0.01 to 100 %. */
export function personProblem(d: PersonDraft): PersonProblem | null {
  if (!LETTER.test(d.givenName) || !LETTER.test(d.familyName)) return PersonProblem.NAME;
  const share = Number(d.ownershipPercent.replace(",", "."));
  const ownerShareBad = !(share > 0 && share <= 100);
  if (d.role === PersonRole.OWNER && ownerShareBad) return PersonProblem.OWNERSHIP;
  if (d.email.trim() && !EMAIL.test(d.email.trim())) return PersonProblem.EMAIL;
  if (d.dateOfBirth && !DATE.test(d.dateOfBirth)) return PersonProblem.DATE;
  return null;
}

/** A typed value, or `undefined` (left out of the JSON body) when empty. */
const given = (v: string) => v.trim() || undefined;

/**
 * The body a save sends. Empty fields are left out rather than sent as null,
 * so editing a person inside an app (where the personal fields arrive
 * withheld) never wipes what elvix holds.
 */
export function personInputFrom(d: PersonDraft): Partial<PersonInput> {
  const owner = d.role === PersonRole.OWNER;
  return {
    role: d.role,
    givenName: d.givenName.trim(),
    familyName: d.familyName.trim(),
    title: given(d.title),
    dateOfBirth: given(d.dateOfBirth),
    nationality: given(d.nationality.toUpperCase()),
    email: given(d.email),
    phone: given(d.phone),
    addressLine1: given(d.addressLine1),
    addressPostalCode: given(d.addressPostalCode),
    addressCity: given(d.addressCity),
    addressCountry: given(d.addressCountry.toUpperCase()),
    ownershipPercent: owner ? Number(d.ownershipPercent.replace(",", ".")) : undefined,
  };
}
