"use client";

/**
 * The picker's end of `useElvixLegalEntityPickerControls()`: collects what
 * the panes offer (`host-actions.tsx`), publishes the state the host's
 * buttons show, and answers the host's `next()` / `back()`.
 *
 * An offer belongs to the step it was made on, so a pane still sliding out
 * after a step change is never what the host's Continue presses.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { HostActions, HostedPrimary } from "./host-actions";
import type {
  ElvixLegalEntityPickerControls,
  ElvixLegalEntityPickerControlsState,
} from "./legal-entity-picker-controls";

type Offer<T> = { token: object; step: string; value: T };

/** What the picker knows of itself this render. */
export type PickerNow = {
  /** The add step showing, or null on the list. */
  step: string | null;
  /** A new entity is being saved. */
  saving: boolean;
  /** On the list: an entity is picked, and a grant is running. */
  picked: boolean;
  granting: boolean;
};

const IDLE = { next: () => {}, back: () => false };

export function usePickerHostBinding(
  controls: ElvixLegalEntityPickerControls | undefined,
  now: PickerNow,
): HostActions | null {
  const binding = controls?.binding;
  const step = useRef(now.step);
  step.current = now.step;
  const [primary, setPrimary] = useState<Offer<HostedPrimary> | null>(null);
  const back = useRef<Offer<() => void> | null>(null);

  const host = useMemo<HostActions | null>(() => {
    if (!binding) return null;
    const offer = <T>(value: T): Offer<T> => ({ token: {}, step: step.current ?? "", value });
    return {
      offerPrimary: (value) => {
        const o = offer(value);
        setPrimary(o);
        return () => setPrimary((cur) => (cur?.token === o.token ? null : cur));
      },
      offerBack: (value) => {
        const o = offer(value);
        back.current = o;
        return () => {
          if (back.current?.token === o.token) back.current = null;
        };
      },
    };
  }, [binding]);

  const current = <T>(o: Offer<T> | null) => (o && o.step === now.step ? o.value : null);
  const press = current(primary);
  const state = stateOf(now, press);

  // Idempotent (the hook drops an unchanged state), so every render may publish.
  useEffect(() => binding?.publish(state));
  useEffect(() => {
    if (!binding) return;
    binding.handlers.current = {
      next: () => {
        if (state.canContinue && now.step) press?.press();
      },
      back: () => {
        if (!now.step) return false;
        if (!now.saving) current(back.current)?.();
        return true;
      },
    };
  });
  useEffect(
    () => () => {
      if (!binding) return;
      binding.handlers.current = IDLE;
      binding.publish({ adding: false, canContinue: false, busy: false, step: null });
    },
    [binding],
  );
  return host;
}

function stateOf(
  now: PickerNow,
  primary: HostedPrimary | null,
): ElvixLegalEntityPickerControlsState {
  if (!now.step) {
    return { adding: false, canContinue: now.picked, busy: now.granting, step: null };
  }
  const busy = now.saving || Boolean(primary?.busy);
  return {
    adding: true,
    canContinue: !busy && primary !== null && !primary.disabled,
    busy,
    step: { id: now.step },
  };
}
