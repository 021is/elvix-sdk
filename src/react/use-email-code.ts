"use client";

/**
 * `<ElvixEmailCodeSignIn>`'s state: the form's own flow and code legs, the
 * code its mount sends once (`email-code-once.ts`), and where it went.
 */

import { useCallback, useEffect, useState } from "react";
import { useT } from "../locale/use-t";
import type {
  ElvixEmailCodePreviewStep,
  ElvixEmailCodeSignInProps,
} from "./elvix-email-code-sign-in";
import { useElvixApp, useElvixContext } from "./elvix-provider";
import { codeKey, forgetCode, keepCode, sendOnce } from "./email-code-once";
import type { ElvixSignInResult } from "./types";
import { isEmail, type OtpStart, useOtpStart } from "./use-otp";
import { Step, useSignInFlow } from "./use-sign-in-flow";
import { useStableCallback } from "./use-stable-callback";

/** Sends the mount's code once per address and shows it. */
function useCodeOnMount(key: string, otp: OtpStart, enabled: boolean) {
  const start = useStableCallback(otp.start);
  const resume = useStableCallback(otp.resume);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void sendOnce(key, async () => (await start()) ?? null).then((sent) => {
      if (live && sent) resume(sent.challengeId, sent.sentAt);
    });
    return () => {
      live = false;
    };
  }, [key, enabled, start, resume]);
}

function previewOnboarding(step: ElvixEmailCodePreviewStep | undefined) {
  return step === "username" || step === "passkey" || step === "recover" ? step : undefined;
}

/** The step the block opens on: an address that is not one opens on the email field. */
function openingStep(p: ElvixEmailCodeSignInProps, isPreview: boolean): Step {
  const onEmailField = isPreview ? p.previewStep === "email" : !isEmail(p.email);
  return onEmailField ? Step.IDENTIFIER : Step.CODE;
}

export function useEmailCode(p: ElvixEmailCodeSignInProps) {
  const t = useT();
  const ctx = useElvixContext();
  const { baseUrl } = ctx;
  const app = useElvixApp();
  const isPreview = p.mode === "preview";
  // The provider's own prop, known at the first render: the bootstrap envelope
  // lands later, and a key that changed then sent a second code.
  const clientId = p.clientId ?? ctx.clientId ?? undefined;
  const [sentTo, setSentTo] = useState(p.email.trim());
  // A code that signed the person in is spent: a later mount must not offer it.
  const hostResult = useStableCallback(p.onResult);
  const onResult = useCallback(
    (r: ElvixSignInResult) => {
      if (r.ok) {
        forgetCode(codeKey(baseUrl, clientId, sentTo));
        forgetCode(codeKey(baseUrl, clientId, p.email));
      }
      hostResult(r);
    },
    [baseUrl, clientId, sentTo, p.email, hostResult],
  );
  const flow = useSignInFlow({
    intent: "app",
    onResult,
    onAuthenticated: p.onAuthenticated,
    navigate: false,
    allowedOrigins: app?.allowedOrigins,
    previewStep: isPreview ? previewOnboarding(p.previewStep) : undefined,
    startAt: openingStep(p, isPreview),
    deferOnboarding: p.deferOnboarding,
  });
  const otp = useOtpStart({
    flow,
    baseUrl,
    intent: "app",
    clientId,
    isPreview,
    methodEmailOtp: true,
    methodUsername: false,
    t,
    initialIdentifier: p.email.trim(),
  });
  useCodeOnMount(codeKey(baseUrl, clientId, p.email), otp, isEmail(p.email) && !isPreview);

  /** Sends a code to the address in the field ("Send again", another email). */
  const send = useCallback(async () => {
    const to = otp.identifier.trim();
    const challengeId = await otp.start();
    if (!challengeId) return;
    keepCode(codeKey(baseUrl, clientId, to), { challengeId, sentAt: Date.now() });
    setSentTo(to);
  }, [otp, baseUrl, clientId]);

  /** Moves to `step` with `identifier` in the email field, the error cleared. */
  const switchTo = (step: Step, identifier: string) => {
    otp.setIdentifier(identifier);
    flow.setError(null);
    flow.setStep(step);
  };

  return { t, baseUrl, app, clientId, isPreview, flow, otp, sentTo, send, switchTo };
}
