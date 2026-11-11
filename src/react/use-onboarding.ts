"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useElvixRefresh } from "./elvix-provider";
import { clearOnboardingPending, onOnboardingChange, pendingOnboardingStep } from "./session";

export type ElvixOnboardingState = {
  /** True from a redirect return that carries a step until the sign-in finishes. */
  pending: boolean;
  /** Which step is waiting: pick a username, add a passkey, or restore a membership. */
  step: "username" | "passkey" | "recover" | null;
  /**
   * "Not now" (0.25): the person closed your surface on the step. The sign-in completes
   * without it, the host sees the session, and the step is offered at the next sign-in.
   */
  dismiss: () => void;
};

/**
 * What a host's own UI needs after a redirect sign-in (Google, GitHub, the
 * hosted passkey page) brings the person back to the page.
 *
 * The redirect reloads the page, so the in-frame sign-in is gone. When the
 * server asked for one more step, the person is signed in on elvix's side but
 * has not finished: `useElvixSession()` stays anonymous (so nothing in your app
 * treats them as signed in) and this hook says why, so you can bring the step
 * back. `<ElvixSignInForm presentation="modal" | "drawer">` already does: it
 * opens itself on the step (`resumeOnReturn`, default on). With your own
 * surface (your own sheet), open it on `<ElvixSignInCard>` while `pending` is true and
 * call `dismiss` when the person closes it:
 *
 *   const { pending, dismiss } = useElvixOnboarding();
 *   return <YourSheet open={pending} onClose={dismiss}><ElvixSignInCard /></YourSheet>;
 *
 * The card finishes the step in place and calls `onResult` at the true end. One surface
 * per return: every sign-in mounted when the person comes back takes the step, so open
 * yours instead of `<ElvixOnboarding>`, never beside it.
 */
export function useElvixOnboarding(): ElvixOnboardingState {
  const step = useSyncExternalStore(onOnboardingChange, pendingOnboardingStep, () => null);
  const refresh = useElvixRefresh();
  const dismiss = useCallback(() => {
    clearOnboardingPending();
    void refresh();
  }, [refresh]);
  return useMemo(() => ({ pending: step !== null, step, dismiss }), [step, dismiss]);
}
