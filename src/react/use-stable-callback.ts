"use client";

import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * A function whose identity never changes but which always calls the LATEST
 * `fn` — the userland form of React's `useEffectEvent` (not available on the
 * React 18 the SDK supports).
 *
 * Use it for callbacks a host passes in (`onChange`, `onResult`) and for
 * handlers an effect subscribes with. Putting such a callback in a dependency
 * array re-runs the effect whenever the host re-renders with an inline arrow,
 * which for a fetch effect is a request per render. The latest value is
 * committed in an insertion effect, before any layout or passive effect reads
 * it, and never during render. Do not call the result during render.
 */
export function useStableCallback<A extends unknown[], R>(
  fn: ((...args: A) => R) | undefined,
): (...args: A) => R | undefined {
  const ref = useRef(fn);
  useInsertionEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current?.(...args), []);
}
