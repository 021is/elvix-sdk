"use client";

/**
 * `useElvixLegalEntityPickerControls()` (0.19): the host's own Back and
 * Continue drive `<ElvixLegalEntityPicker controls>`, so the screen holds one
 * of each (DanceClub, 2026-11-02). Given `controls`, the picker draws no
 * Back, Continue or Save of its own at any step; the host reads what its
 * buttons should show and calls `next()` / `back()`.
 *
 *   const controls = useElvixLegalEntityPickerControls();
 *   <ElvixLegalEntityPicker controls={controls} card={false} … />
 *   <button onClick={() => controls.back() || leavePane()}>‹</button>
 *   <button
 *     disabled={!controls.canContinue || controls.busy}
 *     onClick={controls.adding ? controls.next : grantAndGo}
 *   >Continue</button>
 *
 * On the list nothing changes: a tap picks (`onPick`), and the host's
 * Continue grants and moves on, as without controls.
 */

import { useCallback, useMemo, useRef, useState } from "react";

/** What the host's buttons show. */
export type ElvixLegalEntityPickerControlsState = {
  /** In "Add a company" (any step), not on the list. */
  adding: boolean;
  /** Adding: the step is complete. On the list: an entity is picked. */
  canContinue: boolean;
  /** A register check, a save or a grant is running. */
  busy: boolean;
  /** Adding: the step showing (its id is stable, e.g. `"vat-id"`); null on the list. */
  step: { id: string } | null;
};

export type ElvixLegalEntityPickerControls = ElvixLegalEntityPickerControlsState & {
  /** The step's own Continue or Save (the last step saves and picks). Nothing on the list. */
  next: () => void;
  /** One step back while adding (the first step returns to the list); false on the list. */
  back: () => boolean;
  /** The picker's end of the binding. */
  readonly binding: PickerBinding;
};

/** How the picker publishes its state and receives the host's presses. */
export type PickerBinding = {
  publish: (state: ElvixLegalEntityPickerControlsState) => void;
  handlers: { current: { next: () => void; back: () => boolean } };
};

const ON_THE_LIST: ElvixLegalEntityPickerControlsState = {
  adding: false,
  canContinue: false,
  busy: false,
  step: null,
};

export function useElvixLegalEntityPickerControls(): ElvixLegalEntityPickerControls {
  const [state, setState] = useState(ON_THE_LIST);
  const handlers = useRef({ next: () => {}, back: () => false });
  const binding = useMemo<PickerBinding>(
    () => ({ publish: (s) => setState((prev) => (sameState(prev, s) ? prev : s)), handlers }),
    [],
  );
  const next = useCallback(() => handlers.current.next(), []);
  const back = useCallback(() => handlers.current.back(), []);
  return useMemo(() => ({ ...state, next, back, binding }), [state, next, back, binding]);
}

function sameState(a: ElvixLegalEntityPickerControlsState, b: ElvixLegalEntityPickerControlsState) {
  return (
    a.adding === b.adding &&
    a.canContinue === b.canContinue &&
    a.busy === b.busy &&
    a.step?.id === b.step?.id
  );
}
