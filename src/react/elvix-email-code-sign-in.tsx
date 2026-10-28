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
 * account. The host stays on its page: the block never navigates. State lives
 * in `use-email-code.ts`.
 */

import { Loader2 } from "lucide-react";
import type { CSSProperties } from "react";
import { brandCssVars } from "./elvix-provider";
import { EmailCodeOnboarding } from "./email-code-onboarding";
import { CompactCodePane, CompactEmailPane } from "./email-code-panes";
import type { Cta } from "./sign-in-controls";
import { type Theme, themeVars, useSignInTheme } from "./sign-in-theme";
import type { ElvixSignInResult } from "./types";
import { useEmailCode } from "./use-email-code";
import { Step } from "./use-sign-in-flow";

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

function EmailCodeBody(p: ElvixEmailCodeSignInProps & { cta: Cta }) {
  const { t, baseUrl, app, clientId, isPreview, flow, otp, sentTo, send, switchTo } =
    useEmailCode(p);
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
