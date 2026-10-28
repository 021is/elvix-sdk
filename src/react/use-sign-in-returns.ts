"use client";

/**
 * What the page arrived with, for `<ElvixSignInForm>`: an active session to
 * resume, a `#elvix_token` redirect return, a Google `?onboarding=1` return, a
 * blocked-OAuth `?elvix_error`. Each one ends in the flow's own funnel
 * (`applyLanding` → `finishSignIn`).
 */

import { useEffect, useRef } from "react";
import { ElvixSessionStatus } from "./elvix-provider";
import { send } from "./profile-request";
import {
  authInit,
  consumeSignedOutFlag,
  type ElvixLandingPayload,
  getElvixToken,
  takeJustReturnedLanding,
  takeJustReturnedToken,
  wasReturnTokenConsumed,
} from "./session";
import { humanError, type Translator } from "./sign-in-copy";
import { unwrapEnvelope } from "./spine-fetch";
import { toast } from "./toast";
import type { ElvixSignInResult } from "./types";
import type { Landing, NextStep, RecoverKind, Reply, SignInFlow } from "./use-sign-in-flow";
import { useStableCallback } from "./use-stable-callback";

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
    void finishSignIn(finalRedirect(), getElvixToken() ?? undefined);
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
      void finishSignIn(finalRedirect(), token);
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
