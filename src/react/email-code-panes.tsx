"use client";

/**
 * The two panes of `<ElvixEmailCodeSignIn>` that the card does not have: the
 * code, under one line that says where it went, and "use another email". No
 * header, no card: the host's card is the frame. The onboarding steps after
 * the code are the card's own panes (`sign-in-steps.tsx`).
 */

import { Loader2 } from "lucide-react";
import { type FormEvent, type ReactNode, useId } from "react";
import { useT } from "../locale/use-t";
import { FIELD_COMPACT } from "./brand-focus";
import { OtpInput } from "./otp-input";
import { STACK_2, STACK_3 } from "./pane-layout";
import { type Cta, CtaButton, ErrorLine } from "./sign-in-controls";
import { type OtpStart, useOtpVerify } from "./use-otp";
import type { SignInFlow } from "./use-sign-in-flow";

/** The parts of the block a host can add classes to (`classNames`). */
export type ElvixEmailCodeSlot =
  | "root"
  | "header"
  | "title"
  | "description"
  | "line"
  | "code"
  | "field"
  | "button"
  | "links"
  | "link"
  | "error";
export type ElvixEmailCodeClassNames = Partial<Record<ElvixEmailCodeSlot, string>>;

/** What every pane takes from the host's props. */
export type PaneLook = { classNames: ElvixEmailCodeClassNames; autoFocus: boolean };

/** What preview mode shows in the boxes: a filled demo state, never sent. */
const PREVIEW_CODE = "482913";

const LINK_CLASS =
  "cursor-pointer inline-flex items-center min-h-8 rounded-md px-2 -mx-2 text-[12px] text-fg-2 hover:text-fg-1 hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-fg-3 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--elvix-primary)] transition";

function SmallLink(p: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={p.onClick}
      disabled={p.disabled}
      className={`${LINK_CLASS} ${p.className ?? ""}`}
    >
      {p.children}
    </button>
  );
}

type CodePaneProps = {
  flow: SignInFlow;
  otp: OtpStart;
  baseUrl: string;
  isPreview: boolean;
  look: PaneLook;
  /** The address the code in `otp` went to. */
  sentTo: string;
  onResend: () => void;
  onAnotherEmail: () => void;
};

const SENDING = "signin.codeSending";

/** Where the code stands: on its way (the mount's send included), sent, or not sent. */
function sentLine(p: CodePaneProps, sent: boolean): string {
  if (p.otp.sending) return SENDING;
  if (sent || p.isPreview) return "signin.codeSentSubtitle";
  return p.flow.error ? "signin.codeNotSent" : SENDING;
}

/** "We sent a code to …", the six boxes (verified at the sixth digit), and two links. */
export function CompactCodePane(p: CodePaneProps) {
  const t = useT();
  const lineId = useId();
  const { flow, otp, isPreview } = p;
  const cn = p.look.classNames;
  const { code, setCode, verifying } = useOtpVerify({
    flow,
    baseUrl: p.baseUrl,
    challengeId: otp.challengeId,
    isPreview,
    t,
  });
  const line = sentLine(p, otp.challengeId !== null);
  const busy = verifying || line === SENDING;
  return (
    <div className={STACK_3}>
      <p
        id={lineId}
        aria-live="polite"
        className={`flex items-center gap-1.5 text-[13px] leading-[1.45] text-fg-2 ${cn.line ?? ""}`}
      >
        {busy && <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin" />}
        {t(line, { email: p.sentTo })}
      </p>
      <OtpInput
        value={isPreview ? PREVIEW_CODE : code}
        onChange={setCode}
        disabled={isPreview || verifying}
        autoFocus={!isPreview && p.look.autoFocus}
        compact
        describedBy={lineId}
        className={cn.code}
      />
      <ErrorLine error={flow.error} className={cn.error} />
      <div className={`flex flex-wrap items-center justify-between gap-x-3 ${cn.links ?? ""}`}>
        <SmallLink onClick={p.onAnotherEmail} disabled={verifying} className={cn.link}>
          {t("signin.useAnotherEmail")}
        </SmallLink>
        <SmallLink
          onClick={p.onResend}
          disabled={isPreview || busy || otp.resendIn > 0}
          className={cn.link}
        >
          {otp.resendIn > 0
            ? t("signin.sendAgainIn", { seconds: otp.resendIn })
            : t("signin.sendAgain")}
        </SmallLink>
      </div>
    </div>
  );
}

type EmailPaneProps = {
  flow: SignInFlow;
  otp: OtpStart;
  isPreview: boolean;
  look: PaneLook;
  cta: Cta;
  onSend: () => void;
  /** Back to the code already sent; absent when none was. */
  onBack?: () => void;
};

/** An email field and Continue, inside the same compact frame. */
export function CompactEmailPane(p: EmailPaneProps) {
  const t = useT();
  const fieldId = useId();
  const { flow, otp, isPreview } = p;
  const cn = p.look.classNames;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    p.onSend();
  };
  return (
    <form onSubmit={submit} className={STACK_2}>
      <label htmlFor={fieldId} className={`text-[12px] font-medium text-fg-2 ${cn.line ?? ""}`}>
        {t("signin.emailPlaceholder")}
      </label>
      <input
        id={fieldId}
        type="email"
        autoComplete="email"
        inputMode="email"
        autoFocus={!isPreview && p.look.autoFocus}
        value={otp.identifier}
        disabled={isPreview || otp.sending}
        onChange={(e) => otp.setIdentifier(e.target.value)}
        className={`w-full h-10 px-3 text-[14px] ${FIELD_COMPACT} ${cn.field ?? ""}`}
      />
      <ErrorLine error={flow.error} className={cn.error} />
      <CtaButton
        cta={p.cta}
        submit
        faint
        busy={otp.sending}
        disabled={isPreview || !otp.valid || otp.sending}
        className={cn.button}
      >
        {t("signin.sendCodeButton")}
      </CtaButton>
      {p.onBack && (
        <div className={cn.links}>
          <SmallLink onClick={p.onBack} disabled={otp.sending} className={cn.link}>
            {t("common.back")}
          </SmallLink>
        </div>
      )}
    </form>
  );
}
