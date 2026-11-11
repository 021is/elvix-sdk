"use client";

/**
 * The entry step's method buttons: Google, GitHub and passkey, in importance order. Out of
 * `sign-in-steps.tsx` in 0.26 (889 lines, recorded debt). The gap between them is the app's
 * `gapMethods` (`--elvix-gap-methods`, 8 px by default).
 */

import { Fingerprint, Loader2 } from "lucide-react";
import { type RefObject, useState } from "react";
import { useT } from "../locale/use-t";
import type { AuthFormProps } from "./elvix-sign-in-form";
import { runPasskeySignIn } from "./passkey";
import { isSameOrigin } from "./session";
import { hostedCeremonyUrl, humanError, OAuthProvider, oauthStartHref } from "./sign-in-copy";
import type { SignInFlow } from "./use-sign-in-flow";

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M16.51 8.18c0-.58-.05-1.13-.15-1.66H9v3.14h4.21a3.6 3.6 0 0 1-1.56 2.36v1.96h2.52c1.47-1.36 2.34-3.36 2.34-5.8z"
      />
      <path
        fill="#34A853"
        d="M9 17c2.1 0 3.87-.7 5.17-1.9l-2.52-1.96c-.7.47-1.6.74-2.65.74-2.04 0-3.77-1.38-4.38-3.23H2.02v2.03A8 8 0 0 0 9 17z"
      />
      <path
        fill="#FBBC05"
        d="M4.62 10.65A4.8 4.8 0 0 1 4.36 9c0-.57.1-1.12.26-1.65V5.32H2.02A8 8 0 0 0 1 9c0 1.29.31 2.5.86 3.58l2.51-1.93z"
      />
      <path
        fill="#EA4335"
        d="M9 4.77c1.14 0 2.17.4 2.98 1.17l2.23-2.23A7.84 7.84 0 0 0 9 1 8 8 0 0 0 1.86 5.32l2.51 1.93C5.23 5.17 6.96 4.77 9 4.77z"
      />
    </svg>
  );
}

function GithubGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.96c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const SOCIAL_CLASS =
  "cursor-pointer w-full inline-flex items-center justify-center gap-2 h-10 rounded-[10px] font-medium text-[13px] border border-border-base bg-surface text-fg-1 hover:bg-surface-hover transition";

/** An error from the inline ceremony that the hosted page on elvix.is
 *  (where the rpId matches) gets past: a browser without Related Origin
 *  Requests support. */
const RP_ID_MISMATCH = /rp\.?id|RelyingParty|cannot be used with the current origin|SecurityError/i;

/** The passkey sign-in button's handler: the inline ceremony, falling back
 *  to the hosted one cross-origin, whose return arrives as `#elvix_token`.
 *  `beforePrompt` ends the field's autofill offer first: a browser holds one
 *  passkey request at a time, so the dialog would otherwise never open. */
function usePasskeySignIn(
  flow: SignInFlow,
  p: AuthFormProps,
  baseUrl: string,
  beforePrompt: () => Promise<void>,
) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (p.mode === "preview" || busy) return;
    flow.setError(null);
    setBusy(true);
    await beforePrompt();
    const result = await runPasskeySignIn(baseUrl, p.clientId, p.intent ?? "app");
    setBusy(false);
    if (result.ok) {
      flow.methodRef.current = "passkey";
      flow.applyLanding(result.landing);
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
    flow.reportError(
      result.error,
      result.message ?? humanError(t, result.error) ?? t("signin.errorPasskeyVerify"),
    );
  };
  return { busy, run };
}

export type SocialButtonsProps = {
  flow: SignInFlow;
  p: AuthFormProps;
  baseUrl: string;
  /** Where Google Identity Services renders its own button, when it does. */
  gisSlot: RefObject<HTMLDivElement | null> | null;
  /** Ends the identifier field's passkey autofill offer before the passkey dialog opens. */
  beforePasskey: () => Promise<void>;
};

/** A method's place in the grid: its short or long label, and whether it spans the row. */
type Tile = { short: boolean; span: string };

/**
 * In grid mode the methods tile two-up with short labels; an odd one out, always the last,
 * spans the row and keeps its long label. Stacked, every one is long and full width.
 */
function tiles(p: AuthFormProps): Record<"google" | "github" | "passkey", Tile> {
  const shown = [p.methodGoogle, p.methodGithub, p.methodPasskey].filter(Boolean).length;
  const grid = p.socialLayout === "grid" && shown >= 2;
  const last = p.methodPasskey ? "passkey" : p.methodGithub ? "github" : "google";
  const tile = (which: string): Tile => {
    const wide = grid && shown % 2 === 1 && which === last;
    return { short: grid && !wide, span: wide ? " col-span-2" : "" };
  };
  return { google: tile("google"), github: tile("github"), passkey: tile("passkey") };
}

type MethodProps = { p: AuthFormProps; baseUrl: string; tile: Tile };

function GoogleMethod({
  p,
  baseUrl,
  tile,
  gisSlot,
}: MethodProps & Pick<SocialButtonsProps, "gisSlot">) {
  const t = useT();
  const isPreview = p.mode === "preview";
  if (gisSlot) {
    // GIS renders its own button here, with its own accessible name;
    // the slot only reserves the height while it hydrates.
    return <div ref={gisSlot} className={`w-full min-h-10${tile.span}`} />;
  }
  const href = oauthStartHref(OAuthProvider.GOOGLE, baseUrl, p.intent ?? "app", p.clientId);
  return (
    <a
      href={isPreview ? "#" : href}
      onClick={isPreview ? (e) => e.preventDefault() : undefined}
      className={`${SOCIAL_CLASS}${tile.span}`}
    >
      <GoogleGlyph />
      {tile.short ? t("signin.googleButtonShort") : t("signin.googleButton")}
    </a>
  );
}

function GithubMethod({ p, baseUrl, tile }: MethodProps) {
  const t = useT();
  const isPreview = p.mode === "preview";
  const [redirecting, setRedirecting] = useState(false);
  const go = () => {
    // Paint "Signing in…" before the browser leaves for GitHub.
    setRedirecting(true);
    const href = oauthStartHref(OAuthProvider.GITHUB, baseUrl, p.intent ?? "app", p.clientId);
    requestAnimationFrame(() => window.location.assign(href));
  };
  return (
    <button
      type="button"
      disabled={isPreview || redirecting}
      onClick={isPreview ? undefined : go}
      aria-label={t("signin.githubButton")}
      className={`${SOCIAL_CLASS} disabled:cursor-not-allowed disabled:opacity-70${tile.span}`}
    >
      {redirecting ? <Loader2 className="size-4 animate-spin" /> : <GithubGlyph />}
      {redirecting && t("signin.signingIn")}
      {!redirecting && (tile.short ? "GitHub" : t("signin.githubButton"))}
    </button>
  );
}

function PasskeyMethod({
  flow,
  p,
  baseUrl,
  tile,
  beforePasskey,
}: MethodProps & Pick<SocialButtonsProps, "flow" | "beforePasskey">) {
  const t = useT();
  const passkey = usePasskeySignIn(flow, p, baseUrl, beforePasskey);
  return (
    <button
      type="button"
      disabled={passkey.busy}
      onClick={p.mode === "preview" ? undefined : () => void passkey.run()}
      className={`${SOCIAL_CLASS} disabled:cursor-not-allowed disabled:opacity-60${tile.span}`}
    >
      {passkey.busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Fingerprint className="size-4" />
      )}
      {tile.short ? t("signin.passkeyButtonShort") : t("signin.passkeyButton")}
    </button>
  );
}

/** Google, GitHub and passkey in importance order, `gapMethods` apart. */
export function SocialButtons({ flow, p, baseUrl, gisSlot, beforePasskey }: SocialButtonsProps) {
  const tile = tiles(p);
  const grid = tile.google.short || tile.github.short || tile.passkey.short;
  return (
    <div
      data-elvix-methods=""
      className={
        grid
          ? "grid grid-cols-2 gap-(--elvix-gap-methods)"
          : "flex flex-col gap-(--elvix-gap-methods)"
      }
    >
      {p.methodGoogle && (
        <GoogleMethod p={p} baseUrl={baseUrl} tile={tile.google} gisSlot={gisSlot} />
      )}
      {p.methodGithub && <GithubMethod p={p} baseUrl={baseUrl} tile={tile.github} />}
      {p.methodPasskey && (
        <PasskeyMethod
          flow={flow}
          p={p}
          baseUrl={baseUrl}
          tile={tile.passkey}
          beforePasskey={beforePasskey}
        />
      )}
    </div>
  );
}
