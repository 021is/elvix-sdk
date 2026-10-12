"use client";

import { useEffect } from "react";
import { useElvixRefresh } from "./elvix-provider";
import { type AuthFormProps, ElvixSignInForm } from "./elvix-sign-in-form";
import { clearOnboardingPending } from "./session";
import { useElvixOnboarding } from "./use-onboarding";

export type ElvixOnboardingStep = "username" | "passkey" | "recover";

const ALL_STEPS: readonly ElvixOnboardingStep[] = ["username", "passkey", "recover"];

export type ElvixOnboardingProps = Pick<
  AuthFormProps,
  | "drawerSide"
  | "width"
  | "dismissable"
  | "redirectAfterSignIn"
  | "navigate"
  | "onResult"
  | "onAuthenticated"
> & {
  /**
   * Which steps this surface offers. Default: all of them. `["passkey"]` offers
   * the passkey after a redirect sign-in and nothing else; a step you leave out
   * is not shown and the sign-in simply completes. (Recover is a restore
   * decision, not an upsell: leave it in unless your own flow handles it.)
   */
  steps?: readonly ElvixOnboardingStep[];
  /** "modal" (default) or "drawer". */
  presentation?: "modal" | "drawer";
};

/**
 * The surface for what happens AFTER a redirect sign-in.
 *
 * Google, GitHub and the hosted passkey page send the person away and bring
 * them back to your page, which reloads, so the in-frame sign-in is gone. When
 * the server asked for one more step (pick a username, add a passkey, restore a
 * membership) there is nothing on the page to show it. Mount this once, high in
 * the tree (a layout), inside `<ElvixProvider>`: it renders nothing until such a
 * return arrives, then opens itself on that step, finishes it in place and
 * closes. Until then `useElvixSession()` stays anonymous, so nothing in your app
 * treats the person as signed in half-way.
 *
 *   <ElvixProvider clientId={id}>
 *     <ElvixOnboarding steps={["passkey"]} onResult={(r) => r.ok && router.refresh()} />
 *     {children}
 *   </ElvixProvider>
 *
 * Closing it (Escape, backdrop) means "not now": the sign-in completes without
 * the step and the person is offered it again at their next sign-in. A sign-in
 * that stays on your page (a modal `<ElvixSignInForm>`, the email code) already
 * shows its own steps in frame; this is for the redirect methods. Needs elvix
 * SDK 0.14.3 or later.
 */
export function ElvixOnboarding({
  steps = ALL_STEPS,
  presentation = "modal",
  navigate = false,
  ...rest
}: ElvixOnboardingProps) {
  const { pending, step } = useElvixOnboarding();
  const refresh = useElvixRefresh();
  const offered = step !== null && steps.includes(step);

  // A step the host did not ask for is not shown: complete the sign-in quietly.
  useEffect(() => {
    if (!pending || offered) return;
    clearOnboardingPending();
    void refresh();
  }, [pending, offered, refresh]);

  return (
    <ElvixSignInForm
      {...rest}
      presentation={presentation}
      navigate={navigate}
      open={pending && offered}
      onOpenChange={(open) => {
        if (open) return;
        // Dismissed (or finished): "not now". The session is reported to the host.
        clearOnboardingPending();
        void refresh();
      }}
      trigger={() => null}
      resumeOnReturn={false}
    />
  );
}
