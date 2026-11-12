"use client";

/**
 * The entry step's two passkey sign-ins, as one (0.26): the passkey button's dialog and the
 * identifier field's autofill offer (`autocomplete="… webauthn"`). A browser holds one
 * passkey request at a time, and a person signs in once, so the two share one lock with
 * every other card on the page (`passkey-lock.ts`):
 *
 * - the autofill offer starts on a focus of the field while no request is open in any card,
 *   never on open, and never while a button's ceremony runs;
 * - the button ends any open offer before its dialog, and does nothing when that offer
 *   already has a passkey picked (its sign-in is finishing) or the step is gone;
 * - the offer has no hosted fallback, on purpose: the person did not ask for it, so it never
 *   sends them away. Before a pick it is silent; the button keeps the fallback and errors.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useT } from "../locale/use-t";
import type { AuthFormProps } from "./elvix-sign-in-form";
import { type PasskeySignInResult, runPasskeySignIn } from "./passkey";
import {
  holdCeremony,
  holdOffer,
  PasskeyLock,
  type PasskeyOffer,
  passkeyLockState,
  pickOffer,
  releaseCeremony,
  releaseOffer,
  subscribePasskeyLock,
} from "./passkey-lock";
import { orAbort } from "./passkey-timeout";
import { isSameOrigin } from "./session";
import { hostedCeremonyUrl, humanError, type Translator } from "./sign-in-copy";
import type { Landing, SignInFlow } from "./use-sign-in-flow";

/** A passkey sign-in that worked: the server's landing decides what comes next. */
function passkeySignedIn(flow: SignInFlow, landing: Landing) {
  flow.methodRef.current = "passkey";
  flow.applyLanding(landing);
}

/** A passkey sign-in that failed, in elvix's words for its code: a browser's, an
 *  extension's or a server's own text never reaches the page or `onResult`. */
function reportPasskeyError(flow: SignInFlow, t: Translator, result: { error: string }) {
  flow.reportError(result.error, humanError(t, result.error) ?? t("signin.errorPasskeyVerify"));
}

/** Whether this browser can offer passkeys inside a field's autofill; `false` at once when
 *  `signal` aborts, for a probe that never answers must not hold the offer. */
async function conditionalMediationAvailable(signal: AbortSignal): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  const probe = window.PublicKeyCredential.isConditionalMediationAvailable;
  if (typeof probe !== "function") return false;
  const answer = probe.call(window.PublicKeyCredential).catch(() => {
    // A browser that cannot answer the probe cannot offer passkeys in a field either; the
    // passkey button stays, so nothing is lost and nothing needs saying.
    return false;
  });
  return orAbort(answer, signal, false);
}

/** An error past every handler of ours (a host callback that throws): reported as the
 *  uncaught error it is, to the page's `error` listeners and the console. */
function reportUncaught(error: unknown) {
  if (typeof globalThis.reportError === "function") globalThis.reportError(error);
  else console.error(error);
}

/** An offer, whole before anything runs; `end` resolves its `done`, which nothing rejects. */
function newOffer() {
  let end: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    end = resolve;
  });
  const offer: PasskeyOffer = { controller: new AbortController(), picked: false, done };
  return { offer, end: () => end() };
}

/** A server renders no request open. */
const serverLockState = () => PasskeyLock.FREE;

export type PasskeySignIn = {
  /** A passkey sign-in is running, in this card or another. */
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
  // A sign-in running in any card (a ceremony, a picked offer, one whose card is gone)
  // shows on every button.
  const lock = useSyncExternalStore(subscribePasskeyLock, passkeyLockState, serverLockState);
  const busy = lock === PasskeyLock.BUSY;
  /** This card's own offer, ended when the card goes. */
  const offer = useRef<PasskeyOffer | null>(null);
  const mounted = useRef(true);
  const autofill = p.mode !== "preview" && Boolean(p.methodPasskey);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      offer.current?.controller.abort();
    };
  }, []);

  const onOffer = (picked: boolean, result: PasskeySignInResult) => {
    if (result.ok) passkeySignedIn(flow, result.landing);
    else if (picked) reportPasskeyError(flow, t, result);
    // Not picked: the offer ended (aborted, dismissed) or never showed (a start refused, a
    // browser that cannot do it across origins). The person asked for nothing, so there is
    // nothing to tell them or the host; the passkey button stays, and reports its own.
  };

  const arm = () => {
    // Before the envelope names the app's clientId, `runPasskeySignIn` asks for nothing
    // (`missing_client_id`, silent here), and the next focus asks again.
    if (!autofill) return;
    const { offer: o, end } = newOffer();
    if (!holdOffer(o)) return;
    offer.current = o;
    void (async () => {
      const able = await conditionalMediationAvailable(o.controller.signal);
      if (!able || o.controller.signal.aborted) return;
      const result = await runPasskeySignIn(baseUrl, p.clientId, p.intent ?? "app", {
        kind: "autofill",
        signal: o.controller.signal,
        onPicked: () => pickOffer(o),
      });
      onOffer(o.picked, result);
    })()
      // Neither the probe nor `runPasskeySignIn` throws: what does is the host's own callback
      // (`onResult`) inside `onOffer`. It is reported as its own uncaught error, never as a
      // sign-in failure with its words on the page, and `done` still resolves below.
      .catch(reportUncaught)
      .finally(() => {
        releaseOffer(o);
        if (offer.current === o) offer.current = null;
        end();
      });
  };

  const run = async () => {
    if (p.mode === "preview") return;
    // A ceremony already open (this card's or another's) holds the browser's one request,
    // and a passkey picked from an autofill is already signing the person in.
    if (!(await holdCeremony())) return;
    try {
      flow.setError(null);
      // A step that is gone has no dialog to open: one sign-in, one session.
      if (mounted.current) await runDialog();
    } finally {
      releaseCeremony();
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
    // Any non-cancel failure of the browser's prompt (a browser without Related Origin
    // Requests, an rpId it refuses) is one the hosted page on elvix.is gets past.
    if (!isSameOrigin(baseUrl) && p.clientId && result.error === "passkey_failed") {
      window.location.assign(hostedCeremonyUrl(baseUrl, "passkey", p.clientId));
      return;
    }
    reportPasskeyError(flow, t, result);
  };

  const signIn: PasskeySignIn = { busy, run, autofill, arm };
  return signIn;
}
