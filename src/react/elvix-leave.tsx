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

import { AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Lock, LogOut, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { useT } from "../locale/use-t";
import { DonePane } from "./done-pane";
import { OtpPane } from "./elvix-deactivate";
import { useElvixApp, useElvixAppContext } from "./elvix-provider";
import { ElvixSaveButton } from "./elvix-save-button";
import {
  type ChallengeCopy,
  ChallengedAction,
  type MembershipOutcome,
  useMembershipChallenge,
} from "./use-membership-challenge";
import { SlidePane } from "./wizard-panes";

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
    props.deletedAt !== undefined ? props.deletedAt : (appCtx?.membership?.deletedAt ?? null);
  const deletedBy =
    props.deletedBy !== undefined ? props.deletedBy : (appCtx?.membership?.deletedBy ?? null);
  const privacyPolicyUrl =
    props.privacyPolicyUrl !== undefined ? props.privacyPolicyUrl : (app?.privacyPolicyUrl ?? null);
  const termsOfServiceUrl =
    props.termsOfServiceUrl !== undefined
      ? props.termsOfServiceUrl
      : (app?.termsOfServiceUrl ?? null);
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
  const t = useT();
  const challenge = useMembershipChallenge(appId, ChallengedAction.LEAVE, LEAVE_COPY);
  const [localDeletedAt, setLocalDeletedAt] = useState<string | null>(deletedAt);
  const [localDeletedBy, setLocalDeletedBy] = useState<string | null>(deletedBy);
  const isDeleted = Boolean(localDeletedAt);
  const daysLeft = localDeletedAt ? graceDaysLeft(localDeletedAt) : 0;
  const [pane, setPane] = useState<Pane>(isDeleted ? Pane.RESTORE : Pane.WARN1);
  const [direction, setDirection] = useState<1 | -1>(1);

  const go = (next: Pane, dir: 1 | -1 = 1) => {
    setDirection(dir);
    setPane(next);
    challenge.clearError();
  };

  /** Reports a write; on success the host's onSuccess, or the done pane. */
  const settle = (out: MembershipOutcome | null, state: State) => {
    if (!out) return;
    if (!out.ok) {
      if (out.fatal) onFail?.(out.message);
      onResult?.({ ok: false, error: out.error, message: out.message });
      return;
    }
    setLocalDeletedAt(state === State.LEFT ? new Date().toISOString() : null);
    setLocalDeletedBy(state === State.LEFT ? "user" : null);
    onResult?.({ ok: true, state });
    onSuccess?.(state);
    if (!onSuccess) go(Pane.DONE);
  };

  const restore = async () =>
    settle(
      await challenge.submit(
        { action: "restore" },
        (reply) => ({
          message: t(RESTORE_ERRORS[reply.error ?? ""] ?? "leave.errorRestoreFailed"),
          fatal: true,
        }),
        "restore_failed",
      ),
      State.RESTORED,
    );

  // An app owner removed this user: only the owner can undo it.
  if (isDeleted && localDeletedBy === "owner" && localDeletedAt && pane !== Pane.DONE) {
    return <OwnerLockedPane appName={appName} deletedAt={localDeletedAt} daysLeft={daysLeft} />;
  }

  return (
    <div className="relative overflow-hidden">
      <AnimatePresence mode="wait" custom={direction}>
        <SlidePane key={pane} direction={direction}>
          {pane === Pane.WARN1 ? (
            <LeaveWarn1Pane appName={appName} onContinue={() => go(Pane.WARN2)} />
          ) : pane === Pane.WARN2 ? (
            <LeaveWarn2Pane
              appName={appName}
              privacyPolicyUrl={privacyPolicyUrl}
              termsOfServiceUrl={termsOfServiceUrl}
              requesting={challenge.requesting}
              onBack={() => go(Pane.WARN1, -1)}
              onContinue={() => {
                go(Pane.OTP);
                void challenge.start();
              }}
            />
          ) : pane === Pane.OTP ? (
            <OtpPane
              challenge={challenge}
              onBack={() => go(Pane.WARN2, -1)}
              onConfirm={async () => settle(await challenge.verify(), State.LEFT)}
              actionLabel={t("leave.otpActionLabel", { app: appName })}
            />
          ) : pane === Pane.RESTORE ? (
            <RestorePane
              appName={appName}
              daysLeft={daysLeft}
              saving={challenge.saving}
              serverError={challenge.error}
              onConfirm={restore}
            />
          ) : (
            <LeaveDonePane appName={appName} kind={isDeleted ? State.LEFT : State.RESTORED} />
          )}
        </SlidePane>
      </AnimatePresence>
    </div>
  );
}

const LEAVE_COPY: ChallengeCopy = {
  tooMany: "leave.errorTooManyCodes",
  tooRecent: "leave.errorTooRecent",
  sendFailed: "leave.errorSendFailed",
  requestFailed: "leave.errorRequestFailed",
  wrongCode: "leave.errorWrongCode",
  locked: "leave.errorChallengeLocked",
  expired: "leave.errorChallengeExpired",
};

const RESTORE_ERRORS: Record<string, string> = {
  owner_initiated: "leave.errorOwnerInitiated",
  grace_expired: "leave.errorGraceExpired",
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** A left membership can be restored for 90 days. */
const GRACE_MS = 90 * DAY_MS;

function graceDaysLeft(deletedAt: string): number {
  return Math.max(0, Math.ceil((new Date(deletedAt).getTime() + GRACE_MS - Date.now()) / DAY_MS));
}

function LeaveWarn1Pane({ appName, onContinue }: { appName: string; onContinue: () => void }) {
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
          <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-1">{t("leave.warn1Body")}</p>
          <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-3">
            {t("leave.understandPrompt")}
          </p>
        </div>
      </div>
      <ElvixSaveButton
        state="idle"
        label={t("leave.iUnderstandCta")}
        hint={t("common.enterHint")}
        autoFocus
      />
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
      <p className="text-[12.5px] text-fg-3 leading-[1.55]">{t("leave.warn2EmailPrompt")}</p>
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

function LeaveDonePane({ appName, kind }: { appName: string; kind: State }) {
  const t = useT();
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const left = kind === "left";
  return (
    <DonePane
      icon={left ? <Trash2 className="size-7 text-red-500" strokeWidth={2.2} /> : undefined}
      title={
        left
          ? t("leave.doneLeftTitle", { app: appName })
          : t("leave.doneRestoredTitle", { app: appName })
      }
      body={left ? t("leave.doneLeftBody") : t("leave.doneRestoredBody")}
    />
  );
}

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
