"use client";

/**
 * Host actions (0.19): when a host drives a flow with its own Back and
 * Continue (`useElvixLegalEntityPickerControls()`), each pane hands the host
 * its primary action and its back instead of drawing them, so the screen
 * holds one of each, the host's. Without a provider (every other flow, and
 * the picker without `controls`) nothing here does anything.
 *
 * A pane offers while mounted, and the newest offer wins: a pane sliding out
 * still holds its offer until it unmounts, after the next pane has offered.
 */

import { createContext, useContext, useEffect, useRef } from "react";

/** A pane's primary action as the host sees it. */
export type HostedPrimary = { disabled: boolean; busy: boolean; press: () => void };

export type HostActions = {
  /** Offers the pane's primary action; the return withdraws it. */
  offerPrimary: (primary: HostedPrimary) => () => void;
  /** Offers the pane's back; the return withdraws it. */
  offerBack: (back: () => void) => () => void;
};

const HostActionsContext = createContext<HostActions | null>(null);

export const HostActionsProvider = HostActionsContext.Provider;

/** The host's actions when a host drives this flow, else null. */
export function useHostActions(): HostActions | null {
  return useContext(HostActionsContext);
}

/** Offers `back` to the host while the calling pane is mounted. */
export function useOfferedBack(host: HostActions, back: () => void): void {
  const latest = useRef(back);
  latest.current = back;
  useEffect(() => host.offerBack(() => latest.current()), [host]);
}

/** A pane's back arrow when the host draws its own: offered, not drawn. */
export function HostedBack({ host, onBack }: { host: HostActions; onBack: () => void }) {
  useOfferedBack(host, onBack);
  return null;
}

/** Unseen but in the form, so Enter in a field still submits the step. */
const UNSEEN = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  opacity: 0,
  pointerEvents: "none",
} as const;

/**
 * The step's Save or Continue when the host draws its own: the host's
 * Continue presses this button, so a step behaves exactly as when its own
 * button is pressed (a form's submit, a disabled step refusing).
 */
export function HostedSaveButton(p: {
  host: HostActions;
  disabled: boolean;
  busy: boolean;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { host, disabled, busy } = p;
  useEffect(
    () => host.offerPrimary({ disabled, busy, press: () => ref.current?.click() }),
    [host, disabled, busy],
  );
  return (
    <button
      ref={ref}
      type="submit"
      tabIndex={-1}
      aria-hidden
      disabled={disabled || busy}
      style={UNSEEN}
      onClick={(e) => {
        if (!p.onClick) return; // a plain submit: the enclosing form handles it
        e.preventDefault(); // one press, one action (see ElvixSaveButton)
        p.onClick();
      }}
    />
  );
}
