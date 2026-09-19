/**
 * The `<ElvixAddressBook>` wizard as a pure state machine: which pane shows,
 * the address being assembled, and the pending delete / default change.
 * No fetches here; `use-address-book.ts` performs the requests and reports
 * their outcome back as actions.
 */

import type { AddressInput, AddressKind } from "./address-schema";

export const View = {
  EMPTY: "empty",
  LIST: "list",
  SEARCH: "search",
  REVIEW: "review",
  APT_FLOOR: "apt-floor",
  RECIPIENT_CHOICE: "recipient-choice",
  RECIPIENT_CUSTOM: "recipient-custom",
  RECIPIENT_BUSINESS_NAME: "recipient-business-name",
  RECIPIENT_BUSINESS_CONTACT: "recipient-business-contact",
  NOTE_CHOICE: "note-choice",
  NOTE_INPUT: "note-input",
  SAVING: "saving",
  DETAIL: "detail",
  DELETE_CONFIRM: "delete-confirm",
  DELETING: "deleting",
  DEFAULT_CONFIRM: "default-confirm",
} as const;
export type View = (typeof View)[keyof typeof View];

export const ReturnTo = {
  LIST: "list",
  DETAIL: "detail",
} as const;
export type ReturnTo = (typeof ReturnTo)[keyof typeof ReturnTo];

/** A resolved Google place, as the maps details endpoint returns it. */
export type PlaceDetails = {
  placeId: string;
  formattedAddress: string;
  displayName: string;
  line1: string;
  city: string;
  regionName: string | null;
  regionCode: string | null;
  postalCode: string | null;
  country: string;
  countryName: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
};

/** The address being assembled by the add flow, or the one field being
 *  edited from the detail view. */
export type Draft = {
  seed: PlaceDetails | null;
  line2: string;
  recipient: string;
  company: string;
  notes: string | null;
};

export type DefaultIntent = { id: string; setting: boolean; returnTo: ReturnTo };

/** The detail-view fields that open a wizard step pre-filled. */
export const EditableField = {
  LINE2: "line2",
  NOTES: "notes",
  RECIPIENT: "recipient",
  COMPANY: "company",
} as const;
export type EditableField = (typeof EditableField)[keyof typeof EditableField];

export type WizardState = {
  view: View;
  draft: Draft;
  error: string | null;
  /** The address the detail view shows, and the target of field edits. */
  inspectingId: string | null;
  /** True while a detail-view field edit runs through a wizard step: that
   *  step's confirm then PATCHes one field instead of moving on. */
  editing: boolean;
  deletingId: string | null;
  defaultIntent: DefaultIntent | null;
};

export type WizardAction =
  | { type: "show"; view: View }
  | { type: "loaded"; count: number }
  | { type: "openAdd" }
  | { type: "placePicked"; seed: PlaceDetails }
  | { type: "reopenSearch" }
  | { type: "reviewConfirmed" }
  | { type: "line2Set"; line2: string }
  | { type: "recipientSet"; recipient: string; company: string }
  | { type: "customRecipient" }
  | { type: "businessStart" }
  | { type: "companySet"; company: string }
  | { type: "notesSet"; notes: string | null }
  | { type: "saving" }
  | { type: "saveFailed"; message: string }
  | { type: "saved" }
  | { type: "patched"; error: string | null }
  | { type: "openDetail"; id: string }
  | { type: "closeDetail" }
  | { type: "edit"; field: EditableField; value: string | null }
  | { type: "cancelEdit" }
  | { type: "askDelete"; id: string }
  | { type: "cancelDelete" }
  | { type: "deleting" }
  | { type: "deleteFailed"; error: string }
  | { type: "deleted" }
  | { type: "askDefault"; intent: DefaultIntent }
  | { type: "cancelDefault" }
  | { type: "defaultApplied" };

export const EMPTY_DRAFT: Draft = {
  seed: null,
  line2: "",
  recipient: "",
  company: "",
  notes: null,
};

export const INITIAL_WIZARD: WizardState = {
  view: View.EMPTY,
  draft: EMPTY_DRAFT,
  error: null,
  inspectingId: null,
  editing: false,
  deletingId: null,
  defaultIntent: null,
};

const EDIT_STEP: Record<EditableField, View> = {
  line2: View.APT_FLOOR,
  notes: View.NOTE_INPUT,
  recipient: View.RECIPIENT_CUSTOM,
  company: View.RECIPIENT_BUSINESS_NAME,
};

function editDraft(draft: Draft, field: EditableField, value: string | null): Draft {
  switch (field) {
    case "line2":
      return { ...draft, line2: value ?? "" };
    case "notes":
      return { ...draft, notes: value };
    case "recipient":
      return { ...draft, recipient: value ?? "" };
    case "company":
      return { ...draft, company: value ?? "" };
    default:
      return draft;
  }
}

/** Steps of the add flow, in order. */
function addFlow(s: WizardState, a: WizardAction): WizardState | null {
  switch (a.type) {
    case "openAdd":
      return { ...s, error: null, view: View.SEARCH };
    case "placePicked":
      return { ...s, draft: { ...s.draft, seed: a.seed }, view: View.REVIEW };
    case "reopenSearch":
      return { ...s, draft: { ...s.draft, seed: null }, view: View.SEARCH };
    case "reviewConfirmed":
      return { ...s, draft: { ...s.draft, line2: "" }, view: View.APT_FLOOR };
    case "line2Set":
      return { ...s, draft: { ...s.draft, line2: a.line2 }, view: View.RECIPIENT_CHOICE };
    case "customRecipient":
      return { ...s, draft: { ...s.draft, recipient: "" }, view: View.RECIPIENT_CUSTOM };
    case "businessStart":
      return {
        ...s,
        draft: { ...s.draft, recipient: "", company: "" },
        view: View.RECIPIENT_BUSINESS_NAME,
      };
    case "companySet":
      return {
        ...s,
        draft: { ...s.draft, company: a.company },
        view: View.RECIPIENT_BUSINESS_CONTACT,
      };
    case "recipientSet":
      return {
        ...s,
        draft: { ...s.draft, recipient: a.recipient, company: a.company, notes: null },
        view: View.NOTE_CHOICE,
      };
    case "notesSet":
      return { ...s, draft: { ...s.draft, notes: a.notes } };
    case "saving":
      return { ...s, error: null, view: View.SAVING };
    case "saveFailed":
      return { ...s, error: a.message, view: View.NOTE_CHOICE };
    case "saved":
      return { ...s, draft: EMPTY_DRAFT };
    default:
      return null;
  }
}

/** The detail view, its field edits, delete and the default toggle. */
function manage(s: WizardState, a: WizardAction): WizardState | null {
  switch (a.type) {
    case "openDetail":
      return { ...s, inspectingId: a.id, view: View.DETAIL };
    case "closeDetail":
      return { ...s, inspectingId: null, editing: false, view: View.LIST };
    case "edit":
      return {
        ...s,
        draft: editDraft(s.draft, a.field, a.value),
        editing: true,
        view: EDIT_STEP[a.field],
      };
    case "cancelEdit":
      return { ...s, editing: false, draft: EMPTY_DRAFT, view: View.DETAIL };
    case "patched":
      return {
        ...s,
        error: a.error ?? s.error,
        editing: false,
        draft: EMPTY_DRAFT,
        view: View.DETAIL,
      };
    case "askDelete":
      return { ...s, deletingId: a.id, view: View.DELETE_CONFIRM };
    case "cancelDelete":
      return { ...s, deletingId: null, view: View.LIST };
    case "deleting":
      return { ...s, view: View.DELETING };
    case "deleteFailed":
      return { ...s, error: a.error, view: View.DELETE_CONFIRM };
    case "deleted":
      return { ...s, deletingId: null };
    case "askDefault":
      return { ...s, defaultIntent: a.intent, view: View.DEFAULT_CONFIRM };
    case "cancelDefault":
      return { ...s, defaultIntent: null, view: s.defaultIntent?.returnTo ?? View.LIST };
    case "defaultApplied":
      return {
        ...s,
        error: null,
        defaultIntent: null,
        view: s.defaultIntent?.returnTo ?? View.LIST,
      };
    default:
      return null;
  }
}

export function wizardReducer(s: WizardState, a: WizardAction): WizardState {
  if (a.type === "show") return { ...s, view: a.view };
  // A fresh list decides between the empty tile and the list; the handler
  // that caused the reload may move on from there in the same batch.
  if (a.type === "loaded") return { ...s, view: a.count === 0 ? View.EMPTY : View.LIST };
  return addFlow(s, a) ?? manage(s, a) ?? s;
}

/** The POST body for the address the add flow assembled. */
export function draftToInput(
  kind: AddressKind,
  draft: Draft,
  notes: string | null,
): AddressInput | null {
  const seed = draft.seed;
  if (!seed) return null;
  return {
    kind,
    label: "",
    isDefault: false,
    recipientName: draft.recipient,
    companyName: draft.company || null,
    line1: seed.line1,
    line2: draft.line2.trim() || null,
    city: seed.city,
    regionName: seed.regionName,
    regionCode: seed.regionCode,
    postalCode: seed.postalCode,
    country: seed.country,
    countryName: seed.countryName,
    deliveryNotes: notes?.trim() || null,
    timezone: seed.timezone,
    venueName: seed.displayName || null,
    placeId: seed.placeId,
    formattedAddress: seed.formattedAddress,
    latitude: seed.latitude,
    longitude: seed.longitude,
  };
}
