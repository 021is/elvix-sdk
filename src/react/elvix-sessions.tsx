"use client";

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

import { useElvixContext } from "./elvix-provider";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
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
import { useEffect, useState } from "react";

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

export function ElvixSessions({
  appId,
  signInUrl = "/sign-in/account",
  onChanged,
  onResult,
}: {
  /** When set, scopes the list to one customer app. When undefined,
   *  lists `surface="account"` sessions. */
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
  const [items, setItems] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [pane, setPane] = useState<Pane>("list");
  const [direction, setDirection] = useState<1 | -1>(1);
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const [revokingMode, setRevokingMode] = useState<"none" | "others" | "all">("none");
  const [endedCount, setEndedCount] = useState(0);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = appId ? `?appId=${encodeURIComponent(appId)}` : "";
      const res = await fetch(`${ctx.baseUrl}/api/account/sessions${qs}`, { ...authInit() });
      const body = unwrapEnvelope(await res.json());
      if (!res.ok || !body.ok) {
        setError("Couldn't load sessions.");
        return;
      }
      setItems(body.sessions ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [appId]);

  async function revokeOne(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`${ctx.baseUrl}/api/account/sessions/${id}/revoke`, {
        method: "POST",
        ...authInit(),
      });
      if (!res.ok) {
        setError("Couldn't revoke. Try again.");
        onResult?.({
          ok: false,
          error: "revoke_failed",
          message: "Couldn't revoke. Try again.",
        });
        return;
      }
      setItems((prev) => prev.filter((s) => s.id !== id));
      onChanged?.();
      onResult?.({ ok: true, action: ElvixSessionsAction.REVOKE_ONE, ended: 1 });
    } finally {
      setBusyId(null);
    }
  }

  async function massRevoke(mode: Mode) {
    setRevokingMode(mode);
    setError(null);
    try {
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/sessions/revoke-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.headers },
        credentials: auth.credentials,
        // LEGACY: spine-lint-disable-next-line spine/enum-over-string
        body: JSON.stringify({ appId, includeCurrent: mode === "all" }),
      });
      const body = unwrapEnvelope(await res.json()) as { ok?: boolean; ended?: number };
      if (!res.ok || !body.ok) {
        setError("Couldn't sign out. Try again.");
        onResult?.({
          ok: false,
          error: "mass_revoke_failed",
          message: "Couldn't sign out. Try again.",
        });
        return;
      }
      setEndedCount(body.ended ?? 0);
      onChanged?.();
      onResult?.({
        ok: true,
        action:
          mode === "all"
            ? ElvixSessionsAction.SIGN_OUT_ALL
            : ElvixSessionsAction.SIGN_OUT_OTHERS,
        ended: body.ended ?? 0,
      });
      if (mode === "all") {
        // Current session is gone — push to sign-in. `replace` so
        // browser back doesn't return to a now-401 surface.
        window.location.replace(signInUrl);
        return;
      }
      setItems((prev) => prev.filter((s) => s.isCurrent));
      setDirection(1);
      setPane("done");
    } finally {
      setRevokingMode("none");
    }
  }

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
          <motion.div
            key="list"
            custom={direction}
            variants={paneVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={paneTransition}
          >
            <ListPane
              items={items}
              busyId={busyId}
              error={error}
              othersCount={othersCount}
              hasCurrent={hasCurrent}
              onRevokeOne={revokeOne}
              onMassRevoke={() => {
                setDirection(1);
                setPane("confirm");
                setError(null);
              }}
            />
          </motion.div>
        )}

        {pane === "confirm" && (
          <motion.div
            key="confirm"
            custom={direction}
            variants={paneVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={paneTransition}
          >
            <ConfirmPane
              othersCount={othersCount}
              hasCurrent={hasCurrent}
              revokingMode={revokingMode}
              error={error}
              onBack={() => {
                setDirection(-1);
                setPane("list");
                setError(null);
              }}
              onSignOutOthers={() => void massRevoke("others")}
              onSignOutAll={() => void massRevoke("all")}
            />
          </motion.div>
        )}

        {pane === "done" && (
          <motion.div
            key="done"
            custom={direction}
            variants={paneVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={paneTransition}
          >
            <DonePane
              endedCount={endedCount}
              onBack={() => {
                setDirection(-1);
                setPane("list");
                setEndedCount(0);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
  if (items.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-[var(--elvix-primary-12)] bg-canvas dark:bg-[#101013] px-4 py-6 text-center">
        <p className="text-[12.5px] text-fg-3 leading-[1.55]">No live sessions here.</p>
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
                    {s.device.browser} on {s.device.os}
                  </div>
                  {s.isCurrent && (
                    <span
                      className="inline-flex items-center text-[10px] uppercase tracking-[0.08em] font-medium px-1.5 py-0.5 rounded-full"
                      style={{
                        background: "var(--elvix-primary-12)",
                        color: "var(--elvix-primary-strong)",
                      }}
                    >
                      this device
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-fg-3 mt-1 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatRelative(s.createdAt)}
                  </span>
                  {s.ipCountry && (
                    <span className="inline-flex items-center gap-1">
                      <Globe className="size-3" />
                      {s.ipCountry}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <MethodGlyph method={s.method} />
                    {prettyMethod(s.method)}
                  </span>
                </div>
              </div>
              {!s.isCurrent && (
                <button
                  type="button"
                  onClick={() => onRevokeOne(s.id)}
                  disabled={busyId === s.id}
                  title="Revoke this session"
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
          {othersCount === 0 ? "Sign me out of this device" : "Sign out of devices…"}
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
        Back
      </button>

      <div className="flex items-start gap-3">
        <span className="size-10 rounded-full bg-red-500/15 inline-flex items-center justify-center shrink-0">
          <ShieldOff className="size-5 text-red-500" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight text-fg-1 leading-tight">
            Sign out of where?
          </div>
          <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-1">
            Pick which sessions to end. Each one is revoked the moment you tap, and every tab on
            that device is signed out on its next request.
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
              Sign out of the other {othersCount} {othersCount === 1 ? "device" : "devices"}
            </span>
            <span className="text-[11px] opacity-80">Keep this one signed in</span>
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
                ? "Sign me out of this device"
                : "Sign out everywhere, this device too"}
            </span>
            <span className="text-[11px] opacity-90">
              You'll land on the sign-in page right after
            </span>
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
        Already-issued tokens stay rejected. There's no undo, but signing back in on any device just
        works again.
      </p>
    </div>
  );
}

function DonePane({
  endedCount,
  onBack,
}: {
  endedCount: number;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-2">
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.34, ease: [0.22, 0.61, 0.36, 1] }}
        className="size-12 rounded-full inline-flex items-center justify-center"
        style={{ background: "var(--elvix-primary-12)" }}
      >
        <CheckCircle2
          className="size-7"
          strokeWidth={2.2}
          style={{ color: "var(--elvix-primary-strong)" }}
        />
      </motion.span>
      <div className="space-y-1 max-w-[300px]">
        <div className="text-[15px] font-semibold tracking-tight text-fg-1">
          {endedCount === 0
            ? "Already only this one."
            : `Signed out of ${endedCount} ${endedCount === 1 ? "device" : "devices"}.`}
        </div>
        <div className="text-[12.5px] text-fg-3 leading-[1.55]">
          Your current device is still signed in. Those other tabs will be kicked out on their next
          request.
        </div>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="text-[12.5px] font-medium text-fg-2 hover:text-fg-1 underline underline-offset-4 cursor-pointer"
      >
        Back to my sessions
      </button>
    </div>
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

function prettyMethod(method: string | null): string {
  if (!method) return "Sign-in";
  if (method === "otp") return "Email code";
  if (method === "passkey") return "Passkey";
  return method.charAt(0).toUpperCase() + method.slice(1);
}

function formatRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
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
