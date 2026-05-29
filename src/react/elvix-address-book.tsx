"use client";

/**
 * `<ElvixAddressBook>` — single-frame wizard for billing OR shipping
 * addresses. Lives inside an `<ElvixCard>` so the chrome (brand
 * border + trusted badge) matches every other SDK form.
 *
 * Three sub-views, one frame, slide-left/slide-right transitions:
 *
 *   "empty"  — no addresses yet. One big "Add address" tile (mirrors
 *              the AccountIntentCard visual language).
 *   "list"   — addresses stacked vertically as rectangular cards,
 *              default badge on top, "+ Add address" row at the
 *              bottom. Click any card → slides left into "edit".
 *   "form"   — the address form, with a Back arrow. Used for both
 *              add (new) and edit (existing).
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
 *   width      — frame width (default: 432, same as basic info).
 *
 * Customers can render in narrow checkout columns by passing
 * `width={360}` or in a wide modal with `width={520}` — the inner
 * grid reflows but the outer frame is theirs to size.
 */

import { ElvixCard } from "./elvix-card";
import { ElvixInput } from "./elvix-input";
import { ElvixSaveButton } from "./elvix-save-button";
import { useElvixContext } from "./elvix-provider";
import { authInit, isSameOrigin } from "./session";
import type { AddressInput, AddressKind, AddressRecord } from "./address-schema";
import { unwrapEnvelope } from "./spine-fetch";
import { AnimatePresence, motion } from "framer-motion";
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

const ReturnTo = {
  LIST: "list",
  DETAIL: "detail",
} as const;
type ReturnTo = (typeof ReturnTo)[keyof typeof ReturnTo];


export type ElvixAddressBookResult =
  | { ok: true; count: number }
  | { ok: false; error: string; message?: string };

export type ElvixAddressBookProps = {
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

const View = {
  EMPTY: "empty",
  LIST: "list",
  SEARCH: "search",
  REVIEW: "review",
  APT_FLOOR: "apt-floor",
  RECIPIENT_CHOICE: "recipient-choice",
  RECIPIENT_CUSTOM: "recipient-custom",
  RECIPIENT_BUSINESS_NAME: "recipient-business-name",
  RECIPIENT_BUSINESS_CONTACT: "recipient-business-contact",
  NOTE_CHOICE: "note-choice",
  NOTE_INPUT: "note-input",
  SAVING: "saving",
  DETAIL: "detail",
  DELETE_CONFIRM: "delete-confirm",
  DELETING: "deleting",
  DEFAULT_CONFIRM: "default-confirm",
} as const;
type View = (typeof View)[keyof typeof View];

type PlaceSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
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
}: ElvixAddressBookProps) {
  const ctx = useElvixContext();
  const [addresses, setAddresses] = useState<AddressRecord[]>([]);
  const [view, setView] = useState<View>("empty");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/addresses?kind=${kind}`, {
      cache: "no-store",
      ...authInit(),
    });
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const body = unwrapEnvelope(await res.json()) as { ok: boolean; addresses: AddressRecord[] };
    if (!body.ok) {
      setLoading(false);
      return;
    }
    setAddresses(body.addresses);
    onChange?.(body.addresses);
    setLoading(false);
    setView(body.addresses.length === 0 ? "empty" : "list");
  }, [kind, onChange, ctx.baseUrl]);

  useEffect(() => {
    refresh();
    // refresh on mount only — wizard owns its own view state from
    // here on; list refresh happens manually after save / delete.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const openAdd = useCallback(() => {
    setError(null);
    setView("search");
  }, []);

  const closeWizard = useCallback(() => {
    setView(addresses.length === 0 ? "empty" : "list");
  }, [addresses.length]);

  // Direction the wizard is animating in (+1 forward, -1 back).
  // Framer-motion `custom` value — the Pane variants read it to slide
  // new panes IN from the right (or left when backtracking) and OUT
  // to the opposite side. Old "per-Pane direction prop" approach
  // produced inconsistent transitions; this is the standard pattern.
  const [navDir, setNavDir] = useState<1 | -1>(1);
  const goForward = useCallback((next: View) => {
    setNavDir(1);
    setView(next);
  }, []);
  const goBack = useCallback((next: View) => {
    setNavDir(-1);
    setView(next);
  }, []);

  // Wizard state carried through the multi-step add flow.
  const [searchSeed, setSearchSeed] = useState<PlaceDetails | null>(null);
  const [pickedLine2, setPickedLine2] = useState<string>("");
  const [pickedRecipient, setPickedRecipient] = useState<string>("");
  const [pickedCompany, setPickedCompany] = useState<string>("");
  const [pickedNotes, setPickedNotes] = useState<string | null>(null);
  // Detail-view inspection id — also the target id for in-place
  // field edits (see editingMode below).
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  // editingMode flips the wizard's terminal behaviour: instead of
  // POSTing a brand-new address, the same confirm steps PATCH the
  // single field on the currently-inspected record, then route back
  // to the detail view. Lets users tap any row in DetailView to
  // re-enter the matching wizard step pre-filled with the current
  // value.
  const [editingMode, setEditingMode] = useState(false);

  // PATCH a single (or several) fields on the inspected address,
  // then return to the detail view. Used by every "tap a row to
  // edit" path. Optimistic refresh keeps the visible card fresh.
  const patchField = useCallback(
    async (id: string, partial: Partial<AddressInput>) => {
      setView("saving");
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/profile/addresses?id=${id}`, {
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
        onResult?.({ ok: true, count: addresses.length });
      }
      await refresh();
      setEditingMode(false);
      setSearchSeed(null);
      setPickedLine2("");
      setPickedRecipient("");
      setPickedCompany("");
      setPickedNotes(null);
      setView("detail");
    },
    [refresh, addresses.length, onResult, ctx.baseUrl],
  );

  const advanceToReview = useCallback((details: PlaceDetails) => {
    setSearchSeed(details);
    setView("review");
  }, []);
  const reopenSearch = useCallback(() => {
    setSearchSeed(null);
    setView("search");
  }, []);
  // After review the user clarifies apt/floor (line2) — Google
  // almost never returns it. Skippable; advances to recipient choice.
  const advanceToAptFloor = useCallback(() => {
    setPickedLine2("");
    setView("apt-floor");
  }, []);
  const advanceToRecipientChoice = useCallback(() => {
    setView("recipient-choice");
  }, []);
  const onConfirmAptFloor = useCallback(
    (line2: string | null) => {
      setPickedLine2(line2 ?? "");
      if (editingMode && inspectingId) {
        void patchField(inspectingId, { line2: line2 || null });
        return;
      }
      setView("recipient-choice");
    },
    [editingMode, inspectingId, patchField],
  );

  // Commits the assembled address to the API. Called at the end of
  // the wizard (after the optional delivery-notes step). Uses the
  // accumulated wizard state.
  const commit = useCallback(
    async (notesOverride: string | null = pickedNotes) => {
      if (!searchSeed) return;
      setError(null);
      setView("saving");
      const payload: AddressInput = {
        kind,
        label: "",
        isDefault: false,
        recipientName: pickedRecipient,
        companyName: pickedCompany || null,
        line1: searchSeed.line1,
        line2: pickedLine2.trim() ? pickedLine2.trim() : null,
        city: searchSeed.city,
        regionName: searchSeed.regionName,
        regionCode: searchSeed.regionCode,
        postalCode: searchSeed.postalCode,
        country: searchSeed.country,
        countryName: searchSeed.countryName,
        deliveryNotes: notesOverride?.trim() ? notesOverride.trim() : null,
        timezone: searchSeed.timezone,
        venueName: searchSeed.displayName || null,
        placeId: searchSeed.placeId,
        formattedAddress: searchSeed.formattedAddress,
        latitude: searchSeed.latitude,
        longitude: searchSeed.longitude,
      };
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/profile/addresses`, {
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
        setView("note-choice");
        return;
      }
      // Reset wizard state and refresh.
      setSearchSeed(null);
      setPickedLine2("");
      setPickedRecipient("");
      setPickedCompany("");
      setPickedNotes(null);
      await refresh();
      onResult?.({ ok: true, count: addresses.length + 1 });
    },
    [
      kind,
      refresh,
      searchSeed,
      pickedLine2,
      pickedRecipient,
      pickedCompany,
      pickedNotes,
      addresses.length,
      onResult,
      ctx.baseUrl,
    ],
  );

  // After recipient is captured (any branch) we route to the
  // delivery-notes prompt instead of committing immediately. The
  // user picks Yes (→ note-input) or No (→ commit straight through).
  const askNotes = useCallback(() => {
    setPickedNotes(null);
    setView("note-choice");
  }, []);

  const onPickMe = useCallback(
    (name: string) => {
      setPickedRecipient(name);
      setPickedCompany("");
      askNotes();
    },
    [askNotes],
  );
  const onPickCustom = useCallback(() => {
    setPickedRecipient("");
    setView("recipient-custom");
  }, []);
  const onConfirmCustom = useCallback(
    (name: string) => {
      setPickedRecipient(name);
      if (editingMode && inspectingId) {
        // When editing an existing address from the detail view, we
        // only patch the recipient field. We do NOT touch
        // companyName — clicking "Recipient" means "change the name",
        // not "convert to a personal address".
        void patchField(inspectingId, { recipientName: name });
        return;
      }
      setPickedCompany("");
      askNotes();
    },
    [askNotes, editingMode, inspectingId, patchField],
  );
  const onPickBusiness = useCallback(() => {
    setPickedCompany("");
    setPickedRecipient("");
    setView("recipient-business-name");
  }, []);
  const onConfirmBusinessName = useCallback(
    (company: string) => {
      setPickedCompany(company);
      if (editingMode && inspectingId) {
        // Edit-mode: just patch companyName, keep the rest.
        void patchField(inspectingId, { companyName: company || null });
        return;
      }
      setView("recipient-business-contact");
    },
    [editingMode, inspectingId, patchField],
  );
  const onConfirmBusinessContact = useCallback(
    (contact: string | null) => {
      // If the user provided a contact name, it goes on the
      // recipientName line; the company stays on companyName. If
      // they skipped, recipientName falls back to the company so
      // the invoice / package is still addressable.
      const recipient = (contact ?? "").trim() || pickedCompany;
      setPickedRecipient(recipient);
      askNotes();
    },
    [askNotes, pickedCompany],
  );

  const onNotesYes = useCallback(() => {
    setView("note-input");
  }, []);
  const onNotesNo = useCallback(() => {
    setPickedNotes(null);
    void commit(null);
  }, [commit]);
  const onNotesConfirm = useCallback(
    (notes: string) => {
      setPickedNotes(notes);
      if (editingMode && inspectingId) {
        void patchField(inspectingId, { deliveryNotes: notes.trim() || null });
        return;
      }
      void commit(notes);
    },
    [commit, editingMode, inspectingId, patchField],
  );

  // Delete is a two-step confirmation wizard. The trash icon on a list
  // row opens a dedicated pane (`delete-confirm`) that surfaces the
  // address summary + cross-app impact warning. Confirming moves to
  // a `deleting` pane while the DELETE call is in flight.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const askDelete = useCallback((id: string) => {
    setDeletingId(id);
    setView("delete-confirm");
  }, []);
  const cancelDelete = useCallback(() => {
    setDeletingId(null);
    setView("list");
  }, []);
  const confirmDelete = useCallback(async () => {
    if (!deletingId) return;
    setView("deleting");
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/addresses?id=${deletingId}`, {
      method: "DELETE",
      ...authInit(),
    });
    if (!res.ok) {
      const body = unwrapEnvelope(await res.json().catch(() => ({})));
      const err = (body as { error?: string }).error ?? "delete_failed";
      setError(err);
      onResult?.({ ok: false, error: err });
      setView("delete-confirm");
      return;
    }
    setDeletingId(null);
    await refresh();
    onResult?.({ ok: true, count: Math.max(0, addresses.length - 1) });
  }, [deletingId, refresh, addresses.length, onResult, ctx.baseUrl]);

  const deletingAddress = addresses.find((a) => a.id === deletingId) ?? null;

  // Detail view — click an address row → inspect full info,
  // with Back / Set default / Delete actions + per-field tap-to-edit.
  const openDetail = useCallback((id: string) => {
    setInspectingId(id);
    setView("detail");
  }, []);
  const closeDetail = useCallback(() => {
    setInspectingId(null);
    setEditingMode(false);
    setView("list");
  }, []);
  const inspectingAddress = addresses.find((a) => a.id === inspectingId) ?? null;

  // ─── Tap-to-edit entry points ───────────────────────────────────
  // Each clickable row on the detail view calls one of these. They
  // pre-fill the matching wizard state slot and navigate to the
  // existing step component — same UI as the add flow, just with
  // `editingMode=true` so the confirm PATCHes instead of POSTs.
  const editLine2 = useCallback((current: string | null) => {
    setPickedLine2(current ?? "");
    setEditingMode(true);
    setView("apt-floor");
  }, []);
  const editNotes = useCallback((current: string | null) => {
    setPickedNotes(current);
    setEditingMode(true);
    setView("note-input");
  }, []);
  const editRecipient = useCallback((current: string) => {
    setPickedRecipient(current);
    setEditingMode(true);
    setView("recipient-custom");
  }, []);
  const editCompany = useCallback((current: string) => {
    setPickedCompany(current);
    setEditingMode(true);
    setView("recipient-business-name");
  }, []);
  const cancelEdit = useCallback(() => {
    setEditingMode(false);
    setPickedLine2("");
    setPickedRecipient("");
    setPickedCompany("");
    setPickedNotes(null);
    setView("detail");
  }, []);
  // Default changes affect every app that signs the user into elvix
  // (the address is one record on the elvix profile, shared with all
  // connected apps). Both setting AND removing a default route
  // through a confirmation wizard with the cross-app warning, so
  // there's no silent state change. State for that intent:
  const [defaultIntent, setDefaultIntent] = useState<{
    id: string;
    setting: boolean;
    returnTo: ReturnTo;
  } | null>(null);
  const askDefaultChange = useCallback(
    (id: string, setting: boolean, returnTo: ReturnTo = "list") => {
      setDefaultIntent({ id, setting, returnTo });
      setNavDir(1);
      setView("default-confirm");
    },
    [],
  );
  const cancelDefaultChange = useCallback(() => {
    const back = defaultIntent?.returnTo ?? "list";
    setDefaultIntent(null);
    setNavDir(-1);
    setView(back);
  }, [defaultIntent]);
  const confirmDefaultChange = useCallback(async () => {
    if (!defaultIntent) return;
    const { id, setting, returnTo } = defaultIntent;
    setError(null);
    // Optimistic local flip — the wizard already showed the warning,
    // we don't owe the user a second loading screen.
    setAddresses((prev) =>
      prev.map((a) => {
        if (a.kind !== kind) return a;
        if (setting) return { ...a, isDefault: a.id === id };
        if (a.id === id) return { ...a, isDefault: false };
        return a;
      }),
    );
    setNavDir(-1);
    setView(returnTo);
    setDefaultIntent(null);
    const auth = authInit();
    const res = await fetch(`${ctx.baseUrl}/api/account/profile/addresses?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth.headers },
      credentials: auth.credentials,
      body: JSON.stringify({ isDefault: setting }),
    });
    if (!res.ok) {
      // Revert from server truth on failure.
      await refresh();
    }
  }, [defaultIntent, kind, refresh, ctx.baseUrl]);
  const defaultIntentAddress = addresses.find((a) => a.id === defaultIntent?.id) ?? null;

  const frameStyle: CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    ...(height
      ? { height: `${height}px` }
      : { minHeight: minHeight ?? 360, maxHeight: maxHeight ?? 720 }),
  };

  return (
    <div style={frameStyle} className="mx-auto">
      <ElvixCard className="h-full">
        <div className="relative h-full overflow-hidden">
          <AnimatePresence custom={navDir} initial={false}>
            {loading ? (
              <Pane key="loading" dir={navDir}>
                <div className="grid h-full place-items-center text-fg-3 text-sm">Loading…</div>
              </Pane>
            ) : view === "empty" ? (
              <Pane key="empty" dir={navDir}>
                <EmptyState kind={kind} onAdd={openAdd} />
              </Pane>
            ) : view === "list" ? (
              <Pane key="list" dir={navDir} fadeEdges>
                <ListView
                  kind={kind}
                  addresses={addresses}
                  onOpen={openDetail}
                  onDelete={askDelete}
                  onToggleDefault={(id, current) => askDefaultChange(id, !current, "list")}
                  onAdd={openAdd}
                />
              </Pane>
            ) : view === "search" ? (
              <Pane key="search" dir={navDir}>
                <SearchView kind={kind} onPick={advanceToReview} onBack={closeWizard} />
              </Pane>
            ) : view === "review" ? (
              <Pane key="review" dir={navDir}>
                <ReviewView
                  kind={kind}
                  details={searchSeed}
                  onConfirm={advanceToAptFloor}
                  onChange={reopenSearch}
                />
              </Pane>
            ) : view === "apt-floor" ? (
              <Pane key="apt-floor" dir={navDir}>
                <AptFloorView
                  kind={kind}
                  initial={pickedLine2}
                  onConfirm={onConfirmAptFloor}
                  onBack={editingMode ? cancelEdit : () => setView("review")}
                />
              </Pane>
            ) : view === "recipient-choice" ? (
              <Pane key="recipient-choice" dir={navDir}>
                <RecipientChoiceView
                  kind={kind}
                  userDisplayName={userDisplayName ?? null}
                  onPickMe={onPickMe}
                  onPickCustom={onPickCustom}
                  onPickBusiness={onPickBusiness}
                  onBack={() => setView("apt-floor")}
                  error={error}
                />
              </Pane>
            ) : view === "recipient-custom" ? (
              <Pane key="recipient-custom" dir={navDir}>
                <RecipientCustomView
                  kind={kind}
                  initial={pickedRecipient}
                  onConfirm={onConfirmCustom}
                  onBack={editingMode ? cancelEdit : () => setView("recipient-choice")}
                />
              </Pane>
            ) : view === "recipient-business-name" ? (
              <Pane key="biz-name" dir={navDir}>
                <RecipientBusinessNameView
                  kind={kind}
                  initial={pickedCompany}
                  onConfirm={onConfirmBusinessName}
                  onBack={editingMode ? cancelEdit : () => setView("recipient-choice")}
                />
              </Pane>
            ) : view === "recipient-business-contact" ? (
              <Pane key="biz-contact" dir={navDir}>
                <RecipientBusinessContactView
                  kind={kind}
                  companyName={pickedCompany}
                  onConfirm={onConfirmBusinessContact}
                  onBack={() => setView("recipient-business-name")}
                />
              </Pane>
            ) : view === "note-choice" ? (
              <Pane key="note-choice" dir={navDir}>
                <NoteChoiceView
                  kind={kind}
                  onYes={onNotesYes}
                  onNo={onNotesNo}
                  onBack={() => setView("recipient-choice")}
                  error={error}
                />
              </Pane>
            ) : view === "note-input" ? (
              <Pane key="note-input" dir={navDir}>
                <NoteInputView
                  kind={kind}
                  initial={pickedNotes ?? ""}
                  onConfirm={onNotesConfirm}
                  onBack={editingMode ? cancelEdit : () => setView("note-choice")}
                />
              </Pane>
            ) : view === "saving" ? (
              <Pane key="saving" dir={navDir}>
                <SavingView label="Saving address…" />
              </Pane>
            ) : view === "detail" ? (
              <Pane key="detail" dir={navDir}>
                <DetailView
                  kind={kind}
                  address={inspectingAddress}
                  onBack={closeDetail}
                  onDelete={() => inspectingAddress && askDelete(inspectingAddress.id)}
                  onToggleDefault={() =>
                    inspectingAddress &&
                    askDefaultChange(inspectingAddress.id, !inspectingAddress.isDefault, "detail")
                  }
                  onEditRecipient={() =>
                    inspectingAddress && editRecipient(inspectingAddress.recipientName)
                  }
                  onEditCompany={() =>
                    inspectingAddress && editCompany(inspectingAddress.companyName ?? "")
                  }
                  onEditLine2={() =>
                    inspectingAddress && editLine2(inspectingAddress.line2 ?? null)
                  }
                  onEditNotes={() =>
                    inspectingAddress && editNotes(inspectingAddress.deliveryNotes ?? null)
                  }
                />
              </Pane>
            ) : view === "default-confirm" ? (
              <Pane key="default-confirm" dir={navDir}>
                <DefaultConfirmView
                  kind={kind}
                  address={defaultIntentAddress}
                  setting={defaultIntent?.setting ?? true}
                  error={error}
                  onCancel={cancelDefaultChange}
                  onConfirm={confirmDefaultChange}
                />
              </Pane>
            ) : view === "delete-confirm" ? (
              <Pane key="delete-confirm" dir={navDir}>
                <DeleteConfirmView
                  kind={kind}
                  address={deletingAddress}
                  error={error}
                  onCancel={cancelDelete}
                  onConfirm={confirmDelete}
                />
              </Pane>
            ) : (
              <Pane key="deleting" dir={navDir}>
                <SavingView label="Deleting address…" />
              </Pane>
            )}
          </AnimatePresence>
        </div>
      </ElvixCard>
    </div>
  );
}

// ─── Frame helpers ────────────────────────────────────────────────────

// Cross-fade with a small vertical lift. Direction-agnostic, plays
// the same on forward + back navigation, no per-Pane direction state
// to thread. Matches the Stripe / Linear / Vercel sheet-style
// transition; reads as wizard "step changed", not "panel slid".
const paneVariants = {
  enter: { opacity: 0, y: 6, filter: "blur(4px)" },
  center: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -4, filter: "blur(4px)" },
};

// Mask gradient that fades the top + bottom edges of a scroll
// container so long lists dissolve into the chrome rather than
// ending on a hard edge. Applied to panes where the whole pane is
// scrollable content (List). Panes with their own fixed header /
// footer (Detail, Search, etc.) opt out by passing `fadeEdges={false}`.
const FADE_MASK =
  "linear-gradient(to bottom, transparent 0, rgba(0,0,0,0.4) 12px, black 28px, black calc(100% - 28px), rgba(0,0,0,0.4) calc(100% - 12px), transparent 100%)";

function Pane({
  children,
  // Kept as a prop for API stability across the AnimatePresence
  // children — value is unused now that variants don't read it.
  dir,
  fadeEdges = false,
}: {
  children: React.ReactNode;
  dir: number;
  fadeEdges?: boolean;
}) {
  void dir;
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

// ─── Sub-views ────────────────────────────────────────────────────────

function EmptyState({ kind, onAdd }: { kind: AddressKind; onAdd: () => void }) {
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const noun = kind === "billing" ? "billing" : "shipping";
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
          <div className="text-[15px] font-semibold text-fg-1">Add {noun} address</div>
          <div className="mt-1 text-[12px] text-fg-3">
            We&apos;ll use this for{" "}
            {kind === "billing" ? "invoices and receipts" : "deliveries and pickups"}.
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
  const noun = kind === "billing" ? "billing" : "shipping";
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
        Add another {noun} address
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
                      Default
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
                  <div className="mt-0.5 truncate text-[12.5px] text-fg-2">at {a.companyName}</div>
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
                aria-label={a.isDefault ? "Remove default" : "Set as default"}
                title={a.isDefault ? "Remove default" : "Set as default"}
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
                aria-label="Delete address"
                title="Delete address"
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
        const url = `${ctx.baseUrl}/public/api/maps/autocomplete?q=${encodeURIComponent(q)}&session=${sessionRef.current}`;
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
  }, [query, ctx.baseUrl]);

  const pick = useCallback(
    async (placeId: string) => {
      setPicking(placeId);
      try {
        const url = `${ctx.baseUrl}/public/api/maps/place-details?placeId=${encodeURIComponent(placeId)}&session=${sessionRef.current}`;
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
    [onPick, ctx.baseUrl],
  );

  const noun = kind === "billing" ? "billing" : "shipping";

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div className="ml-auto text-[12px] text-fg-3">New {noun} address</div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
          Start typing your address
        </span>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <ElvixInput
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="221B Baker Street, London…"
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
            Couldn&apos;t search: {err}
          </div>
        )}
        {!err && suggestions.length === 0 && query.trim().length >= 2 && !searching && (
          <div className="rounded-md bg-fg-3/5 px-3 py-2 text-[12.5px] text-fg-3">
            No matches yet. Keep typing.
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
  const [line2, setLine2] = useState(initial);
  const trimmed = line2.trim();
  const valid = trimmed.length <= 180;
  const noun = kind === "billing" ? "billing" : "shipping";

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div className="ml-auto text-[12px] text-fg-3">Apartment · floor · suite</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">
          Apartment, suite, or floor?
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          {kind === "billing"
            ? "Maps rarely captures unit numbers. Adds a second line to the address."
            : "Carriers misroute without unit info. Skip if you don't need it."}
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
          Address line 2 (optional)
        </span>
        <ElvixInput
          type="text"
          value={line2}
          onChange={(e) => setLine2(e.target.value)}
          placeholder="Apt 4B, 3rd floor, Suite 200…"
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
          label="Continue"
          savedLabel="Continue"
          hint="Enter"
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
  const noun = kind === "billing" ? "billing" : "shipping";
  const hasOwnName = Boolean(userDisplayName?.trim());

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div className="ml-auto text-[12px] text-fg-3">Step 2 of 3</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">
          Who is this {noun} address for?
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          {kind === "billing" ? "Name on the invoice." : "Name on the package."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {hasOwnName && (
          <button
            type="button"
            onClick={() => onPickMe(userDisplayName!.trim())}
            className="group flex w-full items-start gap-3 rounded-[12px] border border-fg-3/15 bg-surface px-4 py-3 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:border-[var(--elvix-primary)] hover:bg-[color-mix(in_srgb,var(--elvix-primary)_6%,transparent)] cursor-pointer"
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--elvix-primary)_15%,transparent)] text-[var(--elvix-primary)]">
              <User className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-fg-1">Me</div>
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
            <div className="truncate text-[14px] font-semibold text-fg-1">Someone else</div>
            <div className="truncate text-[12.5px] text-fg-3">
              {kind === "billing" ? "A different name for the invoice" : "Sending to someone else"}
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
            <div className="truncate text-[14px] font-semibold text-fg-1">A business</div>
            <div className="truncate text-[12.5px] text-fg-3">
              {kind === "billing" ? "Invoice the company (B2B)" : "Ship to a company / workplace"}
            </div>
          </div>
          <ChevronRight className="mt-1 size-4 shrink-0 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-[var(--elvix-primary)]" />
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          Couldn&apos;t save: {error}
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
  const [name, setName] = useState(initial);
  const noun = kind === "billing" ? "billing" : "shipping";
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
          Back
        </button>
        <div className="ml-auto text-[12px] text-fg-3">Step 2 of 3</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">
          Who&apos;s the recipient?
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          The name that will appear on the {noun === "billing" ? "invoice" : "package"}.
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">Full name</span>
        <ElvixInput
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
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
          label="Continue"
          savedLabel="Continue"
          hint="Enter"
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
          Back
        </button>
        <div className="ml-auto text-[12px] text-fg-3">Business · step 1 of 2</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">
          What&apos;s the company name?
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          {kind === "billing"
            ? "Appears on the invoice. Required for B2B tax handling later."
            : "Company that receives the package."}
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">Company name</span>
        <ElvixInput
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Edvone"
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
          label="Continue"
          savedLabel="Continue"
          hint="Enter"
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
  const [contact, setContact] = useState("");
  const trimmed = contact.trim();
  const valid = trimmed.length <= 120; // empty is allowed — it's optional
  const noun = kind === "billing" ? "invoice" : "package";

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div className="ml-auto text-[12px] text-fg-3">Business · step 2 of 2</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">
          Anyone in particular at <span className="text-fg-2">{companyName}</span>?
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          Adds an &quot;Attn:&quot; line to the {noun}. Skip to address it to the company.
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
          Contact person (optional)
        </span>
        <ElvixInput
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Jane Doe"
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
          Skip
        </button>
        <div className="ml-auto">
          <ElvixSaveButton
            state="idle"
            disabled={!valid}
            onClick={() => valid && onConfirm(trimmed || null)}
            label="Save"
            savedLabel="Save"
            hint="Enter"
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
  const noun = kind === "billing" ? "billing" : "shipping";
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div className="ml-auto text-[12px] text-fg-3">Last step</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">
          Want to add a delivery note?
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          {kind === "billing"
            ? "Anything the billing team should know. ATTN line, PO number, c/o someone…"
            : "Anything for the delivery person. Buzzer, gate code, leave-at-door…"}
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
            <div className="truncate text-[14px] font-semibold text-fg-1">Yes, add a note</div>
            <div className="truncate text-[12.5px] text-fg-3">Write a short instruction</div>
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
            <div className="truncate text-[14px] font-semibold text-fg-1">No, skip</div>
            <div className="truncate text-[12.5px] text-fg-3">Save the address as-is</div>
          </div>
          <ChevronRight className="mt-1 size-4 shrink-0 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-[var(--elvix-primary)]" />
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          Couldn&apos;t save: {error}
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
  const [notes, setNotes] = useState(initial);
  const trimmed = notes.trim();
  // Optional field — empty saves null (removes the note). Length cap
  // is the only constraint.
  const valid = trimmed.length <= 500;
  const noun = kind === "billing" ? "billing" : "shipping";

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div className="ml-auto text-[12px] text-fg-3">Note · last step</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">What should we say?</h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          {kind === "billing"
            ? "Appears on the invoice / billing record."
            : "Hands off to the delivery carrier."}
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-fg-2">
          {noun === "billing" ? "Billing note" : "Delivery note"}
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          maxLength={500}
          autoFocus
          placeholder={
            noun === "billing"
              ? "Bill to ATTN: Finance, PO #ABC-1234…"
              : "Ring buzzer 3, leave with concierge if not home…"
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
          label="Save"
          savedLabel="Saved"
          hint={null}
          className="!w-auto !px-5"
        />
      </div>
    </div>
  );
}

// ─── Saving pane (commit / delete in flight) ────────────────────────

function SavingView({ label = "Saving address…" }: { label?: string }) {
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
  if (!address) {
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={onBack} className="underline cursor-pointer">
          Back to list
        </button>
      </div>
    );
  }

  const noun = kind === "billing" ? "billing" : "shipping";

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div className="ml-auto text-[12px] text-fg-3">{noun} address</div>
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
                  Default
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
        <DetailSection title="Who">
          <DetailRow label="Recipient" value={address.recipientName} onClick={onEditRecipient} />
          <DetailRow
            label="Company"
            value={address.companyName}
            placeholder="Add a company"
            onClick={onEditCompany}
          />
        </DetailSection>

        {/* Where — Google-sourced; only line2 is directly editable.
            The rest live on the place record and require a re-search.
            Shown as read-only for now. */}
        <DetailSection title="Where">
          <DetailRow label="Street" value={address.line1} />
          <DetailRow
            label="Apt / floor"
            value={address.line2}
            placeholder="Add a unit"
            onClick={onEditLine2}
          />
          <DetailRow label="City" value={address.city} />
          <DetailRow label="Postal code" value={address.postalCode} />
          <DetailRow
            label="Region"
            value={
              address.regionName && address.regionCode
                ? `${address.regionName} (${address.regionCode})`
                : address.regionName || address.regionCode || null
            }
          />
          <DetailRow
            label="Country"
            value={
              address.countryName && address.country
                ? `${address.countryName} (${address.country})`
                : address.countryName || address.country || null
            }
          />
        </DetailSection>

        {/* Extras */}
        <DetailSection title="Notes & meta">
          <DetailRow
            label="Delivery notes"
            value={address.deliveryNotes}
            placeholder="Add a note"
            onClick={onEditNotes}
          />
          <DetailRow label="Timezone" value={address.timezone} />
          <DetailRow label="Venue / building" value={address.venueName} />
        </DetailSection>
      </div>

      <div className="mt-3 flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] text-fg-3 transition hover:bg-red-500/10 hover:text-red-600 cursor-pointer"
        >
          <Trash2 className="size-3.5" />
          Delete
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
            {address.isDefault ? "Remove default" : "Set as default"}
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
  if (!address) {
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={onCancel} className="underline cursor-pointer">
          Nothing to change
        </button>
      </div>
    );
  }

  const noun = kind === "billing" ? "billing" : "shipping";
  const verb = setting ? "Set as default" : "Remove default";
  const title = setting ? "Set this as your default?" : "Remove default from this address?";
  const subtitle = setting
    ? "It'll be the auto-pick at checkout / invoice time."
    : "Nothing will be pre-selected at checkout / invoice time.";

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          Back
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
          Heads up. This affects every app you use with elvix.
        </div>
        <div className="mt-1 text-[12px] leading-snug text-amber-700/85 dark:text-amber-300/85">
          Your default {noun} address is shared across every app you sign in to.{" "}
          {setting
            ? "Switching it here updates the auto-pick everywhere at once."
            : "Removing it means no address is pre-selected anywhere; you'll pick one each time at checkout / invoice."}
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          Couldn&apos;t save: {error}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
        >
          Cancel
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
  if (!address) {
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={onCancel} className="underline cursor-pointer">
          Nothing to delete
        </button>
      </div>
    );
  }

  const noun = kind === "billing" ? "billing" : "shipping";

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg-1 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div className="ml-auto text-[12px] text-fg-3">Delete {noun} address</div>
      </div>

      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-fg-1">Delete this address?</h2>
        <p className="mt-1 text-[12.5px] text-fg-3">This can&apos;t be undone.</p>
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
          Heads up. This affects every app you use with elvix.
        </div>
        <div className="mt-1 text-[12px] leading-snug text-amber-700/85 dark:text-amber-300/85">
          Your {noun} address is stored once on your elvix profile and shared with the apps you sign
          in to. Deleting removes it everywhere. Any checkout, invoice, or shipping flow that
          referenced this address will need a fresh one.
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          Couldn&apos;t delete: {error}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-fg-3/10 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
        >
          Cancel
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-red-600 px-5 text-[14px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_2px_3px_-1px_rgba(0,0,0,0.18),0_0_0_1px_rgba(25,28,33,0.08)] transition hover:bg-red-700 active:scale-[0.985] cursor-pointer"
          >
            <Trash2 className="size-4" />
            Yes, delete
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
  if (!details) {
    // Defensive — should never happen because reaching this view
    // requires a successful pick. If it does, send the user back.
    return (
      <div className="grid h-full place-items-center text-sm text-fg-3">
        <button type="button" onClick={onChange} className="underline cursor-pointer">
          Pick an address first
        </button>
      </div>
    );
  }

  const noun = kind === "billing" ? "billing" : "shipping";
  const region =
    details.regionName && details.regionCode
      ? `${details.regionName} (${details.regionCode})`
      : details.regionName || details.regionCode || null;
  const country =
    details.countryName && details.country
      ? `${details.countryName} (${details.country})`
      : details.countryName || details.country || null;

  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Street", value: details.line1 || null },
    { label: "City", value: details.city || null },
    { label: "Postal code", value: details.postalCode },
    { label: "Region", value: region },
    { label: "Country", value: country },
  ];

  // Required for a usable address record. If Google didn't return
  // street + city + country, the user cannot continue — they have
  // to pick another suggestion or refine their search. Postal +
  // region are optional (many countries don't have one or the other).
  // Gate that mirrors `addressSchema` exactly. Anything failing here
  // would fail server-side validation too — block "Looks right" so
  // the user never hits a "Couldn't save: invalid" two steps later.
  const missing: string[] = [];
  if (!details.line1?.trim()) missing.push("street");
  if (!details.city?.trim()) missing.push("city");
  if (!details.country || !/^[A-Z]{2}$/.test(details.country)) missing.push("country");
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
          Change address
        </button>
        <div className="ml-auto text-[12px] text-fg-3">Review {noun} address</div>
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
            We&apos;re missing the {missing.join(", ")}. Pick a more specific suggestion (with a
            street number) so we can save a deliverable address.
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-fg-3/10 pt-3">
        <button
          type="button"
          onClick={onChange}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-2 transition hover:bg-fg-3/5 hover:text-fg-1 cursor-pointer"
        >
          {canContinue ? "Not right" : "Change address"}
        </button>
        <div className="ml-auto">
          <ElvixSaveButton
            state="idle"
            disabled={!canContinue}
            onClick={onConfirm}
            label="Looks right"
            savedLabel="Looks right"
            hint={null}
            className="!w-auto !px-5"
          />
        </div>
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────

/**
 * Turn the API's error body into a one-line user-visible message.
 * The route returns `{ ok: false, error: "invalid", issues: { fieldErrors: { ... } } }`
 * for zod failures. The flat "invalid" copy was useless — surface
 * the first specific field error instead.
 */
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
    const msg = msgs[0] ?? "invalid";
    return `${firstField}: ${msg}`;
  }
  return b.error ?? "save_failed";
}
