"use client";
import { MaybeCard } from "./elvix-card";

/**
 * `<ElvixSessions>` — live session list for the current user, scoped
 * to one app (when `appId` is set) or to the account surface itself
 * (when omitted). Lives inside an `<ElvixCard>`.
 *
 * Three panes (in-frame wizard, slide transitions):
 *
 *   "list"    — every active session as a device row. Per-row
 *               Revoke for individual non-current sessions. Footer
 *               CTA opens the mass-revoke confirm pane.
 *   "confirm" — two distinct CTAs:
 *                 1) Sign out of the other devices, stay here.
 *                 2) Sign out of *everything*, including this
 *                    device. Path (2) navigates to /sign-in
 *                    afterwards because the current session is gone.
 *   "done"    — in-frame success after path (1). Lists how many
 *               devices were signed out.
 *
 * Customer apps embed by passing their `applicationId`. Same SDK
 * contract: in-frame done by default + optional `onChanged` host
 * hook for refetch.
 */

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  Fingerprint,
  Globe,
  Loader2,
  LogOut,
  Mail,
  Monitor,
  ShieldOff,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useT } from "../locale/use-t";
import { DonePane } from "./done-pane";
import { useElvixContext } from "./elvix-provider";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";

type TFunction = (key: string, params?: Record<string, string | number>) => string;

const Mode = {
  OTHERS: "others",
  ALL: "all",
} as const;
type Mode = (typeof Mode)[keyof typeof Mode];

const RevokingMode = {
  NONE: "none",
  OTHERS: "others",
  ALL: "all",
} as const;
type RevokingMode = (typeof RevokingMode)[keyof typeof RevokingMode];

const DeviceKind = {
  DESKTOP: "desktop",
  MOBILE: "mobile",
  TABLET: "tablet",
  BOT: "bot",
  UNKNOWN: "unknown",
} as const;
type DeviceKind = (typeof DeviceKind)[keyof typeof DeviceKind];

type SessionRow = {
  id: string;
  isCurrent: boolean;
  method: string | null;
  ipCountry: string | null;
  userAgent: string | null;
  device: { browser: string; os: string; kind: DeviceKind };
  createdAt: string;
  expiresAt: string;
};

const Pane = {
  LIST: "list",
  CONFIRM: "confirm",
  DONE: "done",
} as const;
type Pane = (typeof Pane)[keyof typeof Pane];

export const ElvixSessionsAction = {
  REVOKE_ONE: "revoke_one",
  SIGN_OUT_OTHERS: "sign_out_others",
  SIGN_OUT_ALL: "sign_out_all",
} as const;
export type ElvixSessionsAction = (typeof ElvixSessionsAction)[keyof typeof ElvixSessionsAction];

export type ElvixSessionsResult =
  | { ok: true; action: ElvixSessionsAction; ended?: number }
  | { ok: false; error: string; message?: string };

/**
 * Which app's sessions to show: the explicit prop, else the app the provider
 * is configured for.
 *
 * ⚠ The fallback is the whole point. Omitting `appId` on a customer app used to
 * select the ACCOUNT surface, which a cross-origin app bearer cannot read — so
 * the list came back empty with no error and the host saw a component that
 * rendered fine and showed nothing. A customer app always wants its own
 * sessions; deriving that from the provider makes the wrong thing unreachable
 * instead of merely documented.
 *
 * elvix's own account pages mount `<ElvixProvider>` with no clientId, so this
 * returns undefined there and the global account list is still selected.
 *
 * Exported for the test that pins exactly that pair of behaviours.
 */
export function resolveSessionsAppId(
  explicit: string | undefined,
  providerClientId: string | undefined,
): string | undefined {
  return explicit ?? providerClientId ?? undefined;
}

/** Endpoint for a scope: one app, or the user's global elvix account. */
export function sessionsBasePath(appId: string | undefined): string {
  return appId
    ? `/api/account/apps/${encodeURIComponent(appId)}/sessions`
    : "/api/account/sessions";
}

function ElvixSessionsImpl({
  appId: appIdProp,
  signInUrl = "/sign-in/account",
  onChanged,
  onResult,
}: {
  /** Scopes the list to one app. **Defaults to the `clientId` on
   *  `<ElvixProvider>`**, so a customer app gets ITS OWN sessions without
   *  passing anything. Only elvix's own first-party account surface — which
   *  mounts the provider with no clientId — falls through to the global
   *  `surface="account"` list. */
  appId?: string;
  /** Where to send the user after a "sign out everywhere too"
   *  action. Defaults to elvix's account sign-in. */
  signInUrl?: string;
  onChanged?: () => void;
  /** Fires on every terminal revoke outcome. Safe payload: action
   *  kind + count of ended sessions. No session IDs leak to the host. */
  onResult?: (result: ElvixSessionsResult) => void;
}) {
  const ctx = useElvixContext();
  // ⚠ The default is the whole point. Omitting `appId` on a customer app used
  // to fall through to the ACCOUNT surface — a cross-origin app bearer cannot
  // read that, so the list came back empty with no error, and the host saw a
  // working component that showed nothing. A customer app always wants its own
  // sessions; deriving that from the provider makes the wrong thing unreachable
  // rather than merely documented. Matches how `<ElvixLeave>` already resolves.
  //
  // elvix's own account pages mount `<ElvixProvider>` WITHOUT a clientId, so
  // `app` is null there and the account surface is still selected — the
  // first-party behaviour is unchanged.
  const appId = resolveSessionsAppId(appIdProp, ctx.app?.clientId);
  const list = useSessionsList({ baseUrl: ctx.baseUrl, appId, signInUrl, onChanged, onResult });
  const { items, loading, error, setError, busyId, revokingMode, endedCount } = list;

  const [pane, setPane] = useState<Pane>("list");
  const [direction, setDirection] = useState<1 | -1>(1);
  const go = (next: Pane, dir: 1 | -1) => {
    setDirection(dir);
    setPane(next);
  };
  const massRevoke = async (mode: Mode) => {
    if (await list.massRevoke(mode)) go("done", 1);
  };

  if (loading) {
    return (
      <div className="py-10 text-center">
        <Loader2 className="size-5 text-fg-3 animate-spin mx-auto" />
      </div>
    );
  }

  const othersCount = items.filter((s) => !s.isCurrent).length;
  const hasCurrent = items.some((s) => s.isCurrent);

  return (
    <div className="relative overflow-hidden">
      <AnimatePresence mode="wait" custom={direction}>
        {pane === "list" && (
          <Slide key="list" direction={direction}>
            <ListPane
              items={items}
              busyId={busyId}
              error={error}
              othersCount={othersCount}
              hasCurrent={hasCurrent}
              onRevokeOne={list.revokeOne}
              onMassRevoke={() => {
                go("confirm", 1);
                setError(null);
              }}
            />
          </Slide>
        )}

        {pane === "confirm" && (
          <Slide key="confirm" direction={direction}>
            <ConfirmPane
              othersCount={othersCount}
              hasCurrent={hasCurrent}
              revokingMode={revokingMode}
              error={error}
              onBack={() => {
                go("list", -1);
                setError(null);
              }}
              onSignOutOthers={() => void massRevoke("others")}
              onSignOutAll={() => void massRevoke("all")}
            />
          </Slide>
        )}

        {pane === "done" && (
          <Slide key="done" direction={direction}>
            <SessionsDonePane endedCount={endedCount} onBack={() => go("list", -1)} />
          </Slide>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One pane of the sliding wizard. */
function Slide({ direction, children }: { direction: 1 | -1; children: ReactNode }) {
  return (
    <motion.div
      custom={direction}
      variants={paneVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={paneTransition}
    >
      {children}
    </motion.div>
  );
}

/**
 * The session list and its two actions. The list loads when its identity
 * (origin + app) changes, aborted on change or unmount so a late response
 * can't overwrite a newer list; a network failure shows the load error
 * instead of rejecting unhandled.
 */
function useSessionsList(args: {
  baseUrl: string;
  appId: string | undefined;
  signInUrl: string;
  onChanged?: () => void;
  onResult?: (result: ElvixSessionsResult) => void;
}) {
  const { baseUrl, appId, signInUrl, onChanged, onResult } = args;
  const t = useT();
  const base = sessionsBasePath(appId);
  const [items, setItems] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const [revokingMode, setRevokingMode] = useState<"none" | "others" | "all">("none");
  const [endedCount, setEndedCount] = useState(0);

  const loadError = t("sessions.errorLoad");
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${baseUrl}${base}`, { ...authInit(), signal: ctrl.signal })
      .then(async (res) => {
        const body = unwrapEnvelope(await res.json());
        if (!res.ok || !body.ok) setError(loadError);
        else setItems(body.sessions ?? []);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") setError(loadError);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [baseUrl, base, loadError]);

  const fail = (error: string, message: string) => {
    setError(message);
    onResult?.({ ok: false, error, message });
  };

  async function revokeOne(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}${base}/${id}/revoke`, { method: "POST", ...authInit() });
      if (!res.ok) return fail("revoke_failed", t("sessions.errorRevoke"));
      setItems((prev) => prev.filter((s) => s.id !== id));
      onChanged?.();
      onResult?.({ ok: true, action: ElvixSessionsAction.REVOKE_ONE, ended: 1 });
    } finally {
      setBusyId(null);
    }
  }

  /** Ends other sessions (or all, then leaves for sign-in). Resolves true when
   *  the others were ended and the done pane should show. */
  async function massRevoke(mode: Mode): Promise<boolean> {
    setRevokingMode(mode);
    setError(null);
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    const all = mode === "all";
    try {
      const auth = authInit();
      const res = await fetch(`${baseUrl}${base}/revoke-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.headers },
        credentials: auth.credentials,
        body: JSON.stringify({ appId, includeCurrent: all }),
      });
      const body = unwrapEnvelope(await res.json()) as { ok?: boolean; ended?: number };
      if (!res.ok || !body.ok) {
        fail("mass_revoke_failed", t("sessions.errorMassRevoke"));
        return false;
      }
      const ended = body.ended ?? 0;
      setEndedCount(ended);
      onChanged?.();
      onResult?.({
        ok: true,
        action: all ? ElvixSessionsAction.SIGN_OUT_ALL : ElvixSessionsAction.SIGN_OUT_OTHERS,
        ended,
      });
      if (all) {
        // The current session is gone too: go to sign-in. `replace` so the
        // back button doesn't return to a now-401 surface.
        window.location.replace(signInUrl);
        return false;
      }
      setItems((prev) => prev.filter((s) => s.isCurrent));
      return true;
    } finally {
      setRevokingMode("none");
    }
  }

  return {
    items,
    loading,
    error,
    setError,
    busyId,
    revokingMode,
    endedCount,
    revokeOne,
    massRevoke,
  };
}

function ListPane({
  items,
  busyId,
  error,
  othersCount,
  hasCurrent,
  onRevokeOne,
  onMassRevoke,
}: {
  items: SessionRow[];
  busyId: string | null;
  error: string | null;
  othersCount: number;
  hasCurrent: boolean;
  onRevokeOne: (id: string) => void;
  onMassRevoke: () => void;
}) {
  const t = useT();
  if (items.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-[var(--elvix-primary-12)] bg-canvas dark:bg-[#101013] px-4 py-6 text-center">
        <p className="text-[12.5px] text-fg-3 leading-[1.55]">{t("sessions.empty")}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {items.map((s) => (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-3 rounded-[10px] bg-white dark:bg-[#101013] border border-[var(--elvix-primary-12)] px-3 py-2.5"
            >
              <DeviceIcon kind={s.device.kind} current={s.isCurrent} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-[13px] font-medium text-fg-1 truncate">
                    {t("sessions.deviceLine", { browser: s.device.browser, os: s.device.os })}
                  </div>
                  {s.isCurrent && (
                    <span
                      className="inline-flex items-center text-[10px] uppercase tracking-[0.08em] font-medium px-1.5 py-0.5 rounded-full"
                      style={{
                        background: "var(--elvix-primary-12)",
                        color: "var(--elvix-primary-strong)",
                      }}
                    >
                      {t("sessions.thisDeviceBadge")}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-fg-3 mt-1 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatRelative(s.createdAt, t)}
                  </span>
                  {s.ipCountry && (
                    <span className="inline-flex items-center gap-1">
                      <Globe className="size-3" />
                      {s.ipCountry}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <MethodGlyph method={s.method} />
                    {prettyMethod(s.method, t)}
                  </span>
                </div>
              </div>
              {!s.isCurrent && (
                <button
                  type="button"
                  onClick={() => onRevokeOne(s.id)}
                  disabled={busyId === s.id}
                  title={t("sessions.revokeOne")}
                  className="cursor-pointer size-8 grid place-items-center rounded-md text-fg-3 hover:text-red-500 hover:bg-red-500/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busyId === s.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </button>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {error && <p className="text-[12px] text-red-500 leading-tight">{error}</p>}

      {(othersCount > 0 || hasCurrent) && (
        <button
          type="button"
          onClick={onMassRevoke}
          className="w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-[10px] text-[12.5px] font-medium text-fg-2 hover:text-fg-1 bg-surface-hover border border-border-base transition cursor-pointer"
        >
          <LogOut className="size-3.5" />
          {othersCount === 0 ? t("sessions.massRevokeCtaSelf") : t("sessions.massRevokeCtaOpen")}
        </button>
      )}
    </div>
  );
}

function ConfirmPane({
  othersCount,
  hasCurrent,
  revokingMode,
  error,
  onBack,
  onSignOutOthers,
  onSignOutAll,
}: {
  othersCount: number;
  hasCurrent: boolean;
  revokingMode: RevokingMode;
  error: string | null;
  onBack: () => void;
  onSignOutOthers: () => void;
  onSignOutAll: () => void;
}) {
  const t = useT();
  const busy = revokingMode !== "none";
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2 hover:text-fg-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ArrowLeft className="size-3.5" />
        {t("common.back")}
      </button>

      <div className="flex items-start gap-3">
        <span className="size-10 rounded-full bg-red-500/15 inline-flex items-center justify-center shrink-0">
          <ShieldOff className="size-5 text-red-500" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight text-fg-1 leading-tight">
            {t("sessions.confirmChooserTitle")}
          </div>
          <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-1">
            {t("sessions.confirmChooserBody")}
          </p>
        </div>
      </div>

      {othersCount > 0 && (
        <button
          type="button"
          onClick={onSignOutOthers}
          disabled={busy}
          className="w-full inline-flex items-center justify-between gap-3 h-12 px-4 rounded-[10px] cursor-pointer transition ring-1 ring-black/10 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: "var(--elvix-primary-strong)",
            color: "var(--elvix-on-primary)",
            backgroundImage:
              "linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0) 40%)",
          }}
        >
          <div className="flex flex-col items-start text-left">
            <span className="text-[13px] font-semibold tracking-tight">
              {t("sessions.signOutOtherDevicesCount", { count: othersCount })}
            </span>
            <span className="text-[11px] opacity-80">{t("sessions.currentBadge")}</span>
          </div>
          {revokingMode === "others" ? (
            <Loader2 className="size-4 animate-spin shrink-0" />
          ) : (
            <LogOut className="size-4 shrink-0" />
          )}
        </button>
      )}

      {hasCurrent && (
        <button
          type="button"
          onClick={onSignOutAll}
          disabled={busy}
          className="w-full inline-flex items-center justify-between gap-3 h-12 px-4 rounded-[10px] cursor-pointer transition ring-1 ring-red-500/20 text-white bg-red-600 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0) 40%)",
          }}
        >
          <div className="flex flex-col items-start text-left">
            <span className="text-[13px] font-semibold tracking-tight">
              {othersCount === 0
                ? t("sessions.signOutAllCtaSelf")
                : t("sessions.signOutAllCtaIncludingThis")}
            </span>
            <span className="text-[11px] opacity-90">{t("sessions.signOutAllRedirectHint")}</span>
          </div>
          {revokingMode === "all" ? (
            <Loader2 className="size-4 animate-spin shrink-0" />
          ) : (
            <ShieldOff className="size-4 shrink-0" />
          )}
        </button>
      )}

      {error && <p className="text-[12px] text-red-500 leading-tight">{error}</p>}

      <p className="text-[11.5px] text-fg-3 leading-[1.55]">
        {t("sessions.confirmTokensFootnote")}
      </p>
    </div>
  );
}

function SessionsDonePane({ endedCount, onBack }: { endedCount: number; onBack: () => void }) {
  const t = useT();
  return (
    <DonePane
      title={
        endedCount === 0
          ? t("sessions.doneAlreadyAlone")
          : t("sessions.doneCount", { count: endedCount })
      }
      body={t("sessions.doneFootnote")}
      action={{ label: t("sessions.backToList"), onClick: onBack }}
    />
  );
}

function DeviceIcon({ kind, current }: { kind: DeviceKind; current: boolean }) {
  const Icon =
    kind === "mobile"
      ? Smartphone
      : kind === "tablet"
        ? Tablet
        : kind === "desktop"
          ? Monitor
          : Monitor;
  return (
    <span
      aria-hidden
      className="shrink-0 size-9 rounded-[8px] inline-flex items-center justify-center"
      style={
        current
          ? {
              background: "var(--elvix-primary-12)",
              color: "var(--elvix-primary-strong)",
            }
          : {
              background: "color-mix(in srgb, currentColor 5%, transparent)",
              color: "var(--elvix-fg-2, #555)",
            }
      }
    >
      <Icon className="size-4" strokeWidth={2} />
    </span>
  );
}

function MethodGlyph({ method }: { method: string | null }) {
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  if (method === "passkey") return <Fingerprint className="size-3" />;
  if (method === "google" || method === "apple" || method === "facebook")
    return <Globe className="size-3" />;
  return <Mail className="size-3" />;
}

function prettyMethod(method: string | null, t: TFunction): string {
  if (!method) return t("sessions.methodSignIn");
  if (method === "otp") return t("sessions.methodEmailCode");
  if (method === "passkey") return t("sessions.methodPasskey");
  return method.charAt(0).toUpperCase() + method.slice(1);
}

function formatRelative(iso: string, t: TFunction): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t("sessions.relativeJustNow");
  if (diff < 3600) return t("sessions.relativeMinutesAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("sessions.relativeHoursAgo", { count: Math.floor(diff / 3600) });
  if (diff < 7 * 86400) return t("sessions.relativeDaysAgo", { count: Math.floor(diff / 86400) });
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

const paneVariants = {
  enter: (dir: 1 | -1) => ({ x: dir * 24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: 1 | -1) => ({ x: dir * -24, opacity: 0 }),
};
const paneTransition = { duration: 0.24, ease: [0.22, 0.61, 0.36, 1] as const };

/**
 * Public export. Wraps the implementation in <ElvixCard> by default;
 * pass `card={false}` to render bare (compose in your own surface).
 */
export function ElvixSessions(props: Parameters<typeof ElvixSessionsImpl>[0] & { card?: boolean }) {
  const { card, ...rest } = props;
  return (
    <MaybeCard card={card} className="h-full">
      <ElvixSessionsImpl {...(rest as Parameters<typeof ElvixSessionsImpl>[0])} />
    </MaybeCard>
  );
}
