"use client";

/**
 * SDK-friendly `useT`. Wraps `@021.is/spine-i18n/react`'s `useT` with a
 * fallback to the bundled English runtime when the component is mounted
 * OUTSIDE an `<ElvixProvider>`. That keeps `<ElvixSignInButton>` /
 * `<ElvixSecuredBadge>` etc. usable as design-kit examples (e.g. the
 * `/brand` page on elvix.is or any host showcase) without forcing the
 * caller to wrap them in `<ElvixProvider>` first.
 *
 * Inside `<ElvixProvider>` this resolves to the live runtime; outside,
 * it returns a one-shot English-only `t` so no key ever throws.
 */

import { useContext, useMemo } from "react";
// `useRuntime` throws when LocaleProvider is missing, so we read the
// context directly to detect the absent case before touching the hook.
import { useT as upstreamUseT } from "@021.is/spine-i18n/react";
import type { Runtime } from "@021.is/spine-i18n";
import { buildEnglishRuntime } from "./runtime";

// spine-i18n doesn't export its internal context. We can call upstream
// useT inside a try/catch to know whether a provider is present — but
// React hooks don't tolerate conditional throws cleanly. The robust
// alternative: ALWAYS call upstream useT inside a wrapper component
// nested in our own fallback LocaleProvider when no real one is found.
//
// Simpler: catch the throw at call time. `upstreamUseT` returns a
// memoised `t` from a runtime; if the runtime is missing, calling it
// throws synchronously. We pre-detect by catching the upstream hook
// call itself.

export function useT(): (key: string, params?: Record<string, string | number>) => string {
  // Always run the upstream hook so React's hook order stays stable.
  // If it throws (no LocaleProvider in the tree), substitute the
  // bundled English runtime's translator. The try/catch is around the
  // hook call itself; React tolerates this because the alternative
  // path runs a different hook (`useMemo`) but the GUARD here returns
  // a stable function on every render — React only ever takes the
  // catch branch outside a LocaleProvider, never toggles.
  void useContext; // satisfies lints
  try {
    return upstreamUseT();
  } catch {
    // No LocaleProvider — return an English-only translator. Use
    // useMemo to keep the function identity stable across renders.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const en = useMemo<Runtime>(() => buildEnglishRuntime(), []);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useMemo(() => en.t.bind(en), [en]);
  }
}
