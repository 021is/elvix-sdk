"use client";

/**
 * `<ElvixLegalEntities>` — single-frame wizard for managing a user's
 * legal entities (individual / sole prop / company) used for
 * invoicing + KYC + tax filings. Mirrors `<ElvixAddressBook>`'s
 * architecture exactly: list ↔ add/edit panes ↔ detail with tap-to-
 * edit per row, all transitions cross-fade inside a single
 * `<ElvixCard>` frame.
 *
 * Wizard flow:
 *
 *   empty → list ─┬─→ delete-confirm → deleting
 *                 ├─→ default-confirm
 *                 └─→ detail (tap any row → matching edit pane)
 *
 *   add ─→ type-choice (Individual / Sole prop / Company)
 *          → legal-name → trading-name? → dob? → place-of-birth?
 *          → nationality? → tax-country → tax-ids → registration?
 *          → address-search → address-review → address-apt-floor
 *          → contact-choice → [contact-input] → saving → list
 *
 * Per-type branching:
 *   - Individual:  skips trading-name + registration
 *   - Sole prop:   shows everything
 *   - Company:     skips dob + place-of-birth + nationality
 *
 * All editable rows on the detail view re-enter the matching pane
 * with `editingMode=true`; the pane's terminal confirm switches from
 * POST (add) to PATCH (single-field update) automatically.
 */

import { AnimatePresence } from "framer-motion";
import { type CSSProperties, useCallback, useEffect, useState } from "react";

import { useT } from "../locale/use-t";
import { TAX_VALIDATABLE_COUNTRIES } from "./countries";
import { MaybeCard } from "./elvix-card";
import { useElvixContext } from "./elvix-provider";
import type { TaxIdValidationState } from "./elvix-tax-id-input";
import { humanizeApiError, typeTitleCopy } from "./legal-entity-copy";
import {
  DefaultConfirmView,
  DeleteConfirmView,
  DetailView,
  ListView,
} from "./legal-entity-detail-views";
import { needsBusinessSteps, needsPersonSteps, type View } from "./legal-entity-flow";
import { EmptyState, Pane, SavingView } from "./legal-entity-primitives";
import type { LegalEntityInput, LegalEntityRecord, LegalEntityType } from "./legal-entity-schema";
import type { PlaceDetails } from "./legal-entity-types";
import {
  AddressReviewView,
  AddressSearchView,
  ContactInputView,
  CountryView,
  DateView,
  isoYearsAgo,
  NationalityView,
  PlaceOfBirthView,
  RegistrationView,
  SingleTextView,
  TaxIdsView,
  TypeChoiceView,
  VerifyingTaxIdView,
  YesNoView,
} from "./legal-entity-wizard-views";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { useLegalEntityDraft } from "./use-legal-entity-draft";
import { useStableCallback } from "./use-stable-callback";

const ReturnTo = {
  LIST: "list",
  DETAIL: "detail",
} as const;
type ReturnTo = (typeof ReturnTo)[keyof typeof ReturnTo];

// ─── Public types ────────────────────────────────────────────────────

export type ElvixLegalEntitiesResult =
  | { ok: true; count: number }
  | { ok: false; error: string; message?: string };

export type ElvixLegalEntitiesProps = {
  /** Render inside an <ElvixCard>. Default true; pass false for bare (no chrome). */
  card?: boolean;
  /** Fixed frame height. Defaults to 580. */
  height?: number;
  minHeight?: number;
  maxHeight?: number;
  /** Frame width. Defaults to "100%". */
  width?: number | string;
  /** Optional callback fired after a successful save / delete. */
  onChange?: (entities: LegalEntityRecord[]) => void;
  /** Fires on every terminal save / delete outcome. Safe payload:
   *  count only — never the entity rows themselves. */
  onResult?: (result: ElvixLegalEntitiesResult) => void;
};

// ─── Pane transition (matches ElvixAddressBook) ──────────────────────

// ─── Component ───────────────────────────────────────────────────────

export function ElvixLegalEntities({
  height,
  minHeight,
  maxHeight,
  width = "100%",
  onChange,
  onResult,
  card,
}: ElvixLegalEntitiesProps) {
  const ctx = useElvixContext();
  const t = useT();
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [view, setView] = useState<View>("empty");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable: a host's inline `onChange` must not re-run the load effect.
  const emitChange = useStableCallback(onChange);
  const refresh = useCallback(async () => {
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/entities`, {
      cache: "no-store",
      ...authInit(),
    });
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const body = unwrapEnvelope(await res.json()) as { ok: boolean; entities: LegalEntityRecord[] };
    if (!body.ok) {
      setLoading(false);
      return;
    }
    setEntities(body.entities);
    emitChange(body.entities);
    setLoading(false);
    setView(body.entities.length === 0 ? "empty" : "list");
  }, [emitChange, ctx.baseUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ─── Wizard state ──────────────────────────────────────────────
  // One draft object rather than eighteen useState calls plus a hand-written
  // reset that had to be kept in step with every one of them.
  const { draft, setField, reset: resetDraft } = useLegalEntityDraft();

  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [editingMode, setEditingMode] = useState(false);

  const resetWizard = useCallback(() => {
    resetDraft();
    setEditingMode(false);
  }, [resetDraft]);

  const inspecting = entities.find((e) => e.id === inspectingId) ?? null;

  const openAdd = useCallback(() => {
    resetWizard();
    setError(null);
    setView("type-choice");
  }, [resetWizard]);

  const closeWizard = useCallback(() => {
    resetWizard();
    setView(entities.length === 0 ? "empty" : "list");
  }, [entities.length, resetWizard]);

  // ─── PATCH a single field on the inspected record ──────────────
  const patchField = useCallback(
    async (id: string, partial: Partial<LegalEntityInput>) => {
      setView("saving");
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/profile/entities?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth.headers },
        credentials: auth.credentials,
        body: JSON.stringify(partial),
      });
      if (!res.ok) {
        const body = unwrapEnvelope(await res.json().catch(() => ({})));
        const message = humanizeApiError(body);
        setError(message);
        onResult?.({ ok: false, error: "patch_failed", message });
      } else {
        onResult?.({ ok: true, count: entities.length });
      }
      await refresh();
      resetWizard();
      setView("detail");
    },
    [refresh, resetWizard, entities.length, onResult, ctx.baseUrl],
  );

  // ─── Commit (add flow) ─────────────────────────────────────────
  const commit = useCallback(async () => {
    if (!draft.type) return;
    setError(null);
    setView("saving");
    const payload: LegalEntityInput = {
      type: draft.type,
      label: null,
      isDefault: false,
      legalName: draft.legalName,
      tradingName: draft.tradingName || null,
      dateOfBirth: draft.dob || null,
      placeOfBirth: draft.placeOfBirth || null,
      placeOfBirthPlaceId: draft.placeOfBirthPlaceId || null,
      nationality: draft.nationality || null,
      taxCountry: draft.taxCountry,
      taxId: draft.taxId.trim() || null,
      vatId: draft.vatId.trim() || null,
      vatIdValidation:
        // LEGACY: spine-lint-disable-next-line spine/enum-over-string
        draft.vatValidation.level === "live"
          ? "live"
          : // LEGACY: spine-lint-disable-next-line spine/enum-over-string
            draft.vatValidation.level === "format"
            ? "format"
            : "none",
      vatIdValidatedAt: draft.vatValidation.level === "live" ? new Date().toISOString() : null,
      vatIdValidatedName: draft.vatValidation.name,
      registrationNumber: draft.registrationNumber || null,
      registrationBody: draft.registrationBody || null,
      registeredSince: draft.registeredSince || null,
      contactEmail: draft.contactEmail.trim() || null,
      contactPhone: draft.contactPhone.trim() || null,
      addressLine1: draft.address?.line1 ?? null,
      addressLine2: draft.addressLine2.trim() || null,
      addressCity: draft.address?.city ?? null,
      addressRegionName: draft.address?.regionName ?? null,
      addressRegionCode: draft.address?.regionCode ?? null,
      addressPostalCode: draft.address?.postalCode ?? null,
      addressCountry: draft.address?.country ?? null,
      addressCountryName: draft.address?.countryName ?? null,
      addressFormatted: draft.address?.formattedAddress ?? null,
      addressPlaceId: draft.address?.placeId ?? null,
      addressTimezone: draft.address?.timezone ?? null,
      addressLatitude: draft.address?.latitude ?? null,
      addressLongitude: draft.address?.longitude ?? null,
    };
    const auth = authInit();
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/entities`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth.headers },
      credentials: auth.credentials,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = unwrapEnvelope(await res.json().catch(() => ({})));
      const message = humanizeApiError(body);
      setError(message);
      onResult?.({ ok: false, error: "save_failed", message });
      setView("contact-choice");
      return;
    }
    await refresh();
    onResult?.({ ok: true, count: entities.length + 1 });
    resetWizard();
  }, [
    // The whole draft: every field above is read from it, so depending on the
    // object is both correct and the only thing that stays right when a field
    // is added.
    draft,
    refresh,
    resetWizard,
    ctx.baseUrl,
    entities.length,
    onResult,
  ]);

  // ─── Per-type branching helpers ────────────────────────────────
  // Defined once in legal-entity-flow.ts, where the wizard ordering lives and
  // where they are tested. They used to be re-derived here as inline
  // comparisons, which is how "which types see a trading name" ended up being
  // an answer you had to reconstruct from three separate call sites.
  const needsBusiness = needsBusinessSteps(draft.type);
  const needsPerson = needsPersonSteps(draft.type);

  const afterTypeChoice = (next: LegalEntityType) => {
    setField("type", next);
    setView("legal-name");
  };

  const afterLegalName = () => {
    if (!draft.legalName.trim()) return;
    if (editingMode && inspectingId) {
      void patchField(inspectingId, { legalName: draft.legalName.trim() });
      return;
    }
    setView(needsBusiness ? "trading-name" : "dob");
  };

  const afterTradingName = () => {
    if (editingMode && inspectingId) {
      void patchField(inspectingId, { tradingName: draft.tradingName.trim() || null });
      return;
    }
    setView(needsPerson ? "dob" : "tax-country");
  };

  const afterDob = () => {
    if (editingMode && inspectingId) {
      void patchField(inspectingId, { dateOfBirth: draft.dob || null });
      return;
    }
    setView("place-of-birth");
  };

  const afterPlaceOfBirth = () => {
    if (editingMode && inspectingId) {
      void patchField(inspectingId, {
        placeOfBirth: draft.placeOfBirth.trim() || null,
        placeOfBirthPlaceId: draft.placeOfBirthPlaceId || null,
      });
      return;
    }
    setView("nationality");
  };

  const afterNationality = () => {
    if (editingMode && inspectingId) {
      void patchField(inspectingId, { nationality: draft.nationality || null });
      return;
    }
    setView("tax-country");
  };

  const afterTaxCountry = () => {
    if (editingMode && inspectingId) {
      void patchField(inspectingId, { taxCountry: draft.taxCountry });
      return;
    }
    setView("tax-ids");
  };

  /**
   * Route after the user finishes the Tax identifiers pane.
   *
   * Two paths:
   *   - No VAT entered → straight to the next step (or PATCH for edit).
   *   - VAT entered    → bounce through the verification pane so the
   *                       user sees the live-authority confirmation
   *                       (or failure) before committing.
   */
  const proceedAfterTaxIds = () => {
    if (editingMode && inspectingId) {
      void patchField(inspectingId, {
        taxId: draft.taxId.trim() || null,
        vatId: draft.vatId.trim() || null,
        vatIdValidation:
          draft.vatValidation.level === "live"
            ? "live"
            : draft.vatValidation.level === "format"
              ? "format"
              : "none",
        vatIdValidatedAt: draft.vatValidation.level === "live" ? new Date().toISOString() : null,
        vatIdValidatedName: draft.vatValidation.name,
      });
      return;
    }
    setView(needsBusiness ? "registration" : "address-search");
  };

  const afterTaxIds = () => {
    if (!draft.vatId.trim()) {
      proceedAfterTaxIds();
      return;
    }
    setView("verifying-tax-id");
  };

  const afterRegistration = () => {
    if (!draft.registrationNumber.trim() || !draft.registrationBody.trim()) return;
    if (editingMode && inspectingId) {
      void patchField(inspectingId, {
        registrationNumber: draft.registrationNumber.trim() || null,
        registrationBody: draft.registrationBody.trim() || null,
        registeredSince: draft.registeredSince || null,
      });
      return;
    }
    setView("address-search");
  };

  const onPickAddress = (details: PlaceDetails) => {
    setField("address", details);
    setView("address-review");
  };

  const afterAddressReview = () => setView("address-apt-floor");

  const afterAddressAptFloor = () => {
    if (editingMode && inspectingId && draft.address) {
      void patchField(inspectingId, {
        addressLine1: draft.address.line1,
        addressLine2: draft.addressLine2.trim() || null,
        addressCity: draft.address.city,
        addressRegionName: draft.address.regionName,
        addressRegionCode: draft.address.regionCode,
        addressPostalCode: draft.address.postalCode,
        addressCountry: draft.address.country,
        addressCountryName: draft.address.countryName,
        addressFormatted: draft.address.formattedAddress,
        addressPlaceId: draft.address.placeId,
        addressTimezone: draft.address.timezone,
        addressLatitude: draft.address.latitude,
        addressLongitude: draft.address.longitude,
      });
      return;
    }
    setView("contact-choice");
  };

  const onContactYes = () => setView("contact-input");
  const onContactNo = () => void commit();
  const onContactSave = () => {
    // Edit-mode: PATCH the contact fields on the inspected entity
    // instead of running the ADD-flow commit (which bails on null
    // `type` and leaves the user stranded on a dead Save button).
    if (editingMode && inspectingId) {
      void patchField(inspectingId, {
        contactEmail: draft.contactEmail.trim() || null,
        contactPhone: draft.contactPhone.trim() || null,
      });
      return;
    }
    void commit();
  };

  // ─── Detail view: tap-to-edit entries ──────────────────────────
  const openDetail = (id: string) => {
    setInspectingId(id);
    setView("detail");
  };
  const closeDetail = () => {
    setInspectingId(null);
    resetWizard();
    setView("list");
  };

  const editField = (slot: View, prefill: () => void) => {
    prefill();
    setEditingMode(true);
    setView(slot);
  };
  const cancelEdit = () => {
    resetWizard();
    setView("detail");
  };

  // ─── Delete confirmation ───────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const askDelete = (id: string) => {
    setDeletingId(id);
    setView("delete-confirm");
  };
  const cancelDelete = () => {
    setDeletingId(null);
    setView(inspectingId ? "detail" : "list");
  };
  const confirmDelete = async () => {
    if (!deletingId) return;
    setView("deleting");
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/entities?id=${deletingId}`, {
      method: "DELETE",
      ...authInit(),
    });
    if (!res.ok) {
      const body = unwrapEnvelope(await res.json().catch(() => ({})));
      const message = humanizeApiError(body);
      setError(message);
      onResult?.({ ok: false, error: "delete_failed", message });
      setView("delete-confirm");
      return;
    }
    setDeletingId(null);
    setInspectingId(null);
    await refresh();
    onResult?.({ ok: true, count: Math.max(0, entities.length - 1) });
  };
  const deletingEntity = entities.find((e) => e.id === deletingId) ?? null;

  // ─── Default toggle (set / remove) ─────────────────────────────
  const [defaultIntent, setDefaultIntent] = useState<{
    id: string;
    setting: boolean;
    returnTo: ReturnTo;
  } | null>(null);
  const askDefaultChange = (id: string, setting: boolean, returnTo: ReturnTo) => {
    setDefaultIntent({ id, setting, returnTo });
    setView("default-confirm");
  };
  const cancelDefaultChange = () => {
    const back = defaultIntent?.returnTo ?? "list";
    setDefaultIntent(null);
    setView(back);
  };
  const confirmDefaultChange = async () => {
    if (!defaultIntent) return;
    const { id, setting, returnTo } = defaultIntent;
    setEntities((prev) =>
      prev.map((e) => ({
        ...e,
        isDefault: setting ? e.id === id : e.id === id ? false : e.isDefault,
      })),
    );
    setView(returnTo);
    setDefaultIntent(null);
    const auth = authInit();
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/entities?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth.headers },
      credentials: auth.credentials,
      body: JSON.stringify({ isDefault: setting }),
    });
    if (!res.ok) await refresh();
  };
  const defaultIntentEntity = entities.find((e) => e.id === defaultIntent?.id) ?? null;

  // ─── Frame sizing ──────────────────────────────────────────────
  // Default height clamps to the viewport so the card never overflows
  // the AccountStage chrome on shorter screens. Explicit `height` prop
  // still wins for embedders that need a fixed shell.
  const frameStyle: CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    ...(height
      ? { height: `${height}px` }
      : {
          height: "min(540px, 66dvh)",
          minHeight: minHeight ?? 340,
          maxHeight: maxHeight ?? 700,
        }),
  };

  /**
   * Which pane is on screen, as a lookup rather than a chain.
   *
   * This was a twenty-one branch nested ternary, and it was essentially all
   * of this component's cognitive complexity: 255 against a limit of 25. The
   * branches themselves were never the problem; expressing them as one
   * expression was, because reading the last pane meant parsing the twenty
   * conditions in front of it.
   *
   * Each entry is a thunk so only the visible pane is constructed.
   */
  const panes: Partial<Record<View, () => React.ReactNode>> = {
    empty: () => (
      <Pane key="empty">
        <EmptyState onAdd={openAdd} />
      </Pane>
    ),
    list: () => (
      <Pane key="list" fadeEdges>
        <ListView
          entities={entities}
          onAdd={openAdd}
          onOpen={openDetail}
          onDelete={askDelete}
          onToggleDefault={(id, current) => askDefaultChange(id, !current, "list")}
        />
      </Pane>
    ),
    "type-choice": () => (
      <Pane key="type-choice">
        <TypeChoiceView onPick={afterTypeChoice} onBack={closeWizard} />
      </Pane>
    ),
    "legal-name": () => (
      <Pane key="legal-name">
        <SingleTextView
          title={typeTitleCopy(draft.type, "legal-name", t)}
          subtitle={
            draft.type === "individual"
              ? t("legalEntities.legalNameSubtitleIndividual")
              : draft.type === "sole_prop"
                ? t("legalEntities.legalNameSubtitleSoleProp")
                : t("legalEntities.legalNameSubtitleCompany")
          }
          label={t("legalEntities.legalNameLabel")}
          placeholder={
            draft.type === "company"
              ? t("legalEntities.legalNamePlaceholderCompany")
              : t("legalEntities.legalNamePlaceholderPerson")
          }
          value={draft.legalName}
          onChange={(value) => setField("legalName", value)}
          onConfirm={afterLegalName}
          onBack={editingMode ? cancelEdit : () => setView("type-choice")}
          required
          maxLength={180}
          minLength={2}
          requireLetter
          requireWords={draft.type === "company" ? undefined : 2}
          invalidMessage={
            draft.type === "company"
              ? t("legalEntities.legalNameInvalidCompany")
              : t("legalEntities.legalNameInvalidPerson")
          }
        />
      </Pane>
    ),
    "trading-name": () => (
      <Pane key="trading-name">
        <SingleTextView
          title={t("legalEntities.tradingNameTitle")}
          subtitle={t("legalEntities.tradingNameSubtitle")}
          label={t("legalEntities.tradingNameLabel")}
          placeholder={t("legalEntities.tradingNamePlaceholder")}
          value={draft.tradingName}
          onChange={(value) => setField("tradingName", value)}
          onConfirm={afterTradingName}
          onBack={editingMode ? cancelEdit : () => setView("legal-name")}
          maxLength={180}
          optional
        />
      </Pane>
    ),
    dob: () => (
      <Pane key="dob">
        <DateView
          title={t("legalEntities.dobTitle")}
          subtitle={t("legalEntities.dobSubtitle")}
          label={t("legalEntities.dobTitle")}
          value={draft.dob}
          onChange={(value) => setField("dob", value)}
          onConfirm={afterDob}
          onBack={
            editingMode ? cancelEdit : () => setView(needsBusiness ? "trading-name" : "legal-name")
          }
          minDate={isoYearsAgo(120)}
          maxDate={isoYearsAgo(18)}
          outOfRangeMessage={t("legalEntities.dobAgeError")}
        />
      </Pane>
    ),
    "place-of-birth": () => (
      <Pane key="place-of-birth">
        <PlaceOfBirthView
          label={draft.placeOfBirth}
          placeId={draft.placeOfBirthPlaceId}
          onPick={(label, placeId) => {
            setField("placeOfBirth", label);
            setField("placeOfBirthPlaceId", placeId);
          }}
          onClear={() => {
            setField("placeOfBirth", "");
            setField("placeOfBirthPlaceId", null);
          }}
          onConfirm={afterPlaceOfBirth}
          onBack={editingMode ? cancelEdit : () => setView("dob")}
        />
      </Pane>
    ),
    nationality: () => (
      <Pane key="nationality">
        <NationalityView
          value={draft.nationality}
          onChange={(value) => setField("nationality", value)}
          onConfirm={afterNationality}
          onBack={editingMode ? cancelEdit : () => setView("place-of-birth")}
        />
      </Pane>
    ),
    "tax-country": () => (
      <Pane key="tax-country">
        <CountryView
          title={t("legalEntities.taxCountryTitle")}
          subtitle={t("legalEntities.taxCountrySubtitle")}
          value={draft.taxCountry}
          onChange={(value) => setField("taxCountry", value)}
          onConfirm={afterTaxCountry}
          onBack={
            editingMode ? cancelEdit : () => setView(needsPerson ? "nationality" : "trading-name")
          }
          restrictTo={TAX_VALIDATABLE_COUNTRIES}
          required
        />
      </Pane>
    ),
    "tax-ids": () => (
      <Pane key="tax-ids">
        <TaxIdsView
          entityType={draft.type}
          country={draft.taxCountry}
          taxId={draft.taxId}
          vatId={draft.vatId}
          vatValidation={draft.vatValidation}
          setTaxId={(value) => setField("taxId", value)}
          setVatId={(value) => setField("vatId", value)}
          setVatValidation={(value) => setField("vatValidation", value)}
          onConfirm={afterTaxIds}
          onBack={editingMode ? cancelEdit : () => setView("tax-country")}
        />
      </Pane>
    ),
    "verifying-tax-id": () => (
      <Pane key="verifying-tax-id">
        <VerifyingTaxIdView
          country={draft.taxCountry}
          vatId={draft.vatId}
          validation={draft.vatValidation}
          onPass={proceedAfterTaxIds}
          onBack={() => setView("tax-ids")}
        />
      </Pane>
    ),
    registration: () => (
      <Pane key="registration">
        <RegistrationView
          country={draft.taxCountry}
          number={draft.registrationNumber}
          body={draft.registrationBody}
          since={draft.registeredSince}
          setNumber={(value) => setField("registrationNumber", value)}
          setBody={(value) => setField("registrationBody", value)}
          setSince={(value) => setField("registeredSince", value)}
          onConfirm={afterRegistration}
          onBack={editingMode ? cancelEdit : () => setView("tax-ids")}
        />
      </Pane>
    ),
    "address-search": () => (
      <Pane key="address-search">
        <AddressSearchView
          onPick={onPickAddress}
          onBack={
            editingMode ? cancelEdit : () => setView(needsBusiness ? "registration" : "tax-ids")
          }
        />
      </Pane>
    ),
    "address-review": () => (
      <Pane key="address-review">
        <AddressReviewView
          details={draft.address}
          onConfirm={afterAddressReview}
          onChange={() => setView("address-search")}
        />
      </Pane>
    ),
    "address-apt-floor": () => (
      <Pane key="address-apt-floor">
        <SingleTextView
          title={t("legalEntities.addressAptTitle")}
          subtitle={t("legalEntities.addressAptSubtitle")}
          label={t("legalEntities.addressAptLabel")}
          placeholder={t("legalEntities.addressAptPlaceholder")}
          value={draft.addressLine2}
          onChange={(value) => setField("addressLine2", value)}
          onConfirm={afterAddressAptFloor}
          onBack={editingMode ? cancelEdit : () => setView("address-review")}
          maxLength={240}
          optional
        />
      </Pane>
    ),
    "contact-choice": () => (
      <Pane key="contact-choice">
        <YesNoView
          title={t("legalEntities.contactChoiceTitle")}
          subtitle={t("legalEntities.contactChoiceSubtitle")}
          onYes={onContactYes}
          onNo={onContactNo}
          onBack={() => setView("address-apt-floor")}
          error={error}
          yesLabel={t("legalEntities.contactYesCta")}
          noLabel={t("legalEntities.contactNoCta")}
        />
      </Pane>
    ),
    "contact-input": () => (
      <Pane key="contact-input">
        <ContactInputView
          email={draft.contactEmail}
          phone={draft.contactPhone}
          setEmail={(value) => setField("contactEmail", value)}
          setPhone={(value) => setField("contactPhone", value)}
          onConfirm={onContactSave}
          onBack={editingMode ? cancelEdit : () => setView("contact-choice")}
          saveLabel={
            editingMode ? t("legalEntities.saveChangesCta") : t("legalEntities.saveEntityCta")
          }
        />
      </Pane>
    ),
    saving: () => (
      <Pane key="saving">
        <SavingView label={t("legalEntities.savingEntityLabel")} />
      </Pane>
    ),
    detail: () => (
      <Pane key="detail">
        <DetailView
          entity={inspecting}
          onBack={closeDetail}
          onDelete={() => inspecting && askDelete(inspecting.id)}
          onToggleDefault={() =>
            inspecting && askDefaultChange(inspecting.id, !inspecting.isDefault, "detail")
          }
          onEditLegalName={() =>
            inspecting && editField("legal-name", () => setField("legalName", inspecting.legalName))
          }
          onEditTradingName={() =>
            inspecting &&
            editField("trading-name", () => setField("tradingName", inspecting.tradingName ?? ""))
          }
          onEditDob={() =>
            inspecting &&
            editField("dob", () => setField("dob", inspecting.dateOfBirth?.slice(0, 10) ?? ""))
          }
          onEditPlaceOfBirth={() =>
            inspecting &&
            editField("place-of-birth", () => {
              setField("placeOfBirth", inspecting.placeOfBirth ?? "");
              setField("placeOfBirthPlaceId", inspecting.placeOfBirthPlaceId ?? null);
            })
          }
          onEditNationality={() =>
            inspecting &&
            editField("nationality", () => setField("nationality", inspecting.nationality ?? ""))
          }
          onEditTaxCountry={() =>
            inspecting &&
            editField("tax-country", () => setField("taxCountry", inspecting.taxCountry))
          }
          onEditTaxIds={() =>
            inspecting &&
            editField("tax-ids", () => {
              setField("taxCountry", inspecting.taxCountry);
              setField("taxId", inspecting.taxId ?? "");
              setField("vatId", inspecting.vatId ?? "");
              setField("vatValidation", {
                level: (inspecting.vatIdValidation as TaxIdValidationState["level"]) ?? "none",
                name: inspecting.vatIdValidatedName ?? null,
                authority: null,
                normalisedId: inspecting.vatId ?? "",
              });
            })
          }
          onEditRegistration={() =>
            inspecting &&
            editField("registration", () => {
              setField("registrationNumber", inspecting.registrationNumber ?? "");
              setField("registrationBody", inspecting.registrationBody ?? "");
              setField("registeredSince", inspecting.registeredSince?.slice(0, 10) ?? "");
            })
          }
          onEditContact={() =>
            inspecting &&
            editField("contact-input", () => {
              setField("contactEmail", inspecting.contactEmail ?? "");
              setField("contactPhone", inspecting.contactPhone ?? "");
            })
          }
        />
      </Pane>
    ),
    "delete-confirm": () => (
      <Pane key="delete-confirm">
        <DeleteConfirmView
          entity={deletingEntity}
          error={error}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      </Pane>
    ),
    deleting: () => (
      <Pane key="deleting">
        <SavingView label={t("legalEntities.deletingEntityLabel")} />
      </Pane>
    ),
    "default-confirm": () => (
      <Pane key="default-confirm">
        <DefaultConfirmView
          entity={defaultIntentEntity}
          setting={defaultIntent?.setting ?? true}
          error={error}
          onCancel={cancelDefaultChange}
          onConfirm={confirmDefaultChange}
        />
      </Pane>
    ),
  };

  return (
    <div style={frameStyle} className="mx-auto">
      <MaybeCard card={card} className="h-full">
        <div className="relative h-full overflow-hidden">
          <AnimatePresence initial={false}>
            {loading ? (
              <Pane key="loading">
                <div className="grid h-full place-items-center text-fg-3 text-sm">
                  {t("common.loading")}
                </div>
              </Pane>
            ) : (
              (panes[view]?.() ?? null)
            )}
          </AnimatePresence>
        </div>
      </MaybeCard>
    </div>
  );
}

// ─── Sub-views (kept in this file for now — extract to its own SDK
//     when the wizard's footprint stabilises). ────────────────────────

/**
 * `<NationalityView>` — multi-select draft.nationality picker. Backs the
 * wizard's "Nationality" pane; schema serialises picks as comma-
 * separated ISO codes ("DE,UA"), capped at 4 to match the schema
 * regex. Chips show the current selection with a remove button; the
 * picker hides itself when the cap is hit.
 */

// ─── Place-of-birth picker (city-level Places autocomplete) ──────────

// ─── Address sub-flow (reuses the Places autocomplete pattern) ───────

// ─── Yes/No + Contact input ──────────────────────────────────────────

// ─── Spinner / Detail / Confirms ─────────────────────────────────────

// ─── Reusable wizard primitives ──────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────
