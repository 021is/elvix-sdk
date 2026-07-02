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

import { MaybeCard } from "./elvix-card";
import { ElvixCountrySelect } from "./elvix-country-select";
import { ElvixInput } from "./elvix-input";
import { ElvixSaveButton } from "./elvix-save-button";
import { ElvixTaxIdInput, type TaxIdValidationState } from "./elvix-tax-id-input";
import { useElvixContext } from "./elvix-provider";
import { authInit, isSameOrigin } from "./session";
import { TAX_VALIDATABLE_COUNTRIES, findCountry } from "./countries";
import {
  LEGAL_ENTITY_TYPES,
  type LegalEntityInput,
  type LegalEntityRecord,
  type LegalEntityType,
} from "./legal-entity-schema";
import { unwrapEnvelope } from "./spine-fetch";
import { localTaxIdMatches, registrationNumberMatches } from "./tax-validation";
import { useT } from "../locale/use-t";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronRight,
  Loader2,
  MapPin,
  Plus,
  Search,
  Star,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import { type CSSProperties, Fragment, useCallback, useEffect, useRef, useState } from "react";

const ReturnTo = {
  LIST: "list",
  DETAIL: "detail",
} as const;
type ReturnTo = (typeof ReturnTo)[keyof typeof ReturnTo];

const Phase = {
  CHECKING: "checking",
  SETTLED: "settled",
} as const;
type Phase = (typeof Phase)[keyof typeof Phase];


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

type PlaceDetails = {
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

type PlaceSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
};

const View = {
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
type View = (typeof View)[keyof typeof View];

function newSessionToken(): string {
  return crypto.randomUUID();
}

// ─── Pane transition (matches ElvixAddressBook) ──────────────────────

const paneVariants = {
  enter: { opacity: 0, y: 6, filter: "blur(4px)" },
  center: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -4, filter: "blur(4px)" },
};

const FADE_MASK =
  "linear-gradient(to bottom, transparent 0, rgba(0,0,0,0.4) 12px, black 28px, black calc(100% - 28px), rgba(0,0,0,0.4) calc(100% - 12px), transparent 100%)";

function Pane({
  children,
  fadeEdges = false,
}: {
  children: React.ReactNode;
  fadeEdges?: boolean;
}) {
  return (
    <motion.div
      variants={paneVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      className="absolute inset-0 overflow-y-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={fadeEdges ? { maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK } : undefined}
    >
      {children}
    </motion.div>
  );
}

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
    onChange?.(body.entities);
    setLoading(false);
    setView(body.entities.length === 0 ? "empty" : "list");
  }, [onChange, ctx.baseUrl]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Wizard state ──────────────────────────────────────────────
  const [type, setType] = useState<LegalEntityType | null>(null);
  const [legalName, setLegalName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [dob, setDob] = useState("");
  const [placeOfBirth, setPlaceOfBirth] = useState("");
  const [placeOfBirthPlaceId, setPlaceOfBirthPlaceId] = useState<string | null>(null);
  const [nationality, setNationality] = useState("");
  const [taxCountry, setTaxCountry] = useState("");
  const [taxId, setTaxId] = useState("");
  const [vatId, setVatId] = useState("");
  const [vatValidation, setVatValidation] = useState<TaxIdValidationState>({
    level: "none",
    name: null,
    authority: null,
    normalisedId: "",
  });
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [registrationBody, setRegistrationBody] = useState("");
  const [registeredSince, setRegisteredSince] = useState("");
  const [address, setAddress] = useState<PlaceDetails | null>(null);
  const [addressLine2, setAddressLine2] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [editingMode, setEditingMode] = useState(false);

  const inspecting = entities.find((e) => e.id === inspectingId) ?? null;

  const resetWizard = useCallback(() => {
    setType(null);
    setLegalName("");
    setTradingName("");
    setDob("");
    setPlaceOfBirth("");
    setPlaceOfBirthPlaceId(null);
    setNationality("");
    setTaxCountry("");
    setTaxId("");
    setVatId("");
    setVatValidation({ level: "none", name: null, authority: null, normalisedId: "" });
    setRegistrationNumber("");
    setRegistrationBody("");
    setRegisteredSince("");
    setAddress(null);
    setAddressLine2("");
    setContactEmail("");
    setContactPhone("");
    setEditingMode(false);
  }, []);

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
    if (!type) return;
    setError(null);
    setView("saving");
    const payload: LegalEntityInput = {
      type,
      label: null,
      isDefault: false,
      legalName,
      tradingName: tradingName || null,
      dateOfBirth: dob || null,
      placeOfBirth: placeOfBirth || null,
      placeOfBirthPlaceId: placeOfBirthPlaceId || null,
      nationality: nationality || null,
      taxCountry,
      taxId: taxId.trim() || null,
      vatId: vatId.trim() || null,
      vatIdValidation:
        // LEGACY: spine-lint-disable-next-line spine/enum-over-string
        vatValidation.level === "live"
          ? "live"
          // LEGACY: spine-lint-disable-next-line spine/enum-over-string
          : vatValidation.level === "format"
            ? "format"
            : "none",
      vatIdValidatedAt: vatValidation.level === "live" ? new Date().toISOString() : null,
      vatIdValidatedName: vatValidation.name,
      registrationNumber: registrationNumber || null,
      registrationBody: registrationBody || null,
      registeredSince: registeredSince || null,
      contactEmail: contactEmail.trim() || null,
      contactPhone: contactPhone.trim() || null,
      addressLine1: address?.line1 ?? null,
      addressLine2: addressLine2.trim() || null,
      addressCity: address?.city ?? null,
      addressRegionName: address?.regionName ?? null,
      addressRegionCode: address?.regionCode ?? null,
      addressPostalCode: address?.postalCode ?? null,
      addressCountry: address?.country ?? null,
      addressCountryName: address?.countryName ?? null,
      addressFormatted: address?.formattedAddress ?? null,
      addressPlaceId: address?.placeId ?? null,
      addressTimezone: address?.timezone ?? null,
      addressLatitude: address?.latitude ?? null,
      addressLongitude: address?.longitude ?? null,
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
    type,
    legalName,
    tradingName,
    dob,
    placeOfBirth,
    placeOfBirthPlaceId,
    nationality,
    taxCountry,
    taxId,
    vatId,
    vatValidation,
    registrationNumber,
    registrationBody,
    registeredSince,
    contactEmail,
    contactPhone,
    address,
    addressLine2,
    refresh,
    resetWizard,
    ctx.baseUrl,
  ]);

  // ─── Per-type branching helpers ────────────────────────────────
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const needsBusiness = type === "sole_prop" || type === "company";
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const needsPerson = type === "individual" || type === "sole_prop";

  const afterTypeChoice = (next: LegalEntityType) => {
    setType(next);
    setView("legal-name");
  };

  const afterLegalName = () => {
    if (!legalName.trim()) return;
    if (editingMode && inspectingId) {
      void patchField(inspectingId, { legalName: legalName.trim() });
      return;
    }
    setView(needsBusiness ? "trading-name" : "dob");
  };

  const afterTradingName = () => {
    if (editingMode && inspectingId) {
      void patchField(inspectingId, { tradingName: tradingName.trim() || null });
      return;
    }
    setView(needsPerson ? "dob" : "tax-country");
  };

  const afterDob = () => {
    if (editingMode && inspectingId) {
      void patchField(inspectingId, { dateOfBirth: dob || null });
      return;
    }
    setView("place-of-birth");
  };

  const afterPlaceOfBirth = () => {
    if (editingMode && inspectingId) {
      void patchField(inspectingId, {
        placeOfBirth: placeOfBirth.trim() || null,
        placeOfBirthPlaceId: placeOfBirthPlaceId || null,
      });
      return;
    }
    setView("nationality");
  };

  const afterNationality = () => {
    if (editingMode && inspectingId) {
      void patchField(inspectingId, { nationality: nationality || null });
      return;
    }
    setView("tax-country");
  };

  const afterTaxCountry = () => {
    if (editingMode && inspectingId) {
      void patchField(inspectingId, { taxCountry });
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
        taxId: taxId.trim() || null,
        vatId: vatId.trim() || null,
        vatIdValidation:
          vatValidation.level === "live"
            ? "live"
            : vatValidation.level === "format"
              ? "format"
              : "none",
        vatIdValidatedAt: vatValidation.level === "live" ? new Date().toISOString() : null,
        vatIdValidatedName: vatValidation.name,
      });
      return;
    }
    setView(needsBusiness ? "registration" : "address-search");
  };

  const afterTaxIds = () => {
    if (!vatId.trim()) {
      proceedAfterTaxIds();
      return;
    }
    setView("verifying-tax-id");
  };

  const afterRegistration = () => {
    if (!registrationNumber.trim() || !registrationBody.trim()) return;
    if (editingMode && inspectingId) {
      void patchField(inspectingId, {
        registrationNumber: registrationNumber.trim() || null,
        registrationBody: registrationBody.trim() || null,
        registeredSince: registeredSince || null,
      });
      return;
    }
    setView("address-search");
  };

  const onPickAddress = (details: PlaceDetails) => {
    setAddress(details);
    setView("address-review");
  };

  const afterAddressReview = () => setView("address-apt-floor");

  const afterAddressAptFloor = () => {
    if (editingMode && inspectingId && address) {
      void patchField(inspectingId, {
        addressLine1: address.line1,
        addressLine2: addressLine2.trim() || null,
        addressCity: address.city,
        addressRegionName: address.regionName,
        addressRegionCode: address.regionCode,
        addressPostalCode: address.postalCode,
        addressCountry: address.country,
        addressCountryName: address.countryName,
        addressFormatted: address.formattedAddress,
        addressPlaceId: address.placeId,
        addressTimezone: address.timezone,
        addressLatitude: address.latitude,
        addressLongitude: address.longitude,
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
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
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

  return (
    <div style={frameStyle} className="mx-auto">
      <MaybeCard card={card} className="h-full">
        <div className="relative h-full overflow-hidden">
          <AnimatePresence initial={false}>
            {loading ? (
              <Pane key="loading">
                <div className="grid h-full place-items-center text-fg-3 text-sm">{t("common.loading")}</div>
              </Pane>
            ) : view === "empty" ? (
              <Pane key="empty">
                <EmptyState onAdd={openAdd} />
              </Pane>
            ) : view === "list" ? (
              <Pane key="list" fadeEdges>
                <ListView
                  entities={entities}
                  onAdd={openAdd}
                  onOpen={openDetail}
                  onDelete={askDelete}
                  onToggleDefault={(id, current) => askDefaultChange(id, !current, "list")}
                />
              </Pane>
            ) : view === "type-choice" ? (
              <Pane key="type-choice">
                <TypeChoiceView onPick={afterTypeChoice} onBack={closeWizard} />
              </Pane>
            // LEGACY: spine-lint-disable-next-line spine/enum-over-string
            ) : view === "legal-name" ? (
              <Pane key="legal-name">
                <SingleTextView
                  title={typeTitleCopy(type, "legal-name", t)}
                  subtitle={
                    type === "individual"
                      ? t("legalEntities.legalNameSubtitleIndividual")
                      : type === "sole_prop"
                        ? t("legalEntities.legalNameSubtitleSoleProp")
                        : t("legalEntities.legalNameSubtitleCompany")
                  }
                  label={t("legalEntities.legalNameLabel")}
                  placeholder={type === "company" ? t("legalEntities.legalNamePlaceholderCompany") : t("legalEntities.legalNamePlaceholderPerson")}
                  value={legalName}
                  onChange={setLegalName}
                  onConfirm={afterLegalName}
                  onBack={editingMode ? cancelEdit : () => setView("type-choice")}
                  required
                  maxLength={180}
                  minLength={2}
                  requireLetter
                  requireWords={type === "company" ? undefined : 2}
                  invalidMessage={
                    type === "company"
                      ? t("legalEntities.legalNameInvalidCompany")
                      : t("legalEntities.legalNameInvalidPerson")
                  }
                />
              </Pane>
            ) : view === "trading-name" ? (
              <Pane key="trading-name">
                <SingleTextView
                  title={t("legalEntities.tradingNameTitle")}
                  subtitle={t("legalEntities.tradingNameSubtitle")}
                  label={t("legalEntities.tradingNameLabel")}
                  placeholder={t("legalEntities.tradingNamePlaceholder")}
                  value={tradingName}
                  onChange={setTradingName}
                  onConfirm={afterTradingName}
                  onBack={editingMode ? cancelEdit : () => setView("legal-name")}
                  maxLength={180}
                  optional
                />
              </Pane>
            ) : view === "dob" ? (
              <Pane key="dob">
                <DateView
                  title={t("legalEntities.dobTitle")}
                  subtitle={t("legalEntities.dobSubtitle")}
                  label={t("legalEntities.dobTitle")}
                  value={dob}
                  onChange={setDob}
                  onConfirm={afterDob}
                  onBack={
                    editingMode
                      ? cancelEdit
                      : () => setView(needsBusiness ? "trading-name" : "legal-name")
                  }
                  minDate={isoYearsAgo(120)}
                  maxDate={isoYearsAgo(18)}
                  outOfRangeMessage={t("legalEntities.dobAgeError")}
                />
              </Pane>
            ) : view === "place-of-birth" ? (
              <Pane key="place-of-birth">
                <PlaceOfBirthView
                  label={placeOfBirth}
                  placeId={placeOfBirthPlaceId}
                  onPick={(label, placeId) => {
                    setPlaceOfBirth(label);
                    setPlaceOfBirthPlaceId(placeId);
                  }}
                  onClear={() => {
                    setPlaceOfBirth("");
                    setPlaceOfBirthPlaceId(null);
                  }}
                  onConfirm={afterPlaceOfBirth}
                  onBack={editingMode ? cancelEdit : () => setView("dob")}
                />
              </Pane>
            ) : view === "nationality" ? (
              <Pane key="nationality">
                <NationalityView
                  value={nationality}
                  onChange={setNationality}
                  onConfirm={afterNationality}
                  onBack={editingMode ? cancelEdit : () => setView("place-of-birth")}
                />
              </Pane>
            ) : view === "tax-country" ? (
              <Pane key="tax-country">
                <CountryView
                  title={t("legalEntities.taxCountryTitle")}
                  subtitle={t("legalEntities.taxCountrySubtitle")}
                  value={taxCountry}
                  onChange={setTaxCountry}
                  onConfirm={afterTaxCountry}
                  onBack={
                    editingMode
                      ? cancelEdit
                      : () => setView(needsPerson ? "nationality" : "trading-name")
                  }
                  restrictTo={TAX_VALIDATABLE_COUNTRIES}
                  required
                />
              </Pane>
            ) : view === "tax-ids" ? (
              <Pane key="tax-ids">
                <TaxIdsView
                  entityType={type}
                  country={taxCountry}
                  taxId={taxId}
                  vatId={vatId}
                  vatValidation={vatValidation}
                  setTaxId={setTaxId}
                  setVatId={setVatId}
                  setVatValidation={setVatValidation}
                  onConfirm={afterTaxIds}
                  onBack={editingMode ? cancelEdit : () => setView("tax-country")}
                />
              </Pane>
            ) : view === "verifying-tax-id" ? (
              <Pane key="verifying-tax-id">
                <VerifyingTaxIdView
                  country={taxCountry}
                  vatId={vatId}
                  validation={vatValidation}
                  onPass={proceedAfterTaxIds}
                  onBack={() => setView("tax-ids")}
                />
              </Pane>
            ) : view === "registration" ? (
              <Pane key="registration">
                <RegistrationView
                  country={taxCountry}
                  number={registrationNumber}
                  body={registrationBody}
                  since={registeredSince}
                  setNumber={setRegistrationNumber}
                  setBody={setRegistrationBody}
                  setSince={setRegisteredSince}
                  onConfirm={afterRegistration}
                  onBack={editingMode ? cancelEdit : () => setView("tax-ids")}
                />
              </Pane>
            ) : view === "address-search" ? (
              <Pane key="address-search">
                <AddressSearchView
                  onPick={onPickAddress}
                  onBack={
                    editingMode
                      ? cancelEdit
                      : () => setView(needsBusiness ? "registration" : "tax-ids")
                  }
                />
              </Pane>
            ) : view === "address-review" ? (
              <Pane key="address-review">
                <AddressReviewView
                  details={address}
                  onConfirm={afterAddressReview}
                  onChange={() => setView("address-search")}
                />
              </Pane>
            ) : view === "address-apt-floor" ? (
              <Pane key="address-apt-floor">
                <SingleTextView
                  title={t("legalEntities.addressAptTitle")}
                  subtitle={t("legalEntities.addressAptSubtitle")}
                  label={t("legalEntities.addressAptLabel")}
                  placeholder={t("legalEntities.addressAptPlaceholder")}
                  value={addressLine2}
                  onChange={setAddressLine2}
                  onConfirm={afterAddressAptFloor}
                  onBack={editingMode ? cancelEdit : () => setView("address-review")}
                  maxLength={240}
                  optional
                />
              </Pane>
            ) : view === "contact-choice" ? (
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
            ) : view === "contact-input" ? (
              <Pane key="contact-input">
                <ContactInputView
                  email={contactEmail}
                  phone={contactPhone}
                  setEmail={setContactEmail}
                  setPhone={setContactPhone}
                  onConfirm={onContactSave}
                  onBack={editingMode ? cancelEdit : () => setView("contact-choice")}
                  saveLabel={editingMode ? t("legalEntities.saveChangesCta") : t("legalEntities.saveEntityCta")}
                />
              </Pane>
            ) : view === "saving" ? (
              <Pane key="saving">
                <SavingView label={t("legalEntities.savingEntityLabel")} />
              </Pane>
            ) : view === "detail" ? (
              <Pane key="detail">
                <DetailView
                  entity={inspecting}
                  onBack={closeDetail}
                  onDelete={() => inspecting && askDelete(inspecting.id)}
                  onToggleDefault={() =>
                    inspecting && askDefaultChange(inspecting.id, !inspecting.isDefault, "detail")
                  }
                  onEditLegalName={() =>
                    inspecting && editField("legal-name", () => setLegalName(inspecting.legalName))
                  }
                  onEditTradingName={() =>
                    inspecting &&
                    editField("trading-name", () => setTradingName(inspecting.tradingName ?? ""))
                  }
                  onEditDob={() =>
                    inspecting &&
                    editField("dob", () => setDob(inspecting.dateOfBirth?.slice(0, 10) ?? ""))
                  }
                  onEditPlaceOfBirth={() =>
                    inspecting &&
                    editField("place-of-birth", () => {
                      setPlaceOfBirth(inspecting.placeOfBirth ?? "");
                      setPlaceOfBirthPlaceId(inspecting.placeOfBirthPlaceId ?? null);
                    })
                  }
                  onEditNationality={() =>
                    inspecting &&
                    editField("nationality", () => setNationality(inspecting.nationality ?? ""))
                  }
                  onEditTaxCountry={() =>
                    inspecting &&
                    editField("tax-country", () => setTaxCountry(inspecting.taxCountry))
                  }
                  onEditTaxIds={() =>
                    inspecting &&
                    editField("tax-ids", () => {
                      setTaxCountry(inspecting.taxCountry);
                      setTaxId(inspecting.taxId ?? "");
                      setVatId(inspecting.vatId ?? "");
                      setVatValidation({
                        level:
                          (inspecting.vatIdValidation as TaxIdValidationState["level"]) ?? "none",
                        name: inspecting.vatIdValidatedName ?? null,
                        authority: null,
                        normalisedId: inspecting.vatId ?? "",
                      });
                    })
                  }
                  onEditRegistration={() =>
                    inspecting &&
                    editField("registration", () => {
                      setRegistrationNumber(inspecting.registrationNumber ?? "");
                      setRegistrationBody(inspecting.registrationBody ?? "");
                      setRegisteredSince(inspecting.registeredSince?.slice(0, 10) ?? "");
                    })
                  }
                  onEditContact={() =>
                    inspecting &&
                    editField("contact-input", () => {
                      setContactEmail(inspecting.contactEmail ?? "");
                      setContactPhone(inspecting.contactPhone ?? "");
                    })
                  }
                />
              </Pane>
            ) : view === "delete-confirm" ? (
              <Pane key="delete-confirm">
                <DeleteConfirmView
                  entity={deletingEntity}
                  error={error}
                  onCancel={cancelDelete}
                  onConfirm={confirmDelete}
                />
              </Pane>
            ) : view === "deleting" ? (
              <Pane key="deleting">
                <SavingView label={t("legalEntities.deletingEntityLabel")} />
              </Pane>
            ) : (
              <Pane key="default-confirm">
                <DefaultConfirmView
                  entity={defaultIntentEntity}
                  setting={defaultIntent?.setting ?? true}
                  error={error}
                  onCancel={cancelDefaultChange}
                  onConfirm={confirmDefaultChange}
                />
              </Pane>
            )}
          </AnimatePresence>
        </div>
      </MaybeCard>
    </div>
  );
}

// ─── Sub-views (kept in this file for now — extract to its own SDK
//     when the wizard's footprint stabilises). ────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <button
        type="button"
        onClick={onAdd}
        className="group flex w-full max-w-[340px] flex-col items-center gap-3 rounded-[14px] border border-dashed border-fg-3/30 px-6 py-8 transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)] cursor-pointer"
      >
        <div className="grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] text-[var(--elvix-primary)] transition group-hover:scale-105">
          <Building2 className="size-6" />
        </div>
        <div>
          <div className="text-[15px] font-semibold text-fg-1">{t("legalEntities.addCta")}</div>
          <div className="mt-1 text-[12px] text-fg-3">
            {t("legalEntities.addCtaSubtitle")}
          </div>
        </div>
      </button>
    </div>
  );
}

function ListView({
  entities,
  onAdd,
  onOpen,
  onDelete,
  onToggleDefault,
}: {
  entities: LegalEntityRecord[];
  onAdd: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleDefault: (id: string, currentlyDefault: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 pt-3 pb-4">
      <button
        type="button"
        onClick={onAdd}
        className="group flex items-center justify-center gap-2 rounded-[12px] border border-dashed border-fg-3/30 px-4 py-3 text-[13px] font-medium text-fg-2 transition hover:border-[var(--elvix-primary)] hover:text-[var(--elvix-primary)] cursor-pointer"
      >
        <Plus className="size-4" />
        {t("legalEntities.addAnotherCta")}
      </button>
      {entities.map((e) => {
        const icon = typeIcon(e.type as LegalEntityType);
        const subtitle =
          e.type === "individual"
            ? t("legalEntities.kindIndividual")
            : e.type === "sole_prop"
              ? t("legalEntities.kindSoleProp")
              : t("legalEntities.kindCompany");
        return (
          <div
            key={e.id}
            className="group relative flex w-full items-start gap-3 rounded-[12px] border border-fg-3/15 bg-surface text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_4%,transparent)]"
          >
            <button
              type="button"
              onClick={() => onOpen(e.id)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left cursor-pointer"
            >
              <div className="mt-0.5 text-fg-3 group-hover:text-[var(--elvix-primary)]">{icon}</div>
              <div className="min-w-0 flex-1 pr-20">
                <div className="flex items-center gap-2">
                  <div className="truncate text-[14px] font-semibold text-fg-1">
                    {e.label?.trim() || e.legalName}
                  </div>
                  {e.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_15%,transparent)] px-2 py-[1px] text-[10px] font-medium text-[var(--elvix-primary)]">
                      <Star className="size-2.5 fill-current" />
                      {t("addressBook.defaultBadge")}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-fg-2">
                  {subtitle}
                  {e.tradingName ? ` · ${e.tradingName}` : ""}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-fg-3">
                  {findCountry(e.taxCountry)?.flag ?? ""}{" "}
                  {findCountry(e.taxCountry)?.name ?? e.taxCountry}
                  {e.vatId ? ` · ${e.vatId}` : ""}
                </div>
              </div>
            </button>
            <div className="absolute right-2 top-2 flex items-center gap-0.5">
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onToggleDefault(e.id, Boolean(e.isDefault));
                }}
                className={
                  "inline-flex size-8 items-center justify-center rounded-md transition cursor-pointer " +
                  (e.isDefault
                    ? "text-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)]"
                    : "text-fg-3 hover:bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] hover:text-[var(--elvix-primary)]")
                }
                aria-label={e.isDefault ? t("legalEntities.removeDefaultAria") : t("legalEntities.setDefaultAria")}
              >
                <Star className={e.isDefault ? "size-4 fill-current" : "size-4"} />
              </button>
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onDelete(e.id);
                }}
                className="inline-flex size-8 items-center justify-center rounded-md text-fg-3 transition hover:bg-red-500/10 hover:text-red-600 cursor-pointer"
                aria-label={t("legalEntities.deleteAria")}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TypeChoiceView({
  onPick,
  onBack,
}: {
  onPick: (t: LegalEntityType) => void;
  onBack: () => void;
}) {
  const t = useT();
  const TYPES: Array<{
    type: LegalEntityType;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
  }> = [
    {
      type: "individual",
      title: t("legalEntities.kindIndividual"),
      subtitle: t("legalEntities.individualSubtitle"),
      icon: <User className="size-4" />,
    },
    {
      type: "sole_prop",
      title: t("legalEntities.kindSoleProp"),
      subtitle: t("legalEntities.soleProprietorshipSubtitle"),
      icon: <Briefcase className="size-4" />,
    },
    {
      type: "company",
      title: t("legalEntities.kindCompany"),
      subtitle: t("legalEntities.companySubtitle"),
      icon: <Building2 className="size-4" />,
    },
  ];
  return (
    <div className="flex h-full flex-col">
      <WizardHeader stepLabel={t("legalEntities.step1of3")} onBack={onBack} />
      <Heading>{t("legalEntities.typeChoiceTitle")}</Heading>
      <Subtitle>{t("legalEntities.typeChoiceSubtitle")}</Subtitle>
      <div className="mt-4 flex flex-col gap-2">
        {TYPES.map((opt) => (
          <ChoiceCard
            key={opt.type}
            onClick={() => onPick(opt.type)}
            icon={opt.icon}
            title={opt.title}
            subtitle={opt.subtitle}
          />
        ))}
      </div>
    </div>
  );
}

function SingleTextView({
  title,
  subtitle,
  label,
  placeholder,
  value,
  onChange,
  onConfirm,
  onBack,
  required = false,
  optional = false,
  maxLength = 240,
  minLength,
  requireLetter = false,
  requireWords,
  invalidMessage,
}: {
  title: string;
  subtitle: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  required?: boolean;
  optional?: boolean;
  maxLength?: number;
  /** Minimum trimmed length. Defaults to 1 for required, else 0. */
  minLength?: number;
  /** When true, the trimmed value must contain at least one letter
   *  (Unicode-aware). Catches "1", "...", " " etc. */
  requireLetter?: boolean;
  /** Minimum number of whitespace-separated words, each with ≥1
   *  letter. Used to enforce "given name + family name" for natural
   *  persons; left undefined for company names. */
  requireWords?: number;
  /** Shown inline when the value is non-empty but fails the gate. */
  invalidMessage?: string;
}) {
  const t = useT();
  const trimmed = value.trim();
  const effectiveMin = minLength ?? (required ? 1 : 0);
  const lengthOk = trimmed.length >= effectiveMin && trimmed.length <= maxLength;
  const letterOk = requireLetter ? /\p{L}/u.test(trimmed) : true;
  const wordsOk = requireWords
    ? trimmed.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length >= requireWords
    : true;
  const presenceOk = required ? trimmed.length > 0 : true;
  const valid = presenceOk && lengthOk && letterOk && wordsOk;
  const showError = trimmed.length > 0 && (!lengthOk || !letterOk || !wordsOk);
  void optional;
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <Heading>{title}</Heading>
      <Subtitle>{subtitle}</Subtitle>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{label}</span>
        <ElvixInput
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus
          maxLength={maxLength}
          hasError={showError}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) onConfirm();
          }}
        />
        {showError && invalidMessage && (
          <span className="mt-1.5 block text-[12px] text-red-600 dark:text-red-300">
            {invalidMessage}
          </span>
        )}
      </label>
      <div className="mt-auto flex items-center justify-end pt-3">
        <ElvixSaveButton
          state="idle"
          disabled={!valid}
          onClick={() => valid && onConfirm()}
          label={t("common.continue")}
          savedLabel={t("common.continue")}
          hint={t("common.enterHint")}
          className="!w-auto !px-5"
        />
      </div>
    </div>
  );
}

function DateView({
  title,
  subtitle,
  label,
  value,
  onChange,
  onConfirm,
  onBack,
  minDate,
  maxDate,
  outOfRangeMessage,
}: {
  title: string;
  subtitle: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  /** ISO yyyy-mm-dd lower bound (inclusive). */
  minDate?: string;
  /** ISO yyyy-mm-dd upper bound (inclusive). Defaults to today. */
  maxDate?: string;
  outOfRangeMessage?: string;
}) {
  const t = useT();
  const fallbackOutOfRangeMessage = outOfRangeMessage ?? t("legalEntities.dobOutOfRange");
  const today = new Date().toISOString().slice(0, 10);
  const upper = maxDate ?? today;
  const formatOk = /^\d{4}-\d{2}-\d{2}$/.test(value);
  // Date inputs accept manual yyyy typing on Chrome, so the `min` /
  // `max` HTML attrs are only soft hints. Validate in JS too.
  const parseable = formatOk && !Number.isNaN(new Date(value).getTime());
  const withinRange = parseable && value <= upper && (minDate ? value >= minDate : true);
  const valid = parseable && withinRange;
  const showError = formatOk && parseable && !withinRange;
  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onConfirm();
      }}
    >
      <WizardHeader onBack={onBack} />
      <Heading>{title}</Heading>
      <Subtitle>{subtitle}</Subtitle>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{label}</span>
        <ElvixInput
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          max={upper}
          min={minDate}
          hasError={showError}
        />
        {showError && (
          <span className="mt-1.5 block text-[12px] text-red-600 dark:text-red-300">
            {fallbackOutOfRangeMessage}
          </span>
        )}
      </label>
      <div className="mt-auto flex items-center justify-end pt-3">
        <ElvixSaveButton
          state="idle"
          disabled={!valid}
          onClick={() => valid && onConfirm()}
          label={t("common.continue")}
          savedLabel={t("common.continue")}
          hint={t("common.enterHint")}
          className="!w-auto !px-5"
        />
      </div>
    </form>
  );
}

/** ISO yyyy-mm-dd N years before today. */
function isoYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function CountryView({
  title,
  subtitle,
  value,
  onChange,
  onConfirm,
  onBack,
  restrictTo,
  required = false,
}: {
  title: string;
  subtitle: string;
  value: string;
  onChange: (code: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  restrictTo?: readonly string[];
  required?: boolean;
}) {
  const t = useT();
  const valid = required ? Boolean(value) : true;
  const selected = value ? findCountry(value) : null;
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <Heading>{title}</Heading>
      <Subtitle>{subtitle}</Subtitle>
      {selected && (
        <div className="mt-4 flex flex-wrap gap-2">
          <CountryChip country={selected} onRemove={() => onChange("")} />
        </div>
      )}
      <div className="mt-4">
        <ElvixCountrySelect
          value={null}
          onChange={onChange}
          restrictTo={restrictTo}
          collapsible={false}
          listMaxHeightClass={selected ? "max-h-44" : "max-h-52"}
        />
      </div>
      <div className="mt-auto flex items-center justify-end pt-3">
        <ElvixSaveButton
          state="idle"
          disabled={!valid}
          onClick={() => valid && onConfirm()}
          label={t("common.continue")}
          savedLabel={t("common.continue")}
          hint={null}
          className="!w-auto !px-5"
        />
      </div>
    </div>
  );
}

/**
 * Shared chip primitive used by both `<CountryView>` (single) and
 * `<NationalityView>` (multi). Same visual treatment everywhere so
 * the user reads "selection" identically across panes.
 */
function CountryChip({
  country,
  onRemove,
  badge,
}: {
  country: { code: string; name: string; flag: string };
  onRemove: () => void;
  badge?: string | null;
}) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--elvix-primary)] bg-[color-mix(in_srgb,var(--elvix-primary)_10%,transparent)] px-2.5 py-1 text-[12.5px] font-medium text-fg-1">
      <span aria-hidden className="text-[14px] leading-none">
        {country.flag}
      </span>
      <span>{country.name}</span>
      {badge && (
        <span className="text-[10px] uppercase tracking-wide text-[var(--elvix-primary)]">
          {badge}
        </span>
      )}
      <button
        type="button"
        aria-label={t("legalEntities.removeCountryAria", { name: country.name })}
        onClick={onRemove}
        className="ml-0.5 grid size-4 place-items-center rounded-full text-fg-3 transition hover:bg-fg-3/15 hover:text-fg-1 cursor-pointer"
      >
        <span className="text-[12px] leading-none">×</span>
      </button>
    </span>
  );
}

/**
 * `<NationalityView>` — multi-select nationality picker. Backs the
 * wizard's "Nationality" pane; schema serialises picks as comma-
 * separated ISO codes ("DE,UA"), capped at 4 to match the schema
 * regex. Chips show the current selection with a remove button; the
 * picker hides itself when the cap is hit.
 */
const MAX_NATIONALITIES = 4;

function NationalityView({
  value,
  onChange,
  onConfirm,
  onBack,
}: {
  value: string;
  onChange: (next: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const codes = value
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const setCodes = (next: string[]) => onChange(next.join(","));
  const add = (code: string) => {
    if (!code) return;
    if (codes.includes(code)) return;
    if (codes.length >= MAX_NATIONALITIES) return;
    setCodes([...codes, code]);
  };
  const remove = (code: string) => setCodes(codes.filter((c) => c !== code));
  const atCap = codes.length >= MAX_NATIONALITIES;
  const valid = codes.length >= 1;

  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <Heading>{t("legalEntities.nationalityTitle")}</Heading>
      <Subtitle>
        {t("legalEntities.nationalitySubtitle", { max: MAX_NATIONALITIES })}
      </Subtitle>

      {codes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {codes.map((code, idx) => {
            const c = findCountry(code) ?? { code, name: code, flag: "🏳" };
            return (
              <CountryChip
                key={code}
                country={c}
                onRemove={() => remove(code)}
                badge={idx === 0 && codes.length > 1 ? t("legalEntities.nationalityPrimaryBadge") : null}
              />
            );
          })}
        </div>
      )}

      {!atCap && (
        <div className="mt-4">
          <ElvixCountrySelect
            value={null}
            onChange={add}
            collapsible={false}
            listMaxHeightClass={codes.length > 0 ? "max-h-44" : "max-h-52"}
          />
        </div>
      )}
      {atCap && (
        <div className="mt-4 rounded-[10px] bg-fg-3/8 px-3 py-2 text-[12.5px] text-fg-2">
          {t("legalEntities.nationalityCapReached", { max: MAX_NATIONALITIES })}
        </div>
      )}

      <div className="mt-auto flex items-center justify-end pt-3">
        <ElvixSaveButton
          state="idle"
          disabled={!valid}
          onClick={() => valid && onConfirm()}
          label={t("common.continue")}
          savedLabel={t("common.continue")}
          hint={null}
          className="!w-auto !px-5"
        />
      </div>
    </div>
  );
}

function TaxIdsView({
  entityType,
  country,
  taxId,
  vatId,
  vatValidation,
  setTaxId,
  setVatId,
  setVatValidation,
  onConfirm,
  onBack,
}: {
  entityType: LegalEntityType | null;
  country: string;
  taxId: string;
  vatId: string;
  vatValidation: TaxIdValidationState;
  setTaxId: (v: string) => void;
  setVatId: (v: string) => void;
  setVatValidation: (s: TaxIdValidationState) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const t = useT();
  // Per-type required-field gates:
  //
  //   Individual → only the local tax number (Steuernummer/NINO/…) is
  //                relevant and REQUIRED. VAT is hidden — natural
  //                persons don't hold a VAT ID.
  //   Sole prop  → both shown but BOTH OPTIONAL. The registered
  //                business identity comes from the next pane
  //                (registration number + issuing authority); local
  //                tax number is only relevant if the user wants it
  //                on invoices, VAT only if they're VAT-registered.
  //   Company    → both shown; VAT required (live-validated); local
  //                tax number optional (some jurisdictions issue
  //                only one).
  const isIndividual = entityType === "individual";
  const isSoleProp = entityType === "sole_prop";
  const isCompany = entityType === "company";
  const showVat = !isIndividual;
  const taxIdRequired = isIndividual;
  const vatRequired = isCompany;
  void isSoleProp;

  const trimmedTax = taxId.trim();
  const trimmedVat = vatId.trim();

  // Local tax number format gate, in addition to required/optional.
  // Lenient when empty AND not required; strict when non-empty AND
  // the country has a known format.
  const taxIdFormatOk = trimmedTax.length === 0 ? true : localTaxIdMatches(country, trimmedTax);

  let blockReason: string | null = null;
  if (taxIdRequired && trimmedTax.length === 0) {
    blockReason = t("legalEntities.blockReasonTaxIdRequired");
  } else if (trimmedTax.length > 0 && !taxIdFormatOk) {
    blockReason = t("legalEntities.blockReasonTaxIdFormat", {
      country: findCountry(country)?.name ?? country,
      hint: taxIdFormatHint(country, t),
    });
  } else if (showVat) {
    if (vatRequired && trimmedVat.length === 0) {
      blockReason = t("legalEntities.blockReasonVatRequired");
    } else if (trimmedVat.length > 0) {
      // The input now runs a synchronous client-side format check
      // and emits `invalid` for bad format, `format` for OK format.
      // The Verifying pane (next step) is where the actual authority
      // call happens.
      // LEGACY: spine-lint-disable-next-line spine/enum-over-string
      if (vatValidation.level === "invalid") {
        blockReason = t("legalEntities.blockReasonVatFormat");
      }
    }
  }
  const canContinue = blockReason === null;

  const subtitleCopy = isIndividual
    ? t("legalEntities.taxIdsSubtitleIndividual", {
        country: findCountry(country)?.name ?? t("legalEntities.taxIdsSubtitleIndividualFallback"),
      })
    : isCompany
      ? t("legalEntities.taxIdsSubtitleCompany", {
          authority: findCountry(country)?.name ?? t("legalEntities.taxIdsSubtitleCompanyFallback"),
        })
      : t("legalEntities.taxIdsSubtitleSoleProp");

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (canContinue) onConfirm();
      }}
    >
      <WizardHeader onBack={onBack} />
      <Heading>{t("legalEntities.taxIdsTitle")}</Heading>
      <Subtitle>{subtitleCopy}</Subtitle>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
            {t("legalEntities.localTaxNumberLabel")}{taxIdRequired ? "" : t("common.optionalSuffix")}
          </span>
          <ElvixInput
            type="text"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            placeholder={taxIdPlaceholder(country)}
            maxLength={40}
            autoFocus={isIndividual}
            hasError={trimmedTax.length > 0 && !taxIdFormatOk}
          />
        </label>
        {showVat && (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
              {t("legalEntities.vatCompanyIdLabel")}{vatRequired ? "" : t("common.optionalSuffix")}
            </span>
            <ElvixTaxIdInput
              country={country}
              value={vatId}
              onChange={setVatId}
              onValidationChange={setVatValidation}
              placeholder={vatPlaceholder(country)}
              autoFocus={!isIndividual && !vatId}
            />
          </label>
        )}
      </div>
      <div className="mt-auto flex items-center justify-end gap-3 pt-3">
        {blockReason && <span className="text-[12px] text-fg-3">{blockReason}</span>}
        <ElvixSaveButton
          state="idle"
          disabled={!canContinue}
          onClick={() => canContinue && onConfirm()}
          label={t("common.continue")}
          savedLabel={t("common.continue")}
          hint={null}
          className="!w-auto !px-5"
        />
      </div>
      <span className="sr-only">{vatValidation.level}</span>
    </form>
  );
}

/**
 * `<VerifyingTaxIdView>` — confidence pane shown between Tax
 * identifiers and the next step. Re-runs the authority lookup live,
 * shows a spinner during the call, then routes:
 *
 *   live    → ✓ animation + "Verified as {name}" + auto-advance
 *   format  → ⚠ "Authority unreachable" + manual Continue (we store
 *              the entry anyway; the next sync will re-verify)
 *   invalid → ✗ "Authority couldn't confirm this VAT" + Back to fix
 *
 * Minimum display time of ~900ms so the animation always feels
 * intentional, even on fast networks where the cached state is
 * already known.
 */
function VerifyingTaxIdView({
  country,
  vatId,
  validation,
  onPass,
  onBack,
}: {
  country: string;
  vatId: string;
  validation: TaxIdValidationState;
  onPass: () => void;
  onBack: () => void;
}) {
  // Local state tracks the verification lifecycle independently from
  // the cached `validation` prop. We always re-run so the user sees
  // a fresh authority call, not a cached verdict.
  const ctx = useElvixContext();
  const t = useT();
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const [phase, setPhase] = useState<"checking" | "settled">("checking");
  const [result, setResult] = useState<TaxIdValidationState>(validation);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    const minDisplay = 900;
    const trimmed = vatId.trim();
    (async () => {
      try {
        const res = await fetch(
          `${ctx.baseUrl}/public/api/tax/validate?country=${encodeURIComponent(country)}&vatId=${encodeURIComponent(trimmed)}`,
          { signal: ctrl.signal, credentials: isSameOrigin(ctx.baseUrl) ? "include" : "omit" },
        );
        if (!res.ok) throw new Error(`http ${res.status}`);
        const body = unwrapEnvelope(await res.json()) as {
          ok: boolean;
          result: {
            level: TaxIdValidationState["level"];
            name: string | null;
            authority: string | null;
            normalisedId: string;
          };
        };
        if (cancelled) return;
        const elapsed = Date.now() - startedAt.current;
        const wait = Math.max(0, minDisplay - elapsed);
        setTimeout(() => {
          if (cancelled) return;
          setResult({
            level: body.result.level,
            name: body.result.name,
            authority: body.result.authority,
            normalisedId: body.result.normalisedId,
          });
          setPhase("settled");
        }, wait);
      } catch (e) {
        if (cancelled) return;
        const elapsed = Date.now() - startedAt.current;
        const wait = Math.max(0, minDisplay - elapsed);
        setTimeout(() => {
          if (cancelled) return;
          // Network blew up → degrade to format-only, let the user proceed.
          setResult({
            level: "format",
            name: null,
            authority: null,
            normalisedId: trimmed,
          });
          setPhase("settled");
        }, wait);
        void e;
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [country, vatId, ctx.baseUrl]);

  // Auto-advance on live after a brief celebration delay so the user
  // registers the success state, then the wizard moves on.
  useEffect(() => {
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    if (phase !== "settled") return;
    if (result.level !== "live") return;
    const handle = setTimeout(onPass, 850);
    return () => clearTimeout(handle);
  }, [phase, result.level, onPass]);

  const authorityName = result.authority ?? t("legalEntities.authorityFallback");
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const isChecking = phase === "checking";
  const isLive = phase === "settled" && result.level === "live";
  const isInvalid = phase === "settled" && result.level === "invalid";
  const isFormat = phase === "settled" && result.level === "format";

  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} backLabel={t("legalEntities.editTaxIdsBackLabel")} />
      <Heading>
        {isChecking
          ? t("legalEntities.verifyHeadingChecking")
          : isLive
            ? t("legalEntities.verifyHeadingLive")
            : isInvalid
              ? t("legalEntities.verifyHeadingInvalid")
              : t("legalEntities.verifyHeadingFormat")}
      </Heading>
      <Subtitle>
        {isChecking
          ? t("legalEntities.verifySubtitleChecking", { vatId, country: findCountry(country)?.name ?? country })
          : isLive && result.name
            ? t("legalEntities.verifySubtitleLiveNamed", { authority: authorityName, name: result.name })
            : isLive
              ? t("legalEntities.verifySubtitleLive", { authority: authorityName })
              : isInvalid
                ? t("legalEntities.verifySubtitleInvalid", { authority: authorityName, vatId })
                : t("legalEntities.verifySubtitleFormat", { authority: authorityName })}
      </Subtitle>

      <div className="mt-6 grid flex-1 place-items-center">
        <VerifyingBadge phase={phase} level={result.level} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-3">
        {isInvalid ? (
          <>
            <span />
            <ElvixSaveButton
              state="idle"
              onClick={onBack}
              label={t("legalEntities.fixVatCta")}
              savedLabel={t("legalEntities.fixVatCta")}
              hint={null}
              className="!w-auto !px-5"
            />
          </>
        ) : isFormat ? (
          <>
            <button
              type="button"
              onClick={onBack}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
            >
              {t("common.back")}
            </button>
            <ElvixSaveButton
              state="idle"
              onClick={onPass}
              label={t("legalEntities.continueAnywayCta")}
              savedLabel={t("common.continue")}
              hint={null}
              className="!w-auto !px-5"
            />
          </>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

function VerifyingBadge({
  phase,
  level,
}: {
  phase: Phase;
  level: TaxIdValidationState["level"];
}) {
  const t = useT();
  if (phase === "checking") {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="grid size-16 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] text-[var(--elvix-primary)]">
          <Loader2 className="size-7 animate-spin" />
        </div>
        <div className="text-[12px] uppercase tracking-wide text-fg-3">{t("legalEntities.verifying")}</div>
      </div>
    );
  }
  if (level === "live") {
    return (
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 18 }}
        className="flex flex-col items-center gap-3"
      >
        <div className="grid size-16 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_18%,transparent)] text-[var(--elvix-primary)]">
          <CheckCircle2 className="size-8" />
        </div>
        <div className="text-[12px] uppercase tracking-wide text-[var(--elvix-primary)]">
          {t("legalEntities.verifiedBadge")}
        </div>
      </motion.div>
    );
  }
  if (level === "invalid") {
    return (
      <motion.div
        initial={{ x: -6, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col items-center gap-3"
      >
        <div className="grid size-16 place-items-center rounded-full bg-red-500/10 text-red-500">
          <XCircle className="size-8" />
        </div>
        <div className="text-[12px] uppercase tracking-wide text-red-500">{t("legalEntities.notRegistered")}</div>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center gap-3"
    >
      <div className="grid size-16 place-items-center rounded-full bg-amber-500/10 text-amber-500">
        <AlertTriangle className="size-8" />
      </div>
      <div className="text-[12px] uppercase tracking-wide text-amber-500">{t("legalEntities.unreachable")}</div>
    </motion.div>
  );
}

function RegistrationView({
  country,
  number,
  body,
  since,
  setNumber,
  setBody,
  setSince,
  onConfirm,
  onBack,
}: {
  country: string;
  number: string;
  body: string;
  since: string;
  setNumber: (v: string) => void;
  setBody: (v: string) => void;
  setSince: (v: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const today = new Date().toISOString().slice(0, 10);
  const sinceFormatOk = since === "" || /^\d{4}-\d{2}-\d{2}$/.test(since);
  const sinceRangeOk = since === "" || (since <= today && since >= "1900-01-01");
  const sinceOk = sinceFormatOk && sinceRangeOk;
  const trimmedNumber = number.trim();
  const numberFormatOk =
    trimmedNumber.length === 0 ? false : registrationNumberMatches(country, trimmedNumber);
  const showNumberError = trimmedNumber.length > 0 && !numberFormatOk;
  const valid = numberFormatOk && body.trim().length >= 2 && sinceOk;
  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onConfirm();
      }}
    >
      <WizardHeader onBack={onBack} />
      <Heading>{t("legalEntities.registrationTitle")}</Heading>
      <Subtitle>
        {t("legalEntities.registrationSubtitle")}
      </Subtitle>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
            {t("legalEntities.registrationNumberLabel")}
          </span>
          <ElvixInput
            type="text"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder={regNumberPlaceholder(country)}
            autoFocus
            maxLength={80}
            hasError={showNumberError}
          />
          {showNumberError && (
            <span className="mt-1.5 block text-[12px] text-red-600 dark:text-red-300">
              {regNumberFormatHint(country, t)}
            </span>
          )}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{t("legalEntities.issuingAuthorityLabel")}</span>
          <ElvixInput
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("legalEntities.issuingAuthorityPlaceholder")}
            maxLength={180}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
            {t("legalEntities.registeredSinceLabel")}
          </span>
          <ElvixInput
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            max={today}
            min="1900-01-01"
            hasError={!sinceOk}
          />
          {!sinceOk && (
            <span className="mt-1.5 block text-[12px] text-red-600 dark:text-red-300">
              {t("legalEntities.registeredSinceRangeError")}
            </span>
          )}
        </label>
      </div>
      <div className="mt-auto flex items-center justify-end pt-3">
        <ElvixSaveButton
          state="idle"
          disabled={!valid}
          onClick={() => valid && onConfirm()}
          label={t("common.continue")}
          savedLabel={t("common.continue")}
          hint={null}
          className="!w-auto !px-5"
        />
      </div>
    </form>
  );
}

// ─── Place-of-birth picker (city-level Places autocomplete) ──────────

/**
 * `<PlaceOfBirthView>` — Google Places autocomplete filtered to cities
 * (`?types=cities`). Captures the canonical `place_id` alongside the
 * human-readable label so downstream surfaces (Ambassadors desk) can
 * resolve the city without re-geocoding.
 *
 * Optional field — empty save is allowed via "Skip". Edit mode pre-
 * seeds the input with the saved label; clearing it persists null.
 */
function PlaceOfBirthView({
  label,
  placeId,
  onPick,
  onClear,
  onConfirm,
  onBack,
}: {
  label: string;
  placeId: string | null;
  onPick: (label: string, placeId: string) => void;
  onClear: () => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const ctx = useElvixContext();
  const t = useT();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sessionRef = useRef<string>(newSessionToken());

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setErr(null);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `${ctx.baseUrl}/public/api/maps/autocomplete?q=${encodeURIComponent(q)}&session=${sessionRef.current}&types=cities`,
          { signal: controller.signal, credentials: isSameOrigin(ctx.baseUrl) ? "include" : "omit" },
        );
        if (!res.ok) throw new Error(`http ${res.status}`);
        const body = unwrapEnvelope(await res.json()) as {
          ok: boolean;
          suggestions: PlaceSuggestion[];
        };
        setSuggestions(body.suggestions ?? []);
        setErr(null);
      } catch (e) {
        if (controller.signal.aborted) return;
        setErr(e instanceof Error ? e.message : "search_failed");
        setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 180);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, ctx.baseUrl]);

  const pick = useCallback(
    (s: PlaceSuggestion) => {
      const labelText = s.text || [s.mainText, s.secondaryText].filter(Boolean).join(", ");
      onPick(labelText, s.placeId);
      sessionRef.current = newSessionToken();
      setQuery("");
      setSuggestions([]);
    },
    [onPick],
  );

  const hasPick = Boolean(placeId && label);

  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <Heading>{t("legalEntities.placeOfBirthTitle")}</Heading>
      <Subtitle>{t("legalEntities.placeOfBirthSubtitle")}</Subtitle>

      {hasPick && (
        <div className="mt-4 flex items-start gap-3 rounded-[12px] border border-[var(--elvix-primary)] bg-[color-mix(in_srgb,var(--elvix-primary)_8%,transparent)] px-3 py-2.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--elvix-primary)]" />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-medium text-fg-1">{label}</div>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-2 py-1 text-[12px] font-medium text-fg-2 transition hover:bg-fg-3/10 hover:text-fg-1 cursor-pointer"
          >
            {t("legalEntities.placeChangeCta")}
          </button>
        </div>
      )}

      {!hasPick && (
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{t("legalEntities.placeOfBirthCityLabel")}</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
            <ElvixInput
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("legalEntities.placeOfBirthCityPlaceholder")}
              autoFocus
              autoComplete="off"
              className="pl-9"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-fg-3" />
            )}
          </div>
        </label>
      )}

      {!hasPick && (
        <div className="mt-2 flex-1 min-h-0 overflow-y-auto pr-1">
          {err && (
            <div className="rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
              {t("legalEntities.placeSearchError", { error: err })}
            </div>
          )}
          <ul className="flex flex-col gap-1">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  className="group flex w-full items-start gap-3 rounded-[12px] border border-fg-3/15 bg-surface px-3 py-2.5 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)] cursor-pointer"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-fg-3 group-hover:text-[var(--elvix-primary)]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-fg-1">
                      {s.mainText || s.text}
                    </div>
                    {s.secondaryText && (
                      <div className="truncate text-[12px] text-fg-3">{s.secondaryText}</div>
                    )}
                  </div>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-[var(--elvix-primary)]" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto flex items-center justify-end pt-3">
        <ElvixSaveButton
          state="idle"
          disabled={!hasPick}
          onClick={() => hasPick && onConfirm()}
          label={t("common.continue")}
          savedLabel={t("common.continue")}
          hint={null}
          className="!w-auto !px-5"
        />
      </div>
    </div>
  );
}

// ─── Address sub-flow (reuses the Places autocomplete pattern) ───────

function AddressSearchView({
  onPick,
  onBack,
}: {
  onPick: (details: PlaceDetails) => void;
  onBack: () => void;
}) {
  const ctx = useElvixContext();
  const t = useT();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sessionRef = useRef<string>(newSessionToken());

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setErr(null);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `${ctx.baseUrl}/public/api/maps/autocomplete?q=${encodeURIComponent(q)}&session=${sessionRef.current}`,
          { signal: controller.signal, credentials: isSameOrigin(ctx.baseUrl) ? "include" : "omit" },
        );
        if (!res.ok) throw new Error(`http ${res.status}`);
        const body = unwrapEnvelope(await res.json()) as {
          ok: boolean;
          suggestions: PlaceSuggestion[];
        };
        setSuggestions(body.suggestions ?? []);
        setErr(null);
      } catch (e) {
        if (controller.signal.aborted) return;
        setErr(e instanceof Error ? e.message : "search_failed");
        setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 180);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, ctx.baseUrl]);

  const pick = useCallback(
    async (placeId: string) => {
      setPicking(placeId);
      try {
        const res = await fetch(
          `${ctx.baseUrl}/public/api/maps/place-details?placeId=${encodeURIComponent(placeId)}&session=${sessionRef.current}`,
          { credentials: isSameOrigin(ctx.baseUrl) ? "include" : "omit" },
        );
        if (!res.ok) throw new Error(`http ${res.status}`);
        const body = unwrapEnvelope(await res.json()) as { ok: boolean; details: PlaceDetails };
        sessionRef.current = newSessionToken();
        onPick(body.details);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "details_failed");
        setPicking(null);
      }
    },
    [onPick, ctx.baseUrl],
  );

  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <Heading>{t("legalEntities.addressSearchTitle")}</Heading>
      <Subtitle>{t("legalEntities.addressSearchSubtitle")}</Subtitle>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{t("legalEntities.addressLabel")}</span>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <ElvixInput
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("legalEntities.addressSearchPlaceholder")}
            autoFocus
            autoComplete="off"
            className="pl-9"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-fg-3" />
          )}
        </div>
      </label>
      <div className="mt-2 flex-1 min-h-0 overflow-y-auto pr-1">
        {err && (
          <div className="rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
            {t("legalEntities.placeSearchError", { error: err })}
          </div>
        )}
        <ul className="flex flex-col gap-1">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                disabled={picking !== null}
                onClick={() => pick(s.placeId)}
                className="group flex w-full items-start gap-3 rounded-[12px] border border-fg-3/15 bg-surface px-3 py-2.5 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)] disabled:opacity-50 cursor-pointer"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-fg-3 group-hover:text-[var(--elvix-primary)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-fg-1">
                    {s.mainText || s.text}
                  </div>
                  {s.secondaryText && (
                    <div className="truncate text-[12px] text-fg-3">{s.secondaryText}</div>
                  )}
                </div>
                {picking === s.placeId ? (
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-[var(--elvix-primary)]" />
                ) : (
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-[var(--elvix-primary)]" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AddressReviewView({
  details,
  onConfirm,
  onChange,
}: {
  details: PlaceDetails | null;
  onConfirm: () => void;
  onChange: () => void;
}) {
  const t = useT();
  if (!details) {
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={onChange} className="underline cursor-pointer">
          {t("legalEntities.addressPickFirst")}
        </button>
      </div>
    );
  }
  const region =
    details.regionName && details.regionCode
      ? `${details.regionName} (${details.regionCode})`
      : details.regionName || details.regionCode || null;
  const country =
    details.countryName && details.country
      ? `${details.countryName} (${details.country})`
      : details.countryName || details.country || null;
  const rows: Array<{ label: string; value: string | null }> = [
    { label: t("legalEntities.addressFieldStreet"), value: details.line1 || null },
    { label: t("legalEntities.addressFieldCity"), value: details.city || null },
    { label: t("legalEntities.addressFieldPostalCode"), value: details.postalCode },
    { label: t("legalEntities.addressFieldRegion"), value: region },
    { label: t("legalEntities.addressFieldCountry"), value: country },
  ];
  const missing: string[] = [];
  if (!details.line1?.trim()) missing.push(t("legalEntities.addressFieldStreet").toLowerCase());
  if (!details.city?.trim()) missing.push(t("legalEntities.addressFieldCity").toLowerCase());
  if (!details.country || !/^[A-Z]{2}$/.test(details.country)) missing.push(t("legalEntities.addressFieldCountry").toLowerCase());
  const canContinue = missing.length === 0;

  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onChange} backLabel={t("legalEntities.addressChangeBackLabel")} />
      <Heading>{t("legalEntities.addressReviewTitle")}</Heading>
      <Subtitle>{t("legalEntities.addressReviewSubtitle")}</Subtitle>
      <div className="mt-4 rounded-[12px] border border-fg-3/15 bg-surface px-4 py-3">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--elvix-primary)]" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-fg-1">
              {details.displayName || details.line1}
            </div>
            <div className="mt-0.5 text-[12.5px] text-fg-2">{details.formattedAddress}</div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1">
        <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
          {rows.map((r) => (
            <Fragment key={r.label}>
              <dt className="text-fg-3">{r.label}</dt>
              <dd className="font-medium text-fg-1">
                {r.value ?? <span className="text-fg-3">·</span>}
              </dd>
            </Fragment>
          ))}
        </dl>
        {!canContinue && (
          <div className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-700 dark:text-amber-300">
            {t("legalEntities.addressMissing", { fields: missing.join(", ") })}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 pt-3">
        <button
          type="button"
          onClick={onChange}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
        >
          {t("legalEntities.addressNotRightCta")}
        </button>
        <div className="ml-auto">
          <ElvixSaveButton
            state="idle"
            disabled={!canContinue}
            onClick={onConfirm}
            label={t("legalEntities.addressLooksRightCta")}
            savedLabel={t("legalEntities.addressLooksRightCta")}
            hint={null}
            className="!w-auto !px-5"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Yes/No + Contact input ──────────────────────────────────────────

function YesNoView({
  title,
  subtitle,
  onYes,
  onNo,
  onBack,
  error,
  yesLabel,
  noLabel,
}: {
  title: string;
  subtitle: string;
  onYes: () => void;
  onNo: () => void;
  onBack: () => void;
  error: string | null;
  yesLabel: string;
  noLabel: string;
}) {
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <Heading>{title}</Heading>
      <Subtitle>{subtitle}</Subtitle>
      <div className="mt-4 flex flex-col gap-2">
        <ChoiceCard
          onClick={onYes}
          icon={<Plus className="size-4" />}
          title={yesLabel}
          subtitle={t("legalEntities.yesNoYesSubtitle")}
        />
        <ChoiceCard
          onClick={onNo}
          icon={<ChevronRight className="size-4" />}
          title={noLabel}
          subtitle={t("legalEntities.yesNoNoSubtitle")}
        />
      </div>
      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          {t("legalEntities.saveError", { error })}
        </div>
      )}
    </div>
  );
}

function ContactInputView({
  email,
  phone,
  setEmail,
  setPhone,
  onConfirm,
  onBack,
  saveLabel,
}: {
  email: string;
  phone: string;
  setEmail: (v: string) => void;
  setPhone: (v: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  saveLabel?: string;
}) {
  const t = useT();
  const effectiveSaveLabel = saveLabel ?? t("legalEntities.saveEntityCta");
  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // Light phone gate: allow optional leading +, then 6-20 digits. Accept
  // separators (spaces, dashes, parens, dots) but require at least 6
  // actual digits — catches "abc" without rejecting common formatting.
  const phoneTrimmed = phone.trim();
  const phoneDigits = phoneTrimmed.replace(/\D/g, "");
  const phoneOk =
    !phoneTrimmed ||
    (/^\+?[\d\s().\-]+$/.test(phoneTrimmed) && phoneDigits.length >= 6 && phoneDigits.length <= 20);
  const allOk = emailOk && phoneOk;
  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (allOk) onConfirm();
      }}
    >
      <WizardHeader onBack={onBack} />
      <Heading>{t("legalEntities.contactInputTitle")}</Heading>
      <Subtitle>{t("legalEntities.contactInputSubtitle")}</Subtitle>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{t("legalEntities.contactEmailLabel")}</span>
          <ElvixInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("legalEntities.contactEmailPlaceholder")}
            maxLength={240}
            hasError={!emailOk}
          />
          {!emailOk && (
            <span className="mt-1.5 block text-[12px] text-red-600 dark:text-red-300">
              {t("legalEntities.contactEmailInvalid")}
            </span>
          )}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{t("legalEntities.contactPhoneLabel")}</span>
          <ElvixInput
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("legalEntities.contactPhonePlaceholder")}
            maxLength={40}
            hasError={!phoneOk}
          />
          {!phoneOk && (
            <span className="mt-1.5 block text-[12px] text-red-600 dark:text-red-300">
              {t("legalEntities.contactPhoneInvalid")}
            </span>
          )}
        </label>
      </div>
      <div className="mt-auto flex items-center justify-end pt-3">
        <ElvixSaveButton
          state="idle"
          disabled={!allOk}
          onClick={() => allOk && onConfirm()}
          label={effectiveSaveLabel}
          savedLabel={t("common.saved")}
          hint={null}
          className="!w-auto !px-5"
        />
      </div>
    </form>
  );
}

// ─── Spinner / Detail / Confirms ─────────────────────────────────────

function SavingView({ label }: { label?: string }) {
  const t = useT();
  const effectiveLabel = label ?? t("common.savingDots");
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] text-[var(--elvix-primary)]">
          <Loader2 className="size-5 animate-spin" />
        </div>
        <div className="text-[13px] font-medium text-fg-2">{effectiveLabel}</div>
      </div>
    </div>
  );
}

function DetailView({
  entity,
  onBack,
  onDelete,
  onToggleDefault,
  onEditLegalName,
  onEditTradingName,
  onEditDob,
  onEditPlaceOfBirth,
  onEditNationality,
  onEditTaxCountry,
  onEditTaxIds,
  onEditRegistration,
  onEditContact,
}: {
  entity: LegalEntityRecord | null;
  onBack: () => void;
  onDelete: () => void;
  onToggleDefault: () => void;
  onEditLegalName: () => void;
  onEditTradingName: () => void;
  onEditDob: () => void;
  onEditPlaceOfBirth: () => void;
  onEditNationality: () => void;
  onEditTaxCountry: () => void;
  onEditTaxIds: () => void;
  onEditRegistration: () => void;
  onEditContact: () => void;
}) {
  const t = useT();
  if (!entity) {
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={onBack} className="underline cursor-pointer">
          {t("legalEntities.backToList")}
        </button>
      </div>
    );
  }
  const type = entity.type as LegalEntityType;
  const isPerson = type === "individual" || type === "sole_prop";
  const isRegistered = type === "sole_prop" || type === "company";
  const c = findCountry(entity.taxCountry);
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <div className="rounded-[14px] border border-fg-3/15 bg-surface px-4 py-3.5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] text-[var(--elvix-primary)]">
            {typeIcon(type, 5)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[15px] font-semibold text-fg-1">
                {entity.label?.trim() || entity.legalName}
              </div>
              {entity.isDefault && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_15%,transparent)] px-2 py-[1px] text-[10px] font-medium text-[var(--elvix-primary)]">
                  <Star className="size-2.5 fill-current" />
                  {t("addressBook.defaultBadge")}
                </span>
              )}
            </div>
            <div className="mt-1 text-[12.5px] leading-snug text-fg-2">
              {humanType(type, t)}
              {entity.tradingName ? ` · ${entity.tradingName}` : ""} · {c?.flag}{" "}
              {c?.name ?? entity.taxCountry}
            </div>
          </div>
        </div>
      </div>

      <div
        className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 pt-3 pb-6 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
      >
        <DetailSection title={t("legalEntities.detailSectionIdentity")}>
          <DetailRow label={t("legalEntities.detailLegalName")} value={entity.legalName} onClick={onEditLegalName} />
          {isRegistered && (
            <DetailRow
              label={t("legalEntities.detailTradingName")}
              value={entity.tradingName}
              placeholder={t("legalEntities.detailTradingNamePlaceholder")}
              onClick={onEditTradingName}
            />
          )}
          {isPerson && (
            <>
              <DetailRow
                label={t("legalEntities.detailDob")}
                value={entity.dateOfBirth ? formatIsoDate(entity.dateOfBirth) : null}
                onClick={onEditDob}
              />
              <DetailRow
                label={t("legalEntities.detailPlaceOfBirth")}
                value={entity.placeOfBirth}
                placeholder={t("legalEntities.detailPlaceOfBirthPlaceholder")}
                onClick={onEditPlaceOfBirth}
              />
              <DetailRow
                label={t("legalEntities.detailNationality")}
                value={renderNationality(entity.nationality)}
                onClick={onEditNationality}
              />
            </>
          )}
        </DetailSection>

        <DetailSection title={t("legalEntities.detailSectionTax")}>
          <DetailRow
            label={t("legalEntities.detailTaxResidence")}
            value={c ? `${c.flag} ${c.name} (${c.code})` : entity.taxCountry}
            onClick={onEditTaxCountry}
          />
          <DetailRow
            label={t("legalEntities.detailVatId")}
            value={
              entity.vatId
                ? `${entity.vatId}${entity.vatIdValidatedName ? ` · ${entity.vatIdValidatedName}` : ""}`
                : null
            }
            placeholder={t("legalEntities.detailVatIdPlaceholder")}
            onClick={onEditTaxIds}
          />
          <DetailRow
            label={t("legalEntities.detailLocalTaxNumber")}
            value={entity.taxId}
            placeholder={t("legalEntities.detailLocalTaxNumberPlaceholder")}
            onClick={onEditTaxIds}
          />
        </DetailSection>

        {isRegistered && (
          <DetailSection title={t("legalEntities.detailSectionRegistration")}>
            <DetailRow
              label={t("legalEntities.detailRegistrationNumber")}
              value={entity.registrationNumber}
              onClick={onEditRegistration}
            />
            <DetailRow
              label={t("legalEntities.detailIssuingAuthority")}
              value={entity.registrationBody}
              onClick={onEditRegistration}
            />
            <DetailRow
              label={t("legalEntities.detailRegisteredSince")}
              value={entity.registeredSince ? formatIsoDate(entity.registeredSince) : null}
              onClick={onEditRegistration}
            />
          </DetailSection>
        )}

        <DetailSection title={t("legalEntities.detailSectionAddress")}>
          <DetailRow label={t("legalEntities.detailStreet")} value={entity.addressLine1} />
          <DetailRow label={t("legalEntities.detailAptFloor")} value={entity.addressLine2} />
          <DetailRow label={t("legalEntities.detailCity")} value={entity.addressCity} />
          <DetailRow label={t("legalEntities.detailPostalCode")} value={entity.addressPostalCode} />
          <DetailRow
            label={t("legalEntities.detailCountry")}
            value={
              entity.addressCountry
                ? `${findCountry(entity.addressCountry)?.flag ?? ""} ${entity.addressCountryName ?? entity.addressCountry}`
                : null
            }
          />
        </DetailSection>

        <DetailSection title={t("legalEntities.detailSectionContact")}>
          <DetailRow
            label={t("legalEntities.detailEmail")}
            value={entity.contactEmail}
            placeholder={t("legalEntities.detailEmailPlaceholder")}
            onClick={onEditContact}
          />
          <DetailRow
            label={t("legalEntities.detailPhone")}
            value={entity.contactPhone}
            placeholder={t("legalEntities.detailPhonePlaceholder")}
            onClick={onEditContact}
          />
        </DetailSection>
      </div>

      <div className="mt-3 flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] text-fg-3 transition hover:bg-red-500/10 hover:text-red-600 cursor-pointer"
        >
          <Trash2 className="size-3.5" />
          {t("common.delete")}
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={onToggleDefault}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-fg-3/20 bg-canvas px-4 text-[13px] font-medium text-fg-1 transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)] active:scale-[0.985] cursor-pointer"
          >
            <Star
              className={
                entity.isDefault
                  ? "size-3.5 fill-[var(--elvix-primary)] text-[var(--elvix-primary)]"
                  : "size-3.5"
              }
            />
            {entity.isDefault ? t("legalEntities.removeDefault") : t("legalEntities.setDefault")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmView({
  entity,
  error,
  onCancel,
  onConfirm,
}: {
  entity: LegalEntityRecord | null;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  if (!entity) {
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={onCancel} className="underline cursor-pointer">
          {t("legalEntities.deleteEmpty")}
        </button>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onCancel} />
      <Heading>{t("legalEntities.deleteConfirmTitle")}</Heading>
      <Subtitle>{t("legalEntities.deleteConfirmBody")}</Subtitle>
      <div className="mt-4 rounded-[12px] border border-fg-3/15 bg-surface px-4 py-3">
        <div className="text-[14px] font-semibold text-fg-1">
          {entity.label?.trim() || entity.legalName}
        </div>
        <div className="mt-0.5 text-[12.5px] text-fg-2">
          {humanType(entity.type as LegalEntityType, t)}
        </div>
        {entity.vatId && <div className="mt-0.5 text-[12px] text-fg-3">{entity.vatId}</div>}
      </div>
      <div className="mt-3 rounded-[10px] border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5">
        <div className="text-[12.5px] font-semibold text-amber-700 dark:text-amber-300">
          {t("legalEntities.sharedAcrossAppsHeading")}
        </div>
        <div className="mt-1 text-[12px] leading-snug text-amber-700/85 dark:text-amber-300/85">
          {t("legalEntities.deleteSharedAcrossAppsBody")}
        </div>
      </div>
      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          {t("legalEntities.deleteError", { error })}
        </div>
      )}
      <div className="mt-auto flex items-center gap-2 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
        >
          {t("common.cancel")}
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-red-600 px-5 text-[14px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_2px_3px_-1px_rgba(0,0,0,0.18),0_0_0_1px_rgba(25,28,33,0.08)] transition hover:bg-red-700 active:scale-[0.985] cursor-pointer"
          >
            <Trash2 className="size-4" />
            {t("legalEntities.yesDelete")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DefaultConfirmView({
  entity,
  setting,
  error,
  onCancel,
  onConfirm,
}: {
  entity: LegalEntityRecord | null;
  setting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  if (!entity) {
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={onCancel} className="underline cursor-pointer">
          {t("legalEntities.nothingToChange")}
        </button>
      </div>
    );
  }
  const verb = setting ? t("legalEntities.setDefault") : t("legalEntities.removeDefault");
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onCancel} rightLabel={verb} />
      <Heading>
        {setting ? t("legalEntities.defaultConfirmTitleSet") : t("legalEntities.defaultConfirmTitleUnset")}
      </Heading>
      <Subtitle>
        {setting
          ? t("legalEntities.defaultConfirmBodySet")
          : t("legalEntities.defaultConfirmBodyUnset")}
      </Subtitle>
      <div className="mt-4 rounded-[12px] border border-fg-3/15 bg-surface px-4 py-3">
        <div className="text-[14px] font-semibold text-fg-1">
          {entity.label?.trim() || entity.legalName}
        </div>
        <div className="mt-0.5 text-[12.5px] text-fg-2">
          {humanType(entity.type as LegalEntityType, t)}
        </div>
      </div>
      <div className="mt-3 rounded-[10px] border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5">
        <div className="text-[12.5px] font-semibold text-amber-700 dark:text-amber-300">
          {t("legalEntities.sharedAcrossAppsHeading")}
        </div>
        <div className="mt-1 text-[12px] leading-snug text-amber-700/85 dark:text-amber-300/85">
          {setting
            ? t("legalEntities.defaultSharedAcrossAppsBodySet")
            : t("legalEntities.defaultSharedAcrossAppsBodyUnset")}
        </div>
      </div>
      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          {t("legalEntities.saveError", { error })}
        </div>
      )}
      <div className="mt-auto flex items-center gap-2 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
        >
          {t("common.cancel")}
        </button>
        <div className="ml-auto">
          <ElvixSaveButton
            state="idle"
            onClick={onConfirm}
            label={verb}
            savedLabel={verb}
            hint={null}
            className="!w-auto !px-5"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Reusable wizard primitives ──────────────────────────────────────

function WizardHeader({
  onBack,
  backLabel,
  stepLabel,
  rightLabel,
}: {
  onBack: () => void;
  backLabel?: string;
  stepLabel?: string;
  rightLabel?: string;
}) {
  const t = useT();
  return (
    <div className="mb-3 flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
      >
        <ArrowLeft className="size-3.5" />
        {backLabel ?? t("common.back")}
      </button>
      <div className="ml-auto text-[12px] text-fg-3">{rightLabel ?? stepLabel ?? ""}</div>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">{children}</h2>;
}

function Subtitle({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[12.5px] text-fg-3">{children}</p>;
}

function ChoiceCard({
  onClick,
  icon,
  title,
  subtitle,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-[12px] border border-fg-3/15 bg-surface px-4 py-3 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)] cursor-pointer"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_15%,transparent)] text-[var(--elvix-primary)]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-fg-1">{title}</div>
        <div className="truncate text-[12.5px] text-fg-3">{subtitle}</div>
      </div>
      <ChevronRight className="mt-1 size-4 shrink-0 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-[var(--elvix-primary)]" />
    </button>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">
        {title}
      </div>
      <div className="overflow-hidden rounded-[12px] border border-fg-3/15 bg-surface divide-y divide-fg-3/10">
        {children}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  placeholder,
  onClick,
}: {
  label: string;
  value: string | null | undefined;
  placeholder?: string;
  onClick?: () => void;
}) {
  const filled = Boolean(value?.toString().trim());
  const interactive = Boolean(onClick);
  const inner = (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <div className="w-[130px] shrink-0 text-[12px] text-fg-3">{label}</div>
      <div className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg-1">
        {filled ? value : <span className="text-fg-3">{placeholder ?? "·"}</span>}
      </div>
      {interactive && (
        <ChevronRight className="size-4 shrink-0 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-[var(--elvix-primary)]" />
      )}
    </div>
  );
  if (!interactive) return inner;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group block w-full text-left transition hover:bg-[color-mix(in_srgb,var(--elvix-primary)_5%,transparent)] cursor-pointer"
    >
      {inner}
    </button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function typeIcon(t: LegalEntityType, size = 4) {
  if (t === "individual") return <User className={`size-${size}`} />;
  if (t === "sole_prop") return <Briefcase className={`size-${size}`} />;
  return <Building2 className={`size-${size}`} />;
}

function humanType(
  type: LegalEntityType,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (type === "individual") return t("legalEntities.kindIndividual");
  if (type === "sole_prop") return t("legalEntities.kindSoleProp");
  return t("legalEntities.kindCompany");
}

function typeTitleCopy(
  type: LegalEntityType | null,
  view: View,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (view === "legal-name") {
    if (type === "individual") return t("legalEntities.legalNameTitleIndividual");
    if (type === "sole_prop") return t("legalEntities.legalNameTitleSoleProp");
    return t("legalEntities.legalNameTitleCompany");
  }
  return "";
}

function vatPlaceholder(country: string): string {
  switch (country) {
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "DE":
      return "DE129273398";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "GB":
      return "GB123456789";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "FR":
      return "FR40303265045";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "NL":
      return "NL813195779B01";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "AU":
      return "51824753556";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "CH":
      return "CHE-101.731.823";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "BR":
      return "00000000000191";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "NO":
      return "974760673";
    default:
      return `${country}…`;
  }
}

function taxIdPlaceholder(country: string): string {
  switch (country) {
    case "DE":
      return "Steuernummer · 10-13 digits";
    case "GB":
      return "UTR (10 digits) or NINO";
    case "US":
      return "EIN · 12-3456789";
    case "FR":
      return "NIF · 13 digits";
    case "NL":
      return "BSN · 9 digits";
    case "ES":
      return "NIE / DNI / CIF";
    case "IT":
      return "Codice Fiscale (11 or 16 chars)";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "PT":
      return "NIF · 9 digits";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "PL":
      return "NIP · 10 digits";
    case "GR":
      return "AFM · 9 digits";
    case "AT":
      return "Steuernummer · 9 digits";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "BE":
      return "10 digits";
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    case "IE":
      return "7 digits + letter";
    case "AU":
      return "TFN · 8-9 digits";
    case "CH":
      return "AHV / AVS · 13 digits";
    case "BR":
      return "CPF (11) or CNPJ (14)";
    case "NO":
      return "Fødselsnummer · 11 digits";
    default:
      return "Local tax number";
  }
}

/** Human-readable hint for the format gate inline error. */
function taxIdFormatHint(
  country: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  return t("legalEntities.taxIdFormatHint", { placeholder: taxIdPlaceholder(country) });
}

function regNumberPlaceholder(country: string): string {
  switch (country) {
    case "DE":
      return "HRB 12345 · GnR 7821 …";
    case "GB":
      return "Companies House · 8 digits or SC123456";
    case "NL":
      return "KvK · 8 digits";
    case "FR":
      return "SIREN (9 digits) or SIRET (14)";
    case "BE":
      return "BCE · 10 digits";
    case "IE":
      return "CRO · 5-7 digits";
    case "PL":
      return "KRS · 10 digits";
    case "PT":
      return "NIPC · 9 digits";
    case "SE":
      return "Org.nr · 10 digits";
    case "DK":
      return "CVR · 8 digits";
    case "FI":
      return "Y-tunnus · 1234567-8";
    case "NO":
      return "Orgnr · 9 digits";
    case "BR":
      return "CNPJ · 14 digits";
    case "AU":
      return "ACN · 9 digits";
    case "CH":
      return "UID · CHE-123.456.789";
    default:
      return "Local register number";
  }
}

function regNumberFormatHint(
  country: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  return t("legalEntities.regNumberFormatHint", { placeholder: regNumberPlaceholder(country) });
}

function formatIsoDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function renderNationality(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts
    .map((code) => {
      const c = findCountry(code);
      return c ? `${c.flag} ${c.name}` : code;
    })
    .join(" · ");
}

function humanizeApiError(body: unknown): string {
  if (!body || typeof body !== "object") return "save_failed";
  const b = body as {
    error?: string;
    issues?: { fieldErrors?: Record<string, string[] | undefined> };
  };
  const fieldErrors = b.issues?.fieldErrors ?? {};
  const firstField = Object.keys(fieldErrors)[0];
  if (firstField) {
    const msgs = fieldErrors[firstField] ?? [];
    return `${firstField}: ${msgs[0] ?? "invalid"}`;
  }
  return b.error ?? "save_failed";
}

// LEGAL_ENTITY_TYPES is referenced so it's tree-shake-safe.
void LEGAL_ENTITY_TYPES;
