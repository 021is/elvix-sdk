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
 * any add step; choices that are the step's content (a type, Yes or No, a list
 * row) stay in the pane. On the list nothing changes: a tap picks, and the
 * host's Continue grants and moves on. One controls object drives one picker.
 */

import { useCallback, useEffect, useInsertionEffect, useRef, useState } from "react";
import { View } from "./legal-entity-flow";
import type { StepHost } from "./legal-entity-step-chrome";

/** How the picker reaches its controls. Pass it on; never call it. */
export type ElvixLegalEntityPickerConnection = StepHost & {
  setFlow: (flow: { adding: boolean; stepId: string | null; working: boolean }) => void;
  claim: (owner: object) => boolean;
  release: (owner: object) => void;
};

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
  /**
   * One step back in the add flow, and `true`; during a check or the save a
   * no-op, still `true`. `false` only on the list, so the host leaves its pane.
   */
  back: () => boolean;
  /** The picker's side of these controls. */
  connection: ElvixLegalEntityPickerConnection;
};

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
  useInsertionEffect(() => {
    live.current = snap;
  });
  const [connection] = useState(() => connect(setSnap, run, goBack));

  const next = useCallback(() => {
    if (live.current.action?.canContinue) run.current?.();
  }, []);
  const back = useCallback(() => {
    if (!live.current.adding) return false;
    goBack.current?.();
    return true;
  }, []);

  return {
    adding: snap.adding,
    step: snap.adding && snap.stepId ? { id: snap.stepId, title: snap.title } : null,
    canContinue: snap.action?.canContinue ?? false,
    busy: snap.working && snap.action === null,
    label: snap.action?.label ?? null,
    next,
    back,
    connection,
  };
}

type Ref<T> = { current: T };

/** The connection's methods, made once; they only write refs and state. */
function connect(
  setSnap: (update: (prev: Snapshot) => Snapshot) => void,
  run: Ref<(() => void) | null>,
  goBack: Ref<(() => void) | null>,
): ElvixLegalEntityPickerConnection {
  let owner: object | null = null;
  const merge = (part: Partial<Snapshot>) =>
    setSnap((prev) => (changes(prev, part) ? { ...prev, ...part } : prev));
  return {
    setAction: (action, fn) => {
      run.current = action ? fn : null;
      merge({ action });
    },
    setBack: (fn) => {
      goBack.current = fn;
    },
    setTitle: (title) => merge({ title }),
    setFlow: ({ adding, stepId, working }) => merge({ adding, stepId, working }),
    claim: (who) => {
      if (owner && owner !== who) return false;
      owner = who;
      return true;
    },
    release: (who) => {
      if (owner !== who) return;
      owner = null;
      run.current = null;
      goBack.current = null;
      merge(IDLE);
    },
  };
}

/**
 * The picker's side: claims the controls, tells them where the add flow
 * stands, and gives its steps the host to publish to; `null` without
 * controls, or when another picker already holds them.
 */
export function usePickerHost(
  controls: ElvixLegalEntityPickerControls | undefined,
  adding: boolean,
  view: string,
): ElvixLegalEntityPickerConnection | null {
  const connection = controls?.connection ?? null;
  const [me] = useState(() => ({}));
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    if (!connection) return;
    if (!connection.claim(me)) {
      console.error("elvix_picker_controls_shared: one controls object drives one picker");
      setRefused(true);
      return;
    }
    return () => connection.release(me);
  }, [connection, me]);
  const host = refused ? null : connection;
  const working = view === View.SAVING || view === View.VERIFYING_TAX_ID;
  useEffect(() => {
    host?.setFlow({ adding, stepId: adding ? view : null, working });
  }, [host, adding, view, working]);
  return host;
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
