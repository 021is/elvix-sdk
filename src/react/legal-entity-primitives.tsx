"use client";

/**
 * Presentational primitives shared by every legal-entity pane.
 *
 * These are the small pieces the wizard repeats: the animated pane wrapper,
 * the header with its back arrow, a heading, a subtitle, a choice card, and
 * the rows a detail view is built from. None of them own state or talk to the
 * API, which is what makes them safe to reuse and boring to read.
 *
 * They lived in the middle of a 3,292-line component file, interleaved with
 * the panes that used them, so "what does a DetailRow look like" meant
 * scrolling past four hundred lines of wizard step.
 */

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronRight,
  Loader2,
  User,
  XCircle,
} from "lucide-react";

import { useT } from "../locale/use-t";
import type { TaxIdValidationState } from "./elvix-tax-id-input";
import type { LegalEntityType } from "./legal-entity-schema";

/**
 * Whether a live tax-authority lookup is still running. Lives here because
 * `VerifyingBadge` is the only thing that renders the distinction.
 */
export const Phase = {
  CHECKING: "checking",
  SETTLED: "settled",
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

/** Cross-fade used by every pane transition (matches ElvixAddressBook). */
export const paneVariants = {
  enter: { opacity: 0, y: 6, filter: "blur(4px)" },
  center: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -4, filter: "blur(4px)" },
};

/** Softens the top and bottom edges of a scrolling list. */
export const FADE_MASK =
  "linear-gradient(to bottom, transparent 0, rgba(0,0,0,0.4) 12px, black 28px, black calc(100% - 28px), rgba(0,0,0,0.4) calc(100% - 12px), transparent 100%)";

export function Pane({
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

export function EmptyState({ onAdd }: { onAdd: () => void }) {
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
          <div className="mt-1 text-[12px] text-fg-3">{t("legalEntities.addCtaSubtitle")}</div>
        </div>
      </button>
    </div>
  );
}

/**
 * Shared chip primitive used by both `<CountryView>` (single) and
 * `<NationalityView>` (multi). Same visual treatment everywhere so
 * the user reads "selection" identically across panes.
 */
export function CountryChip({
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

export function VerifyingBadge({
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
        <div className="text-[12px] uppercase tracking-wide text-fg-3">
          {t("legalEntities.verifying")}
        </div>
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
        <div className="text-[12px] uppercase tracking-wide text-red-500">
          {t("legalEntities.notRegistered")}
        </div>
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
      <div className="text-[12px] uppercase tracking-wide text-amber-500">
        {t("legalEntities.unreachable")}
      </div>
    </motion.div>
  );
}

export function SavingView({ label }: { label?: string }) {
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

export function WizardHeader({
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

export function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">{children}</h2>;
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[12.5px] text-fg-3">{children}</p>;
}

export function ChoiceCard({
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

export function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
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

export function DetailRow({
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

export function typeIcon(t: LegalEntityType, size = 4) {
  if (t === "individual") return <User className={`size-${size}`} />;
  if (t === "sole_prop") return <Briefcase className={`size-${size}`} />;
  return <Building2 className={`size-${size}`} />;
}
