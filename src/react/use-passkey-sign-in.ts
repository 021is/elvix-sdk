"use client";

/**
 * The entry step's two passkey sign-ins, as one (0.26): the passkey button's dialog and the
 * identifier field's autofill offer (`autocomplete="… webauthn"`). A browser holds one
 * passkey request at a time, and a person signs in once, so the two share one state:
 *
 * - the autofill offer starts on the field's first focus, never on open, and never while the
 *   button's ceremony runs;
 * - the button ends the offer before its dialog, and does nothing when the offer already has
 *   a passkey picked (its sign-in is finishing) or the step is gone;
 * - the offer has no hosted fallback, on purpose: the person did not ask for it, so it never
 *   sends them away. Before a pick it is silent; the button keeps the fallback and errors.
 */

import { useEffect, useRef, useState } from "react";
import { useT } from "../locale/use-t";
import type { AuthFormProps } from "./elvix-sign-in-form";
import { type PasskeySignInResult, runPasskeySignIn } from "./passkey";
import { isSameOrigin } from "./session";
import { hostedCeremonyUrl, humanError, type Translator } from "./sign-in-copy";
import type { Landing, SignInFlow } from "./use-sign-in-flow";

/** An error from the inline ceremony that the hosted page on elvix.is
 *  (where the rpId matches) gets past: a browser without Related Origin
 *  Requests support. */
const RP_ID_MISMATCH = /rp\.?id|RelyingParty|cannot be used with the current origin|SecurityError/i;

/** A passkey sign-in that worked: the server's landing decides what comes next. */
function passkeySignedIn(flow: SignInFlow, landing: Landing) {
  flow.methodRef.current = "passkey";
  flow.applyLanding(landing);
}

/** A passkey sign-in that failed, in the server's words or the code's. */
function reportPasskeyError(
  flow: SignInFlow,
  t: Translator,
  result: { error: string; message?: string },
) {
  flow.reportError(
    result.error,
    result.message ?? humanError(t, result.error) ?? t("signin.errorPasskeyVerify"),
  );
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

type Offer = { controller: AbortController; picked: boolean; done: Promise<void> };

export type PasskeySignIn = {
  /** The button's ceremony is running. */
  busy: boolean;
  /** The button: end the offer, then the dialog (or the hosted page across origins). */
  run: () => Promise<void>;
  /** The field: passkeys on, so its autocomplete names `webauthn`. */
  autofill: boolean;
  /** The field's focus: start the offer, once, when nothing else is running. */
  arm: () => void;
};

export function usePasskeySignIn(flow: SignInFlow, p: AuthFormProps, baseUrl: string) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const button = useRef(false);
  const offer = useRef<Offer | null>(null);
  const mounted = useRef(true);
  const autofill = p.mode !== "preview" && Boolean(p.methodPasskey);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      offer.current?.controller.abort();
    };
  }, []);

  /** Ends the offer; true when it had a passkey picked (its sign-in is under way). */
  const stop = async (): Promise<boolean> => {
    const current = offer.current;
    if (!current) return false;
    current.controller.abort();
    await current.done;
    return current.picked;
  };

  const onOffer = (o: Offer, result: PasskeySignInResult) => {
    if (result.ok) passkeySignedIn(flow, result.landing);
    else if (o.picked) reportPasskeyError(flow, t, result);
    // Not picked: the offer ended (aborted, dismissed) or never showed (a start refused, a
    // browser that cannot do it across origins). The person asked for nothing, so there is
    // nothing to tell them or the host; the passkey button stays, and reports its own.
  };

  const arm = () => {
    // An app sign-in names its clientId, which comes with the provider's envelope: before
    // it lands there is nothing to ask for, and the next focus asks again.
    const scoped = (p.intent ?? "app") !== "app" || Boolean(p.clientId);
    if (!autofill || !scoped || button.current || offer.current) return;
    const o: Offer = { controller: new AbortController(), picked: false, done: Promise.resolve() };
    o.done = (async () => {
      if (!(await conditionalMediationAvailable()) || o.controller.signal.aborted) return;
      const result = await runPasskeySignIn(baseUrl, p.clientId, p.intent ?? "app", {
        kind: "autofill",
        signal: o.controller.signal,
        onPicked: () => {
          o.picked = true;
        },
      });
      onOffer(o, result);
    })()
      // `runPasskeySignIn` never throws; anything else that does is shown, not left unhandled.
      .catch((e: unknown) =>
        reportPasskeyError(flow, t, {
          error: "passkey_failed",
          message: e instanceof Error ? e.message : undefined,
        }),
      )
      .finally(() => {
        if (offer.current === o) offer.current = null;
      });
    offer.current = o;
  };

  const run = async () => {
    if (p.mode === "preview" || button.current) return;
    button.current = true;
    flow.setError(null);
    setBusy(true);
    try {
      // A passkey picked from the autofill is already signing the person in, and a step that
      // is gone has no dialog to open: one sign-in, one session.
      if ((await stop()) || !mounted.current) return;
      await runDialog();
    } finally {
      button.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const runDialog = async () => {
    const result = await runPasskeySignIn(baseUrl, p.clientId, p.intent ?? "app");
    if (result.ok) {
      passkeySignedIn(flow, result.landing);
      return;
    }
    if (result.error === "passkey_cancelled") {
      // The user dismissed the prompt: nothing to show, but the host hears it.
      p.onResult?.({ ok: false, error: result.error });
      return;
    }
    const hostedHelps =
      RP_ID_MISMATCH.test(result.message ?? "") || result.error === "passkey_failed";
    if (!isSameOrigin(baseUrl) && p.clientId && hostedHelps) {
      window.location.assign(hostedCeremonyUrl(baseUrl, "passkey", p.clientId));
      return;
    }
    reportPasskeyError(flow, t, result);
  };

  const signIn: PasskeySignIn = { busy, run, autofill, arm };
  return signIn;
}
