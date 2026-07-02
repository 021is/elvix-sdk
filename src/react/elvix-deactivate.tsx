"use client";
import { MaybeCard } from "./elvix-card";

/**
 * `<ElvixDeactivate>` — Instagram-style temporary deactivation as an
 * SDK component. Lives inside an `<ElvixCard>`. State-aware: renders
 * the deactivate or reactivate flow depending on the current value
 * of `inactive`.
 *
 * Deactivate flow — 4 panes (warn1 → warn2 → otp → done):
 *   1. warn1   — what deactivation actually does.
 *   2. warn2   — caveats, sessions revoked, reversibility.
 *   3. otp     — 6-digit code emailed to the user; verify before
 *                executing. Each pane has a clear Back so the user
 *                can re-read the warnings.
 *   4. done    — success, in-frame.
 *
 * Reactivate flow — single confirm pane (benign action, no OTP).
 *
 * SDK contract: in-frame done by default + optional host
 * `onSuccess`/`onFail` hooks. Never navigates.
 */

import { OtpInput } from "./otp-input";
import { ElvixSaveButton } from "./elvix-save-button";
import { useElvixApp, useElvixAppContext, useElvixContext } from "./elvix-provider";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../locale/use-t";

const State = {
  INACTIVE: "inactive",
  ACTIVE: "active",
} as const;
type State = (typeof State)[keyof typeof State];

const Kind = {
  DEACTIVATED: "deactivated",
  REACTIVATED: "reactivated",
} as const;
type Kind = (typeof Kind)[keyof typeof Kind];


const Pane = {
  WARN1: "warn1",
  WARN2: "warn2",
  OTP: "otp",
  DONE: "done",
  REACTIVATE: "reactivate",
} as const;
type Pane = (typeof Pane)[keyof typeof Pane];

export type ElvixDeactivateResult =
  | { ok: true; state: State }
  | { ok: false; error: string; message?: string };

function ElvixDeactivateImpl(props: {
  appId?: string;
  appName?: string;
  inactive?: boolean;
  inactivatedBy?: string | null;
  onSuccess?: (state: State) => void;
  onFail?: (error: string) => void;
  onResult?: (result: ElvixDeactivateResult) => void;
}) {
  const app = useElvixApp();
  const appCtx = useElvixAppContext();
  const appId = props.appId ?? app?.clientId ?? "preview";
  const appName = props.appName ?? app?.appName ?? "your app";
  const inactive =
    props.inactive ?? Boolean(appCtx?.membership?.inactiveAt) ?? false;
  const inactivatedBy =
    props.inactivatedBy ?? appCtx?.membership?.inactivatedBy ?? null;
  const { onSuccess, onFail, onResult } = props;
  return (
    <ElvixDeactivateInner
      appId={appId}
      appName={appName}
      inactive={inactive}
      inactivatedBy={inactivatedBy}
      onSuccess={onSuccess}
      onFail={onFail}
      onResult={onResult}
    />
  );
}

function ElvixDeactivateInner({
  appId,
  appName,
  inactive,
  inactivatedBy,
  onSuccess,
  onFail,
  onResult,
}: {
  appId: string;
  appName: string;
  inactive: boolean;
  inactivatedBy: string | null;
  onSuccess?: (state: State) => void;
  onFail?: (error: string) => void;
  onResult?: (result: ElvixDeactivateResult) => void;
}) {
  const ctx = useElvixContext();
  const t = useT();
  const [isInactive, setIsInactive] = useState(inactive);
  const [pane, setPane] = useState<Pane>(inactive ? "reactivate" : "warn1");
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

  // Countdown for the resend gate (30s).
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
        body: JSON.stringify({ kind: "inactivate" }),
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
        if (body.error === "too_recent") {
          setResendIn(body.retryAfterSeconds ?? 30);
        }
        setServerError(
          body.error === "too_many"
            ? t("deactivate.errorTooMany")
            : body.error === "too_recent"
              ? t("deactivate.errorTooRecent", { seconds: body.retryAfterSeconds ?? 30 })
              : body.error === "send_failed"
                ? t("deactivate.errorSendFailed")
                : t("deactivate.errorRequestFailed"),
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
    if (!challengeId) {
      await requestChallenge();
    }
  }

  async function verifyAndSubmit() {
    if (saving || !challengeId || code.length !== 6) return;
    setSaving(true);
    setServerError(null);
    try {
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/apps/${appId}/membership`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.headers },
        credentials: auth.credentials,
        body: JSON.stringify({ action: "inactivate", challengeId, code }),
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
            t("deactivate.errorWrongCode", { count: body.attemptsLeft ?? 0 }),
          );
        } else if (body.error === "challenge_locked") {
          setServerError(t("deactivate.errorChallengeLocked"));
          setChallengeId(null);
          setCode("");
        } else if (body.error === "challenge_expired") {
          setServerError(t("deactivate.errorChallengeExpired"));
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
      setIsInactive(true);
      onResult?.({ ok: true, state: "inactive" });
      onSuccess?.("inactive");
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

  async function submitReactivate() {
    if (saving) return;
    setSaving(true);
    setServerError(null);
    try {
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/apps/${appId}/membership`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.headers },
        credentials: auth.credentials,
        body: JSON.stringify({ action: "reactivate" }),
      });
      const body = unwrapEnvelope(await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        const msg =
          body.error === "deleted"
            ? t("deactivate.errorAlreadyLeft")
            : t("common.errorSaveFailed");
        setServerError(msg);
        onFail?.(msg);
        onResult?.({
          ok: false,
          error: body.error ?? "save_failed",
          message: msg,
        });
        return;
      }
      setIsInactive(false);
      onResult?.({ ok: true, state: "active" });
      onSuccess?.("active");
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
            <Warn1Pane appName={appName} onContinue={() => go("warn2", 1)} />
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
            <Warn2Pane
              onBack={() => go("warn1", -1)}
              onContinue={() => {
                void startOtpFlow();
              }}
              requesting={requesting}
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
              onConfirm={verifyAndSubmit}
              onResend={requestChallenge}
              actionLabel={t("deactivate.confirmCta")}
            />
          </motion.div>
        )}
        {pane === "reactivate" && (
          <motion.div
            key="reactivate"
            custom={direction}
            variants={paneVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={paneTransition}
          >
            <ReactivatePane
              appName={appName}
              inactivatedBy={inactivatedBy}
              saving={saving}
              serverError={serverError}
              onConfirm={submitReactivate}
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
              appName={appName}
              kind={isInactive ? "deactivated" : "reactivated"}
              onAgain={() => {
                setChallengeId(null);
                setCode("");
                setResendIn(0);
                setAttemptsLeft(null);
                go(isInactive ? "reactivate" : "warn1", -1);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Warn1Pane({
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
        <span
          className="size-10 rounded-full inline-flex items-center justify-center shrink-0"
          style={{ background: "var(--elvix-primary-12)" }}
        >
          <EyeOff
            className="size-5"
            strokeWidth={2.2}
            style={{ color: "var(--elvix-primary-strong)" }}
          />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight text-fg-1 leading-tight">
            {t("deactivate.warn1Title", { app: appName })}
          </div>
          <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-1">
            {t("deactivate.warn1Body", { app: appName })}
          </p>
          <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-3">{t("deactivate.soundGood")}</p>
        </div>
      </div>
      <ElvixSaveButton
        state="idle"
        label={t("deactivate.warn1Cta")}
        hint={t("common.hintEnter")}
        autoFocus
      />
    </form>
  );
}

function Warn2Pane({
  onBack,
  onContinue,
  requesting,
}: {
  onBack: () => void;
  onContinue: () => void;
  requesting: boolean;
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
        {t("deactivate.warn2Title")}
      </div>
      <ul className="text-[12.5px] text-fg-2 leading-[1.55] pl-3 space-y-1.5 list-disc">
        <li>{t("deactivate.warn2Bullet1")}</li>
        <li>{t("deactivate.warn2Bullet2")}</li>
        <li>{t("deactivate.warn2Bullet3")}</li>
        <li>{t("deactivate.warn2Bullet4")}</li>
      </ul>
      <p className="text-[12.5px] text-fg-3 leading-[1.55]">{t("deactivate.soundGood")}</p>
      <ElvixSaveButton
        state={requesting ? "saving" : "idle"}
        disabled={requesting}
        label={t("deactivate.warn2Cta")}
        savedLabel={t("deactivate.sendingLabel")}
        hint={null}
        autoFocus
      />
    </form>
  );
}

function ReactivatePane({
  appName,
  inactivatedBy,
  saving,
  serverError,
  onConfirm,
}: {
  appName: string;
  inactivatedBy: string | null;
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
          <Eye
            className="size-5"
            strokeWidth={2.2}
            style={{ color: "var(--elvix-primary-strong)" }}
          />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight text-fg-1 leading-tight">
            {t("deactivate.reactivateTitle", { app: appName })}
          </div>
          <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-1">
            {inactivatedBy === "owner"
              ? t("deactivate.reactivateBodyByOwner", { app: appName })
              : t("deactivate.reactivateBody", { app: appName })}
          </p>
        </div>
      </div>
      {serverError ? <p className="text-[12px] text-red-500 leading-tight">{serverError}</p> : null}
      <ElvixSaveButton
        state={saving ? "saving" : "idle"}
        disabled={saving}
        label={t("deactivate.reactivateCta")}
        savedLabel={t("identity.saved")}
        hint={null}
        onClick={onConfirm}
        autoFocus
      />
    </div>
  );
}

function DonePane({
  appName,
  kind,
  onAgain,
}: {
  appName: string;
  kind: Kind;
  onAgain: () => void;
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
        <CheckCircle2
          className="size-7"
          strokeWidth={2.2}
          style={{ color: "var(--elvix-primary-strong)" }}
        />
      </motion.span>
      <div className="space-y-1 max-w-[300px]">
        <div className="text-[15px] font-semibold tracking-tight text-fg-1">
          {/* LEGACY: spine-lint-disable-next-line spine/enum-over-string */}
          {kind === "deactivated"
            ? t("deactivate.doneDeactivatedTitle", { app: appName })
            : t("deactivate.doneReactivatedTitle", { app: appName })}
        </div>
        <div className="text-[12.5px] text-fg-3 leading-[1.55]">
          {kind === "deactivated"
            ? t("deactivate.doneDeactivatedBody")
            : t("deactivate.doneReactivatedBody")}
        </div>
      </div>
      <button
        type="button"
        onClick={onAgain}
        className="text-[12.5px] font-medium text-fg-2 hover:text-fg-1 underline underline-offset-4 cursor-pointer"
      >
        {kind === "deactivated" ? t("deactivate.reactivateAgain") : t("deactivate.deactivateAgain")}
      </button>
    </div>
  );
}

export function OtpPane({
  appName: _appName,
  deliveredTo,
  code,
  setCode,
  saving,
  requesting,
  serverError,
  attemptsLeft: _attemptsLeft,
  resendIn,
  onBack,
  onConfirm,
  onResend,
  actionLabel,
}: {
  appName: string;
  deliveredTo: string | null;
  code: string;
  setCode: (v: string) => void;
  saving: boolean;
  requesting: boolean;
  serverError: string | null;
  attemptsLeft: number | null;
  resendIn: number;
  onBack: () => void;
  onConfirm: () => void;
  onResend: () => Promise<boolean | undefined>;
  actionLabel: string;
}) {
  const t = useT();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm();
      }}
    >
      <button
        type="button"
        onClick={onBack}
        disabled={saving}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2 hover:text-fg-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ArrowLeft className="size-3.5" />
        {t("common.back")}
      </button>
      <div>
        <div className="text-[15px] font-semibold tracking-tight text-fg-1 leading-tight">
          {t("deactivate.otpTitle")}
        </div>
        <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-1">
          {deliveredTo
            ? t("deactivate.otpDelivered", { email: deliveredTo })
            : requesting
              ? t("deactivate.otpSending")
              : t("deactivate.otpPending")}
        </p>
      </div>
      <OtpInput value={code} onChange={setCode} disabled={saving} autoFocus />
      {serverError ? <p className="text-[12px] text-red-500 leading-tight">{serverError}</p> : null}
      <ElvixSaveButton
        state={saving ? "saving" : "idle"}
        disabled={saving || code.length !== 6}
        label={actionLabel}
        savedLabel={t("identity.saved")}
        hint={null}
      />
      <div className="flex items-center justify-center gap-2 text-[12px] text-fg-3 pt-1">
        <button
          type="button"
          onClick={() => {
            if (resendIn > 0 || requesting) return;
            void onResend();
          }}
          disabled={resendIn > 0 || requesting || saving}
          className="inline-flex items-center gap-1 font-medium text-fg-2 hover:text-fg-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {requesting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {resendIn > 0 ? t("deactivate.resendIn", { seconds: resendIn }) : t("signin.resendCode")}
        </button>
      </div>
    </form>
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
export function ElvixDeactivate(props: Parameters<typeof ElvixDeactivateImpl>[0] & { card?: boolean }) {
  const { card, ...rest } = props;
  return (
    <MaybeCard card={card} className="h-full">
      <ElvixDeactivateImpl {...(rest as Parameters<typeof ElvixDeactivateImpl>[0])} />
    </MaybeCard>
  );
}
