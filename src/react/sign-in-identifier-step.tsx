"use client";

/**
 * The entry step: the method buttons, the "or" line, the email / username field and
 * Continue. Out of `sign-in-steps.tsx` in 0.26. Each gap between its parts is one of the
 * app's card tokens (`--elvix-gap-*`): the form itself has no gap, so no value adds to
 * another and the distance a token names is the distance a person sees.
 */

import { type RefObject, useEffect, useRef } from "react";
import { useT } from "../locale/use-t";
import type { AuthFormProps } from "./elvix-sign-in-form";
import { GoogleOneTap } from "./google-one-tap";
import { runPasskeySignIn } from "./passkey";
import { type Cta, CtaButton } from "./sign-in-controls";
import { passkeySignedIn, reportPasskeyError, SocialButtons } from "./sign-in-social";
import type { OtpStart } from "./use-otp";
import type { SignInFlow } from "./use-sign-in-flow";

/**
 * Whether Google Identity Services runs (any One Tap / popup / auto-select /
 * FedCM flag), and whether it renders Google's own "Continue as <name>"
 * button. That button needs a Google client id (per app, on the bootstrap
 * envelope) AND the SDK running on the elvix origin: elsewhere GIS does not
 * run, its slot stays empty and the Google button would vanish. Short of
 * both, the static redirect link stays, which uses elvix's server-side
 * client id and always works.
 */
function googleIdentityServices(p: AuthFormProps, baseUrl: string, isPreview: boolean) {
  const cfg = p.googleConfig;
  const flags = Boolean(cfg?.oneTap || cfg?.popup || cfg?.autoSelect || cfg?.fedcm);
  const enabled = !isPreview && Boolean(p.methodGoogle) && flags;
  const onElvix = typeof window !== "undefined" && window.location.origin === baseUrl;
  return { enabled, button: enabled && Boolean(p.googleClientId) && onElvix };
}

/** What the identifier field accepts, as its placeholder says. */
function identifierPlaceholderKey(p: AuthFormProps): string {
  if (p.methodEmailOtp && p.methodUsername) return "signin.identifierPlaceholderEmailOrUsername";
  return p.methodUsername
    ? "signin.identifierPlaceholderUsername"
    : "signin.identifierPlaceholderEmail";
}

/** Whether this browser can offer passkeys inside a field's autofill. */
async function conditionalMediationAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  const probe = window.PublicKeyCredential.isConditionalMediationAvailable;
  if (typeof probe !== "function") return false;
  return probe.call(window.PublicKeyCredential).catch(() => {
    // A browser that cannot answer the probe cannot offer passkeys in a field either; the
    // passkey button stays, so nothing is lost and nothing needs saying.
    return false;
  });
}

/**
 * The passkeys offered in the identifier field's autofill (`autocomplete="… webauthn"`,
 * 0.26): a phone shows them over the keyboard, no dialog. The request starts when the person
 * first focuses the field, never on open, and one at a time. Picking a passkey finishes the
 * sign-in as the passkey button does. `stop()` ends the offer before the button's dialog,
 * because a browser holds one passkey request at a time: a second prompt never opens.
 *
 * Only a failure after a passkey was picked is shown. Before that the offer is silent on
 * purpose: the person did not ask for it, the autofill is not shown when the browser cannot
 * do it (across origins without Related Origin Requests), and the button stays, with its
 * hosted fallback and its own errors.
 */
function useConditionalPasskey(flow: SignInFlow, p: AuthFormProps, baseUrl: string) {
  const t = useT();
  const pending = useRef<{ controller: AbortController; done: Promise<void> } | null>(null);
  const enabled = p.mode !== "preview" && Boolean(p.methodPasskey);

  const stop = async () => {
    const current = pending.current;
    if (!current) return;
    current.controller.abort();
    await current.done;
  };
  useEffect(() => () => pending.current?.controller.abort(), []);

  const arm = () => {
    // An app sign-in names its clientId, which comes with the provider's envelope: before
    // it lands there is nothing to ask for, and the next focus asks again.
    const scoped = (p.intent ?? "app") !== "app" || Boolean(p.clientId);
    if (!enabled || !scoped || pending.current) return;
    const controller = new AbortController();
    let picked = false;
    const done = (async () => {
      if (!(await conditionalMediationAvailable()) || controller.signal.aborted) return;
      const result = await runPasskeySignIn(baseUrl, p.clientId, p.intent ?? "app", {
        mediation: "conditional",
        signal: controller.signal,
        onPicked: () => {
          picked = true;
        },
      });
      if (result.ok) passkeySignedIn(flow, result.landing);
      else if (picked) reportPasskeyError(flow, t, result);
      // Not picked: the offer ended (aborted, dismissed) or never showed (a start refused, a
      // browser that cannot do it across origins). The person asked for nothing, so there is
      // nothing to tell them or the host; the passkey button stays, and reports its own.
    })()
      // `runPasskeySignIn` never throws; anything else that does is shown, not left unhandled.
      .catch((e: unknown) =>
        reportPasskeyError(flow, t, {
          error: "passkey_failed",
          message: e instanceof Error ? e.message : undefined,
        }),
      )
      .finally(() => {
        if (pending.current?.controller === controller) pending.current = null;
      });
    pending.current = { controller, done };
  };
  return { enabled, arm, stop };
}
type ConditionalPasskey = ReturnType<typeof useConditionalPasskey>;

type IdentifierStepProps = {
  flow: SignInFlow;
  otp: OtpStart;
  p: AuthFormProps;
  baseUrl: string;
  cta: Cta;
};

/** Google Identity Services, when a GIS flag is on: it draws only its error line here, and
 *  `empty:hidden` keeps its slot out of the layout otherwise. An error line is not a part of
 *  the card's layout, so it has no token: it keeps the 8 px it had above the methods. */
function GisPrompt({ p, baseUrl, gisSlot, button }: GisPromptProps) {
  const cfg = p.googleConfig;
  if (!p.googleClientId) return null;
  return (
    <div className="mb-2 empty:hidden">
      <GoogleOneTap
        baseUrl={baseUrl}
        clientId={p.googleClientId}
        intent={p.intent ?? "app"}
        appClientId={p.clientId}
        renderButton={button}
        buttonContainerRef={gisSlot}
        config={{
          oneTap: cfg?.oneTap ?? false,
          autoSelect: cfg?.autoSelect ?? false,
          popup: cfg?.popup ?? false,
          fedcm: cfg?.fedcm ?? false,
          hostedDomain: cfg?.hostedDomain ?? "",
        }}
      />
    </div>
  );
}
type GisPromptProps = {
  p: AuthFormProps;
  baseUrl: string;
  gisSlot: RefObject<HTMLDivElement | null>;
  button: boolean;
};

function OrLine() {
  const t = useT();
  return (
    <div data-elvix-divider="" className="flex items-center gap-3 my-(--elvix-gap-divider)">
      <span className="h-px flex-1 bg-border-base" />
      <span className="text-[11px] uppercase tracking-[0.08em] text-fg-3">{t("signin.or")}</span>
      <span className="h-px flex-1 bg-border-base" />
    </div>
  );
}

/** The email / username field, Continue `gapFieldButton` under it, and the error line. */
function IdentifierField({
  flow,
  otp,
  p,
  cta,
  passkeyFill,
}: Omit<IdentifierStepProps, "baseUrl"> & { passkeyFill: ConditionalPasskey }) {
  const t = useT();
  const placeholder = t(identifierPlaceholderKey(p));
  const kind = p.methodUsername ? "username" : "email";
  return (
    <>
      <input
        type="text"
        disabled={otp.sending}
        value={otp.identifier}
        onChange={(e) => otp.setIdentifier(e.target.value)}
        onFocus={passkeyFill.arm}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete={passkeyFill.enabled ? `${kind} webauthn` : kind}
        inputMode={p.methodUsername ? "text" : "email"}
        enterKeyHint="go"
        className="elvix-field w-full h-10 px-3 text-[13px] disabled:cursor-not-allowed"
      />
      <CtaButton
        cta={cta}
        submit
        faint
        className="mt-(--elvix-gap-field-button)"
        busy={otp.sending}
        disabled={!otp.valid || otp.sending}
        arrow
      >
        {t("signin.sendCodeButton")}
      </CtaButton>
      {/* 12 px under Continue, as before 0.26 (the form's old 8 px gap plus `mt-1`): an
          error line has no token. */}
      {flow.error && <p className="text-[11.5px] text-red-400 text-center mt-3">{flow.error}</p>}
    </>
  );
}

export function IdentifierStep({ flow, otp, p, baseUrl, cta }: IdentifierStepProps) {
  const t = useT();
  const gisSlot = useRef<HTMLDivElement | null>(null);
  const gis = googleIdentityServices(p, baseUrl, p.mode === "preview");
  const passkeyFill = useConditionalPasskey(flow, p, baseUrl);
  const social = p.methodGoogle || p.methodPasskey || p.methodGithub;
  const typed = p.methodEmailOtp || p.methodUsername;

  if (!social && !typed) {
    return (
      <div className="rounded-[10px] border border-dashed border-border-base bg-surface-hover py-8 px-4 text-center">
        <p className="text-[12.5px] text-fg-3">{t("signin.previewEmptyMethods")}</p>
      </div>
    );
  }
  // No gap on the form: each distance below is one token, never two added up.
  return (
    <form onSubmit={(e) => void otp.start(e)} className="flex flex-col">
      {gis.enabled && <GisPrompt p={p} baseUrl={baseUrl} gisSlot={gisSlot} button={gis.button} />}
      {social && (
        <SocialButtons
          flow={flow}
          p={p}
          baseUrl={baseUrl}
          gisSlot={gis.button ? gisSlot : null}
          beforePasskey={passkeyFill.stop}
        />
      )}
      {typed && social && <OrLine />}
      {typed && <IdentifierField flow={flow} otp={otp} p={p} cta={cta} passkeyFill={passkeyFill} />}
    </form>
  );
}
