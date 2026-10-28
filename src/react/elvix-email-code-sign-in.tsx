"use client";

/**
 * `<ElvixEmailCodeSignIn>` (0.17): a sign-in that starts at the email code,
 * for a host that already knows the person's address (a wallet payment hands
 * it over). It sends the code once when it mounts and draws only what that
 * moment needs: an optional title and line, where the code went, the six
 * boxes, "Send again" and "Use another email". No card, logo, method list or
 * footer; the host's card is the frame.
 *
 * Everything after the code is `<ElvixSignInForm>`'s own: the same flow
 * (`useSignInFlow`, so the provider refreshes before the host hears of the
 * sign-in), the same code legs (`use-otp.ts`) and the same onboarding panes.
 * `deferOnboarding` puts the optional ones off. Sign-in is sign-up: a new
 * address creates the account. The block never navigates: `onSignedIn` is
 * where the host does what comes next. State lives in `use-email-code.ts`.
 */

import { Loader2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { brandCssVars } from "./elvix-provider";
import { EmailCodeOnboarding } from "./email-code-onboarding";
import {
  CompactCodePane,
  CompactEmailPane,
  type ElvixEmailCodeClassNames,
  type PaneLook,
} from "./email-code-panes";
import type { Cta } from "./sign-in-controls";
import { type Theme, themeVars, useSignInTheme } from "./sign-in-theme";
import type { ElvixSignInResult, ElvixSignInResultOk } from "./types";
import { useEmailCode } from "./use-email-code";
import { Step } from "./use-sign-in-flow";

/** Which pane preview mode draws. */
export type ElvixEmailCodePreviewStep = "code" | "email" | "username" | "passkey" | "recover";

export type ElvixEmailCodeSignInProps = {
  /** Where the code goes. Sent once when the block mounts; a new value starts over. */
  email: string;
  /** The app's public clientId. Defaults to `<ElvixProvider clientId>`. */
  clientId?: string;
  /** A heading above the block. A string renders as an `<h3>`; any element as given. Omit to hide. */
  title?: ReactNode;
  /** A line under the title. A string renders as a `<p>`; any element as given. Omit to hide. */
  description?: ReactNode;
  /**
   * The person is signed in: the provider has already refreshed, so
   * `useElvixSession()` is authenticated. Show the next thing here: the
   * ticket, the page they came for. Fires once.
   */
  onSignedIn?: (session: ElvixSignInResultOk) => void;
  /** What the block shows once signed in, in place of everything else. Default: nothing. */
  signedIn?: ReactNode;
  /** Fires once at the end, as on `<ElvixSignInForm>`; every failure too, with its code. */
  onResult?: (result: ElvixSignInResult) => void;
  /** The short success shape of `<ElvixSignInForm>`. Prefer `onSignedIn`. */
  onAuthenticated?: (r: { ok: true; redirect: string; token?: string }) => void;
  /**
   * Sign in at once when the app would offer a username or a passkey; the
   * result's `deferred` names the step put off, offered again at the next
   * sign-in. Restoring a membership is never put off.
   */
  deferOnboarding?: boolean;
  /** Focus the code boxes (or the email field) when they appear. Default true. */
  autoFocus?: boolean;
  /** "preview" draws the block with `email` and demo state: no request, no email sent. */
  mode?: "interactive" | "preview";
  /** Preview only: which pane to draw. Default "code". */
  previewStep?: ElvixEmailCodePreviewStep;
  /** Light, dark or the page's ("auto"); defaults to the provider and the Console. */
  theme?: Theme;
  /** More classes on the block's root. */
  className?: string;
  /** More classes on its parts. The fields' look is set by `--elvix-field*` variables. */
  classNames?: ElvixEmailCodeClassNames;
};

type Look = { cta: Cta; style: CSSProperties; look: PaneLook };

export function ElvixEmailCodeSignIn(props: ElvixEmailCodeSignInProps) {
  const { theme, brandPair } = useSignInTheme(props.theme);
  // A pinned theme carries its own brand pair; otherwise the provider's
  // `--elvix-primary` already reaches the block.
  const frame: Look = {
    style: {
      ...themeVars(theme),
      ...(brandPair ? brandCssVars(brandPair.primary, brandPair.on) : {}),
    },
    cta: {
      brand: brandPair?.primary ?? "var(--elvix-primary)",
      onBrand: brandPair?.on ?? "var(--elvix-on-primary)",
    },
    look: { classNames: props.classNames ?? {}, autoFocus: props.autoFocus ?? true },
  };
  // A new address is a new sign-in: fresh state, its own code.
  return <EmailCodeBody key={props.email} {...props} {...frame} />;
}

/** The optional title and line; nothing at all when both are left out. */
function Header({ p }: { p: ElvixEmailCodeSignInProps }) {
  if (!p.title && !p.description) return null;
  const cn = p.classNames ?? {};
  const title =
    typeof p.title === "string" ? (
      <h3 className={`text-[15px] font-semibold leading-snug text-fg-1 ${cn.title ?? ""}`}>
        {p.title}
      </h3>
    ) : (
      p.title
    );
  const description =
    typeof p.description === "string" ? (
      <p className={`text-[13px] leading-[1.45] text-fg-2 ${cn.description ?? ""}`}>
        {p.description}
      </p>
    ) : (
      p.description
    );
  return (
    <div className={`flex flex-col gap-1 ${cn.header ?? ""}`}>
      {title}
      {description}
    </div>
  );
}

function EmailCodeBody(p: ElvixEmailCodeSignInProps & Look) {
  const state = useEmailCode(p);
  // One column, one gap: a hidden title or line leaves no margin behind.
  return (
    <div className={`flex flex-col gap-4 ${p.className ?? ""}`} style={p.style}>
      {state.signedIn ? (
        p.signedIn
      ) : (
        <>
          <Header p={p} />
          <EmailCodePane p={p} state={state} />
        </>
      )}
    </div>
  );
}

function EmailCodePane({
  p,
  state,
}: {
  p: ElvixEmailCodeSignInProps & Look;
  state: ReturnType<typeof useEmailCode>;
}) {
  const { t, baseUrl, app, clientId, isPreview, flow, otp, sentTo, send, switchTo } = state;
  switch (flow.step) {
    case Step.CODE:
      return (
        <CompactCodePane
          flow={flow}
          otp={otp}
          baseUrl={baseUrl}
          isPreview={isPreview}
          look={p.look}
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
          look={p.look}
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
