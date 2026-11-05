"use client";

/**
 * `useElvixLegalEntityPickerControls()` (0.23): the host drives the picker's
 * add flow from its own bar, so the screen shows one Back and one Continue,
 * both the host's (DanceClub's Bookings ask, 2026-11-02).
 *
 *   const controls = useElvixLegalEntityPickerControls();
 *   <ElvixLegalEntityPicker controls={controls} onPick={…} />
 *   <Bar onBack={() => controls.back() || leavePane()}>
 *     <Continue disabled={!controls.canContinue || controls.busy} onClick={controls.next}>
 *       {controls.label ?? "Continue"}
 *     </Continue>
 *   </Bar>
 *
 * Given `controls`, the picker draws no Back, Continue or Save of its own at
 * any step; choices that are the step's content (a type, Yes or No, a list
 * row) stay in the pane. On the list nothing changes: a tap picks, and the
 * host's Continue grants and moves on.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "./legal-entity-flow";
import type { StepHost } from "./legal-entity-step-chrome";

export type ElvixLegalEntityPickerControls = {
  /** In the add flow (a step of adding an entity), not on the list. */
  adding: boolean;
  /** The add step showing: its id and its question, or `null` on the list. */
  step: { id: string; title: string | null } | null;
  /** The step's own action may run now. */
  canContinue: boolean;
  /** A check (VAT ID, register) or the save is in flight. */
  busy: boolean;
  /** What the step's own button said: "Continue", "Skip", "Save company"; `null` on the list. */
  label: string | null;
  /** Runs the step's action; the last step saves and picks, then `onPick` as always. */
  next: () => void;
  /** One step back in the add flow; `false` on the list, so the host leaves its pane. */
  back: () => boolean;
};

/** What the picker tells the controls beyond what its steps publish. */
export type PickerBinder = StepHost & {
  setFlow: (flow: { adding: boolean; stepId: string | null; working: boolean }) => void;
};

/** The picker finds its binder through `controls.next`, the one stable member. */
const BINDERS = new WeakMap<() => void, PickerBinder>();

/**
 * The picker's side: tells the controls where the add flow stands and gives
 * back the host its steps publish to, `null` without controls.
 */
export function usePickerHost(
  controls: ElvixLegalEntityPickerControls | undefined,
  adding: boolean,
  view: string,
): PickerBinder | null {
  const host = controls ? (BINDERS.get(controls.next) ?? null) : null;
  const working = view === View.SAVING || view === View.VERIFYING_TAX_ID;
  useEffect(() => {
    host?.setFlow({ adding, stepId: adding ? view : null, working });
  }, [host, adding, view, working]);
  return host;
}

type Snapshot = {
  adding: boolean;
  stepId: string | null;
  working: boolean;
  title: string | null;
  action: { label: string; canContinue: boolean } | null;
};

const IDLE: Snapshot = { adding: false, stepId: null, working: false, title: null, action: null };

export function useElvixLegalEntityPickerControls(): ElvixLegalEntityPickerControls {
  const [snap, setSnap] = useState(IDLE);
  const run = useRef<(() => void) | null>(null);
  const goBack = useRef<(() => void) | null>(null);
  const live = useRef(snap);
  live.current = snap;

  const merge = useCallback((part: Partial<Snapshot>) => {
    setSnap((prev) => (changes(prev, part) ? { ...prev, ...part } : prev));
  }, []);

  const next = useCallback(() => {
    if (live.current.action?.canContinue) run.current?.();
  }, []);
  const back = useCallback(() => {
    if (!live.current.adding || !goBack.current) return false;
    goBack.current();
    return true;
  }, []);

  // Built once, before the picker's first effect reads it.
  useState(() => {
    BINDERS.set(next, {
      setAction: (action, fn) => {
        run.current = action ? fn : null;
        merge({ action });
      },
      setBack: (fn) => {
        goBack.current = fn;
      },
      setTitle: (title) => merge({ title }),
      setFlow: ({ adding, stepId, working }) => merge({ adding, stepId, working }),
    });
    return null;
  });

  return {
    adding: snap.adding,
    step: snap.adding && snap.stepId ? { id: snap.stepId, title: snap.title } : null,
    canContinue: snap.action?.canContinue ?? false,
    busy: snap.working && snap.action === null,
    label: snap.action?.label ?? null,
    next,
    back,
  };
}

/** Whether `part` changes anything, so an unchanged publish renders nothing. */
function changes(prev: Snapshot, part: Partial<Snapshot>): boolean {
  const next = { ...prev, ...part };
  return (
    next.adding !== prev.adding ||
    next.stepId !== prev.stepId ||
    next.working !== prev.working ||
    next.title !== prev.title ||
    !sameAction(next.action, prev.action)
  );
}

function sameAction(a: Snapshot["action"], b: Snapshot["action"]): boolean {
  if (a === null || b === null) return a === b;
  return a.label === b.label && a.canContinue === b.canContinue;
}
