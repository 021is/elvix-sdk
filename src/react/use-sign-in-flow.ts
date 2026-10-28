"use client";

/**
 * `<ElvixSignInForm>`'s state machine and side effects.
 *
 *   useSignInFlow — which step shows, and the single funnel every sign-in path
 *                   ends in (`applyLanding` → `finishSignIn`).
 *
 * Beside it: `use-sign-in-returns.ts` (what the page arrived with) and
 * `use-otp.ts` (the email-code legs). Every step renders inside the same
 * frame; nothing here changes the URL except the final navigation, which the
 * host can take over.
 */

import { useCallback, useRef, useState } from "react";
import { useElvixRefresh } from "./elvix-provider";
import { jsonInit, send } from "./profile-request";
import { safeRedirect } from "./safe-redirect";
import { clearOnboardingPending, getElvixToken, isSameOrigin, setElvixToken } from "./session";
import { defaultRedirect } from "./sign-in-copy";
import { unwrapEnvelope } from "./spine-fetch";
import type { ElvixDeferredStep, ElvixSignInMethod, ElvixSignInResult } from "./types";

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
  /** The app's registered origins: the only other places a redirect may go. */
  allowedOrigins?: readonly string[];
  /** Preview mode only: start on an onboarding step, with demo data. */
  previewStep?: "username" | "passkey" | "recover";
  /** The step the flow opens on; the identifier step unless said otherwise. */
  startAt?: Step;
  /**
   * Finish at once when the server offers an optional step (username,
   * passkey): the session is complete, and the person is offered the step
   * again at their next sign-in. Restoring a membership is never deferred.
   */
  deferOnboarding?: boolean;
};

/** The onboarding steps a host may put off (`deferOnboarding`). */
function isDeferrable(step: NextStep | undefined): step is ElvixDeferredStep {
  return step === NextStep.USERNAME || step === NextStep.PASSKEY;
}

/** The onboarding step a landing opens, or `null` when the sign-in is done. */
function gateOf(body: Landing): Step | null {
  switch (body.next_step) {
    case NextStep.USERNAME:
      return Step.USERNAME;
    case NextStep.PASSKEY:
      return Step.PASSKEY;
    case NextStep.RECOVER:
      // A restore needs the membership it restores; without it there is nothing to ask.
      return body.recover ? Step.RECOVER : null;
    default:
      return null;
  }
}

/** What `previewStep` shows when there is no server to ask. */
const PREVIEW_SUGGESTIONS = ["ada", "ada.dev", "ada_l"];
const PREVIEW_RECOVER: RecoverState = {
  appId: "preview",
  appName: "this app",
  state: "inactive",
  sinceAt: "2026-01-01T00:00:00.000Z",
};

export function useSignInFlow({
  intent,
  redirectAfterSignIn,
  onResult,
  onAuthenticated,
  navigate,
  allowedOrigins,
  previewStep,
  startAt,
  deferOnboarding,
}: FlowOptions) {
  const refreshSession = useElvixRefresh();
  const [step, setStep] = useState<Step>(previewStep ?? startAt ?? Step.IDENTIFIER);
  const [recover, setRecover] = useState<RecoverState | null>(
    previewStep === Step.RECOVER ? PREVIEW_RECOVER : null,
  );
  const [suggestions, setSuggestions] = useState<string[]>(
    previewStep === Step.USERNAME ? PREVIEW_SUGGESTIONS : [],
  );
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
    async (target: string, token: string | undefined, deferred?: ElvixDeferredStep) => {
      setStep(Step.AUTHENTICATING);
      // Any onboarding step a redirect return carried is done: from here the
      // host may see the session.
      clearOnboardingPending();
      // The provider reads the new session BEFORE the host hears about it, so
      // `useElvixSession()` / `useElvixUser()` are already authenticated when
      // `onResult` runs. Without this the host showed "Sign in" until the tab
      // regained focus. Never rejects.
      await refreshSession();
      const redirect = safeRedirect(target, allowedOrigins);
      onResult?.({
        ok: true,
        phase: "complete",
        method: methodRef.current,
        redirect,
        token,
        ...(deferred ? { deferred } : {}),
      });
      onAuthenticated?.({ ok: true, redirect, token });
      const hostOwnsNav = navigate === false || Boolean(onAuthenticated);
      if (!hostOwnsNav) window.location.href = redirect;
    },
    [onResult, onAuthenticated, navigate, refreshSession, allowedOrigins],
  );

  /** Shows the error inline and reports it; every failure funnels here. */
  const reportError = useCallback(
    (code: string | undefined, message: string) => {
      setError(message);
      onResult?.({ ok: false, error: code ?? "unknown", message });
    },
    [onResult],
  );

  /** Moves the form to an onboarding step, with what that step needs from the landing. */
  const openGate = useCallback((gate: Step, body: Landing) => {
    if (gate === Step.USERNAME) setSuggestions(body.suggestions ?? []);
    if (gate === Step.RECOVER) setRecover(body.recover ?? null);
    setBackendFinal(body.final ?? "/");
    setStep(gate);
  }, []);

  /**
   * Applies a finisher's answer: an onboarding gate moves the form to that
   * step in place, anything else finishes. A cross-origin sign-in returns the
   * session token in the body (no third-party cookie), so it is stored first.
   */
  const applyLanding = useCallback(
    (body: Landing) => {
      if (body.token) setElvixToken(body.token);
      const token = getElvixToken() ?? undefined;
      if (deferOnboarding && isDeferrable(body.next_step)) {
        void finishSignIn(finalRedirect(body.final), token, body.next_step);
        return;
      }
      const gate = gateOf(body);
      if (gate) openGate(gate, body);
      else void finishSignIn(finalRedirect(body.redirect ?? defaultRedirect(intent)), token);
    },
    [intent, finalRedirect, finishSignIn, deferOnboarding, openGate],
  );

  /** Leaves the form for a server-named destination, through the redirect guard. */
  const leaveTo = useCallback(
    (target: string) => {
      window.location.href = safeRedirect(target, allowedOrigins);
    },
    [allowedOrigins],
  );

  /** Finishes an onboarding leg at its destination with the stored bearer. */
  const finishOnboarding = useCallback(
    (backendRedirect?: string) =>
      void finishSignIn(finalRedirect(backendRedirect), getElvixToken() ?? undefined),
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
    leaveTo,
    reportError,
    applyLanding,
  };
}

export type SignInFlow = ReturnType<typeof useSignInFlow>;
