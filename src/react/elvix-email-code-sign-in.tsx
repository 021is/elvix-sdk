"use client";

/**
 * `<ElvixEmailCodeSignIn>` (0.17): a sign-in that starts at the email code,
 * for a host that already knows the person's address (a wallet payment hands
 * it over). It sends the code once when it mounts and draws only what that
 * moment needs: where the code went, the six boxes, "Send again" and "Use
 * another email". No card, header, method list or footer; the host's card is
 * the frame.
 *
 * Everything after the code is `<ElvixSignInForm>`'s own: the same flow
 * (`useSignInFlow`, so the provider refreshes before `onResult`), the same
 * code legs (`use-otp.ts`) and the same onboarding panes. `deferOnboarding`
 * puts the optional ones off. Sign-in is sign-up: a new address creates the
 * account. The host stays on its page: the block never navigates.
 */

import { Loader2 } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { useT } from "../locale/use-t";
import { brandCssVars, useElvixApp, useElvixContext } from "./elvix-provider";
import { EmailCodeOnboarding } from "./email-code-onboarding";
import { codeKey, forgetCode, keepCode, sendOnce } from "./email-code-once";
import { CompactCodePane, CompactEmailPane } from "./email-code-panes";
import type { Cta } from "./sign-in-controls";
import { type Theme, themeVars, useSignInTheme } from "./sign-in-theme";
import type { ElvixSignInResult } from "./types";
import { isEmail, type OtpStart, useOtpStart } from "./use-otp";
import { Step, useSignInFlow } from "./use-sign-in-flow";
import { useStableCallback } from "./use-stable-callback";

/** Which pane preview mode draws. */
export type ElvixEmailCodePreviewStep = "code" | "email" | "username" | "passkey" | "recover";

export type ElvixEmailCodeSignInProps = {
  /** Where the code goes. Sent once when the block mounts; a new value starts over. */
  email: string;
  /** The app's public clientId. Defaults to `<ElvixProvider clientId>`. */
  clientId?: string;
  /** Fires once at the end, as on `<ElvixSignInForm>`; every failure too, with its code. */
  onResult?: (result: ElvixSignInResult) => void;
  /** Fires with the session after a sign-in, after the provider has refreshed. */
  onAuthenticated?: (r: { ok: true; redirect: string; token?: string }) => void;
  /**
   * Sign in at once when the app would offer a username or a passkey; the
   * result's `deferred` names the step put off, offered again at the next
   * sign-in. Restoring a membership is never put off.
   */
  deferOnboarding?: boolean;
  /** "preview" draws the block with `email` and demo state: no request, no email sent. */
  mode?: "interactive" | "preview";
  /** Preview only: which pane to draw. Default "code". */
  previewStep?: ElvixEmailCodePreviewStep;
  /** Light, dark or the page's ("auto"); defaults to the provider and the Console. */
  theme?: Theme;
  className?: string;
};

export function ElvixEmailCodeSignIn(props: ElvixEmailCodeSignInProps) {
  const { theme, brandPair } = useSignInTheme(props.theme);
  // A pinned theme carries its own brand pair; otherwise the provider's
  // `--elvix-primary` already reaches the block.
  const style: CSSProperties = {
    ...themeVars(theme),
    ...(brandPair ? brandCssVars(brandPair.primary, brandPair.on) : {}),
  };
  const cta: Cta = {
    brand: brandPair?.primary ?? "var(--elvix-primary)",
    onBrand: brandPair?.on ?? "var(--elvix-on-primary)",
  };
  return (
    <div className={props.className} style={style}>
      {/* A new address is a new sign-in: fresh state, its own code. */}
      <EmailCodeBody key={props.email} {...props} cta={cta} />
    </div>
  );
}

/** Sends the mount's code once per address (`email-code-once.ts`) and shows it. */
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

function EmailCodeBody(p: ElvixEmailCodeSignInProps & { cta: Cta }) {
  const t = useT();
  const ctx = useElvixContext();
  const { baseUrl } = ctx;
  const app = useElvixApp();
  const isPreview = p.mode === "preview";
  // The provider's own prop, known at the first render: the bootstrap envelope
  // lands later, and a key that changed then sent a second code.
  const clientId = p.clientId ?? ctx.clientId ?? undefined;
  const valid = isEmail(p.email);
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
    // An address that is not one (a typo in the wallet) opens on the email field.
    startAt: (isPreview ? p.previewStep === "email" : !valid) ? Step.IDENTIFIER : Step.CODE,
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
  useCodeOnMount(codeKey(baseUrl, clientId, p.email), otp, valid && !isPreview);

  const send = useCallback(async () => {
    const to = otp.identifier.trim();
    const challengeId = await otp.start();
    if (!challengeId) return;
    keepCode(codeKey(baseUrl, clientId, to), { challengeId, sentAt: Date.now() });
    setSentTo(to);
  }, [otp, baseUrl, clientId]);
  const switchTo = (step: Step, identifier: string) => {
    otp.setIdentifier(identifier);
    flow.setError(null);
    flow.setStep(step);
  };

  switch (flow.step) {
    case Step.CODE:
      return (
        <CompactCodePane
          flow={flow}
          otp={otp}
          baseUrl={baseUrl}
          isPreview={isPreview}
          sentTo={sentTo}
          onResend={() => void send()}
          onAnotherEmail={() => switchTo(Step.IDENTIFIER, "")}
        />
      );
    case Step.IDENTIFIER:
      return (
        <CompactEmailPane
          flow={flow}
          otp={otp}
          isPreview={isPreview}
          cta={p.cta}
          onSend={() => void send()}
          onBack={otp.challengeId || isPreview ? () => switchTo(Step.CODE, sentTo) : undefined}
        />
      );
    case Step.AUTHENTICATING:
      return (
        <p role="status" className="flex items-center gap-2 text-[13px] text-fg-2">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          {t("signin.signingYouIn")}
        </p>
      );
    default:
      return (
        <EmailCodeOnboarding
          flow={flow}
          baseUrl={baseUrl}
          isPreview={isPreview}
          cta={p.cta}
          form={{ intent: "app", clientId, appName: app?.appName, brandColor: p.cta.brand }}
        />
      );
  }
}
