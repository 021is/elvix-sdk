"use client";

/**
 * The emailed-code confirmation `<ElvixDeactivate>` and `<ElvixLeave>` share:
 * request a challenge, count down to a resend, verify the six digits along
 * with the membership action. Also the plain membership write both use to
 * undo (reactivate, restore), which needs no code.
 */

import { useEffect, useState } from "react";
import { useT } from "../locale/use-t";
import { useElvixContext } from "./elvix-provider";
import { jsonInit, send } from "./profile-request";
import { unwrapEnvelope } from "./spine-fetch";

/** The membership actions that need an emailed code. */
export const ChallengedAction = {
  INACTIVATE: "inactivate",
  LEAVE: "leave",
} as const;
export type ChallengedAction = (typeof ChallengedAction)[keyof typeof ChallengedAction];

/** i18n keys for the component's own wording of each failure. */
export type ChallengeCopy = {
  tooMany: string;
  /** Takes `{seconds}`. */
  tooRecent: string;
  sendFailed: string;
  requestFailed: string;
  /** Takes `{count}`, the attempts left. */
  wrongCode: string;
  locked: string;
  expired: string;
};

type Reply = {
  ok?: boolean;
  error?: string;
  challengeId?: string;
  deliveredTo?: string;
  retryAfterSeconds?: number;
  attemptsLeft?: number;
};

/** How a failure reads to the user. */
export type FailureWording = {
  message: string;
  /** Not recoverable inside the pane (a new code can't fix it). */
  fatal: boolean;
};

export type MembershipOutcome = { ok: true } | ({ ok: false; error: string } & FailureWording);

const RESEND_SECONDS = 30;
const CODE_LENGTH = 6;

async function post(url: string, body: unknown): Promise<{ ok: boolean; reply: Reply } | null> {
  const res = await send(url, jsonInit("POST", body));
  if (!res) return null;
  const reply = (unwrapEnvelope(await res.json().catch(() => ({}))) ?? {}) as Reply;
  return { ok: res.ok && reply.ok === true, reply };
}

export function useMembershipChallenge(
  appId: string,
  action: ChallengedAction,
  copy: ChallengeCopy,
) {
  const t = useT();
  const { baseUrl } = useElvixContext();
  const url = `${baseUrl}/api/account/apps/${appId}/membership`;
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [deliveredTo, setDeliveredTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const requestFailure = (reply: Reply) => {
    const seconds = reply.retryAfterSeconds ?? RESEND_SECONDS;
    switch (reply.error) {
      case "too_many":
        return t(copy.tooMany);
      case "too_recent":
        setResendIn(seconds);
        return t(copy.tooRecent, { seconds });
      case "send_failed":
        return t(copy.sendFailed);
      default:
        return t(copy.requestFailed);
    }
  };

  /** Emails a fresh code. */
  const request = async () => {
    setRequesting(true);
    setError(null);
    const out = await post(`${url}/challenge`, { kind: action });
    setRequesting(false);
    if (!out) {
      setError(t("common.errorNetwork"));
      return;
    }
    if (!out.ok) {
      setError(requestFailure(out.reply));
      return;
    }
    setChallengeId(out.reply.challengeId ?? null);
    setDeliveredTo(out.reply.deliveredTo ?? null);
    setCode("");
    setAttemptsLeft(null);
    setResendIn(RESEND_SECONDS);
  };

  /** A failed verify: the message, and what the pane must forget. */
  const verifyFailure = (reply: Reply): FailureWording => {
    switch (reply.error) {
      case "wrong_code":
        setAttemptsLeft(reply.attemptsLeft ?? null);
        setCode("");
        return { message: t(copy.wrongCode, { count: reply.attemptsLeft ?? 0 }), fatal: false };
      case "challenge_locked":
      case "challenge_expired":
        setChallengeId(null);
        setCode("");
        return {
          message: t(reply.error === "challenge_locked" ? copy.locked : copy.expired),
          fatal: false,
        };
      default:
        return { message: t("common.errorSaveFailed"), fatal: true };
    }
  };

  /** Writes a membership action. `failMessage` words a server error code. */
  const submit = async (
    body: Record<string, unknown>,
    failMessage?: (reply: Reply) => FailureWording,
    fallbackError = "save_failed",
  ): Promise<MembershipOutcome | null> => {
    if (saving) return null;
    setSaving(true);
    setError(null);
    const out = await post(url, body);
    setSaving(false);
    if (out?.ok) return { ok: true };
    const failure = out
      ? (failMessage?.(out.reply) ?? { message: t("common.errorSaveFailed"), fatal: true })
      : { message: t("common.errorNetwork"), fatal: true };
    setError(failure.message);
    const error = out ? (out.reply.error ?? fallbackError) : "network_error";
    return { ok: false, error, ...failure };
  };

  return {
    challengeId,
    deliveredTo,
    code,
    setCode,
    requesting,
    saving,
    attemptsLeft,
    resendIn,
    error,
    clearError: () => setError(null),
    request,
    /** Moves on to the code step: requests a code unless one is pending. */
    start: async () => {
      if (!challengeId) await request();
    },
    /** Verifies the entered code together with the action. */
    verify: async () => {
      if (!challengeId || code.length !== CODE_LENGTH) return null;
      return submit({ action, challengeId, code }, verifyFailure);
    },
    submit,
    /** Forgets the pending code, for running the flow again. */
    reset: () => {
      setChallengeId(null);
      setCode("");
      setResendIn(0);
      setAttemptsLeft(null);
    },
  };
}
