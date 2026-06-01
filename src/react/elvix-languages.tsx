"use client";

/**
 * `<ElvixLanguages>` — single-frame wizard for managing a user's
 * spoken languages + self-reported proficiency. Mirrors the
 * `<ElvixLegalEntities>` / `<ElvixAddressBook>` architecture exactly:
 * list ↔ add/edit panes ↔ detail with tap-to-edit, all transitions
 * cross-fade inside one `<ElvixCard>` frame.
 *
 * Wizard flow:
 *
 *   empty → list ─┬─→ delete-confirm → deleting
 *                 └─→ detail (tap a row → level chooser in edit mode)
 *
 *   add ─→ language-pick → level-pick → saving → list
 *
 * Cap of 8 enforced at three layers (UI hides picker, server gates
 * POST, DB has a unique constraint).
 */

import { ElvixCard } from "./elvix-card";
import { ElvixInput } from "./elvix-input";
import { ElvixSaveButton } from "./elvix-save-button";
import { useElvixContext } from "./elvix-provider";
import { authInit } from "./session";
import type { LanguageRecord } from "./language-schema";
import {
  LANGUAGES,
  LANGUAGE_LEVELS,
  LANGUAGE_LEVEL_META,
  type Language,
  type LanguageLevel,
  MAX_LANGUAGES_PER_USER,
  findLanguage,
} from "./languages";
import { unwrapEnvelope } from "./spine-fetch";
import { useT } from "../locale/use-t";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Languages as LanguagesIcon,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useState } from "react";

// ─── Public types ────────────────────────────────────────────────────

export type ElvixLanguagesResult =
  | { ok: true; count: number }
  | { ok: false; error: string; message?: string };

export type ElvixLanguagesProps = {
  height?: number;
  minHeight?: number;
  maxHeight?: number;
  width?: number | string;
  onChange?: (languages: LanguageRecord[]) => void;
  /** Fires on every terminal save outcome. Safe payload: count only. */
  onResult?: (result: ElvixLanguagesResult) => void;
};

const View = {
  LOADING: "loading",
  EMPTY: "empty",
  LIST: "list",
  LANGUAGE_PICK: "language-pick",
  LEVEL_PICK: "level-pick",
  SAVING: "saving",
  DELETE_CONFIRM: "delete-confirm",
  DELETING: "deleting",
} as const;
type View = (typeof View)[keyof typeof View];

// ─── Pane transition (matches ElvixLegalEntities) ────────────────────

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

export function ElvixLanguages({
  height,
  minHeight,
  maxHeight,
  width = "100%",
  onChange,
  onResult,
}: ElvixLanguagesProps) {
  const ctx = useElvixContext();
  const t = useT();
  const [view, setView] = useState<View>("loading");
  const [languages, setLanguages] = useState<LanguageRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/languages`, {
      cache: "no-store",
      ...authInit(),
    });
    if (!res.ok) return;
    const body = unwrapEnvelope(await res.json()) as { languages: LanguageRecord[] };
    setLanguages(body.languages);
    onChange?.(body.languages);
  }, [onChange, ctx.baseUrl]);

  useEffect(() => {
    (async () => {
      await refresh();
      // LEGACY: spine-lint-disable-next-line spine/enum-over-string
      setView((v) => (v === "loading" ? ("fallback-decide" as View) : v));
    })();
  }, [refresh]);

  // Decide initial pane once after first load (avoid stomping if user
  // has already navigated).
  useEffect(() => {
    if (view !== ("fallback-decide" as View)) return;
    setView(languages.length === 0 ? "empty" : "list");
  }, [view, languages.length]);

  // ─── Add-flow state ────────────────────────────────────────────
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const [pickedLevel, setPickedLevel] = useState<LanguageLevel>("INTERMEDIATE");
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetWizard = () => {
    setPickedCode(null);
    setPickedLevel("INTERMEDIATE");
    setEditingId(null);
  };

  const openAdd = () => {
    resetWizard();
    setError(null);
    setView("language-pick");
  };

  const closeAdd = () => {
    resetWizard();
    setView(languages.length === 0 ? "empty" : "list");
  };

  const onPickLanguage = (code: string) => {
    setPickedCode(code);
    setPickedLevel("INTERMEDIATE");
    setView("level-pick");
  };

  const onPickLevel = (level: LanguageLevel) => {
    setPickedLevel(level);
  };

  const commitAdd = async () => {
    if (!pickedCode) return;
    setView("saving");
    const auth = authInit();
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/languages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth.headers },
      credentials: auth.credentials,
      body: JSON.stringify({ code: pickedCode, level: pickedLevel }),
    });
    if (!res.ok) {
      const body = unwrapEnvelope(await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(body.error ?? "save_failed");
      onResult?.({ ok: false, error: body.error ?? "save_failed" });
      setView("level-pick");
      return;
    }
    await refresh();
    onResult?.({ ok: true, count: languages.length + 1 });
    resetWizard();
    setView("list");
  };

  // ─── Edit-flow: tap a list row → re-enter level-pick in edit mode ─
  const openEdit = (record: LanguageRecord) => {
    setPickedCode(record.code);
    setPickedLevel(record.level);
    setEditingId(record.id);
    setView("level-pick");
  };

  const commitEdit = async () => {
    if (!editingId) return;
    setView("saving");
    const auth = authInit();
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/languages?id=${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth.headers },
      credentials: auth.credentials,
      body: JSON.stringify({ level: pickedLevel }),
    });
    if (!res.ok) {
      setError("save_failed");
      onResult?.({ ok: false, error: "save_failed" });
      setView("level-pick");
      return;
    }
    await refresh();
    onResult?.({ ok: true, count: languages.length });
    resetWizard();
    setView("list");
  };

  const onLevelConfirm = () => {
    if (editingId) void commitEdit();
    else void commitAdd();
  };

  // ─── Delete confirmation ───────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingRecord = languages.find((l) => l.id === deletingId) ?? null;
  const askDelete = (id: string) => {
    setDeletingId(id);
    setView("delete-confirm");
  };
  const cancelDelete = () => {
    setDeletingId(null);
    setView(languages.length === 0 ? "empty" : "list");
  };
  const confirmDelete = async () => {
    if (!deletingId) return;
    setView("deleting");
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/languages?id=${deletingId}`, {
      method: "DELETE",
      ...authInit(),
    });
    if (!res.ok) {
      setError("delete_failed");
      onResult?.({ ok: false, error: "delete_failed" });
      setView("delete-confirm");
      return;
    }
    setDeletingId(null);
    await refresh();
    onResult?.({ ok: true, count: Math.max(0, languages.length - 1) });
    setView(languages.length <= 1 ? "empty" : "list");
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

  const atCap = languages.length >= MAX_LANGUAGES_PER_USER;
  const pickedLanguage = pickedCode ? findLanguage(pickedCode) : null;
  const editing = Boolean(editingId);

  return (
    <div style={frameStyle} className="mx-auto">
      <ElvixCard className="h-full">
        <div className="relative h-full overflow-hidden">
          <AnimatePresence initial={false}>
            {view === "loading" || view === ("fallback-decide" as View) ? (
              <Pane key="loading">
                <div className="grid h-full place-items-center text-fg-3 text-sm">
                  {t("common.loading")}
                </div>
              </Pane>
            ) : view === "empty" ? (
              <Pane key="empty">
                <EmptyState onAdd={openAdd} />
              </Pane>
            ) : view === "list" ? (
              <Pane key="list" fadeEdges>
                <ListView
                  languages={languages}
                  atCap={atCap}
                  onAdd={openAdd}
                  onOpen={openEdit}
                  onDelete={askDelete}
                />
              </Pane>
            ) : view === "language-pick" ? (
              <Pane key="language-pick">
                <LanguagePickView
                  onPick={onPickLanguage}
                  onBack={closeAdd}
                  takenCodes={languages.map((l) => l.code)}
                />
              </Pane>
            ) : view === "level-pick" ? (
              <Pane key="level-pick">
                <LevelPickView
                  language={pickedLanguage}
                  selected={pickedLevel}
                  onSelect={onPickLevel}
                  onConfirm={onLevelConfirm}
                  onBack={editing ? () => setView("list") : () => setView("language-pick")}
                  saveLabel={editing ? t("languages.saveLevel") : t("common.continue")}
                  error={error}
                />
              </Pane>
            ) : view === "saving" ? (
              <Pane key="saving">
                <SavingView
                  label={editing ? t("languages.updatingLevel") : t("languages.addingLanguage")}
                />
              </Pane>
            ) : view === "delete-confirm" ? (
              <Pane key="delete-confirm">
                <DeleteConfirmView
                  record={deletingRecord}
                  onCancel={cancelDelete}
                  onConfirm={confirmDelete}
                />
              </Pane>
            ) : view === "deleting" ? (
              <Pane key="deleting">
                <SavingView label={t("languages.removing")} />
              </Pane>
            ) : null}
          </AnimatePresence>
        </div>
      </ElvixCard>
    </div>
  );
}

// ─── Sub-views ───────────────────────────────────────────────────────

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
          <LanguagesIcon className="size-6" />
        </div>
        <div>
          <div className="text-[15px] font-semibold text-fg-1">{t("languages.addLanguage")}</div>
          <div className="mt-1 text-[12px] text-fg-3">{t("languages.emptyHint")}</div>
        </div>
      </button>
    </div>
  );
}

function ListView({
  languages,
  atCap,
  onAdd,
  onOpen,
  onDelete,
}: {
  languages: LanguageRecord[];
  atCap: boolean;
  onAdd: () => void;
  onOpen: (l: LanguageRecord) => void;
  onDelete: (id: string) => void;
}) {
  const t = useT();
  return (
    <div className="flex h-full flex-col pt-4">
      <div className="mb-2 flex items-center justify-between px-1">
        <Heading className="!mt-0">{t("languages.title")}</Heading>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={atCap}
        className="mb-3 flex items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-fg-3/35 px-3 py-2.5 text-[13.5px] font-medium text-fg-2 transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_5%,transparent)] hover:text-fg-1 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
      >
        <Plus className="size-4" />
        {atCap
          ? t("languages.limitReached", { limit: MAX_LANGUAGES_PER_USER })
          : t("languages.addAnother")}
      </button>
      <ul className="flex flex-col gap-2 pb-3">
        {languages.map((rec) => {
          const lang = findLanguage(rec.code);
          const meta = LANGUAGE_LEVEL_META[rec.level];
          return (
            <li key={rec.id}>
              <div className="group flex items-center gap-3 rounded-[12px] border border-fg-3/15 bg-surface px-3 py-2.5 transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_5%,transparent)]">
                <button
                  type="button"
                  onClick={() => onOpen(rec)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-fg-1">
                      {lang?.name ?? rec.code}
                    </div>
                    <div className="truncate text-[12px] text-fg-3">
                      {lang?.native && lang.native !== lang.name
                        ? `${lang.native} · ${meta.label}`
                        : meta.label}
                    </div>
                  </div>
                </button>
                <span className="rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_10%,transparent)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--elvix-primary)]">
                  {meta.cefr}
                </span>
                <button
                  type="button"
                  aria-label={`${t("languages.remove")} ${lang?.name ?? rec.code}`}
                  onClick={() => onDelete(rec.id)}
                  className="grid size-7 place-items-center rounded-md text-fg-3 transition hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LanguagePickView({
  onPick,
  onBack,
  takenCodes,
}: {
  onPick: (code: string) => void;
  onBack: () => void;
  takenCodes: string[];
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const taken = new Set(takenCodes);
  const q = query.trim().toLowerCase();
  const filtered: readonly Language[] = q
    ? LANGUAGES.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.native.toLowerCase().includes(q) ||
          l.code.includes(q),
      )
    : LANGUAGES;

  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <Heading>{t("languages.addLanguage")}</Heading>
      <Subtitle>{t("languages.searchHint")}</Subtitle>
      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
        <ElvixInput
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("languages.searchPlaceholder")}
          autoFocus
          autoComplete="off"
          className="pl-9"
        />
      </div>
      <div
        className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-fg-3">
            {t("common.noMatches")}
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5 py-1">
            {filtered.map((l) => {
              const isTaken = taken.has(l.code);
              return (
                <li key={l.code}>
                  <button
                    type="button"
                    disabled={isTaken}
                    onClick={() => !isTaken && onPick(l.code)}
                    className={
                      "group flex w-full items-center gap-3 rounded-[12px] border border-fg-3/15 bg-surface px-3 py-2.5 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition " +
                      (isTaken
                        ? "cursor-not-allowed opacity-40"
                        : "hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)] cursor-pointer")
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
                    {isTaken ? (
                      <span className="text-[11px] uppercase tracking-wide text-fg-3">
                        {t("languages.takenBadge")}
                      </span>
                    ) : (
                      <ChevronRight className="size-4 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-[var(--elvix-primary)]" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function LevelPickView({
  language,
  selected,
  onSelect,
  onConfirm,
  onBack,
  saveLabel,
  error,
}: {
  language: Language | null;
  selected: LanguageLevel;
  onSelect: (l: LanguageLevel) => void;
  onConfirm: () => void;
  onBack: () => void;
  saveLabel: string;
  error: string | null;
}) {
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onBack} />
      <Heading>
        {t("languages.levelPickTitle", {
          language: language?.name ?? t("languages.thisLanguageFallback"),
        })}
      </Heading>
      <Subtitle>{t("languages.levelPickSubtitle")}</Subtitle>
      <ul className="mt-4 flex flex-col gap-2">
        {LANGUAGE_LEVELS.map((lvl) => {
          const meta = LANGUAGE_LEVEL_META[lvl];
          const isSelected = selected === lvl;
          return (
            <li key={lvl}>
              <button
                type="button"
                onClick={() => onSelect(lvl)}
                className={
                  "flex w-full items-start gap-3 rounded-[12px] border px-3 py-2.5 text-left transition cursor-pointer " +
                  (isSelected
                    ? "border-[var(--elvix-primary)] bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] ring-1 ring-inset ring-[var(--elvix-primary)]"
                    : "border-fg-3/15 bg-surface hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_5%,transparent)]")
                }
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[14px] font-semibold text-fg-1">{meta.label}</span>
                    <span className="text-[11px] uppercase tracking-wide text-fg-3">
                      {meta.cefr}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-fg-2">{meta.hint}</div>
                </div>
                {isSelected && (
                  <Check className="mt-1 size-4 shrink-0 text-[var(--elvix-primary)]" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          {error === "already_added"
            ? t("languages.errorAlreadyAdded")
            : error === "cap_reached"
              ? t("languages.limitReached", { limit: MAX_LANGUAGES_PER_USER })
              : t("signin.errorGeneric")}
        </div>
      )}
      <div className="mt-auto flex items-center justify-end pt-3">
        <ElvixSaveButton
          state="idle"
          onClick={onConfirm}
          label={saveLabel}
          savedLabel={t("identity.saved")}
          hint={null}
          className="!w-auto !px-5"
        />
      </div>
    </div>
  );
}

function DeleteConfirmView({
  record,
  onCancel,
  onConfirm,
}: {
  record: LanguageRecord | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const lang = record ? findLanguage(record.code) : null;
  return (
    <div className="flex h-full flex-col">
      <WizardHeader onBack={onCancel} />
      <Heading>
        {t("languages.removeConfirmTitle", {
          language: lang?.name ?? t("languages.thisLanguageFallback"),
        })}
      </Heading>
      <Subtitle>
        {t("languages.removeConfirmBody", {
          language: lang?.name ?? t("languages.thisLanguageFallback"),
        })}
      </Subtitle>
      <div className="mt-auto flex items-center justify-end gap-3 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
        >
          {t("languages.keepCta")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-[10px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-95 cursor-pointer"
        >
          {t("languages.remove")}
        </button>
      </div>
    </div>
  );
}

function SavingView({ label }: { label?: string }) {
  const t = useT();
  const resolved = label ?? t("common.saving");
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] text-[var(--elvix-primary)]">
          <Loader2 className="size-5 animate-spin" />
        </div>
        <div className="text-[13px] font-medium text-fg-2">{resolved}</div>
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
