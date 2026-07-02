"use client";
import { MaybeCard } from "./elvix-card";

/**
 * `<ElvixLeave>` — soft-delete the per-app membership from inside
 * an `<ElvixCard>`. State-aware:
 *
 *   Active                           → Leave wizard (4 panes).
 *   User-initiated soft-delete still
 *   inside the 90-day grace          → Restore wizard (1 pane, benign).
 *   Owner-initiated soft-delete      → Locked pane (owner must
 *                                       reverse from Console).
 *
 * Leave wizard panes (warn1 → warn2 → otp → done):
 *   1. warn1 — what leaving actually does (consequences).
 *   2. warn2 — **About your data on the app**: elvix doesn't store
 *              or delete what the app keeps about you. Surfaces
 *              privacy/ToS links so the user reads them before
 *              hitting the OTP step.
 *   3. otp   — 6-digit code emailed to confirm the action came
 *              from them.
 *   4. done  — success, in-frame.
 *
 * SDK contract: in-frame done by default + optional host
 * `onSuccess`/`onFail` hooks. Never navigates.
 */

import { OtpPane } from "./elvix-deactivate";
import { ElvixSaveButton } from "./elvix-save-button";
import { useElvixApp, useElvixAppContext, useElvixContext } from "./elvix-provider";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { useT } from "../locale/use-t";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Lock, LogOut, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";

const State = {
  LEFT: "left",
  RESTORED: "restored",
} as const;
type State = (typeof State)[keyof typeof State];


const Pane = {
  WARN1: "warn1",
  WARN2: "warn2",
  OTP: "otp",
  DONE: "done",
  RESTORE: "restore",
} as const;
type Pane = (typeof Pane)[keyof typeof Pane];

export type ElvixLeaveResult =
  | { ok: true; state: State }
  | { ok: false; error: string; message?: string };

function ElvixLeaveImpl(props: {
  appId?: string;
  appName?: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  privacyPolicyUrl?: string | null;
  termsOfServiceUrl?: string | null;
  onSuccess?: (state: State) => void;
  onFail?: (error: string) => void;
  onResult?: (result: ElvixLeaveResult) => void;
}) {
  const app = useElvixApp();
  const appCtx = useElvixAppContext();
  const appId = props.appId ?? app?.clientId ?? "preview";
  const appName = props.appName ?? app?.appName ?? "your app";
  const deletedAt =
    props.deletedAt !== undefined ? props.deletedAt : appCtx?.membership?.deletedAt ?? null;
  const deletedBy =
    props.deletedBy !== undefined ? props.deletedBy : appCtx?.membership?.deletedBy ?? null;
  const privacyPolicyUrl =
    props.privacyPolicyUrl !== undefined ? props.privacyPolicyUrl : app?.privacyPolicyUrl ?? null;
  const termsOfServiceUrl =
    props.termsOfServiceUrl !== undefined
      ? props.termsOfServiceUrl
      : app?.termsOfServiceUrl ?? null;
  const { onSuccess, onFail, onResult } = props;
  return (
    <ElvixLeaveInner
      appId={appId}
      appName={appName}
      deletedAt={deletedAt}
      deletedBy={deletedBy}
      privacyPolicyUrl={privacyPolicyUrl}
      termsOfServiceUrl={termsOfServiceUrl}
      onSuccess={onSuccess}
      onFail={onFail}
      onResult={onResult}
    />
  );
}

function ElvixLeaveInner({
  appId,
  appName,
  deletedAt,
  deletedBy,
  privacyPolicyUrl,
  termsOfServiceUrl,
  onSuccess,
  onFail,
  onResult,
}: {
  appId: string;
  appName: string;
  deletedAt: string | null;
  deletedBy: string | null;
  privacyPolicyUrl: string | null;
  termsOfServiceUrl: string | null;
  onSuccess?: (state: State) => void;
  onFail?: (error: string) => void;
  onResult?: (result: ElvixLeaveResult) => void;
}) {
  const ctx = useElvixContext();
  const t = useT();
  const [localDeletedAt, setLocalDeletedAt] = useState<string | null>(deletedAt);
  const [localDeletedBy, setLocalDeletedBy] = useState<string | null>(deletedBy);
  const isDeleted = Boolean(localDeletedAt);
  const isOwnerInitiated = isDeleted && localDeletedBy === "owner";

  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const daysLeft = localDeletedAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(localDeletedAt).getTime() + ninetyDaysMs - Date.now()) / (24 * 60 * 60 * 1000),
        ),
      )
    : 0;

  const [pane, setPane] = useState<Pane>(isDeleted ? "restore" : "warn1");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // OTP state
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [deliveredTo, setDeliveredTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  function go(next: Pane, dir: 1 | -1 = 1) {
    setDirection(dir);
    setPane(next);
    setServerError(null);
  }

  async function requestChallenge() {
    setRequesting(true);
    setServerError(null);
    try {
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/apps/${appId}/membership/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.headers },
        credentials: auth.credentials,
        body: JSON.stringify({ kind: "leave" }),
      });
      const body = unwrapEnvelope(await res.json()) as {
        ok: boolean;
        error?: string;
        challengeId?: string;
        deliveredTo?: string;
        retryAfterSeconds?: number;
      };
      if (!res.ok || !body.ok) {
        // LEGACY: spine-lint-disable-next-line spine/enum-over-string
        if (body.error === "too_recent") setResendIn(body.retryAfterSeconds ?? 30);
        setServerError(
          body.error === "too_many"
            ? t("leave.errorTooManyCodes")
            : body.error === "too_recent"
              ? t("leave.errorTooRecent", { seconds: body.retryAfterSeconds ?? 30 })
              : body.error === "send_failed"
                ? t("leave.errorSendFailed")
                : t("leave.errorRequestFailed"),
        );
        return false;
      }
      setChallengeId(body.challengeId ?? null);
      setDeliveredTo(body.deliveredTo ?? null);
      setCode("");
      setAttemptsLeft(null);
      setResendIn(30);
      return true;
    } catch {
      setServerError(t("common.errorNetwork"));
      return false;
    } finally {
      setRequesting(false);
    }
  }

  async function startOtpFlow() {
    setDirection(1);
    setPane("otp");
    if (!challengeId) await requestChallenge();
  }

  async function verifyAndLeave() {
    if (saving || !challengeId || code.length !== 6) return;
    setSaving(true);
    setServerError(null);
    try {
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/apps/${appId}/membership`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.headers },
        credentials: auth.credentials,
        body: JSON.stringify({ action: "leave", challengeId, code }),
      });
      const body = unwrapEnvelope(await res.json()) as {
        ok: boolean;
        error?: string;
        attemptsLeft?: number;
      };
      if (!res.ok || !body.ok) {
        if (body.error === "wrong_code") {
          setAttemptsLeft(body.attemptsLeft ?? null);
          setCode("");
          setServerError(
            t("leave.errorWrongCode", { count: body.attemptsLeft ?? 0 }),
          );
        } else if (body.error === "challenge_locked") {
          setServerError(t("leave.errorChallengeLocked"));
          setChallengeId(null);
          setCode("");
        } else if (body.error === "challenge_expired") {
          setServerError(t("leave.errorChallengeExpired"));
          setChallengeId(null);
          setCode("");
        } else {
          const msg = t("common.errorSaveFailed");
          setServerError(msg);
          onFail?.(msg);
        }
        onResult?.({
          ok: false,
          error: body.error ?? "save_failed",
          message: serverError ?? t("common.errorSaveFailed"),
        });
        return;
      }
      setLocalDeletedAt(new Date().toISOString());
      setLocalDeletedBy("user");
      onResult?.({ ok: true, state: "left" });
      onSuccess?.("left");
      if (!onSuccess) {
        setDirection(1);
        setPane("done");
      }
    } catch {
      setServerError(t("common.errorNetwork"));
      onResult?.({
        ok: false,
        error: "network_error",
        message: t("common.errorNetwork"),
      });
    } finally {
      setSaving(false);
    }
  }

  async function submitRestore() {
    if (saving) return;
    setSaving(true);
    setServerError(null);
    try {
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/apps/${appId}/membership`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.headers },
        credentials: auth.credentials,
        body: JSON.stringify({ action: "restore" }),
      });
      const body = unwrapEnvelope(await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        const msg =
          body.error === "owner_initiated"
            ? t("leave.errorOwnerInitiated")
            : body.error === "grace_expired"
              ? t("leave.errorGraceExpired")
              : t("leave.errorRestoreFailed");
        setServerError(msg);
        onFail?.(msg);
        onResult?.({ ok: false, error: body.error ?? "restore_failed", message: msg });
        return;
      }
      setLocalDeletedAt(null);
      setLocalDeletedBy(null);
      onResult?.({ ok: true, state: "restored" });
      onSuccess?.("restored");
      if (!onSuccess) {
        setDirection(1);
        setPane("done");
      }
    } catch {
      const msg = t("common.errorNetwork");
      setServerError(msg);
      onFail?.(msg);
      onResult?.({ ok: false, error: "network_error", message: msg });
    } finally {
      setSaving(false);
    }
  }

  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  if (isOwnerInitiated && pane !== "done") {
    return <OwnerLockedPane appName={appName} deletedAt={localDeletedAt!} daysLeft={daysLeft} />;
  }

  return (
    <div className="relative overflow-hidden">
      <AnimatePresence mode="wait" custom={direction}>
        {pane === "warn1" && (
          <motion.div
            key="warn1"
            custom={direction}
            variants={paneVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={paneTransition}
          >
            <LeaveWarn1Pane appName={appName} onContinue={() => go("warn2", 1)} />
          </motion.div>
        )}
        {pane === "warn2" && (
          <motion.div
            key="warn2"
            custom={direction}
            variants={paneVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={paneTransition}
          >
            <LeaveWarn2Pane
              appName={appName}
              privacyPolicyUrl={privacyPolicyUrl}
              termsOfServiceUrl={termsOfServiceUrl}
              requesting={requesting}
              onBack={() => go("warn1", -1)}
              onContinue={() => {
                void startOtpFlow();
              }}
            />
          </motion.div>
        )}
        {pane === "otp" && (
          <motion.div
            key="otp"
            custom={direction}
            variants={paneVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={paneTransition}
          >
            <OtpPane
              appName={appName}
              deliveredTo={deliveredTo}
              code={code}
              setCode={setCode}
              saving={saving}
              requesting={requesting}
              serverError={serverError}
              attemptsLeft={attemptsLeft}
              resendIn={resendIn}
              onBack={() => go("warn2", -1)}
              onConfirm={verifyAndLeave}
              onResend={requestChallenge}
              actionLabel={t("leave.otpActionLabel", { app: appName })}
            />
          </motion.div>
        )}
        {pane === "restore" && (
          <motion.div
            key="restore"
            custom={direction}
            variants={paneVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={paneTransition}
          >
            <RestorePane
              appName={appName}
              daysLeft={daysLeft}
              saving={saving}
              serverError={serverError}
              onConfirm={submitRestore}
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
            <DonePane appName={appName} kind={isDeleted ? "left" : "restored"} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LeaveWarn1Pane({
  appName,
  onContinue,
}: {
  appName: string;
  onContinue: () => void;
}) {
  const t = useT();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onContinue();
      }}
    >
      <div className="flex items-start gap-3">
        <span className="size-10 rounded-full bg-red-500/15 inline-flex items-center justify-center shrink-0">
          <LogOut className="size-5 text-red-500" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight text-fg-1 leading-tight">
            {t("leave.warn1Heading", { app: appName })}
          </div>
          <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-1">
            {t("leave.warn1Body")}
          </p>
          <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-3">{t("leave.understandPrompt")}</p>
        </div>
      </div>
      <ElvixSaveButton state="idle" label={t("leave.iUnderstandCta")} hint={t("common.enterHint")} autoFocus />
    </form>
  );
}

function LeaveWarn2Pane({
  appName,
  privacyPolicyUrl,
  termsOfServiceUrl,
  requesting,
  onBack,
  onContinue,
}: {
  appName: string;
  privacyPolicyUrl: string | null;
  termsOfServiceUrl: string | null;
  requesting: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const t = useT();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onContinue();
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2 hover:text-fg-1 cursor-pointer"
      >
        <ArrowLeft className="size-3.5" />
        {t("common.back")}
      </button>
      <div className="text-[15px] font-semibold tracking-tight text-fg-1 leading-tight">
        {t("leave.dataHeading", { app: appName })}
      </div>
      <div className="rounded-[12px] p-4 bg-amber-500/8 border border-amber-500/30">
        <p className="text-[12.5px] text-fg-2 leading-[1.55]">
          {t("leave.warn2Body", { app: appName })}
        </p>
        {(privacyPolicyUrl || termsOfServiceUrl) && (
          <div className="mt-3 flex items-center gap-3 flex-wrap text-[11.5px]">
            {privacyPolicyUrl ? (
              <a
                href={privacyPolicyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-fg-1 font-semibold underline underline-offset-4 hover:text-amber-700 dark:hover:text-amber-300"
              >
                {t("leave.privacyPolicy")}
                <ArrowUpRight className="size-3" />
              </a>
            ) : null}
            {termsOfServiceUrl ? (
              <a
                href={termsOfServiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-fg-1 font-semibold underline underline-offset-4 hover:text-amber-700 dark:hover:text-amber-300"
              >
                {t("leave.termsOfService")}
                <ArrowUpRight className="size-3" />
              </a>
            ) : null}
          </div>
        )}
      </div>
      <p className="text-[12.5px] text-fg-3 leading-[1.55]">
        {t("leave.warn2EmailPrompt")}
      </p>
      <ElvixSaveButton
        state={requesting ? "saving" : "idle"}
        disabled={requesting}
        label={t("leave.warn2Cta")}
        savedLabel={`${t("common.sendingLabel")}…`}
        hint={null}
        autoFocus
      />
    </form>
  );
}

function RestorePane({
  appName,
  daysLeft,
  saving,
  serverError,
  onConfirm,
}: {
  appName: string;
  daysLeft: number;
  saving: boolean;
  serverError: string | null;
  onConfirm: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span
          className="size-10 rounded-full inline-flex items-center justify-center shrink-0"
          style={{ background: "var(--elvix-primary-12)" }}
        >
          <Undo2
            className="size-5"
            strokeWidth={2.2}
            style={{ color: "var(--elvix-primary-strong)" }}
          />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight text-fg-1 leading-tight">
            {t("leave.restoreHeading", { app: appName })}
          </div>
          <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-1">
            {t("leave.restoreBody", { count: daysLeft })}
          </p>
        </div>
      </div>
      {serverError ? <p className="text-[12px] text-red-500 leading-tight">{serverError}</p> : null}
      <ElvixSaveButton
        state={saving ? "saving" : "idle"}
        disabled={saving}
        label={t("leave.restoreCta")}
        savedLabel={t("common.saved")}
        hint={null}
        onClick={onConfirm}
        autoFocus
      />
    </div>
  );
}

function OwnerLockedPane({
  appName,
  deletedAt,
  daysLeft,
}: {
  appName: string;
  deletedAt: string;
  daysLeft: number;
}) {
  const t = useT();
  const formattedDate = new Date(deletedAt).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="size-10 rounded-full bg-amber-500/15 inline-flex items-center justify-center shrink-0">
          <Lock className="size-5 text-amber-600 dark:text-amber-300" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight text-fg-1 leading-tight">
            {t("leave.ownerLockedHeading", { app: appName })}
          </div>
          <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-1">
            {t("leave.ownerLockedBody", { date: formattedDate, count: daysLeft })}
          </p>
          <p className="text-[11.5px] text-fg-3 leading-[1.55] mt-2">
            {t("leave.ownerLockedReachOut")}
          </p>
        </div>
      </div>
    </div>
  );
}

function DonePane({
  appName,
  kind,
}: {
  appName: string;
  kind: State;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-center text-center gap-4 py-2">
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.34, ease: [0.22, 0.61, 0.36, 1] }}
        className="size-12 rounded-full inline-flex items-center justify-center"
        style={{ background: "var(--elvix-primary-12)" }}
      >
        {/* LEGACY: spine-lint-disable-next-line spine/enum-over-string */}
        {kind === "left" ? (
          <Trash2 className="size-7 text-red-500" strokeWidth={2.2} />
        ) : (
          <CheckCircle2
            className="size-7"
            strokeWidth={2.2}
            style={{ color: "var(--elvix-primary-strong)" }}
          />
        )}
      </motion.span>
      <div className="space-y-1 max-w-[320px]">
        <div className="text-[15px] font-semibold tracking-tight text-fg-1">
          {kind === "left"
            ? t("leave.doneLeftTitle", { app: appName })
            : t("leave.doneRestoredTitle", { app: appName })}
        </div>
        <div className="text-[12.5px] text-fg-3 leading-[1.55]">
          {kind === "left" ? t("leave.doneLeftBody") : t("leave.doneRestoredBody")}
        </div>
      </div>
    </div>
  );
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
export function ElvixLeave(props: Parameters<typeof ElvixLeaveImpl>[0] & { card?: boolean }) {
  const { card, ...rest } = props;
  return (
    <MaybeCard card={card} className="h-full">
      <ElvixLeaveImpl {...(rest as Parameters<typeof ElvixLeaveImpl>[0])} />
    </MaybeCard>
  );
}
