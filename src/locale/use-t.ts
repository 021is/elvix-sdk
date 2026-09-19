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
 * it returns an English-only `t` so no key ever throws.
 */

import { useT as upstreamUseT } from "@021.is/spine-i18n/react";
import { buildEnglishRuntime } from "./runtime";

type Translate = (key: string, params?: Record<string, string | number>) => string;

// Built once per page, on first use outside a provider. A module value, not a
// hook: the fallback runs in a `catch`, where calling a hook would change the
// hook order between renders.
let englishT: Translate | null = null;
function englishFallback(): Translate {
  if (!englishT) {
    const en = buildEnglishRuntime();
    englishT = en.t.bind(en);
  }
  return englishT;
}

export function useT(): Translate {
  // spine-i18n exports no context to probe, so detect a missing
  // LocaleProvider by the upstream hook throwing. Whether it throws never
  // changes for a mounted component, so the hook order is stable.
  try {
    return upstreamUseT();
  } catch {
    return englishFallback();
  }
}
