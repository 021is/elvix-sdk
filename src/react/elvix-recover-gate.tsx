"use client";

/**
 * `<ElvixRecoverGate>` — moved VERBATIM (markup + Tailwind classes, incl.
 * the framer-motion `AnimatePresence` / `motion.*` enter/exit fades) from
 * the elvix monorepo (`components/sdk/elvix-recover-gate.tsx`).
 *
 * Only one host-coupling was swapped for the SDK:
 *   - same-origin `fetch("/api/auth/recover-membership")` +
 *     `@/lib/spine-fetch`'s `unwrapEnvelope` → the SDK cross-origin
 *     pattern: `${baseUrl}/api/...` with `authInit()` (bearer token
 *     cross-origin, cookie same-origin) reading the Spine envelope
 *     (`success`/`data`).
 *
 * Recovery gateway for a user whose membership on an app is currently in
 * a reversible off-state (deactivated, or soft-deleted by them inside the
 * 90-day grace). Rendered inside `<ElvixSignInForm>` as the `recover`
 * landing step: the user just signed back in; sign-in won't complete
 * until they pick Restore or Cancel.
 */

import { useT } from "../locale/use-t";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, EyeOff, LogOut, Undo2, X } from "lucide-react";
import { useState } from "react";
import { authInit } from "./session";

type TFn = ReturnType<typeof useT>;

const Decision = {
  RESTORE: "restore",
  CANCEL: "cancel",
} as const;
type Decision = (typeof Decision)[keyof typeof Decision];

const Busy = {
  NONE: "none",
  RESTORE: "restore",
  CANCEL: "cancel",
} as const;
type Busy = (typeof Busy)[keyof typeof Busy];

const Icon = {
  CHECK: "check",
  LOGOUT: "logout",
} as const;
type Icon = (typeof Icon)[keyof typeof Icon];

const GateState = {
  INACTIVE: "inactive",
  SOFT_DELETED_BY_USER: "soft_deleted_by_user",
} as const;
type GateState = (typeof GateState)[keyof typeof GateState];
const Pane = {
  DECIDE: "decide",
  DONE_RESTORED: "done_restored",
  DONE_CANCELLED: "done_cancelled",
} as const;
type Pane = (typeof Pane)[keyof typeof Pane];

export function ElvixRecoverGate({
  baseUrl,
  appName,
  state,
  sinceAt,
  onRestore,
  onCancel,
  onFail,
}: {
  /** elvix origin the SDK talks to (cross-origin aware). */
  baseUrl: string;
  appName: string;
  state: GateState;
  /** ISO timestamp of when the off-state started. Used to render
   *  the grace countdown for soft-deleted memberships. */
  sinceAt: string;
  /**
   * Fires after a successful restore. The payload's `redirect` is
   * the app's canonical post-sign-in destination. Host can navigate,
   * call its own router, or skip and let the SDK's done pane render.
   */
  onRestore?: (result: { redirect: string }) => void;
  /**
   * Fires after a successful cancel (session destroyed server-side).
   * `redirect` points back to the sign-in URL. Host can navigate, or
   * skip and let the SDK's done pane render.
   */
  onCancel?: (result: { redirect: string }) => void;
  /** Fires on any server / network failure. SDK still shows the
   *  error inline. */
  onFail?: (error: string) => void;
}) {
  const t = useT();
  const [pane, setPane] = useState<Pane>("decide");
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const [busy, setBusy] = useState<"none" | "restore" | "cancel">("none");
  const [error, setError] = useState<string | null>(null);

  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const daysLeft =
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    state === "soft_deleted_by_user"
      ? Math.max(
          0,
          Math.ceil(
            (new Date(sinceAt).getTime() + ninetyDaysMs - Date.now()) / (24 * 60 * 60 * 1000),
          ),
        )
      : null;

  async function decide(decision: Decision) {
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    if (busy !== "none") return;
    setBusy(decision);
    setError(null);
    try {
      const init = authInit();
      const res = await fetch(`${baseUrl}/api/auth/recover-membership`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...init.headers },
        credentials: init.credentials,
        body: JSON.stringify({ decision }),
      });
      const raw = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { redirect?: string };
        errorKey?: string;
        errorMessage?: string;
      };
      const errorKey = raw.errorKey ?? raw.errorMessage;
      if (!res.ok || !raw.success) {
        const msg =
          errorKey === "grace_expired"
            ? t("signin.errorGraceExpired")
            : errorKey === "unauthenticated"
              ? t("signin.errorSessionEnded")
              : t("common.somethingWentWrong");
        setError(msg);
        onFail?.(msg);
        return;
      }
      const redirect = raw.data?.redirect ?? "/";
      // LEGACY: spine-lint-disable-next-line spine/enum-over-string
      if (decision === "restore") {
        onRestore?.({ redirect });
        if (!onRestore) setPane("done_restored");
      } else {
        onCancel?.({ redirect });
        if (!onCancel) setPane("done_cancelled");
      }
    } catch {
      const msg = t("common.errorNetwork");
      setError(msg);
      onFail?.(msg);
    } finally {
      setBusy("none");
    }
  }

  return (
    <div className="relative overflow-hidden">
      <AnimatePresence mode="wait">
        {pane === "decide" && (
          <motion.div
            key="decide"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <DecidePane
              t={t}
              appName={appName}
              state={state}
              daysLeft={daysLeft}
              busy={busy}
              error={error}
              onRestore={() => void decide("restore")}
              onCancel={() => void decide("cancel")}
            />
          </motion.div>
        )}
        {pane === "done_restored" && (
          <motion.div
            key="done_restored"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <DonePane
              icon="check"
              title={t("lifecycle.recoverRestoredTitle", { app: appName })}
              body={t("lifecycle.recoverRestoredBody")}
            />
          </motion.div>
        )}
        {pane === "done_cancelled" && (
          <motion.div
            key="done_cancelled"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <DonePane
              icon="logout"
              title={t("lifecycle.recoverSignedOutTitle")}
              body={t("lifecycle.recoverSignedOutBody", { app: appName })}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DecidePane({
  t,
  appName,
  state,
  daysLeft,
  busy,
  error,
  onRestore,
  onCancel,
}: {
  t: TFn;
  appName: string;
  state: GateState;
  daysLeft: number | null;
  busy: Busy;
  error: string | null;
  onRestore: () => void;
  onCancel: () => void;
}) {
  const isDeleted = state === "soft_deleted_by_user";
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span
          className={
            "size-10 rounded-full inline-flex items-center justify-center shrink-0 " +
            (isDeleted ? "bg-red-500/15" : "")
          }
          style={isDeleted ? undefined : { background: "var(--elvix-primary-12)" }}
        >
          {isDeleted ? (
            <Undo2 className="size-5 text-red-500" strokeWidth={2.2} />
          ) : (
            <EyeOff
              className="size-5"
              strokeWidth={2.2}
              style={{ color: "var(--elvix-primary-strong)" }}
            />
          )}
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight text-fg-1 leading-tight">
            {t("lifecycle.recoverWelcomeBack", { app: appName })}
          </div>
          <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-1">
            {isDeleted
              ? `${t("lifecycle.recoverDeletedIntro", { app: appName })} ${
                  daysLeft != null
                    ? t("lifecycle.recoverDeletedDaysLeft", { count: daysLeft })
                    : t("lifecycle.recoverDeletedNoCountdown")
                } ${t("lifecycle.recoverDeletedOutro")}`
              : t("lifecycle.recoverPausedBody", { app: appName })}
          </p>
        </div>
      </div>

      {error ? <p className="text-[12px] text-red-500 leading-tight">{error}</p> : null}

      <button
        type="button"
        onClick={onRestore}
        disabled={busy !== "none"}
        autoFocus
        className="w-full h-10 rounded-[10px] text-[14px] font-semibold tracking-tight cursor-pointer transition ring-1 ring-black/10 inline-flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: "var(--elvix-primary-strong)",
          color: "var(--elvix-on-primary)",
          backgroundImage:
            "linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0) 40%)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.06) inset, 0 2px 3px -1px rgba(0,0,0,0.18), 0 0 0 1px rgba(25,28,33,0.08)",
        }}
      >
        {busy === "restore" ? (
          `${t("lifecycle.recoverRestoringLabel")}…`
        ) : (
          <>
            <Undo2 className="size-3.5" />
            {isDeleted
              ? t("lifecycle.recoverRestoreDeletedCta", { app: appName })
              : t("lifecycle.recoverRestorePausedCta", { app: appName })}
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onCancel}
        disabled={busy !== "none"}
        className="w-full h-10 rounded-[10px] text-[13px] font-medium text-fg-2 hover:text-fg-1 hover:bg-surface-hover cursor-pointer transition inline-flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy === "cancel" ? (
          `${t("lifecycle.recoverSigningOutLabel")}…`
        ) : (
          <>
            <X className="size-3.5" />
            {t("lifecycle.recoverDeclineCta")}
          </>
        )}
      </button>
    </div>
  );
}

function DonePane({
  icon,
  title,
  body,
}: {
  icon: Icon;
  title: string;
  body: string;
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
        {icon === "check" ? (
          <CheckCircle2
            className="size-7"
            strokeWidth={2.2}
            style={{ color: "var(--elvix-primary-strong)" }}
          />
        ) : (
          <LogOut className="size-7 text-fg-2" strokeWidth={2.2} />
        )}
      </motion.span>
      <div className="space-y-1 max-w-[320px]">
        <div className="text-[15px] font-semibold tracking-tight text-fg-1">{title}</div>
        <div className="text-[12.5px] text-fg-3 leading-[1.55]">{body}</div>
      </div>
    </div>
  );
}
