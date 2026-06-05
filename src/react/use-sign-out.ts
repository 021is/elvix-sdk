"use client";

import { useCallback, useState } from "react";
import { useResolvedBaseUrl } from "./elvix-provider";
import { type SignOutOptions, type SignOutResult, signOut } from "./sign-out";

/**
 * React hook wrapper around `signOut()`. Returns a busy-state
 * boolean and the run function. Use this when you have your own
 * "Sign out" affordance in your design system and just want to
 * wire the elvix flow on click.
 *
 *   const { run, busy } = useSignOut({ redirectAfterSignOut: "/" });
 *   <MyButton disabled={busy} onClick={() => run().then(toast)} />
 *
 * `run()` resolves with the same `SignOutResult` discriminated union
 * `signOut()` returns. Calling `run()` while `busy === true` is a
 * no-op.
 */
export function useSignOut(defaults: SignOutOptions = {}): {
  run: (override?: SignOutOptions) => Promise<SignOutResult>;
  busy: boolean;
} {
  const [busy, setBusy] = useState(false);
  // Resolve the elvix origin from <ElvixProvider baseUrl> so the sign-out
  // request reaches elvix.is cross-origin (not the customer's own origin).
  const baseUrl = useResolvedBaseUrl(defaults.baseUrl);
  const run = useCallback(
    async (override?: SignOutOptions): Promise<SignOutResult> => {
      if (busy) {
        return { ok: false, error: "busy", message: "sign-out already in progress" };
      }
      setBusy(true);
      try {
        return await signOut({ baseUrl, ...defaults, ...override });
      } finally {
        setBusy(false);
      }
    },
    [busy, defaults, baseUrl],
  );
  return { run, busy };
}
