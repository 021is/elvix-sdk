"use client";

/**
 * The add/edit wizard panes for legal entities: one pane per question the
 * user is asked, in the order `legal-entity-flow.ts` defines.
 *
 * Each is a leaf: it renders a question, validates the answer locally, and
 * calls back. None of them decide what comes next — that is the flow
 * module's job, and keeping the decision out of the panes is what let the
 * ordering become testable.
 */

import {
  Briefcase,
  Building2,
  ChevronRight,
  Loader2,
  MapPin,
  Plus,
  Search,
  User,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { useT } from "../locale/use-t";
import { findCountry } from "./countries";
import { ElvixCountrySelect } from "./elvix-country-select";
import { ElvixInput } from "./elvix-input";
import { useElvixContext } from "./elvix-provider";
import { ElvixSaveButton } from "./elvix-save-button";
import { ElvixTaxIdInput, type TaxIdValidationState } from "./elvix-tax-id-input";
import {
  regNumberFormatHint,
  regNumberPlaceholder,
  taxIdFormatHint,
  taxIdPlaceholder,
  vatPlaceholder,
} from "./legal-entity-copy";
import {
  ChoiceCard,
  CountryChip,
  Heading,
  Subtitle,
  VerifyingBadge,
  WizardHeader,
} from "./legal-entity-primitives";
import type { LegalEntityType } from "./legal-entity-schema";
import { newSessionToken, type PlaceDetails, type PlaceSuggestion } from "./legal-entity-types";
import { MAPS_MISSING_CLIENT_ID, mapsUrl } from "./maps-url";
import { isSameOrigin } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { localTaxIdMatches, registrationNumberMatches } from "./tax-validation";

/** Nationality is multi-select but capped; more than a few is a data-entry error. */
const MAX_NATIONALITIES = 4;

export function TypeChoiceView({
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

export function SingleTextView({
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

export function DateView({
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
export function isoYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export function CountryView({
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

export function NationalityView({
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
      <Subtitle>{t("legalEntities.nationalitySubtitle", { max: MAX_NATIONALITIES })}</Subtitle>

      {codes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {codes.map((code, idx) => {
            const c = findCountry(code) ?? { code, name: code, flag: "🏳" };
            return (
              <CountryChip
                key={code}
                country={c}
                onRemove={() => remove(code)}
                badge={
                  idx === 0 && codes.length > 1 ? t("legalEntities.nationalityPrimaryBadge") : null
                }
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

export function TaxIdsView({
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
            {t("legalEntities.localTaxNumberLabel")}
            {taxIdRequired ? "" : t("common.optionalSuffix")}
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
              {t("legalEntities.vatCompanyIdLabel")}
              {vatRequired ? "" : t("common.optionalSuffix")}
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
export function VerifyingTaxIdView({
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
          ? t("legalEntities.verifySubtitleChecking", {
              vatId,
              country: findCountry(country)?.name ?? country,
            })
          : isLive && result.name
            ? t("legalEntities.verifySubtitleLiveNamed", {
                authority: authorityName,
                name: result.name,
              })
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

export function RegistrationView({
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
      <Subtitle>{t("legalEntities.registrationSubtitle")}</Subtitle>
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
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
            {t("legalEntities.issuingAuthorityLabel")}
          </span>
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

/**
 * `<PlaceOfBirthView>` — Google Places autocomplete filtered to cities
 * (`?types=cities`). Captures the canonical `place_id` alongside the
 * human-readable label so downstream surfaces (Ambassadors desk) can
 * resolve the city without re-geocoding.
 *
 * Optional field — empty save is allowed via "Skip". Edit mode pre-
 * seeds the input with the saved label; clearing it persists null.
 */
export function PlaceOfBirthView({
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
        const url = mapsUrl(ctx, "autocomplete", {
          q,
          session: sessionRef.current,
          types: "cities",
        });
        if (!url) {
          setErr(MAPS_MISSING_CLIENT_ID);
          setSuggestions([]);
          return;
        }
        const res = await fetch(url, {
          signal: controller.signal,
          credentials: isSameOrigin(ctx.baseUrl) ? "include" : "omit",
        });
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
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
            {t("legalEntities.placeOfBirthCityLabel")}
          </span>
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

export function AddressSearchView({
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
        const url = mapsUrl(ctx, "autocomplete", { q, session: sessionRef.current });
        if (!url) {
          setErr(MAPS_MISSING_CLIENT_ID);
          setSuggestions([]);
          return;
        }
        const res = await fetch(url, {
          signal: controller.signal,
          credentials: isSameOrigin(ctx.baseUrl) ? "include" : "omit",
        });
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
        const url = mapsUrl(ctx, "place-details", { placeId, session: sessionRef.current });
        if (!url) {
          setErr(MAPS_MISSING_CLIENT_ID);
          setPicking(null);
          return;
        }
        const res = await fetch(url, {
          credentials: isSameOrigin(ctx.baseUrl) ? "include" : "omit",
        });
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
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
          {t("legalEntities.addressLabel")}
        </span>
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

export function AddressReviewView({
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
  if (!details.country || !/^[A-Z]{2}$/.test(details.country))
    missing.push(t("legalEntities.addressFieldCountry").toLowerCase());
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

export function YesNoView({
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

export function ContactInputView({
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
    (/^\+?[\d\s().-]+$/.test(phoneTrimmed) && phoneDigits.length >= 6 && phoneDigits.length <= 20);
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
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
            {t("legalEntities.contactEmailLabel")}
          </span>
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
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
            {t("legalEntities.contactPhoneLabel")}
          </span>
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
