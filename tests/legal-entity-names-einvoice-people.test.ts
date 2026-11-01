/**
 * The 0.18 additions behind the legal-entity UI, pure: a person's name in
 * two parts, where e-invoices go, the people of a business, and the picker
 * row's VAT mark (a confirmed number whose register name differs is not
 * "Verified").
 */
import { describe, expect, it } from "vitest";
import { View } from "../src/react/legal-entity-flow";
import { eInvoiceReady, stepPatch, stepReady } from "../src/react/legal-entity-payload";
import {
  emptyPerson,
  PersonProblem,
  PersonRole,
  personDraftFrom,
  personInputFrom,
  personProblem,
} from "../src/react/legal-entity-person";
import { VatMark, vatMark } from "../src/react/legal-entity-picker-views";
import type { LegalEntityRecord } from "../src/react/legal-entity-schema";
import { emptyDraft } from "../src/react/use-legal-entity-draft";

describe("a natural person's name", () => {
  it("is asked in two parts and builds the legal name", () => {
    const d = {
      ...emptyDraft(),
      type: "sole_prop" as const,
      givenName: " Ada ",
      familyName: "Lovelace",
    };
    expect(stepReady(View.LEGAL_NAME, { ...d, familyName: "" })).toBe(false);
    expect(stepPatch(View.LEGAL_NAME, d)).toEqual({
      givenName: "Ada",
      familyName: "Lovelace",
      legalName: "Ada Lovelace",
    });
  });

  it("stays one field for a company", () => {
    const d = { ...emptyDraft(), type: "company" as const, legalName: " Grei GmbH " };
    expect(stepPatch(View.LEGAL_NAME, d)).toEqual({ legalName: "Grei GmbH" });
  });
});

describe("where e-invoices go", () => {
  const draft = (over: Partial<ReturnType<typeof emptyDraft>>) => ({ ...emptyDraft(), ...over });

  it("may be left empty, never malformed", () => {
    expect(eInvoiceReady(draft({}))).toBe(true);
    expect(eInvoiceReady(draft({ peppolId: "0208:0123456789" }))).toBe(true);
    expect(eInvoiceReady(draft({ peppolId: "0123456789" }))).toBe(false);
    expect(eInvoiceReady(draft({ codiceDestinatario: "abc1234" }))).toBe(true);
    expect(eInvoiceReady(draft({ codiceDestinatario: "ABC12" }))).toBe(false);
    expect(eInvoiceReady(draft({ leitwegId: "04011000-1234512345-06" }))).toBe(true);
    expect(eInvoiceReady(draft({ leitwegId: "04011000" }))).toBe(false);
  });

  it("clears an emptied field and upper-cases the SDI code", () => {
    const patch = stepPatch(
      View.E_INVOICE,
      draft({ codiceDestinatario: "abc1234", peppolId: " " }),
    );
    expect(patch).toEqual({
      peppolId: null,
      codiceDestinatario: "ABC1234",
      pecAddress: null,
      leitwegId: null,
    });
  });
});

describe("the people of a business", () => {
  it("needs both names, and an owner needs a share", () => {
    expect(personProblem(emptyPerson())).toBe(PersonProblem.NAME);
    const named = { ...emptyPerson(), givenName: "Ada", familyName: "Lovelace" };
    expect(personProblem(named)).toBeNull();
    expect(personProblem({ ...named, role: PersonRole.OWNER })).toBe(PersonProblem.OWNERSHIP);
    expect(
      personProblem({ ...named, role: PersonRole.OWNER, ownershipPercent: "25,5" }),
    ).toBeNull();
    expect(personProblem({ ...named, email: "nope" })).toBe(PersonProblem.EMAIL);
  });

  it("never sends an empty field, so a withheld value is not wiped", () => {
    const body = personInputFrom({ ...emptyPerson(), givenName: "Ada", familyName: "Lovelace" });
    expect(JSON.parse(JSON.stringify(body))).toEqual({
      role: "representative",
      givenName: "Ada",
      familyName: "Lovelace",
    });
  });

  it("opens a withheld person with the personal fields empty", () => {
    const d = personDraftFrom({
      id: "p1",
      entityId: "le1",
      role: "owner",
      givenName: "Ada",
      familyName: "Lovelace",
      dateOfBirth: null,
      nationality: null,
      email: null,
      phone: null,
      title: "CEO",
      ownershipPercent: 51,
      addressLine1: null,
      addressPostalCode: null,
      addressCity: null,
      addressCountry: null,
      createdAt: "",
      updatedAt: "",
      withheld: true,
    });
    expect(d).toMatchObject({ dateOfBirth: "", ownershipPercent: "51", title: "CEO" });
  });
});

describe("the picker row's VAT mark", () => {
  const e = (over: Partial<LegalEntityRecord>) =>
    ({ vatIdValidation: "live", ...over }) as LegalEntityRecord;

  it("verifies a confirmed number unless the register's name differs", () => {
    expect(vatMark(e({}))).toBe(VatMark.VERIFIED);
    expect(vatMark(e({ vatIdNameMatch: "unknown" }))).toBe(VatMark.VERIFIED);
    expect(vatMark(e({ vatIdNameMatch: "mismatch" }))).toBe(VatMark.NAME_MISMATCH);
    expect(vatMark(e({ vatIdValidation: "format" }))).toBeNull();
  });
});
