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

import { AnimatePresence } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useT } from "../locale/use-t";
import { DonePane } from "./done-pane";
import { useElvixApp, useElvixAppContext } from "./elvix-provider";
import { ElvixSaveButton } from "./elvix-save-button";
import { OtpInput } from "./otp-input";
import {
  type ChallengeCopy,
  ChallengedAction,
  type MembershipOutcome,
  useMembershipChallenge,
} from "./use-membership-challenge";
import { SlidePane } from "./wizard-panes";

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
  const inactive = props.inactive ?? Boolean(appCtx?.membership?.inactiveAt);
  const inactivatedBy = props.inactivatedBy ?? appCtx?.membership?.inactivatedBy ?? null;
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
  const t = useT();
  const challenge = useMembershipChallenge(appId, ChallengedAction.INACTIVATE, DEACTIVATE_COPY);
  const [isInactive, setIsInactive] = useState(inactive);
  const [pane, setPane] = useState<Pane>(inactive ? Pane.REACTIVATE : Pane.WARN1);
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
    setIsInactive(state === State.INACTIVE);
    onResult?.({ ok: true, state });
    onSuccess?.(state);
    if (!onSuccess) go(Pane.DONE);
  };

  const reactivate = async () =>
    settle(
      await challenge.submit({ action: "reactivate" }, (reply) => ({
        message: t(
          reply.error === "deleted" ? "deactivate.errorAlreadyLeft" : "common.errorSaveFailed",
        ),
        fatal: true,
      })),
      State.ACTIVE,
    );

  return (
    <div className="relative overflow-hidden">
      <AnimatePresence mode="wait" custom={direction}>
        <SlidePane key={pane} direction={direction}>
          {pane === Pane.WARN1 ? (
            <Warn1Pane appName={appName} onContinue={() => go(Pane.WARN2)} />
          ) : pane === Pane.WARN2 ? (
            <Warn2Pane
              onBack={() => go(Pane.WARN1, -1)}
              onContinue={() => {
                go(Pane.OTP);
                void challenge.start();
              }}
              requesting={challenge.requesting}
            />
          ) : pane === Pane.OTP ? (
            <OtpPane
              challenge={challenge}
              onBack={() => go(Pane.WARN2, -1)}
              onConfirm={async () => settle(await challenge.verify(), State.INACTIVE)}
              actionLabel={t("deactivate.confirmCta")}
            />
          ) : pane === Pane.REACTIVATE ? (
            <ReactivatePane
              appName={appName}
              inactivatedBy={inactivatedBy}
              saving={challenge.saving}
              serverError={challenge.error}
              onConfirm={reactivate}
            />
          ) : (
            <DeactivateDonePane
              appName={appName}
              kind={isInactive ? Kind.DEACTIVATED : Kind.REACTIVATED}
              onAgain={() => {
                challenge.reset();
                go(isInactive ? Pane.REACTIVATE : Pane.WARN1, -1);
              }}
            />
          )}
        </SlidePane>
      </AnimatePresence>
    </div>
  );
}

const DEACTIVATE_COPY: ChallengeCopy = {
  tooMany: "deactivate.errorTooMany",
  tooRecent: "deactivate.errorTooRecent",
  sendFailed: "deactivate.errorSendFailed",
  requestFailed: "deactivate.errorRequestFailed",
  wrongCode: "deactivate.errorWrongCode",
  locked: "deactivate.errorChallengeLocked",
  expired: "deactivate.errorChallengeExpired",
};

function Warn1Pane({ appName, onContinue }: { appName: string; onContinue: () => void }) {
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

function DeactivateDonePane({
  appName,
  kind,
  onAgain,
}: {
  appName: string;
  kind: Kind;
  onAgain: () => void;
}) {
  const t = useT();
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const deactivated = kind === "deactivated";
  return (
    <DonePane
      title={
        deactivated
          ? t("deactivate.doneDeactivatedTitle", { app: appName })
          : t("deactivate.doneReactivatedTitle", { app: appName })
      }
      body={deactivated ? t("deactivate.doneDeactivatedBody") : t("deactivate.doneReactivatedBody")}
      action={{
        label: deactivated ? t("deactivate.reactivateAgain") : t("deactivate.deactivateAgain"),
        onClick: onAgain,
      }}
    />
  );
}

/** The code step of a membership challenge; shared with `<ElvixLeave>`. */
export function OtpPane({
  challenge,
  onBack,
  onConfirm,
  actionLabel,
}: {
  challenge: ReturnType<typeof useMembershipChallenge>;
  onBack: () => void;
  onConfirm: () => void;
  actionLabel: string;
}) {
  const t = useT();
  const { deliveredTo, code, setCode, saving, requesting, resendIn } = challenge;
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
      {challenge.error ? (
        <p className="text-[12px] text-red-500 leading-tight">{challenge.error}</p>
      ) : null}
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
            void challenge.request();
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

/**
 * Public export. Wraps the implementation in <ElvixCard> by default;
 * pass `card={false}` to render bare (compose in your own surface).
 */
export function ElvixDeactivate(
  props: Parameters<typeof ElvixDeactivateImpl>[0] & { card?: boolean },
) {
  const { card, ...rest } = props;
  return (
    <MaybeCard card={card} className="h-full">
      <ElvixDeactivateImpl {...(rest as Parameters<typeof ElvixDeactivateImpl>[0])} />
    </MaybeCard>
  );
}
