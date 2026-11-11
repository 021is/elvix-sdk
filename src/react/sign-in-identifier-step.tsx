"use client";

/**
 * The entry step: the method buttons, the "or" line, the email / username field and
 * Continue. Out of `sign-in-steps.tsx` in 0.26. Each gap between its parts is one of the
 * app's card tokens (`--elvix-gap-*`): the form itself has no gap, so no value adds to
 * another and the distance a token names is the distance a person sees.
 */

import { type RefObject, useRef } from "react";
import { useT } from "../locale/use-t";
import type { AuthFormProps } from "./elvix-sign-in-form";
import { GoogleOneTap } from "./google-one-tap";
import { type Cta, CtaButton } from "./sign-in-controls";
import { SocialButtons } from "./sign-in-social";
import type { OtpStart } from "./use-otp";
import { type PasskeySignIn, usePasskeySignIn } from "./use-passkey-sign-in";
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
  passkey,
}: Omit<IdentifierStepProps, "baseUrl"> & { passkey: PasskeySignIn }) {
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
        onFocus={passkey.arm}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete={passkey.autofill ? `${kind} webauthn` : kind}
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
  const passkey = usePasskeySignIn(flow, p, baseUrl);
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
          p={p}
          baseUrl={baseUrl}
          gisSlot={gis.button ? gisSlot : null}
          passkey={passkey}
        />
      )}
      {typed && social && <OrLine />}
      {typed && <IdentifierField flow={flow} otp={otp} p={p} cta={cta} passkey={passkey} />}
    </form>
  );
}
