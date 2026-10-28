"use client";

import { useT } from "../locale/use-t";
import type { AuthFormProps } from "./elvix-sign-in-form";
import { STACK_3 } from "./pane-layout";
import type { Cta } from "./sign-in-controls";
import {
  headerSubtitle,
  headerTitle,
  PasskeyStep,
  RecoverStep,
  UsernameStep,
} from "./sign-in-steps";
import { type SignInFlow, Step } from "./use-sign-in-flow";

/**
 * An onboarding step inside `<ElvixEmailCodeSignIn>`: the card's own pane, with
 * the title and line the card's header would give it, and nothing else. One
 * implementation of each step, whichever surface it opens in.
 */
export function EmailCodeOnboarding(p: {
  flow: SignInFlow;
  baseUrl: string;
  isPreview: boolean;
  cta: Cta;
  /** What the card's panes read from its props: the app, its brand. */
  form: AuthFormProps;
}) {
  const t = useT();
  const { flow } = p;
  const shared = { flow, baseUrl: p.baseUrl, isPreview: p.isPreview, cta: p.cta };
  return (
    <div className={STACK_3}>
      <div>
        <h3 className="text-[14px] font-semibold leading-snug text-fg-1">
          {headerTitle(flow.step, p.form, flow.recover?.appName, t)}
        </h3>
        <p className="mt-0.5 text-[12.5px] leading-[1.45] text-fg-2">
          {headerSubtitle(flow.step, p.form, "", t)}
        </p>
      </div>
      {flow.step === Step.USERNAME && <UsernameStep {...shared} />}
      {flow.step === Step.PASSKEY && <PasskeyStep {...shared} p={p.form} />}
      {flow.step === Step.RECOVER && <RecoverStep flow={flow} baseUrl={p.baseUrl} />}
    </div>
  );
}
