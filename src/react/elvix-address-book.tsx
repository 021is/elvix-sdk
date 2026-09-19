"use client";

/**
 * `<ElvixAddressBook>` — single-frame wizard for billing OR shipping
 * addresses. Lives inside an `<ElvixCard>` so the chrome (brand
 * border + trusted badge) matches every other SDK form.
 *
 * One frame, one pane at a time (the state machine is in
 * `address-book-wizard.ts`, the requests in `use-address-book.ts`):
 *
 *   empty / list — the addresses of this kind, or the "Add address" tile.
 *   add flow     — search → review → apt/floor → recipient → notes → save.
 *   detail       — one address; each row reopens its add-flow step to edit
 *                  that field alone.
 *   confirms     — delete, and set/clear default. Both warn that the
 *                  address is shared with every app the user signs into.
 *
 * Critical: everything happens INSIDE THE FRAME. No page navigation.
 * That's the SDK contract — a customer drops `<ElvixAddressBook
 * kind="billing" />` into their checkout and the entire CRUD lifecycle
 * runs inside the frame they sized.
 *
 * Sizing — opinionated default, fully overridable for hosts:
 *
 *   height     — fixed height (default: 520). Takes precedence over
 *                min/max.
 *   minHeight  — bottom bound when `height` is not set.
 *   maxHeight  — top bound when `height` is not set.
 *   width      — frame width (default: "100%", fills the host's column).
 *
 * Customers can render in narrow checkout columns by passing
 * `width={360}` or in a wide modal with `width={520}` — the inner
 * grid reflows but the outer frame is theirs to size.
 */

import { AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Loader2,
  MapPin,
  Plus,
  Search,
  Star,
  Trash2,
  User,
  UserPlus,
} from "lucide-react";
import { type CSSProperties, Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../locale/use-t";
import { EditableField, type PlaceDetails, ReturnTo, View } from "./address-book-wizard";
import type { AddressKind, AddressRecord } from "./address-schema";
import { MaybeCard } from "./elvix-card";
import { ElvixInput } from "./elvix-input";
import { useElvixContext } from "./elvix-provider";
import { ElvixSaveButton } from "./elvix-save-button";
import { MAPS_MISSING_CLIENT_ID, mapsUrl } from "./maps-url";
import { isSameOrigin } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { type ElvixAddressBookResult, useAddressBook } from "./use-address-book";
import { FadePane } from "./wizard-panes";

export type { ElvixAddressBookResult } from "./use-address-book";

export type ElvixAddressBookProps = {
  /** Render inside an <ElvixCard>. Default true; pass false for bare (no chrome). */
  card?: boolean;
  kind: AddressKind;
  /** Fixed frame height. Defaults to 520. Takes precedence over min/max. */
  height?: number;
  /** Bottom bound when `height` is unset. */
  minHeight?: number;
  /** Top bound when `height` is unset. */
  maxHeight?: number;
  /** Frame width. Defaults to "100%" so it fills whatever container
   *  the host puts it in. Pass a number for a fixed pixel width. */
  width?: number | string;
  /**
   * Signed-in user's display name. Powers the "Me" card on the
   * recipient step so the user can pick their own name with one
   * click. Falls back to email or "You" if the host doesn't provide.
   */
  userDisplayName?: string | null;
  /** Optional callback fired after a successful save / delete. */
  onChange?: (addresses: AddressRecord[]) => void;
  /** Fires on every terminal save / delete outcome. Safe payload:
   *  count only — never the address rows themselves. */
  onResult?: (result: ElvixAddressBookResult) => void;
};

type PlaceSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
};

function newSessionToken(): string {
  return crypto.randomUUID();
}

export function ElvixAddressBook({
  kind,
  height = 520,
  minHeight,
  maxHeight,
  width = "100%",
  userDisplayName,
  onChange,
  onResult,
  card,
}: ElvixAddressBookProps) {
  const t = useT();
  const book = useAddressBook({ kind, onChange, onResult });
  const { view } = book.state;
  const frameStyle: CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    ...(height
      ? { height: `${height}px` }
      : { minHeight: minHeight ?? 360, maxHeight: maxHeight ?? 720 }),
  };

  return (
    <div style={frameStyle} className="mx-auto">
      <MaybeCard card={card} className="h-full">
        <div className="relative h-full overflow-hidden">
          <AnimatePresence initial={false}>
            {book.loading ? (
              <FadePane key="loading">
                <div className="grid h-full place-items-center text-fg-3 text-sm">
                  {t("common.loading")}
                </div>
              </FadePane>
            ) : (
              <FadePane key={view} fadeEdges={view === View.LIST}>
                {ADD_FLOW_VIEWS.has(view) ? (
                  <AddFlowPane kind={kind} userDisplayName={userDisplayName ?? null} book={book} />
                ) : (
                  <ManagePane kind={kind} book={book} />
                )}
              </FadePane>
            )}
          </AnimatePresence>
        </div>
      </MaybeCard>
    </div>
  );
}

type Book = ReturnType<typeof useAddressBook>;

const ADD_FLOW_VIEWS: ReadonlySet<View> = new Set([
  View.SEARCH,
  View.REVIEW,
  View.APT_FLOOR,
  View.RECIPIENT_CHOICE,
  View.RECIPIENT_CUSTOM,
  View.RECIPIENT_BUSINESS_NAME,
  View.RECIPIENT_BUSINESS_CONTACT,
  View.NOTE_CHOICE,
  View.NOTE_INPUT,
  View.SAVING,
]);

/**
 * The add flow's steps. The four steps a detail-view row reopens (apt/floor,
 * recipient, company, notes) go back to the detail view while editing.
 */
function AddFlowPane({
  kind,
  userDisplayName,
  book,
}: {
  kind: AddressKind;
  userDisplayName: string | null;
  book: Book;
}) {
  const t = useT();
  const { state, dispatch } = book;
  const { draft, error, editing } = state;
  const show = (view: View) => () => dispatch({ type: "show", view });
  const backTo = (view: View) => (editing ? () => dispatch({ type: "cancelEdit" }) : show(view));

  switch (state.view) {
    case View.SEARCH:
      return (
        <SearchView
          kind={kind}
          onPick={(seed) => dispatch({ type: "placePicked", seed })}
          onBack={book.closeWizard}
        />
      );
    case View.REVIEW:
      return (
        <ReviewView
          kind={kind}
          details={draft.seed}
          onConfirm={() => dispatch({ type: "reviewConfirmed" })}
          onChange={() => dispatch({ type: "reopenSearch" })}
        />
      );
    case View.APT_FLOOR:
      return (
        <AptFloorView
          kind={kind}
          initial={draft.line2}
          onConfirm={book.confirmLine2}
          onBack={backTo(View.REVIEW)}
        />
      );
    case View.RECIPIENT_CHOICE:
      return (
        <RecipientChoiceView
          kind={kind}
          userDisplayName={userDisplayName}
          onPickMe={(name) => dispatch({ type: "recipientSet", recipient: name, company: "" })}
          onPickCustom={() => dispatch({ type: "customRecipient" })}
          onPickBusiness={() => dispatch({ type: "businessStart" })}
          onBack={show(View.APT_FLOOR)}
          error={error}
        />
      );
    case View.RECIPIENT_CUSTOM:
      return (
        <RecipientCustomView
          kind={kind}
          initial={draft.recipient}
          onConfirm={book.confirmRecipient}
          onBack={backTo(View.RECIPIENT_CHOICE)}
        />
      );
    case View.RECIPIENT_BUSINESS_NAME:
      return (
        <RecipientBusinessNameView
          kind={kind}
          initial={draft.company}
          onConfirm={book.confirmCompany}
          onBack={backTo(View.RECIPIENT_CHOICE)}
        />
      );
    case View.RECIPIENT_BUSINESS_CONTACT:
      return (
        <RecipientBusinessContactView
          kind={kind}
          companyName={draft.company}
          onConfirm={book.confirmContact}
          onBack={show(View.RECIPIENT_BUSINESS_NAME)}
        />
      );
    case View.NOTE_CHOICE:
      return (
        <NoteChoiceView
          kind={kind}
          onYes={show(View.NOTE_INPUT)}
          onNo={() => book.confirmNotes(null)}
          onBack={show(View.RECIPIENT_CHOICE)}
          error={error}
        />
      );
    case View.NOTE_INPUT:
      return (
        <NoteInputView
          kind={kind}
          initial={draft.notes ?? ""}
          onConfirm={book.confirmNotes}
          onBack={backTo(View.NOTE_CHOICE)}
        />
      );
    default:
      return <SavingView label={t("addressBook.savingLabel")} />;
  }
}

/** The list, one address's detail, and the delete / default confirmations. */
function ManagePane({ kind, book }: { kind: AddressKind; book: Book }) {
  const t = useT();
  const { state, dispatch, addresses } = book;
  const find = (id: string | null | undefined) => addresses.find((a) => a.id === id) ?? null;
  const askDefault = (id: string, setting: boolean, returnTo: ReturnTo) =>
    dispatch({ type: "askDefault", intent: { id, setting, returnTo } });
  const openAdd = () => dispatch({ type: "openAdd" });

  switch (state.view) {
    case View.EMPTY:
      return <EmptyState kind={kind} onAdd={openAdd} />;
    case View.LIST:
      return (
        <ListView
          kind={kind}
          addresses={addresses}
          onOpen={(id) => dispatch({ type: "openDetail", id })}
          onDelete={(id) => dispatch({ type: "askDelete", id })}
          onToggleDefault={(id, current) => askDefault(id, !current, ReturnTo.LIST)}
          onAdd={openAdd}
        />
      );
    case View.DETAIL:
      return (
        <DetailPane
          kind={kind}
          address={find(state.inspectingId)}
          book={book}
          askDefault={askDefault}
        />
      );
    case View.DEFAULT_CONFIRM:
      return (
        <DefaultConfirmView
          kind={kind}
          address={find(state.defaultIntent?.id)}
          setting={state.defaultIntent?.setting ?? true}
          error={state.error}
          onCancel={() => dispatch({ type: "cancelDefault" })}
          onConfirm={book.confirmDefault}
        />
      );
    case View.DELETE_CONFIRM:
      return (
        <DeleteConfirmView
          kind={kind}
          address={find(state.deletingId)}
          error={state.error}
          onCancel={() => dispatch({ type: "cancelDelete" })}
          onConfirm={book.confirmDelete}
        />
      );
    default:
      return <SavingView label={t("addressBook.deletingLabel")} />;
  }
}

/** One address in full; each row reopens its wizard step to edit it. */
function DetailPane({
  kind,
  address,
  book,
  askDefault,
}: {
  kind: AddressKind;
  address: AddressRecord | null;
  book: Book;
  askDefault: (id: string, setting: boolean, returnTo: ReturnTo) => void;
}) {
  const { dispatch } = book;
  const edit = (field: EditableField, value: string | null) => () =>
    dispatch({ type: "edit", field, value });
  return (
    <DetailView
      kind={kind}
      address={address}
      onBack={() => dispatch({ type: "closeDetail" })}
      onDelete={() => address && dispatch({ type: "askDelete", id: address.id })}
      onToggleDefault={() => address && askDefault(address.id, !address.isDefault, ReturnTo.DETAIL)}
      onEditRecipient={edit(EditableField.RECIPIENT, address?.recipientName ?? "")}
      onEditCompany={edit(EditableField.COMPANY, address?.companyName ?? "")}
      onEditLine2={edit(EditableField.LINE2, address?.line2 ?? null)}
      onEditNotes={edit(EditableField.NOTES, address?.deliveryNotes ?? null)}
    />
  );
}

// ─── Sub-views ────────────────────────────────────────────────────────

function EmptyState({ kind, onAdd }: { kind: AddressKind; onAdd: () => void }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <button
        type="button"
        onClick={onAdd}
        className="group flex w-full max-w-[320px] flex-col items-center gap-3 rounded-[14px] border border-dashed border-fg-3/30 px-6 py-8 transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)] cursor-pointer"
      >
        <div className="grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] text-[var(--elvix-primary)] transition group-hover:scale-105">
          <Plus className="size-6" />
        </div>
        <div>
          <div className="text-[15px] font-semibold text-fg-1">
            {kind === "billing" ? t("addressBook.addBilling") : t("addressBook.addShipping")}
          </div>
          <div className="mt-1 text-[12px] text-fg-3">
            {kind === "billing" ? t("addressBook.useForBilling") : t("addressBook.useForShipping")}
          </div>
        </div>
      </button>
    </div>
  );
}

function ListView({
  kind,
  addresses,
  onOpen,
  onDelete,
  onToggleDefault,
  onAdd,
}: {
  kind: AddressKind;
  addresses: AddressRecord[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleDefault: (id: string, currentlyDefault: boolean) => void;
  onAdd: () => void;
}) {
  const t = useT();
  // Top + bottom padding gives the first / last card clearance from
  // the Pane's fade mask so they're never partially fogged when the
  // list isn't scrolled.
  return (
    <div className="flex flex-col gap-2 pt-3 pb-4">
      <button
        type="button"
        onClick={onAdd}
        className="group flex items-center justify-center gap-2 rounded-[12px] border border-dashed border-fg-3/30 px-4 py-3 text-[13px] font-medium text-fg-2 transition hover:border-[var(--elvix-primary)] hover:text-[var(--elvix-primary)] cursor-pointer"
      >
        <Plus className="size-4" />
        {kind === "billing"
          ? t("addressBook.addAnotherBilling")
          : t("addressBook.addAnotherShipping")}
      </button>
      {addresses.map((a) => {
        const hasLabel = Boolean(a.label?.trim());
        const hasCompany = Boolean(a.companyName?.trim());
        return (
          <div
            key={a.id}
            className="group relative flex w-full items-start gap-3 rounded-[12px] border border-fg-3/15 bg-surface text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_4%,transparent)]"
          >
            <button
              type="button"
              onClick={() => onOpen(a.id)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left cursor-pointer"
            >
              <div className="mt-0.5 text-fg-3 group-hover:text-[var(--elvix-primary)]">
                <MapPin className="size-4" />
              </div>
              <div className="min-w-0 flex-1 pr-20">
                <div className="flex items-center gap-2">
                  <div className="truncate text-[14px] font-semibold text-fg-1">
                    {hasLabel ? a.label : a.recipientName}
                  </div>
                  {a.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_15%,transparent)] px-2 py-[1px] text-[10px] font-medium text-[var(--elvix-primary)]">
                      <Star className="size-2.5 fill-current" />
                      {t("addressBook.defaultBadge")}
                    </span>
                  )}
                </div>
                {/* If label was the title, show the recipient line
                    underneath. If company exists, surface it on the
                    next line ("at <Company>"). */}
                {hasLabel && (
                  <div className="mt-0.5 truncate text-[12.5px] text-fg-2">
                    {a.recipientName}
                    {hasCompany ? ` · ${a.companyName}` : ""}
                  </div>
                )}
                {!hasLabel && hasCompany && (
                  <div className="mt-0.5 truncate text-[12.5px] text-fg-2">
                    {t("addressBook.atCompany", { company: a.companyName ?? "" })}
                  </div>
                )}
                <div className="mt-0.5 truncate text-[12.5px] text-fg-2">
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}
                </div>
                <div className="truncate text-[12px] text-fg-3">
                  {[a.postalCode, a.city, a.regionName, a.countryName ?? a.country]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              </div>
            </button>
            {/* Right-edge action stack — always visible (mobile-safe).
                Star: tap to promote a non-default address; on the
                default row it's read-only (just an indicator).
                Trash: opens the confirm wizard. */}
            <div className="absolute right-2 top-2 flex items-center gap-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDefault(a.id, Boolean(a.isDefault));
                }}
                className={
                  "inline-flex size-8 items-center justify-center rounded-md transition cursor-pointer " +
                  (a.isDefault
                    ? "text-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)]"
                    : "text-fg-3 hover:bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] hover:text-[var(--elvix-primary)]")
                }
                aria-label={
                  a.isDefault ? t("addressBook.removeDefault") : t("addressBook.setAsDefault")
                }
                title={a.isDefault ? t("addressBook.removeDefault") : t("addressBook.setAsDefault")}
              >
                <Star className={a.isDefault ? "size-4 fill-current" : "size-4"} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(a.id);
                }}
                className="inline-flex size-8 items-center justify-center rounded-md text-fg-3 transition hover:bg-red-500/10 hover:text-red-600 cursor-pointer"
                aria-label={t("addressBook.deleteAddress")}
                title={t("addressBook.deleteAddress")}
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

// ─── Search step (Google Places autocomplete) ────────────────────────

function SearchView({
  kind,
  onPick,
  onBack,
}: {
  kind: AddressKind;
  onPick: (details: PlaceDetails) => void;
  onBack: () => void;
}) {
  const t = useT();
  const ctx = useElvixContext();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // One session token per "user opens search → picks a place". Billing
  // groups every keystroke + the final details call into one charge.
  const sessionRef = useRef<string>(newSessionToken());

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setErr(null);
      return;
    }
    // AbortController cancels the in-flight request when the user
    // types again. Without this, an older slow fetch can resolve
    // AFTER a newer fast one and overwrite its results / write a
    // stale error — exactly the "error + results visible at once"
    // bug.
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
        if (controller.signal.aborted) return; // user typed again — drop this result
        setErr(e instanceof Error ? e.message : "search_failed");
        setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 180); // debounce
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, ctx]);

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
        // Rotate the session token — billing closes after the details call.
        sessionRef.current = newSessionToken();
        onPick(body.details);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "details_failed");
        setPicking(null);
      }
    },
    [onPick, ctx],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          {t("common.back")}
        </button>
        <div className="ml-auto text-[12px] text-fg-3">
          {kind === "billing"
            ? t("addressBook.newBillingAddress")
            : t("addressBook.newShippingAddress")}
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
          {t("addressBook.searchPrompt")}
        </span>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <ElvixInput
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("addressBook.searchPlaceholder")}
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
            {t("addressBook.searchError", { error: err })}
          </div>
        )}
        {!err && suggestions.length === 0 && query.trim().length >= 2 && !searching && (
          <div className="rounded-md bg-fg-3/5 px-3 py-2 text-[12.5px] text-fg-3">
            {t("addressBook.noMatchesKeepTyping")}
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

// ─── Apartment / floor step ─────────────────────────────────────────

function AptFloorView({
  kind,
  initial = "",
  onConfirm,
  onBack,
}: {
  kind: AddressKind;
  initial?: string;
  onConfirm: (line2: string | null) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [line2, setLine2] = useState(initial);
  const trimmed = line2.trim();
  const valid = trimmed.length <= 180;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          {t("common.back")}
        </button>
        <div className="ml-auto text-[12px] text-fg-3">{t("addressBook.aptFloorEyebrow")}</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">
          {t("addressBook.aptFloorTitle")}
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          {kind === "billing"
            ? t("addressBook.aptFloorBodyBilling")
            : t("addressBook.aptFloorBodyShipping")}
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
          {t("addressBook.line2Label")}
        </span>
        <ElvixInput
          type="text"
          value={line2}
          onChange={(e) => setLine2(e.target.value)}
          placeholder={t("addressBook.line2Placeholder")}
          autoFocus
          autoComplete="address-line2"
          maxLength={180}
          onKeyDown={(e) => {
            // LEGACY: spine-lint-disable-next-line spine/enum-over-string
            if (e.key === "Enter" && valid) onConfirm(trimmed || null);
          }}
        />
      </label>

      <div className="mt-auto flex items-center justify-end pt-3">
        {/* Optional field — Continue is always enabled (within max
            length). Empty input saves null, which both adds and
            removes the value cleanly. No separate Skip button to
            confuse the edit flow. */}
        <ElvixSaveButton
          state="idle"
          disabled={!valid}
          onClick={() => valid && onConfirm(trimmed || null)}
          label={t("common.continue")}
          savedLabel={t("common.continue")}
          hint={t("common.enterHint")}
          className="!w-auto !px-5"
        />
      </div>
    </div>
  );
}

// ─── Recipient choice step ──────────────────────────────────────────

function RecipientChoiceView({
  kind,
  userDisplayName,
  onPickMe,
  onPickCustom,
  onPickBusiness,
  onBack,
  error,
}: {
  kind: AddressKind;
  userDisplayName: string | null;
  onPickMe: (name: string) => void;
  onPickCustom: () => void;
  onPickBusiness: () => void;
  onBack: () => void;
  error: string | null;
}) {
  const t = useT();
  const ownName = userDisplayName?.trim();

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          {t("common.back")}
        </button>
        <div className="ml-auto text-[12px] text-fg-3">{t("addressBook.step2of3")}</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">
          {kind === "billing"
            ? t("addressBook.recipientTitleBilling")
            : t("addressBook.recipientTitleShipping")}
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          {kind === "billing"
            ? t("addressBook.recipientSubtitleBilling")
            : t("addressBook.recipientSubtitleShipping")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {ownName && (
          <button
            type="button"
            onClick={() => onPickMe(ownName)}
            className="group flex w-full items-start gap-3 rounded-[12px] border border-fg-3/15 bg-surface px-4 py-3 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)] cursor-pointer"
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_15%,transparent)] text-[var(--elvix-primary)]">
              <User className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-fg-1">
                {t("entityKind.me")}
              </div>
              <div className="truncate text-[12.5px] text-fg-3">{userDisplayName}</div>
            </div>
            <ChevronRight className="mt-1 size-4 shrink-0 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-[var(--elvix-primary)]" />
          </button>
        )}

        <button
          type="button"
          onClick={onPickCustom}
          className="group flex w-full items-start gap-3 rounded-[12px] border border-fg-3/15 bg-surface px-4 py-3 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)] cursor-pointer"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-fg-3/10 text-fg-2">
            <UserPlus className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-fg-1">
              {t("entityKind.someoneElse")}
            </div>
            <div className="truncate text-[12.5px] text-fg-3">
              {kind === "billing"
                ? t("addressBook.someoneElseSubtitleBilling")
                : t("addressBook.someoneElseSubtitleShipping")}
            </div>
          </div>
          <ChevronRight className="mt-1 size-4 shrink-0 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-[var(--elvix-primary)]" />
        </button>

        <button
          type="button"
          onClick={onPickBusiness}
          className="group flex w-full items-start gap-3 rounded-[12px] border border-fg-3/15 bg-surface px-4 py-3 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)] cursor-pointer"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-fg-3/10 text-fg-2">
            <Building2 className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-fg-1">
              {t("entityKind.business")}
            </div>
            <div className="truncate text-[12.5px] text-fg-3">
              {kind === "billing"
                ? t("addressBook.businessSubtitleBilling")
                : t("addressBook.businessSubtitleShipping")}
            </div>
          </div>
          <ChevronRight className="mt-1 size-4 shrink-0 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-[var(--elvix-primary)]" />
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          {t("addressBook.saveError", { error })}
        </div>
      )}
    </div>
  );
}

// ─── Recipient custom-name step ─────────────────────────────────────

function RecipientCustomView({
  kind,
  initial = "",
  onConfirm,
  onBack,
}: {
  kind: AddressKind;
  initial?: string;
  onConfirm: (name: string) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 120;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          {t("common.back")}
        </button>
        <div className="ml-auto text-[12px] text-fg-3">{t("addressBook.step2of3")}</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">
          {t("addressBook.recipientCustomTitle")}
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          {kind === "billing"
            ? t("addressBook.recipientCustomSubtitleBilling")
            : t("addressBook.recipientCustomSubtitleShipping")}
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
          {t("identity.fullName")}
        </span>
        <ElvixInput
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("addressBook.recipientPlaceholder")}
          autoFocus
          autoComplete="name"
          maxLength={120}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) onConfirm(trimmed);
          }}
        />
      </label>

      <div className="mt-auto flex items-center justify-end border-t border-fg-3/10 pt-3">
        <ElvixSaveButton
          state="idle"
          disabled={!valid}
          onClick={() => valid && onConfirm(trimmed)}
          label={t("common.continue")}
          savedLabel={t("common.continue")}
          hint={t("common.enterHint")}
          className="!w-auto !px-5"
        />
      </div>
    </div>
  );
}

// ─── Business: company name step ────────────────────────────────────

function RecipientBusinessNameView({
  kind,
  initial = "",
  onConfirm,
  onBack,
}: {
  kind: AddressKind;
  initial?: string;
  onConfirm: (companyName: string) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [company, setCompany] = useState(initial);
  const trimmed = company.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 120;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          {t("common.back")}
        </button>
        <div className="ml-auto text-[12px] text-fg-3">{t("addressBook.businessStep1of2")}</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">
          {t("addressBook.companyNameTitle")}
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          {kind === "billing"
            ? t("addressBook.companyNameBodyBilling")
            : t("addressBook.companyNameBodyShipping")}
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
          {t("legalEntities.companyName")}
        </span>
        <ElvixInput
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder={t("addressBook.companyNamePlaceholder")}
          autoFocus
          autoComplete="organization"
          maxLength={120}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) onConfirm(trimmed);
          }}
        />
      </label>

      <div className="mt-auto flex items-center justify-end border-t border-fg-3/10 pt-3">
        <ElvixSaveButton
          state="idle"
          disabled={!valid}
          onClick={() => valid && onConfirm(trimmed)}
          label={t("common.continue")}
          savedLabel={t("common.continue")}
          hint={t("common.enterHint")}
          className="!w-auto !px-5"
        />
      </div>
    </div>
  );
}

// ─── Business: optional contact step ────────────────────────────────

function RecipientBusinessContactView({
  kind,
  companyName,
  onConfirm,
  onBack,
}: {
  kind: AddressKind;
  companyName: string;
  onConfirm: (contact: string | null) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [contact, setContact] = useState("");
  const trimmed = contact.trim();
  const valid = trimmed.length <= 120; // empty is allowed — it's optional

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          {t("common.back")}
        </button>
        <div className="ml-auto text-[12px] text-fg-3">{t("addressBook.businessStep2of2")}</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">
          {t("addressBook.contactAtCompanyTitle", { company: companyName })}
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          {kind === "billing" ? t("addressBook.attnBodyInvoice") : t("addressBook.attnBodyPackage")}
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
          {t("addressBook.contactPersonOptional")}
        </span>
        <ElvixInput
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={t("addressBook.recipientPlaceholder")}
          autoFocus
          autoComplete="name"
          maxLength={120}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) onConfirm(trimmed || null);
          }}
        />
      </label>

      <div className="mt-auto flex items-center gap-2 border-t border-fg-3/10 pt-3">
        <button
          type="button"
          onClick={() => onConfirm(null)}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
        >
          {t("addressBook.skip")}
        </button>
        <div className="ml-auto">
          <ElvixSaveButton
            state="idle"
            disabled={!valid}
            onClick={() => valid && onConfirm(trimmed || null)}
            label={t("common.save")}
            savedLabel={t("common.save")}
            hint={t("common.enterHint")}
            className="!w-auto !px-5"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Delivery-notes Yes / No choice ─────────────────────────────────

function NoteChoiceView({
  kind,
  onYes,
  onNo,
  onBack,
  error,
}: {
  kind: AddressKind;
  onYes: () => void;
  onNo: () => void;
  onBack: () => void;
  error: string | null;
}) {
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          {t("common.back")}
        </button>
        <div className="ml-auto text-[12px] text-fg-3">{t("common.lastStep")}</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">
          {t("addressBook.noteChoiceTitle")}
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          {kind === "billing"
            ? t("addressBook.noteChoiceBodyBilling")
            : t("addressBook.noteChoiceBodyShipping")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onYes}
          className="group flex w-full items-start gap-3 rounded-[12px] border border-fg-3/15 bg-surface px-4 py-3 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)] cursor-pointer"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_15%,transparent)] text-[var(--elvix-primary)]">
            <Plus className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-fg-1">
              {t("addressBook.noteYesTitle")}
            </div>
            <div className="truncate text-[12.5px] text-fg-3">
              {t("addressBook.noteYesSubtitle")}
            </div>
          </div>
          <ChevronRight className="mt-1 size-4 shrink-0 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-[var(--elvix-primary)]" />
        </button>

        <button
          type="button"
          onClick={onNo}
          className="group flex w-full items-start gap-3 rounded-[12px] border border-fg-3/15 bg-surface px-4 py-3 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)] cursor-pointer"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-fg-3/10 text-fg-2">
            <ChevronRight className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-fg-1">
              {t("addressBook.noteNoTitle")}
            </div>
            <div className="truncate text-[12.5px] text-fg-3">
              {t("addressBook.noteNoSubtitle")}
            </div>
          </div>
          <ChevronRight className="mt-1 size-4 shrink-0 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-[var(--elvix-primary)]" />
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          {t("addressBook.saveError", { error })}
        </div>
      )}
    </div>
  );
}

// ─── Delivery-notes input ───────────────────────────────────────────

function NoteInputView({
  kind,
  initial = "",
  onConfirm,
  onBack,
}: {
  kind: AddressKind;
  initial?: string;
  onConfirm: (notes: string) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [notes, setNotes] = useState(initial);
  const trimmed = notes.trim();
  // Optional field — empty saves null (removes the note). Length cap
  // is the only constraint.
  const valid = trimmed.length <= 500;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          {t("common.back")}
        </button>
        <div className="ml-auto text-[12px] text-fg-3">{t("addressBook.noteLastStep")}</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">
          {t("addressBook.noteInputTitle")}
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          {kind === "billing"
            ? t("addressBook.noteInputBodyBilling")
            : t("addressBook.noteInputBodyShipping")}
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
          {kind === "billing" ? t("addressBook.billingNote") : t("addressBook.deliveryNote")}
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          maxLength={500}
          autoFocus
          placeholder={
            kind === "billing"
              ? t("addressBook.notePlaceholderBilling")
              : t("addressBook.notePlaceholderShipping")
          }
          className="w-full resize-none rounded-[10px] border border-fg-3/25 bg-canvas px-3 py-2 text-[14px] text-fg-1 placeholder:text-fg-3 focus:border-[var(--elvix-primary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--elvix-primary)_25%,transparent)]"
        />
        <div className="mt-1 text-right text-[11px] text-fg-3">{trimmed.length}/500</div>
      </label>

      <div className="mt-auto flex items-center justify-end pt-3">
        <ElvixSaveButton
          state="idle"
          disabled={!valid}
          onClick={() => valid && onConfirm(trimmed)}
          label={t("common.save")}
          savedLabel={t("identity.saved")}
          hint={null}
          className="!w-auto !px-5"
        />
      </div>
    </div>
  );
}

// ─── Saving pane (commit / delete in flight) ────────────────────────

function SavingView({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] text-[var(--elvix-primary)]">
          <Loader2 className="size-5 animate-spin" />
        </div>
        <div className="text-[13px] font-medium text-fg-2">{label}</div>
      </div>
    </div>
  );
}

// ─── Detail view (sectioned, tap-to-edit) ───────────────────────────

function DetailView({
  kind,
  address,
  onBack,
  onDelete,
  onToggleDefault,
  onEditRecipient,
  onEditCompany,
  onEditLine2,
  onEditNotes,
}: {
  kind: AddressKind;
  address: AddressRecord | null;
  onBack: () => void;
  onDelete: () => void;
  onToggleDefault: () => void;
  onEditRecipient: () => void;
  onEditCompany: () => void;
  onEditLine2: () => void;
  onEditNotes: () => void;
}) {
  const t = useT();
  if (!address) {
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={onBack} className="underline cursor-pointer">
          {t("addressBook.backToList")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          {t("common.back")}
        </button>
        <div className="ml-auto text-[12px] text-fg-3">
          {kind === "billing"
            ? t("addressBook.billingAddressLabel")
            : t("addressBook.shippingAddressLabel")}
        </div>
      </div>

      {/* Hero card — title + formatted address. Reads as the
          "headline" of the screen. */}
      <div className="mb-4 rounded-[14px] border border-fg-3/15 bg-surface px-4 py-3.5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_12%,transparent)] text-[var(--elvix-primary)]">
            <MapPin className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[15px] font-semibold text-fg-1">
                {address.label?.trim() || address.recipientName}
              </div>
              {address.isDefault && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_15%,transparent)] px-2 py-[1px] text-[10px] font-medium text-[var(--elvix-primary)]">
                  <Star className="size-2.5 fill-current" />
                  {t("addressBook.defaultBadge")}
                </span>
              )}
            </div>
            {address.formattedAddress && (
              <div className="mt-1 text-[12.5px] leading-snug text-fg-2">
                {address.formattedAddress}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto pr-1 pt-3 pb-6 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          // Soft fade on BOTH edges — content dissolves into the
          // hero card above and the action bar below instead of
          // ending in a hard line. Mirrored linear-gradient mask.
          maskImage:
            "linear-gradient(to bottom, transparent 0, rgba(0,0,0,0.4) 12px, black 28px, black calc(100% - 28px), rgba(0,0,0,0.4) calc(100% - 12px), transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0, rgba(0,0,0,0.4) 12px, black 28px, black calc(100% - 28px), rgba(0,0,0,0.4) calc(100% - 12px), transparent 100%)",
        }}
      >
        {/* Who */}
        <DetailSection title={t("addressBook.sectionWho")}>
          <DetailRow
            label={t("addressBook.fieldRecipient")}
            value={address.recipientName}
            onClick={onEditRecipient}
          />
          <DetailRow
            label={t("addressBook.fieldCompany")}
            value={address.companyName}
            placeholder={t("addressBook.addCompanyPlaceholder")}
            onClick={onEditCompany}
          />
        </DetailSection>

        {/* Where — Google-sourced; only line2 is directly editable.
            The rest live on the place record and require a re-search.
            Shown as read-only for now. */}
        <DetailSection title={t("addressBook.sectionWhere")}>
          <DetailRow label={t("addressBook.fieldStreet")} value={address.line1} />
          <DetailRow
            label={t("addressBook.fieldAptFloor")}
            value={address.line2}
            placeholder={t("addressBook.addUnitPlaceholder")}
            onClick={onEditLine2}
          />
          <DetailRow label={t("addressBook.fieldCity")} value={address.city} />
          <DetailRow label={t("addressBook.fieldPostalCode")} value={address.postalCode} />
          <DetailRow
            label={t("addressBook.fieldRegion")}
            value={
              address.regionName && address.regionCode
                ? `${address.regionName} (${address.regionCode})`
                : address.regionName || address.regionCode || null
            }
          />
          <DetailRow
            label={t("addressBook.fieldCountry")}
            value={
              address.countryName && address.country
                ? `${address.countryName} (${address.country})`
                : address.countryName || address.country || null
            }
          />
        </DetailSection>

        {/* Extras */}
        <DetailSection title={t("addressBook.sectionNotesMeta")}>
          <DetailRow
            label={t("addressBook.fieldDeliveryNotes")}
            value={address.deliveryNotes}
            placeholder={t("addressBook.addNotePlaceholder")}
            onClick={onEditNotes}
          />
          <DetailRow label={t("addressBook.fieldTimezone")} value={address.timezone} />
          <DetailRow label={t("addressBook.fieldVenue")} value={address.venueName} />
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
                address.isDefault
                  ? "size-3.5 fill-[var(--elvix-primary)] text-[var(--elvix-primary)]"
                  : "size-3.5"
              }
            />
            {address.isDefault ? t("addressBook.removeDefault") : t("addressBook.setAsDefault")}
          </button>
        </div>
      </div>
    </div>
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
      <div className="w-[110px] shrink-0 text-[12px] text-fg-3">{label}</div>
      <div className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg-1">
        {filled ? value : <span className="text-fg-3">{placeholder ?? "—"}</span>}
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

// ─── Default change confirmation ────────────────────────────────────

function DefaultConfirmView({
  kind,
  address,
  setting,
  error,
  onCancel,
  onConfirm,
}: {
  kind: AddressKind;
  address: AddressRecord | null;
  /** true = promoting this address; false = clearing its default flag. */
  setting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  if (!address) {
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={onCancel} className="underline cursor-pointer">
          {t("addressBook.nothingToChange")}
        </button>
      </div>
    );
  }

  const verb = setting ? t("addressBook.setAsDefault") : t("addressBook.removeDefault");
  const title = setting ? t("addressBook.setDefaultTitle") : t("addressBook.removeDefaultTitle");
  const subtitle = setting
    ? t("addressBook.setDefaultSubtitle")
    : t("addressBook.removeDefaultSubtitle");

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          {t("common.back")}
        </button>
        <div className="ml-auto text-[12px] text-fg-3">{verb}</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">{title}</h2>
        <p className="mt-1 text-[12.5px] text-fg-3">{subtitle}</p>
      </div>

      <div className="mb-4 rounded-[12px] border border-fg-3/15 bg-surface px-4 py-3">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-fg-3" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-fg-1">
              {address.label?.trim() || address.recipientName}
            </div>
            <div className="mt-0.5 truncate text-[12.5px] text-fg-2">
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ""}
            </div>
            <div className="truncate text-[12px] text-fg-3">
              {[
                address.postalCode,
                address.city,
                address.regionName,
                address.countryName ?? address.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5">
        <div className="text-[12.5px] font-semibold text-amber-700 dark:text-amber-300">
          {t("addressBook.crossAppHeadsUp")}
        </div>
        <div className="mt-1 text-[12px] leading-snug text-amber-700/85 dark:text-amber-300/85">
          {setting
            ? t("addressBook.crossAppDefaultBodySetting", { kind })
            : t("addressBook.crossAppDefaultBodyClearing", { kind })}
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          {t("addressBook.saveError", { error })}
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

// ─── Delete confirmation ────────────────────────────────────────────

function DeleteConfirmView({
  kind,
  address,
  error,
  onCancel,
  onConfirm,
}: {
  kind: AddressKind;
  address: AddressRecord | null;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  if (!address) {
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={onCancel} className="underline cursor-pointer">
          {t("addressBook.nothingToDelete")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          {t("common.back")}
        </button>
        <div className="ml-auto text-[12px] text-fg-3">
          {kind === "billing"
            ? t("addressBook.deleteBillingHeader")
            : t("addressBook.deleteShippingHeader")}
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">
          {t("addressBook.deleteConfirmTitle")}
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-3">{t("addressBook.cantBeUndone")}</p>
      </div>

      <div className="mb-4 rounded-[12px] border border-fg-3/15 bg-surface px-4 py-3">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-fg-3" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-fg-1">
              {address.label?.trim() || address.recipientName}
            </div>
            <div className="mt-0.5 truncate text-[12.5px] text-fg-2">
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ""}
            </div>
            <div className="truncate text-[12px] text-fg-3">
              {[
                address.postalCode,
                address.city,
                address.regionName,
                address.countryName ?? address.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5">
        <div className="text-[12.5px] font-semibold text-amber-700 dark:text-amber-300">
          {t("addressBook.crossAppHeadsUp")}
        </div>
        <div className="mt-1 text-[12px] leading-snug text-amber-700/85 dark:text-amber-300/85">
          {kind === "billing"
            ? t("addressBook.crossAppDeleteBodyBilling")
            : t("addressBook.crossAppDeleteBodyShipping")}
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          {t("addressBook.deleteError", { error })}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-fg-3/10 pt-3">
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
            {t("addressBook.yesDelete")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Review step (sanity-check Google's parsed details) ─────────────

function ReviewView({
  kind,
  details,
  onConfirm,
  onChange,
}: {
  kind: AddressKind;
  details: PlaceDetails | null;
  onConfirm: () => void;
  onChange: () => void;
}) {
  const t = useT();
  if (!details) {
    // Defensive — should never happen because reaching this view
    // requires a successful pick. If it does, send the user back.
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={onChange} className="underline cursor-pointer">
          {t("addressBook.pickAddressFirst")}
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
    { label: t("addressBook.fieldStreet"), value: details.line1 || null },
    { label: t("addressBook.fieldCity"), value: details.city || null },
    { label: t("addressBook.fieldPostalCode"), value: details.postalCode },
    { label: t("addressBook.fieldRegion"), value: region },
    { label: t("addressBook.fieldCountry"), value: country },
  ];

  // Required for a usable address record. If Google didn't return
  // street + city + country, the user cannot continue — they have
  // to pick another suggestion or refine their search. Postal +
  // region are optional (many countries don't have one or the other).
  // Gate that mirrors `addressSchema` exactly. Anything failing here
  // would fail server-side validation too — block "Looks right" so
  // the user never hits a "Couldn't save: invalid" two steps later.
  const missing: string[] = [];
  if (!details.line1?.trim()) missing.push(t("addressBook.fieldStreet").toLowerCase());
  if (!details.city?.trim()) missing.push(t("addressBook.fieldCity").toLowerCase());
  if (!details.country || !/^[A-Z]{2}$/.test(details.country))
    missing.push(t("addressBook.fieldCountry").toLowerCase());
  const canContinue = missing.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onChange}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          {t("addressBook.changeAddress")}
        </button>
        <div className="ml-auto text-[12px] text-fg-3">
          {kind === "billing" ? t("addressBook.reviewBilling") : t("addressBook.reviewShipping")}
        </div>
      </div>

      <div className="mb-4">
        <div className="rounded-[12px] border border-fg-3/15 bg-surface px-4 py-3">
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
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
          {rows.map((r) => (
            <Fragment key={r.label}>
              <dt className="text-fg-3">{r.label}</dt>
              <dd className="font-medium text-fg-1">
                {r.value ?? <span className="text-fg-3">—</span>}
              </dd>
            </Fragment>
          ))}
        </dl>

        {!canContinue && (
          <div className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-700 dark:text-amber-300">
            {t("addressBook.missingFieldsHint", { fields: missing.join(", ") })}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-fg-3/10 pt-3">
        <button
          type="button"
          onClick={onChange}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
        >
          {canContinue ? t("addressBook.notRight") : t("addressBook.changeAddress")}
        </button>
        <div className="ml-auto">
          <ElvixSaveButton
            state="idle"
            disabled={!canContinue}
            onClick={onConfirm}
            label={t("addressBook.looksRight")}
            savedLabel={t("addressBook.looksRight")}
            hint={null}
            className="!w-auto !px-5"
          />
        </div>
      </div>
    </div>
  );
}

// ─── kind-fixed aliases ──────────────────────────────────────────────
// The same one component drives both address kinds — `kind` is the only
// thing that differs. Hosts that prefer an explicit name (and never want
// to pass `kind`) reach for these thin aliases instead, exactly like
// <ElvixSignOutMenuItem> / <ElvixSignOutLink> wrap <ElvixSignOutButton>.

/**
 * `<ElvixBillingAddressBook>` — the address book pinned to billing
 * addresses. Thin alias for `<ElvixAddressBook kind="billing">`; same
 * props minus `kind`.
 */
export function ElvixBillingAddressBook(props: Omit<ElvixAddressBookProps, "kind">) {
  return <ElvixAddressBook {...props} kind="billing" />;
}

/**
 * `<ElvixShippingAddressBook>` — the address book pinned to shipping
 * addresses. Thin alias for `<ElvixAddressBook kind="shipping">`; same
 * props minus `kind`.
 */
export function ElvixShippingAddressBook(props: Omit<ElvixAddressBookProps, "kind">) {
  return <ElvixAddressBook {...props} kind="shipping" />;
}
