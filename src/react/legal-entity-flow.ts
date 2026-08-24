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
 * a function of the current pane and the entity type, and
 * `tests/legal-entity-flow.test.ts` walks every branch of it.
 */

export const View = {
  EMPTY: "empty",
  LIST: "list",
  TYPE_CHOICE: "type-choice",
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
};

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
      return View.LEGAL_NAME;

    case View.LEGAL_NAME:
      // Businesses get asked for a trading name; a private individual has none.
      return needsBusinessSteps(ctx.type) ? View.TRADING_NAME : View.DOB;

    case View.TRADING_NAME:
      // Only reachable for businesses. A sole prop is also a person, so it
      // continues into the personal details; a company skips straight to tax.
      return needsPersonSteps(ctx.type) ? View.DOB : View.TAX_COUNTRY;

    case View.DOB:
      return View.PLACE_OF_BIRTH;

    case View.PLACE_OF_BIRTH:
      return View.NATIONALITY;

    case View.NATIONALITY:
      return View.TAX_COUNTRY;

    case View.TAX_COUNTRY:
      return View.TAX_IDS;

    case View.TAX_IDS:
      // A VAT id is checked against the live authority before we move on, so
      // the user sees the confirmation (or the failure) rather than learning
      // about it after saving.
      return ctx.hasVatId ? View.VERIFYING_TAX_ID : afterTaxIdentifiers(ctx);

    case View.VERIFYING_TAX_ID:
      return afterTaxIdentifiers(ctx);

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

/** Registration details are a business-only step, so individuals skip them. */
function afterTaxIdentifiers(ctx: FlowContext): View {
  return needsBusinessSteps(ctx.type) ? View.REGISTRATION : View.ADDRESS_SEARCH;
}

/**
 * The full pane sequence for an entity type, in order.
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
