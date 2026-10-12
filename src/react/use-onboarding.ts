"use client";

import { useSyncExternalStore } from "react";
import { onOnboardingChange, pendingOnboardingStep } from "./session";

export type ElvixOnboardingState = {
  /** True from a redirect return that carries a step until the sign-in finishes. */
  pending: boolean;
  /** Which step is waiting: pick a username, add a passkey, or restore a membership. */
  step: "username" | "passkey" | "recover" | null;
};

const NONE: ElvixOnboardingState = { pending: false, step: null };

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
 * surface, render `<ElvixSignInForm>` (or open yours) while `pending` is true:
 *
 *   const { pending } = useElvixOnboarding();
 *   return <ElvixSignInForm presentation="modal" open={pending || open} ... />;
 *
 * The form finishes the step in place and calls `onResult` at the true end.
 */
export function useElvixOnboarding(): ElvixOnboardingState {
  const step = useSyncExternalStore(onOnboardingChange, pendingOnboardingStep, () => null);
  return step ? { pending: true, step } : NONE;
}
