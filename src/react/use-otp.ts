"use client";

/**
 * The email-code legs every sign-in surface shares (`<ElvixSignInForm>`,
 * `<ElvixEmailCodeSignIn>`):
 *
 *   useOtpStart  — an email or username → a code, and the resend cooldown.
 *   useOtpVerify — the six digits → the finisher's landing, handed whole to
 *                  `flow.applyLanding`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { humanError, type Translator } from "./sign-in-copy";
import { postJson, type SignInFlow, Step } from "./use-sign-in-flow";
import { useStableCallback } from "./use-stable-callback";
import { isValidUsername } from "./username-rules";

export const CODE_LENGTH = 6;
const RESEND_SECONDS = 45;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A plausible email address, as the identifier step accepts it. */
export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

type OtpOptions = {
  flow: SignInFlow;
  baseUrl: string;
  intent: string;
  clientId?: string;
  isPreview: boolean;
  methodEmailOtp: boolean;
  methodUsername: boolean;
  t: Translator;
  /** What the identifier field starts with (an email the host already knows). */
  initialIdentifier?: string;
};

/** The identifier step: an email gets a code; a username gets one at its email. */
export function useOtpStart(o: OtpOptions) {
  const { flow, baseUrl, t } = o;
  const [identifier, setIdentifier] = useState(o.initialIdentifier ?? "");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  // Valid only for a method that is on: with only usernames enabled, an
  // email must not unlock Continue (the resolve route would reject it).
  const valid = useMemo(() => {
    const v = identifier.trim();
    if (!v) return false;
    if (v.includes("@")) return o.methodEmailOtp && isEmail(v);
    return o.methodUsername && isValidUsername(v);
  }, [identifier, o.methodEmailOtp, o.methodUsername]);

  /** Sends a code to the identifier; the new challenge, or `null` when none was sent. */
  const start = async (e?: { preventDefault: () => void }): Promise<string | null> => {
    e?.preventDefault();
    if (!valid || o.isPreview || sending) return null;
    flow.setError(null);
    setSending(true);
    const v = identifier.trim();
    const byUsername = !v.includes("@");
    const out = byUsername
      ? await postJson(
          `${baseUrl}/api/auth/identifier/resolve`,
          {
            username: v.toLowerCase(),
            intent: o.intent,
            ...(o.clientId ? { clientId: o.clientId } : {}),
          },
          false,
        )
      : await postJson(
          `${baseUrl}/api/auth/otp/start`,
          { email: v, intent: o.intent, clientId: o.clientId },
          false,
        );
    setSending(false);
    if (!out) {
      flow.reportError("network_error", t("signin.errorNetwork"));
      return null;
    }
    const { body } = out;
    if (!out.ok || !body.challengeId) {
      if (body.error === "too_recent" || body.error === "too_many") {
        setResendIn(body.retryAfterSeconds ?? (byUsername ? RESEND_SECONDS : 30));
      }
      flow.reportError(body.error, humanError(t, body.error, body.retryAfterSeconds));
      return null;
    }
    resume(body.challengeId, Date.now());
    return body.challengeId;
  };

  /** Shows the code step for a code already sent at `sentAt`, with what is left of the cooldown. */
  const resume = (id: string, sentAt: number) => {
    setChallengeId(id);
    flow.setStep(Step.CODE);
    setResendIn(Math.max(0, RESEND_SECONDS - Math.floor((Date.now() - sentAt) / 1000)));
  };

  return { identifier, setIdentifier, valid, challengeId, sending, resendIn, start, resume };
}

export type OtpStart = ReturnType<typeof useOtpStart>;

/** The code step: verifies on submit and as soon as the sixth digit lands. */
export function useOtpVerify(o: {
  flow: SignInFlow;
  baseUrl: string;
  challengeId: string | null;
  isPreview: boolean;
  t: Translator;
}) {
  const { flow } = o;
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const verify = async (e?: { preventDefault: () => void }) => {
    e?.preventDefault();
    if (o.isPreview || verifying || code.length !== CODE_LENGTH || !o.challengeId) return;
    flow.setError(null);
    setVerifying(true);
    const out = await postJson(
      `${o.baseUrl}/api/auth/otp/verify`,
      { challengeId: o.challengeId, code },
      false,
    );
    setVerifying(false);
    if (!out) {
      flow.reportError("network_error", o.t("signin.errorNetwork"));
      return;
    }
    if (!out.ok) {
      flow.reportError(out.body.error, humanError(o.t, out.body.error));
      return;
    }
    flow.methodRef.current = "email_otp";
    flow.applyLanding(out.body);
  };

  // Auto-submit once per complete code; editing below six digits re-arms it,
  // so a code that failed is not retried until the user changes it.
  const submittedRef = useRef("");
  const verifyOnce = useStableCallback(verify);
  useEffect(() => {
    if (code.length < CODE_LENGTH) {
      submittedRef.current = "";
      return;
    }
    if (verifying || o.isPreview || !o.challengeId || submittedRef.current === code) return;
    submittedRef.current = code;
    void verifyOnce();
  }, [code, verifying, o.isPreview, o.challengeId, verifyOnce]);

  return { code, setCode, verifying, verify };
}
