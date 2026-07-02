"use client";

/**
 * `<ElvixRegion>` — single-frame wizard for the user's regional
 * preferences singleton. Mirrors the legal-entities / address-book
 * architecture: empty ↔ pick-country (cascade defaults) ↔ detail
 * (tap-to-edit any field) → field-specific edit panes.
 *
 *   empty → country-pick → detail (after the cascade lands)
 *
 *   detail ─→ field-edit (one of: ui-locale, time-zone, time-format,
 *             date-format, number-format, currency, measurement,
 *             first-day, country) → patches single field → back
 *
 * Country edit triggers a "Reset to country defaults?" confirm pane
 * because it cascades. Other fields PATCH only themselves.
 */

import { MaybeCard } from "./elvix-card";
import { ElvixCountrySelect } from "./elvix-country-select";
import { ElvixInput } from "./elvix-input";
import { ElvixSaveButton } from "./elvix-save-button";
import { useElvixContext } from "./elvix-provider";
import { authInit } from "./session";
import { findCountry } from "./countries";
import { LANGUAGES, findLanguage } from "./languages";
import type { RegionPatchInput, RegionRecord } from "./region-schema";
import {
  CURRENCIES,
  DATE_FORMATS,
  DATE_FORMAT_META,
  DAY_OF_WEEK_META,
  type DateFormat,
  type DayOfWeek,
  MEASUREMENT_META,
  MEASUREMENT_SYSTEMS,
  type MeasurementSystem,
  NUMBER_FORMATS,
  NUMBER_FORMAT_META,
  type NumberFormat,
  TIME_FORMATS,
  TIME_FORMAT_META,
  type TimeFormat,
  defaultsFor,
  findCurrency,
  prettyTimeZone,
  supportedTimeZones,
} from "./regions";
import { unwrapEnvelope } from "./spine-fetch";
import { useT } from "../locale/use-t";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, ChevronRight, Globe, Loader2, Pencil, Search } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";

// ─── Public types ────────────────────────────────────────────────────

export type ElvixRegionResult =
  | { ok: true; country: string; locale: string }
  | { ok: false; error: string; message?: string };

export type ElvixRegionProps = {
  /** Render inside an <ElvixCard>. Default true; pass false for bare (no chrome). */
  card?: boolean;
  height?: number;
  minHeight?: number;
  maxHeight?: number;
  width?: number | string;
  onChange?: (region: RegionRecord | null) => void;
  /** Fires on every terminal save outcome. Safe payload: country +
   *  locale code only. `onChange` keeps firing too on every refresh. */
  onResult?: (result: ElvixRegionResult) => void;
};

const View = {
  LOADING: "loading",
  EMPTY: "empty",
  COUNTRY_PICK: "country-pick",
  COUNTRY_PICK_CASCADE_CONFIRM: "country-pick-cascade-confirm",
  DETAIL: "detail",
  EDIT_UI_LOCALE: "edit-ui-locale",
  EDIT_TIME_ZONE: "edit-time-zone",
  EDIT_TIME_FORMAT: "edit-time-format",
  EDIT_DATE_FORMAT: "edit-date-format",
  EDIT_NUMBER_FORMAT: "edit-number-format",
  EDIT_CURRENCY: "edit-currency",
  EDIT_MEASUREMENT: "edit-measurement",
  EDIT_FIRST_DAY: "edit-first-day",
  SAVING: "saving",
} as const;
type View = (typeof View)[keyof typeof View];

// ─── Pane transition (matches other wizards) ─────────────────────────

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

export function ElvixRegion({
  height,
  minHeight,
  maxHeight,
  width = "100%",
  onChange,
  onResult,
  card,
}: ElvixRegionProps) {
  const ctx = useElvixContext();
  const t = useT();
  const [view, setView] = useState<View>("loading");
  const [region, setRegion] = useState<RegionRecord | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/region`, {
      cache: "no-store",
      ...authInit(),
    });
    if (!res.ok) return;
    const body = unwrapEnvelope(await res.json()) as { region: RegionRecord | null };
    setRegion(body.region);
    onChange?.(body.region);
  }, [onChange, ctx.baseUrl]);

  useEffect(() => {
    (async () => {
      await refresh();
      // LEGACY: spine-lint-disable-next-line spine/enum-over-string
      setView((v) => (v === "loading" ? ("decide" as View) : v));
    })();
  }, [refresh]);

  useEffect(() => {
    if (view !== ("decide" as View)) return;
    setView(region ? "detail" : "empty");
  }, [view, region]);

  // ─── Add flow: country pick → save with cascade ────────────────
  const onPickCountry = async (country: string) => {
    setView("saving");
    const auth = authInit();
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/region`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...auth.headers },
      credentials: auth.credentials,
      body: JSON.stringify({ country }),
    });
    if (res.ok) {
      await refresh();
      setView("detail");
      onResult?.({ ok: true, country, locale: region?.uiLocale ?? "" });
    } else {
      setView("country-pick");
      onResult?.({ ok: false, error: "save_failed", message: t("region.errorSaveFailed") });
    }
  };

  // ─── Edit flow: single-field PATCH ─────────────────────────────
  const patch = async (partial: RegionPatchInput) => {
    setView("saving");
    const auth = authInit();
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/region`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth.headers },
      credentials: auth.credentials,
      body: JSON.stringify(partial),
    });
    if (res.ok) {
      await refresh();
      onResult?.({ ok: true, country: region?.country ?? "", locale: region?.uiLocale ?? "" });
    } else {
      onResult?.({ ok: false, error: "save_failed", message: t("region.errorSaveFailed") });
    }
    setView("detail");
  };

  // ─── Country re-pick: cascade-reset confirm ────────────────────
  const [pendingCountry, setPendingCountry] = useState<string | null>(null);
  const onCountryReEdit = (next: string) => {
    if (!region) {
      void onPickCountry(next);
      return;
    }
    setPendingCountry(next);
    setView("country-pick-cascade-confirm");
  };
  const confirmCascadeReset = async () => {
    if (!pendingCountry) return;
    setView("saving");
    const auth = authInit();
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/region`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...auth.headers },
      credentials: auth.credentials,
      body: JSON.stringify({ country: pendingCountry }),
    });
    if (res.ok) {
      await refresh();
      onResult?.({ ok: true, country: pendingCountry, locale: region?.uiLocale ?? "" });
    } else {
      onResult?.({ ok: false, error: "save_failed", message: t("region.errorSaveFailed") });
    }
    setPendingCountry(null);
    setView("detail");
  };
  const cancelCascade = () => {
    setPendingCountry(null);
    setView("detail");
  };

  // ─── Frame sizing ──────────────────────────────────────────────
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
            {view === "loading" || view === ("decide" as View) ? (
              <Pane key="loading">
                <div className="grid h-full place-items-center text-fg-3 text-sm">{t("common.loading")}</div>
              </Pane>
            ) : view === "empty" ? (
              <Pane key="empty">
                <EmptyState onPick={() => setView("country-pick")} />
              </Pane>
            ) : view === "country-pick" ? (
              <Pane key="country-pick">
                <CountryPickView
                  initial={region?.country ?? null}
                  onPick={(c) => (region ? onCountryReEdit(c) : onPickCountry(c))}
                  onBack={() => setView(region ? "detail" : "empty")}
                />
              </Pane>
            ) : view === "country-pick-cascade-confirm" ? (
              <Pane key="cascade-confirm">
                <CascadeConfirmView
                  current={region}
                  next={pendingCountry}
                  onCancel={cancelCascade}
                  onConfirm={confirmCascadeReset}
                />
              </Pane>
            ) : view === "detail" ? (
              <Pane key="detail" fadeEdges>
                <DetailView
                  region={region}
                  onEditCountry={() => setView("country-pick")}
                  onEditUiLocale={() => setView("edit-ui-locale")}
                  onEditTimeZone={() => setView("edit-time-zone")}
                  onEditTimeFormat={() => setView("edit-time-format")}
                  onEditDateFormat={() => setView("edit-date-format")}
                  onEditNumberFormat={() => setView("edit-number-format")}
                  onEditCurrency={() => setView("edit-currency")}
                  onEditMeasurement={() => setView("edit-measurement")}
                  onEditFirstDay={() => setView("edit-first-day")}
                />
              </Pane>
            ) : view === "edit-ui-locale" ? (
              <Pane key="edit-ui-locale">
                <UiLocaleEditView
                  current={region?.uiLocale ?? null}
                  onSave={(uiLocale) => void patch({ uiLocale })}
                  onBack={() => setView("detail")}
                />
              </Pane>
            ) : view === "edit-time-zone" ? (
              <Pane key="edit-time-zone">
                <TimeZoneEditView
                  country={region?.country ?? ""}
                  current={region?.timeZone ?? null}
                  onSave={(timeZone) => void patch({ timeZone })}
                  onBack={() => setView("detail")}
                />
              </Pane>
            ) : view === "edit-time-format" ? (
              <Pane key="edit-time-format">
                <ChoiceEditView<TimeFormat>
                  title={t("region.timeFormat")}
                  options={TIME_FORMATS}
                  meta={TIME_FORMAT_META}
                  current={region?.timeFormat as TimeFormat}
                  onSave={(timeFormat) => void patch({ timeFormat })}
                  onBack={() => setView("detail")}
                />
              </Pane>
            ) : view === "edit-date-format" ? (
              <Pane key="edit-date-format">
                <ChoiceEditView<DateFormat>
                  title={t("region.dateFormat")}
                  options={DATE_FORMATS}
                  meta={DATE_FORMAT_META}
                  current={region?.dateFormat as DateFormat}
                  onSave={(dateFormat) => void patch({ dateFormat })}
                  onBack={() => setView("detail")}
                />
              </Pane>
            ) : view === "edit-number-format" ? (
              <Pane key="edit-number-format">
                <ChoiceEditView<NumberFormat>
                  title={t("region.numberFormat")}
                  options={NUMBER_FORMATS}
                  meta={NUMBER_FORMAT_META}
                  current={region?.numberFormat as NumberFormat}
                  onSave={(numberFormat) => void patch({ numberFormat })}
                  onBack={() => setView("detail")}
                />
              </Pane>
            ) : view === "edit-currency" ? (
              <Pane key="edit-currency">
                <CurrencyEditView
                  current={region?.currency ?? null}
                  onSave={(currency) => void patch({ currency })}
                  onBack={() => setView("detail")}
                />
              </Pane>
            ) : view === "edit-measurement" ? (
              <Pane key="edit-measurement">
                <ChoiceEditView<MeasurementSystem>
                  title={t("region.unitsLabel")}
                  options={MEASUREMENT_SYSTEMS}
                  meta={MEASUREMENT_META}
                  current={region?.measurementSystem as MeasurementSystem}
                  onSave={(measurementSystem) => void patch({ measurementSystem })}
                  onBack={() => setView("detail")}
                />
              </Pane>
            ) : view === "edit-first-day" ? (
              <Pane key="edit-first-day">
                <FirstDayEditView
                  current={(region?.firstDayOfWeek ?? 1) as DayOfWeek}
                  onSave={(firstDayOfWeek) => void patch({ firstDayOfWeek })}
                  onBack={() => setView("detail")}
                />
              </Pane>
            ) : view === "saving" ? (
              <Pane key="saving">
                <SavingView />
              </Pane>
            ) : null}
          </AnimatePresence>
        </div>
      </MaybeCard>
    </div>
  );
}

// ─── Sub-views ───────────────────────────────────────────────────────

function EmptyState({ onPick }: { onPick: () => void }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <button
        type="button"
        onClick={onPick}
        className="group flex w-full max-w-[340px] flex-col items-center gap-3 rounded-[14px] border border-dashed border-fg-3/30 px-6 py-8 transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)] cursor-pointer"
      >
        <div className="grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] text-[var(--elvix-primary)] transition group-hover:scale-105">
          <Globe className="size-6" />
        </div>
        <div>
          <div className="text-[15px] font-semibold text-fg-1">{t("region.title")}</div>
          <div className="mt-1 text-[12px] text-fg-3">{t("region.emptyHint")}</div>
        </div>
      </button>
    </div>
  );
}

function CountryPickView({
  initial,
  onPick,
  onBack,
}: {
  initial: string | null;
  onPick: (country: string) => void;
  onBack: () => void;
}) {
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <Heading>{t("region.whereDoYouLive")}</Heading>
      <Subtitle>{t("region.cascadeHint")}</Subtitle>
      <div className="mt-4 flex-1 min-h-0">
        <ElvixCountrySelect
          value={initial}
          onChange={onPick}
          collapsible={false}
          listMaxHeightClass="max-h-72"
        />
      </div>
    </div>
  );
}

function CascadeConfirmView({
  current,
  next,
  onCancel,
  onConfirm,
}: {
  current: RegionRecord | null;
  next: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const currentCountry = current ? findCountry(current.country) : null;
  const nextCountry = next ? findCountry(next) : null;
  const newDefaults = next ? defaultsFor(next) : null;
  const fallbackCountry = t("region.cascadeFallbackCountry");
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onCancel} />
      <Heading>
        {t("region.cascadeResetTitle", { country: nextCountry?.name ?? next ?? "" })}
      </Heading>
      <Subtitle>
        {t("region.cascadeResetBody", {
          currentFlag: currentCountry?.flag ?? "",
          currentName: currentCountry?.name ?? "—",
          nextFlag: nextCountry?.flag ?? "",
          nextName: nextCountry?.name ?? fallbackCountry,
        })}
      </Subtitle>
      {newDefaults && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-[12.5px]">
          <CascadeRow
            label={t("region.uiLanguageLabel")}
            value={findLanguage(newDefaults.uiLocale)?.name ?? newDefaults.uiLocale}
          />
          <CascadeRow label={t("region.timeZone")} value={prettyTimeZone(newDefaults.timeZone)} />
          <CascadeRow
            label={t("region.currency")}
            value={`${findCurrency(newDefaults.currency)?.symbol ?? ""} ${newDefaults.currency}`}
          />
          <CascadeRow
            label={t("region.dateLabel")}
            value={DATE_FORMAT_META[newDefaults.dateFormat].sample}
          />
          <CascadeRow
            label={t("region.timeLabel")}
            value={TIME_FORMAT_META[newDefaults.timeFormat].sample}
          />
          <CascadeRow
            label={t("region.unitsLabel")}
            value={MEASUREMENT_META[newDefaults.measurementSystem].label}
          />
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
        >
          {t("common.cancel")}
        </button>
        <ElvixSaveButton
          state="idle"
          onClick={onConfirm}
          label={t("region.resetDefaults")}
          savedLabel={t("region.savedLabel")}
          hint={null}
          className="!w-auto !px-5"
        />
      </div>
    </div>
  );
}

function CascadeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-fg-3/15 bg-surface px-2.5 py-1.5">
      <div className="text-[10.5px] uppercase tracking-wide text-fg-3">{label}</div>
      <div className="truncate font-medium text-fg-1">{value}</div>
    </div>
  );
}

function DetailView({
  region,
  onEditCountry,
  onEditUiLocale,
  onEditTimeZone,
  onEditTimeFormat,
  onEditDateFormat,
  onEditNumberFormat,
  onEditCurrency,
  onEditMeasurement,
  onEditFirstDay,
}: {
  region: RegionRecord | null;
  onEditCountry: () => void;
  onEditUiLocale: () => void;
  onEditTimeZone: () => void;
  onEditTimeFormat: () => void;
  onEditDateFormat: () => void;
  onEditNumberFormat: () => void;
  onEditCurrency: () => void;
  onEditMeasurement: () => void;
  onEditFirstDay: () => void;
}) {
  const t = useT();
  if (!region) return null;
  const country = findCountry(region.country);
  const lang = findLanguage(region.uiLocale ?? "");
  const currency = findCurrency(region.currency ?? "");
  return (
    <div className="flex flex-col gap-3 pt-3 pb-4">
      <div className="rounded-[14px] border border-fg-3/15 bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-[24px] leading-none">
            {country?.flag ?? "🌐"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-fg-1">
              {country?.name ?? region.country}
            </div>
            <div className="text-[12px] text-fg-3">{t("region.yourRegion")}</div>
          </div>
          <button
            type="button"
            onClick={onEditCountry}
            className="grid size-7 place-items-center rounded-md text-fg-3 transition hover:bg-fg-3/10 hover:text-fg-1 cursor-pointer"
            aria-label={t("region.changeCountryAria")}
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-[14px] border border-fg-3/15 bg-surface">
        <DetailRow
          label={t("region.uiLanguageLabel")}
          value={lang ? `${lang.name} · ${lang.native}` : region.uiLocale}
          onClick={onEditUiLocale}
        />
        <DetailRow
          label={t("region.timeZone")}
          value={region.timeZone ? prettyTimeZone(region.timeZone) : null}
          placeholder={t("region.setTimeZonePlaceholder")}
          onClick={onEditTimeZone}
        />
        <DetailRow
          label={t("region.currency")}
          value={
            currency ? `${currency.symbol} ${currency.code} · ${currency.name}` : region.currency
          }
          onClick={onEditCurrency}
        />
        <DetailRow
          label={t("region.timeFormat")}
          value={TIME_FORMAT_META[region.timeFormat as TimeFormat]?.sample ?? region.timeFormat}
          onClick={onEditTimeFormat}
        />
        <DetailRow
          label={t("region.dateFormat")}
          value={DATE_FORMAT_META[region.dateFormat as DateFormat]?.sample ?? region.dateFormat}
          onClick={onEditDateFormat}
        />
        <DetailRow
          label={t("region.numbersLabel")}
          value={
            NUMBER_FORMAT_META[region.numberFormat as NumberFormat]?.sample ?? region.numberFormat
          }
          onClick={onEditNumberFormat}
        />
        <DetailRow
          label={t("region.unitsLabel")}
          value={
            MEASUREMENT_META[region.measurementSystem as MeasurementSystem]?.label ??
            region.measurementSystem
          }
          onClick={onEditMeasurement}
        />
        <DetailRow
          label={t("region.weekStartsLabel")}
          value={
            DAY_OF_WEEK_META[region.firstDayOfWeek as DayOfWeek]?.label ??
            String(region.firstDayOfWeek)
          }
          onClick={onEditFirstDay}
          last
        />
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  placeholder,
  onClick,
  last = false,
}: {
  label: string;
  value: string | null | undefined;
  placeholder?: string;
  onClick: () => void;
  last?: boolean;
}) {
  const filled = Boolean(value);
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[color-mix(in_srgb,var(--elvix-primary)_5%,transparent)] cursor-pointer " +
        (last ? "" : "border-b border-fg-3/10")
      }
    >
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-fg-3">{label}</div>
        <div className="truncate text-[13.5px] font-medium text-fg-1">
          {filled ? value : <span className="text-fg-3">{placeholder ?? "·"}</span>}
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-fg-3" />
    </button>
  );
}

// ─── Edit panes ──────────────────────────────────────────────────────

/** Generic single-field edit pane backed by an enum + meta map. */
function ChoiceEditView<T extends string>({
  title,
  options,
  meta,
  current,
  onSave,
  onBack,
}: {
  title: string;
  options: readonly T[];
  meta: Record<T, { label: string; sample?: string }>;
  current: T;
  onSave: (next: T) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<T>(current);
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <Heading>{title}</Heading>
      <Subtitle>{t("region.pickOneHint")}</Subtitle>
      <ul className="mt-4 flex flex-col gap-2">
        {options.map((opt) => {
          const m = meta[opt];
          const isSel = selected === opt;
          return (
            <li key={opt}>
              <button
                type="button"
                onClick={() => setSelected(opt)}
                className={
                  "flex w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition cursor-pointer " +
                  (isSel
                    ? "border-[var(--elvix-primary)] bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] ring-1 ring-inset ring-[var(--elvix-primary)]"
                    : "border-fg-3/15 bg-surface hover:border-[var(--elvix-primary)]")
                }
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-fg-1">{m.label}</div>
                  {m.sample && <div className="text-[12.5px] text-fg-3">{m.sample}</div>}
                </div>
                {isSel && <Check className="size-4 shrink-0 text-[var(--elvix-primary)]" />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex items-center justify-end pt-3">
        <ElvixSaveButton
          state="idle"
          onClick={() => onSave(selected)}
          label={t("common.save")}
          savedLabel={t("region.savedLabel")}
          hint={null}
          className="!w-auto !px-5"
        />
      </div>
    </div>
  );
}

function FirstDayEditView({
  current,
  onSave,
  onBack,
}: {
  current: DayOfWeek;
  onSave: (next: DayOfWeek) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<DayOfWeek>(current);
  // Only show the four common starts (Mon, Sun, Sat, Fri) — the
  // others are theoretically valid but never user-picked.
  const choices: DayOfWeek[] = [1, 0, 6, 5];
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <Heading>{t("region.weekStartsOnTitle")}</Heading>
      <Subtitle>{t("region.weekStartsHint")}</Subtitle>
      <ul className="mt-4 flex flex-col gap-2">
        {choices.map((d) => {
          const m = DAY_OF_WEEK_META[d];
          const isSel = selected === d;
          return (
            <li key={d}>
              <button
                type="button"
                onClick={() => setSelected(d)}
                className={
                  "flex w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition cursor-pointer " +
                  (isSel
                    ? "border-[var(--elvix-primary)] bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] ring-1 ring-inset ring-[var(--elvix-primary)]"
                    : "border-fg-3/15 bg-surface hover:border-[var(--elvix-primary)]")
                }
              >
                <div className="text-[14px] font-semibold text-fg-1">{m.label}</div>
                {isSel && <Check className="ml-auto size-4 shrink-0 text-[var(--elvix-primary)]" />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex items-center justify-end pt-3">
        <ElvixSaveButton
          state="idle"
          onClick={() => onSave(selected)}
          label={t("common.save")}
          savedLabel={t("region.savedLabel")}
          hint={null}
          className="!w-auto !px-5"
        />
      </div>
    </div>
  );
}

function UiLocaleEditView({
  current,
  onSave,
  onBack,
}: {
  current: string | null;
  onSave: (next: string) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? LANGUAGES.filter(
            (l) =>
              l.name.toLowerCase().includes(q) ||
              l.native.toLowerCase().includes(q) ||
              l.code.includes(q),
          )
        : LANGUAGES,
    [q],
  );
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <Heading>{t("region.uiLanguageTitle")}</Heading>
      <Subtitle>{t("region.uiLanguageHint")}</Subtitle>
      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
        <ElvixInput
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("region.languageSearchPlaceholder")}
          autoFocus
          autoComplete="off"
          className="pl-9"
        />
      </div>
      <div
        className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
      >
        <ul className="flex flex-col gap-1.5 py-1">
          {filtered.map((l) => {
            const isSel = current === l.code;
            return (
              <li key={l.code}>
                <button
                  type="button"
                  onClick={() => onSave(l.code)}
                  className={
                    "group flex w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition cursor-pointer " +
                    (isSel
                      ? "border-[var(--elvix-primary)] bg-[color-mix(in_srgb,var(--elvix-primary)_10%,transparent)] ring-1 ring-inset ring-[var(--elvix-primary)]"
                      : "border-fg-3/15 bg-surface hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)]")
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-fg-1">{l.name}</div>
                    {l.native && l.native !== l.name && (
                      <div className="truncate text-[12px] text-fg-3">{l.native}</div>
                    )}
                  </div>
                  <span className="rounded-md bg-fg-3/10 px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-fg-3">
                    {l.code}
                  </span>
                  {isSel && <Check className="size-4 text-[var(--elvix-primary)]" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function CurrencyEditView({
  current,
  onSave,
  onBack,
}: {
  current: string | null;
  onSave: (next: string) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? CURRENCIES.filter(
            (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
          )
        : CURRENCIES,
    [q],
  );
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <Heading>{t("region.currency")}</Heading>
      <Subtitle>{t("region.currencyHint")}</Subtitle>
      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
        <ElvixInput
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("region.currencySearchPlaceholder")}
          autoFocus
          autoComplete="off"
          className="pl-9"
        />
      </div>
      <div
        className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
      >
        <ul className="flex flex-col gap-1.5 py-1">
          {filtered.map((c) => {
            const isSel = current === c.code;
            return (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => onSave(c.code)}
                  className={
                    "group flex w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition cursor-pointer " +
                    (isSel
                      ? "border-[var(--elvix-primary)] bg-[color-mix(in_srgb,var(--elvix-primary)_10%,transparent)] ring-1 ring-inset ring-[var(--elvix-primary)]"
                      : "border-fg-3/15 bg-surface hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)]")
                  }
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-fg-3/10 text-[12px] font-semibold text-fg-2">
                    {c.symbol}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-fg-1">{c.code}</div>
                    <div className="truncate text-[12px] text-fg-3">{c.name}</div>
                  </div>
                  {isSel && <Check className="size-4 text-[var(--elvix-primary)]" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function TimeZoneEditView({
  country,
  current,
  onSave,
  onBack,
}: {
  country: string;
  current: string | null;
  onSave: (next: string) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const zones = useMemo(() => supportedTimeZones(), []);
  const q = query.trim().toLowerCase();
  // Surface country-prefix matches first so users see local options
  // at the top. Country alpha-2 → IANA region root mapping is rough
  // (US → America, GB → Europe, etc.), so we just rank by substring
  // match on the country code if present.
  const filtered = useMemo(() => {
    const base = q ? zones.filter((z) => z.toLowerCase().includes(q)) : zones;
    if (!country) return base;
    const cc = country.toLowerCase();
    return [...base].sort((a, b) => {
      const aMatch = a.toLowerCase().includes(cc) ? 0 : 1;
      const bMatch = b.toLowerCase().includes(cc) ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [zones, q, country]);
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <Heading>{t("region.timeZone")}</Heading>
      <Subtitle>{t("region.timeZoneHint")}</Subtitle>
      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
        <ElvixInput
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("region.timeZoneSearchPlaceholder")}
          autoFocus
          autoComplete="off"
          className="pl-9"
        />
      </div>
      <div
        className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
      >
        <ul className="flex flex-col gap-1.5 py-1">
          {filtered.slice(0, 60).map((tz) => {
            const isSel = current === tz;
            return (
              <li key={tz}>
                <button
                  type="button"
                  onClick={() => onSave(tz)}
                  className={
                    "group flex w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition cursor-pointer " +
                    (isSel
                      ? "border-[var(--elvix-primary)] bg-[color-mix(in_srgb,var(--elvix-primary)_10%,transparent)] ring-1 ring-inset ring-[var(--elvix-primary)]"
                      : "border-fg-3/15 bg-surface hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)]")
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-fg-1">
                      {prettyTimeZone(tz)}
                    </div>
                    <div className="truncate text-[11px] text-fg-3">{tz}</div>
                  </div>
                  {isSel && <Check className="size-4 text-[var(--elvix-primary)]" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SavingView() {
  const t = useT();
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] text-[var(--elvix-primary)]">
          <Loader2 className="size-5 animate-spin" />
        </div>
        <div className="text-[13px] font-medium text-fg-2">{t("common.saving")}</div>
      </div>
    </div>
  );
}

// ─── Shared chrome primitives ────────────────────────────────────────

function WizardHeader({
  onBack,
  backLabel,
}: {
  onBack: () => void;
  backLabel?: string;
}) {
  const t = useT();
  return (
    <div className="flex items-center pt-2">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
      >
        <ArrowLeft className="size-4" />
        {backLabel ?? t("common.back")}
      </button>
    </div>
  );
}

function Heading({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={"mt-2 text-[18px] font-semibold leading-tight text-fg-1 " + className}>
      {children}
    </h2>
  );
}

function Subtitle({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[13px] leading-snug text-fg-2">{children}</p>;
}
