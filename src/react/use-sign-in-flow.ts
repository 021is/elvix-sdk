"use client";

/**
 * `<ElvixSignInForm>`'s state machine and side effects.
 *
 *   useSignInFlow    — which step shows, and the single funnel every sign-in
 *                      path ends in (`applyLanding` → `finishSignIn`).
 *   useSignInReturns — what the page arrived with: an active session to
 *                      resume, a `#elvix_token` redirect return, a Google
 *                      `?onboarding=1` return, a blocked-OAuth `?elvix_error`.
 *   useOtpStart      — the identifier step: email or username → a code.
 *
 * Every step renders inside the same card; nothing here changes the URL
 * except the final navigation, which the host can take over.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ElvixSessionStatus } from "./elvix-provider";
import { jsonInit, send } from "./profile-request";
import {
  authInit,
  consumeSignedOutFlag,
  type ElvixLandingPayload,
  getElvixToken,
  isSameOrigin,
  setElvixToken,
  takeJustReturnedLanding,
  takeJustReturnedToken,
  wasReturnTokenConsumed,
} from "./session";
import { defaultRedirect, humanError, type Translator } from "./sign-in-copy";
import { unwrapEnvelope } from "./spine-fetch";
import { toast } from "./toast";
import type { ElvixSignInMethod, ElvixSignInResult } from "./types";
import { useStableCallback } from "./use-stable-callback";
import { isValidUsername } from "./username-rules";

export const Step = {
  IDENTIFIER: "identifier",
  CODE: "code",
  USERNAME: "username",
  PASSKEY: "passkey",
  RECOVER: "recover",
  AUTHENTICATING: "authenticating",
} as const;
export type Step = (typeof Step)[keyof typeof Step];

/** What the server says comes after a verified factor. */
export const NextStep = {
  DONE: "done",
  USERNAME: "username",
  PASSKEY: "passkey",
  RECOVER: "recover",
} as const;
export type NextStep = (typeof NextStep)[keyof typeof NextStep];

/** A membership the user can get back by restoring it. */
export const RecoverKind = {
  INACTIVE: "inactive",
  SOFT_DELETED_BY_USER: "soft_deleted_by_user",
} as const;
export type RecoverKind = (typeof RecoverKind)[keyof typeof RecoverKind];

export type RecoverState = { appId: string; appName: string; state: RecoverKind; sinceAt: string };

/** A sign-in finisher's answer: the gate endpoints and the fragment agree. */
export type Landing = {
  next_step?: NextStep;
  redirect?: string;
  suggestions?: string[];
  final?: string;
  token?: string;
  recover?: RecoverState;
};

export type Reply = Landing & {
  ok?: boolean;
  error?: string;
  challengeId?: string;
  retryAfterSeconds?: number;
};

const CODE_LENGTH = 6;
const RESEND_SECONDS = 45;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST JSON and unwrap the envelope; `null` on a network error. Before a
 * session exists the cookie only rides same-origin; after it, `authInit()`
 * sends the bearer cross-origin.
 */
export async function postJson(
  url: string,
  body: unknown,
  signedIn: boolean,
): Promise<{ ok: boolean; body: Reply } | null> {
  const init = signedIn
    ? jsonInit("POST", body)
    : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: (isSameOrigin(url) ? "include" : "omit") as RequestCredentials,
        body: JSON.stringify(body),
      };
  const res = await send(url, init);
  if (!res) return null;
  const reply = (unwrapEnvelope(await res.json().catch(() => ({}))) ?? {}) as Reply;
  return { ok: res.ok && reply.ok === true, body: reply };
}

type FlowOptions = {
  intent: string;
  redirectAfterSignIn?: string;
  onResult?: (result: ElvixSignInResult) => void;
  onAuthenticated?: (r: { ok: true; redirect: string; token?: string }) => void;
  navigate: boolean;
};

export function useSignInFlow({
  intent,
  redirectAfterSignIn,
  onResult,
  onAuthenticated,
  navigate,
}: FlowOptions) {
  const [step, setStep] = useState<Step>(Step.IDENTIFIER);
  const [recover, setRecover] = useState<RecoverState | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** The onboarding destination the server named when a gate step began. */
  const [backendFinal, setBackendFinal] = useState("/");
  /**
   * The factor that authenticated this ceremony, stamped at each entry path
   * and read by `finishSignIn`, so `onResult.method` stays right across the
   * onboarding steps. A redirect return re-stamps it on mount.
   */
  const methodRef = useRef<ElvixSignInMethod>("email_otp");

  /**
   * Every terminal redirect resolves here: the host's `redirectAfterSignIn`,
   * else the method's own redirect, else the onboarding `final`, else "/".
   */
  const finalRedirect = useCallback(
    (backendRedirect?: string) => redirectAfterSignIn || backendRedirect || backendFinal || "/",
    [redirectAfterSignIn, backendFinal],
  );

  /**
   * The single terminal-success funnel. Fires `onResult` once with the method
   * and destination, then navigates unless the host took routing over with
   * `navigate={false}` or the deprecated `onAuthenticated`.
   */
  const finishSignIn = useCallback(
    (redirect: string, token: string | undefined) => {
      setStep(Step.AUTHENTICATING);
      onResult?.({ ok: true, phase: "complete", method: methodRef.current, redirect, token });
      onAuthenticated?.({ ok: true, redirect, token });
      const hostOwnsNav = navigate === false || Boolean(onAuthenticated);
      if (!hostOwnsNav) window.location.href = redirect;
    },
    [onResult, onAuthenticated, navigate],
  );

  /** Shows the error inline and reports it; every failure funnels here. */
  const reportError = useCallback(
    (code: string | undefined, message: string) => {
      setError(message);
      onResult?.({ ok: false, error: code ?? "unknown", message });
    },
    [onResult],
  );

  /**
   * Applies a finisher's answer: an onboarding gate moves the form to that
   * step in place, anything else finishes. A cross-origin sign-in returns the
   * session token in the body (no third-party cookie), so it is stored first.
   */
  const applyLanding = useCallback(
    (body: Landing) => {
      if (body.token) setElvixToken(body.token);
      if (body.next_step === NextStep.USERNAME) {
        setSuggestions(body.suggestions ?? []);
        setBackendFinal(body.final ?? "/");
        setStep(Step.USERNAME);
        return;
      }
      if (body.next_step === NextStep.PASSKEY) {
        setBackendFinal(body.final ?? "/");
        setStep(Step.PASSKEY);
        return;
      }
      if (body.next_step === NextStep.RECOVER && body.recover) {
        setRecover(body.recover);
        setBackendFinal(body.final ?? "/");
        setStep(Step.RECOVER);
        return;
      }
      const redirect = finalRedirect(body.redirect ?? defaultRedirect(intent));
      finishSignIn(redirect, body.token ?? getElvixToken() ?? undefined);
    },
    [intent, finalRedirect, finishSignIn],
  );

  /** Finishes an onboarding leg at its destination with the stored bearer. */
  const finishOnboarding = useCallback(
    (backendRedirect?: string) =>
      finishSignIn(finalRedirect(backendRedirect), getElvixToken() ?? undefined),
    [finalRedirect, finishSignIn],
  );

  return {
    step,
    setStep,
    recover,
    suggestions,
    error,
    setError,
    methodRef,
    finalRedirect,
    finishSignIn,
    finishOnboarding,
    reportError,
    applyLanding,
  };
}

export type SignInFlow = ReturnType<typeof useSignInFlow>;

/** A `#elvix_token` return's landing, narrowed to what `applyLanding` takes. */
function landingFromFragment(
  token: string,
  landing: Exclude<ElvixLandingPayload, { next_step: "done" }>,
): Landing {
  return {
    next_step: landing.next_step as NextStep,
    suggestions: landing.next_step === "username" ? landing.suggestions : undefined,
    final: landing.final,
    token,
    recover:
      landing.next_step === "recover" && landing.recover
        ? { ...landing.recover, state: landing.recover.state as RecoverKind }
        : undefined,
  };
}

function stripParams(...names: string[]) {
  const url = new URL(window.location.href);
  for (const name of names) url.searchParams.delete(name);
  window.history.replaceState({}, "", url.toString());
}

type ReturnOptions = {
  flow: SignInFlow;
  baseUrl: string;
  isPreview: boolean;
  redirectIfAuthenticated: boolean;
  sessionStatus: ElvixSessionStatus;
  t: Translator;
  onResult?: (result: ElvixSignInResult) => void;
};

export function useSignInReturns(o: ReturnOptions) {
  const { flow, baseUrl, isPreview, sessionStatus, t } = o;
  const { applyLanding, finishSignIn, finalRedirect, methodRef } = flow;
  // Stable, so a new `applyLanding` or an inline host `onResult` does not
  // re-run the one-shot effects.
  const onLanding = useStableCallback(applyLanding);
  const reportResult = useStableCallback(o.onResult);

  // SSO silent-resume: an opted-in host with an active session completes at
  // once (method "session"). Skipped right after signOut() (the one-shot
  // marker), and when a redirect return is being handled, which owns
  // completion and its onboarding.
  const resumedRef = useRef(false);
  const justSignedOutRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!o.redirectIfAuthenticated || isPreview) return;
    if (justSignedOutRef.current === null) justSignedOutRef.current = consumeSignedOutFlag();
    if (justSignedOutRef.current || wasReturnTokenConsumed()) return;
    if (sessionStatus !== ElvixSessionStatus.AUTHENTICATED || resumedRef.current) return;
    resumedRef.current = true;
    methodRef.current = "session";
    finishSignIn(finalRedirect(), getElvixToken() ?? undefined);
  }, [o.redirectIfAuthenticated, isPreview, sessionStatus, finishSignIn, finalRedirect, methodRef]);

  // The provider strips `#elvix_token=…&elvix_landing=…` on mount and queues
  // it: a redirect-flow finish (Google redirect-OAuth, or the hosted passkey
  // ceremony, which the fragment does not tell apart, so it is labelled
  // "google"). An onboarding landing renders its gate inline; otherwise the
  // sign-in is complete.
  useEffect(() => {
    if (isPreview || typeof window === "undefined") return;
    const dispatch = (token: string, landing: ElvixLandingPayload | null) => {
      methodRef.current = "google";
      if (landing && landing.next_step !== "done") {
        applyLanding(landingFromFragment(token, landing));
        return;
      }
      finishSignIn(finalRedirect(), token);
    };
    const token = takeJustReturnedToken();
    if (token) dispatch(token, takeJustReturnedLanding());
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<{ token: string; landing?: ElvixLandingPayload | null }>)
        .detail;
      if (detail?.token) dispatch(detail.token, detail.landing ?? null);
    };
    window.addEventListener("elvix:return-token", listener);
    return () => window.removeEventListener("elvix:return-token", listener);
  }, [isPreview, applyLanding, finishSignIn, finalRedirect, methodRef]);

  // Google OAuth is a redirect and cannot return JSON, so it lands on
  // `?onboarding=1&next=…`; the pending onboarding step is fetched here and
  // rendered in the card. The params are stripped, so this runs once.
  useEffect(() => {
    if (isPreview || typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("onboarding") !== "1") return;
    void (async () => {
      const init = authInit();
      const res = await send(`${baseUrl}/api/onboarding/state`, {
        headers: init.headers,
        credentials: init.credentials,
      });
      // Best effort: on a failed probe the user stays on the identifier step.
      const body = res?.ok ? (unwrapEnvelope(await res.json().catch(() => null)) as Reply) : null;
      if (body?.ok) onLanding(body);
      stripParams("onboarding", "next");
    })();
  }, [isPreview, baseUrl, onLanding]);

  // A blocked OAuth redirect comes back with `?error=` (first-party) or
  // `?elvix_error=` (cross-origin app) and no token. The user just landed,
  // so the reason is a toast, not an inline line.
  useEffect(() => {
    if (isPreview || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("elvix_error") ?? params.get("error");
    if (!code) return;
    const message = humanError(t, code);
    toast.error(message);
    reportResult({ ok: false, error: code, message });
    stripParams("elvix_error", "error");
  }, [isPreview, t, reportResult]);
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
};

/** The identifier step: an email gets a code; a username gets one at its email. */
export function useOtpStart(o: OtpOptions) {
  const { flow, baseUrl, t } = o;
  const [identifier, setIdentifier] = useState("");
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
    if (v.includes("@")) return o.methodEmailOtp && EMAIL_RE.test(v);
    return o.methodUsername && isValidUsername(v);
  }, [identifier, o.methodEmailOtp, o.methodUsername]);

  const start = async (e?: { preventDefault: () => void }) => {
    e?.preventDefault();
    if (!valid || o.isPreview || sending) return;
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
      return;
    }
    const { body } = out;
    if (!out.ok || !body.challengeId) {
      if (body.error === "too_recent" || body.error === "too_many") {
        setResendIn(body.retryAfterSeconds ?? (byUsername ? RESEND_SECONDS : 30));
      }
      flow.reportError(body.error, humanError(t, body.error, body.retryAfterSeconds));
      return;
    }
    setChallengeId(body.challengeId);
    flow.setStep(Step.CODE);
    setResendIn(RESEND_SECONDS);
  };

  return { identifier, setIdentifier, valid, challengeId, sending, resendIn, start };
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
