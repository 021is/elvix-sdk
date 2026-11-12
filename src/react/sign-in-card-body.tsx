"use client";

import { Loader2 } from "lucide-react";
import type { ReactElement } from "react";
import { useT } from "../locale/use-t";
import {
  ElvixSessionStatus,
  useElvixApp,
  useElvixContext,
  useElvixSession,
} from "./elvix-provider";
import type { AuthFormProps } from "./elvix-sign-in-form";
import { IdentifierStep } from "./sign-in-identifier-step";
import {
  AuthenticatingPane,
  CodeStep,
  LegalFooter,
  PasskeyStep,
  RecoverStep,
  SignInHeader,
  UsernameStep,
} from "./sign-in-steps";
import { type OtpStart, useOtpStart } from "./use-otp";
import { type SignInFlow, Step, useSignInFlow } from "./use-sign-in-flow";
import { useSignInReturns } from "./use-sign-in-returns";

type StepPaneProps = { p: AuthFormProps; flow: SignInFlow; otp: OtpStart; baseUrl: string };

/** The pane of the step the flow is on, one at a time, in place. Every `Step` is named, so a
 *  new step fails the type check until it has a pane. */
function StepPane({ p, flow, otp, baseUrl }: StepPaneProps): ReactElement {
  const isPreview = p.mode === "preview";
  const cta = { brand: p.brandColor, onBrand: p.onBrandColor ?? "#ffffff" };
  const shared = { flow, baseUrl, isPreview, cta };
  switch (flow.step) {
    case Step.AUTHENTICATING:
      return <AuthenticatingPane brandColor={p.brandColor} appName={p.appName} />;
    case Step.CODE:
      return <CodeStep {...shared} otp={otp} />;
    case Step.USERNAME:
      return <UsernameStep {...shared} />;
    case Step.PASSKEY:
      return <PasskeyStep {...shared} p={p} />;
    case Step.RECOVER:
      return <RecoverStep flow={flow} baseUrl={baseUrl} />;
    case Step.IDENTIFIER:
      return <IdentifierStep flow={flow} baseUrl={baseUrl} cta={cta} otp={otp} p={p} />;
  }
}

/**
 * The card's content: header, the current step, the host's `belowMethods` slot, and the
 * legal footer. Every step renders inside the same card, with no URL hop: the person
 * finishes the whole flow, onboarding included, without leaving it.
 */
export function SignInCardBody({ p }: { p: AuthFormProps }) {
  const { baseUrl } = useElvixContext();
  const sessionStatus = useElvixSession();
  // The Console envelope, for what the form does not thread through as props (the gate badge).
  const appCtx = useElvixApp();
  const t = useT();
  const isPreview = p.mode === "preview";
  const intent = p.intent ?? "app";
  const flow = useSignInFlow({
    intent,
    redirectAfterSignIn: p.redirectAfterSignIn,
    onResult: p.onResult,
    onAuthenticated: p.onAuthenticated,
    navigate: p.navigate ?? true,
    allowedOrigins: appCtx?.allowedOrigins,
    previewStep: isPreview ? p.previewStep : undefined,
  });
  useSignInReturns({
    flow,
    baseUrl,
    isPreview,
    redirectIfAuthenticated: p.redirectIfAuthenticated ?? false,
    sessionStatus,
    t,
    onResult: p.onResult,
  });
  const otp = useOtpStart({
    flow,
    baseUrl,
    intent,
    clientId: p.clientId,
    isPreview,
    methodEmailOtp: Boolean(p.methodEmailOtp),
    methodUsername: Boolean(p.methodUsername),
    t,
  });

  // SSO silent-resume: while the opted-in session probe runs, hold a loader
  // so a signed-in user never sees the form flash before being sent on.
  if (p.redirectIfAuthenticated && !isPreview && sessionStatus === ElvixSessionStatus.LOADING) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10">
        <Loader2 className="size-5 animate-spin text-fg-3" />
        <p className="text-[13px] text-fg-3">{t("signin.signingYouIn")}</p>
      </div>
    );
  }

  return (
    <>
      {/* The app's text font reaches the head, the step and the host's line, and stops here:
          the legal line keeps the page's font, so no font (a symbol one, a blank one) can
          turn it unreadable. */}
      <div data-elvix-app-type="" className="[font-family:var(--elvix-font-text)]">
        {(p.showHeader ?? true) && (
          <SignInHeader p={p} flow={flow} identifier={otp.identifier} gate={appCtx?.signinGate} />
        )}
        <StepPane p={p} flow={flow} otp={otp} baseUrl={baseUrl} />
        {/* The host's line under the methods (a tagline, "Request access"), on the entry step
            only, where it does not compete with an active flow; `gapButtonSlot` above it (20
            px by default), or it sat glued to Continue (Edvard, 2026-11-11). */}
        {flow.step === Step.IDENTIFIER && p.belowMethods && (
          <div data-elvix-below-methods="" className="mt-(--elvix-gap-button-slot)">
            {p.belowMethods}
          </div>
        )}
      </div>
      <LegalFooter p={p} />
    </>
  );
}
