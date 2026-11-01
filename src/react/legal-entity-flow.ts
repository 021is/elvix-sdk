import type { LegalEntityType } from "./legal-entity-schema";

/**
 * The legal-entity wizard's step machine, as data.
 *
 * WHY THIS IS ITS OWN FILE: the ordering used to live inside sixteen
 * `afterX()` callbacks in the component, each of which did three unrelated
 * things — validate, decide whether we are editing or adding, and pick the
 * next pane. The pane ordering is the part with actual product meaning (a
 * company never sees "date of birth"; an individual never sees "registration
 * number") and it was the part you could not read without reading all three.
 *
 * Here it is pure: no React, no state, no fetch. Which pane follows which is
 * a function of the current pane and what the user chose so far, and
 * `tests/legal-entity-flow.test.ts` walks every branch of it.
 *
 * A business starts at its VAT ID (0.18): the authority's answer prefills the
 * legal name and the address search, and the VAT ID's prefix names the tax
 * country, so a business is not asked for it. A sole proprietor without a
 * VAT ID goes through the tax country and tax number instead. A private
 * individual has no VAT ID and keeps the order it had.
 */

export const View = {
  EMPTY: "empty",
  LIST: "list",
  TYPE_CHOICE: "type-choice",
  VAT_ID: "vat-id",
  LEGAL_NAME: "legal-name",
  TRADING_NAME: "trading-name",
  DOB: "dob",
  PLACE_OF_BIRTH: "place-of-birth",
  NATIONALITY: "nationality",
  TAX_COUNTRY: "tax-country",
  TAX_IDS: "tax-ids",
  VERIFYING_TAX_ID: "verifying-tax-id",
  REGISTRATION: "registration",
  ADDRESS_SEARCH: "address-search",
  ADDRESS_REVIEW: "address-review",
  ADDRESS_APT_FLOOR: "address-apt-floor",
  CONTACT_CHOICE: "contact-choice",
  CONTACT_INPUT: "contact-input",
  SAVING: "saving",
  DETAIL: "detail",
  DELETE_CONFIRM: "delete-confirm",
  DELETING: "deleting",
  DEFAULT_CONFIRM: "default-confirm",
} as const;
export type View = (typeof View)[keyof typeof View];

/**
 * A sole proprietorship is the awkward one: it is a business AND a person, so
 * it is the only type that walks both the trading-name branch and the
 * date-of-birth branch. Naming these two predicates is what stops that rule
 * being re-derived, slightly differently, at each step.
 */
export function needsBusinessSteps(type: LegalEntityType | null): boolean {
  return type === "sole_prop" || type === "company";
}

export function needsPersonSteps(type: LegalEntityType | null): boolean {
  return type === "individual" || type === "sole_prop";
}

/** What the user has entered so far, insofar as it changes the route. */
export type FlowContext = {
  type: LegalEntityType | null;
  /** A VAT id detours through the live-verification pane before continuing. */
  hasVatId: boolean;
  /** A sole proprietor said "No VAT ID": tax country and tax number instead. */
  withoutVatId: boolean;
};

/** The route-changing part of the context, for walking back. */
export type BackContext = Pick<FlowContext, "type" | "withoutVatId">;

/** A business that starts at its VAT ID rather than at its tax country. */
function startsAtVatId(ctx: BackContext): boolean {
  return needsBusinessSteps(ctx.type) && !ctx.withoutVatId;
}

/**
 * The pane that follows `current` when the user completes it.
 *
 * Returns `null` for panes that do not advance on their own — the terminal
 * ones (`saving`, `detail`) and the ones whose next step depends on a choice
 * the user makes in the pane itself (`contact-choice`) rather than on
 * completing it.
 */
export function nextView(current: View, ctx: FlowContext): View | null {
  switch (current) {
    case View.TYPE_CHOICE:
      return needsBusinessSteps(ctx.type) ? View.VAT_ID : View.LEGAL_NAME;
    case View.VAT_ID:
      return ctx.withoutVatId ? View.TAX_COUNTRY : View.VERIFYING_TAX_ID;
    case View.LEGAL_NAME:
      // Businesses get asked for a trading name; a private individual has none.
      return needsBusinessSteps(ctx.type) ? View.TRADING_NAME : View.DOB;
    case View.TRADING_NAME:
      // Only reachable for businesses. A sole prop is also a person, so it
      // continues into the personal details; a company goes to registration.
      return needsPersonSteps(ctx.type) ? View.DOB : View.REGISTRATION;
    case View.DOB:
      return View.PLACE_OF_BIRTH;
    case View.PLACE_OF_BIRTH:
      return View.NATIONALITY;
    case View.NATIONALITY:
      // A sole prop has its tax details already; an individual gives them now.
      return needsBusinessSteps(ctx.type) ? View.REGISTRATION : View.TAX_COUNTRY;
    case View.TAX_COUNTRY:
      return View.TAX_IDS;
    case View.TAX_IDS:
      // A VAT id is checked against the live authority before we move on, so
      // the user sees the confirmation (or the failure) rather than learning
      // about it after saving.
      return ctx.hasVatId ? View.VERIFYING_TAX_ID : afterTaxIdentifiers(ctx);
    case View.VERIFYING_TAX_ID:
      return afterTaxIdentifiers(ctx);
    default:
      return nextAddressStep(current);
  }
}

/** A business names itself next; an individual's tax details come last. */
function afterTaxIdentifiers(ctx: FlowContext): View {
  return needsBusinessSteps(ctx.type) ? View.LEGAL_NAME : View.ADDRESS_SEARCH;
}

/** The registered address and the contact form, the same for every type. */
function nextAddressStep(current: View): View | null {
  switch (current) {
    case View.REGISTRATION:
      return View.ADDRESS_SEARCH;
    case View.ADDRESS_SEARCH:
      return View.ADDRESS_REVIEW;
    case View.ADDRESS_REVIEW:
      return View.ADDRESS_APT_FLOOR;
    case View.ADDRESS_APT_FLOOR:
      return View.CONTACT_CHOICE;
    case View.CONTACT_INPUT:
      return View.SAVING;
    default:
      return null;
  }
}

/**
 * The pane the add flow's Back button returns to, or `null` at the first
 * step. Derived from the forward order, so the two cannot disagree. Back
 * never lands on the verification pane: it re-runs and moves on by itself on
 * a confirmed VAT ID, so it would push the user forward again. Leaving it
 * goes to the pane the VAT ID was typed in; the contact form goes back to
 * its question.
 */
export function previousView(current: View, ctx: BackContext): View | null {
  if (current === View.VERIFYING_TAX_ID) return startsAtVatId(ctx) ? View.VAT_ID : View.TAX_IDS;
  if (current === View.CONTACT_INPUT) return View.CONTACT_CHOICE;
  const path = walkFlow({ ...ctx, hasVatId: false });
  const at = path.indexOf(current);
  if (at <= 0) return null;
  const previous = path[at - 1] ?? null;
  return previous === View.VERIFYING_TAX_ID ? (path[at - 2] ?? null) : previous;
}

/**
 * The full pane sequence for a context, in order.
 *
 * Used by the tests to assert an entire journey rather than one hop at a
 * time, which is how a dropped or duplicated step actually shows up.
 */
export function walkFlow(ctx: FlowContext): View[] {
  const path: View[] = [View.TYPE_CHOICE];
  let current: View | null = View.TYPE_CHOICE;
  // Bounded: the graph is acyclic and short, and a cap means a future edit
  // that accidentally creates a cycle fails the test instead of hanging it.
  for (let i = 0; i < 32 && current; i++) {
    current = nextView(current, ctx);
    if (current) path.push(current);
  }
  return path;
}
