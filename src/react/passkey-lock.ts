/**
 * One passkey request per document (0.26). A browser holds one WebAuthn request at a time,
 * and a page may show two cards (an inline form and a sign-in button's modal), so every
 * card's `usePasskeySignIn` shares this one lock: an autofill offer starts only when nothing
 * is open, and a passkey button ends whatever offer is open, in any card, before its dialog.
 * Without it, card B's button opened its dialog over card A's offer, the browser refused
 * one, and B fell back to the hosted page (the security review, 2026-11-12).
 *
 * The lock never sticks: a button waits on an ending offer at most `OFFER_END_WAIT_MS`,
 * whatever that offer does (a stalled request, a host callback that throws), and a page
 * leaving for the back-forward cache ends its offer (security review 3, 2026-11-12).
 *
 * Module state, no React: the hook holds and releases it, and reads it through
 * `subscribePasskeyLock` / `passkeyLockState`, so every card's button shows a ceremony.
 */

/** An autofill offer: aborted to end it; `done` resolves once it has (never rejects),
 *  `picked` once the person chose a passkey from it (its sign-in is then under way). */
export type PasskeyOffer = { controller: AbortController; picked: boolean; done: Promise<void> };

type Held = { kind: "offer"; offer: PasskeyOffer } | { kind: "ceremony" };

export const PasskeyLock = { FREE: "free", OFFER: "offer", CEREMONY: "ceremony" } as const;
export type PasskeyLock = (typeof PasskeyLock)[keyof typeof PasskeyLock];

/** The longest a button waits for an offer to end before it takes the lock anyway. */
export const OFFER_END_WAIT_MS = 3000;

let held: Held | null = null;
const listeners = new Set<() => void>();

function set(next: Held | null) {
  held = next;
  for (const listener of listeners) listener();
}

/** What holds the lock now, for `useSyncExternalStore`. */
export const passkeyLockState = (): PasskeyLock => held?.kind ?? PasskeyLock.FREE;

export function subscribePasskeyLock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A page frozen in the back-forward cache must not come back with an offer holding the
 *  lock: the browser ended its request, and nothing would release it. */
let pagehideWatched = false;
function watchPagehide() {
  if (pagehideWatched || typeof window === "undefined") return;
  pagehideWatched = true;
  window.addEventListener("pagehide", () => {
    if (held?.kind !== "offer") return;
    held.offer.controller.abort();
    set(null);
  });
}

/** Takes the lock for `offer`; false when any request, from any card, is open. */
export function holdOffer(offer: PasskeyOffer): boolean {
  if (held) return false;
  watchPagehide();
  set({ kind: "offer", offer });
  return true;
}

/** Gives the lock back once `offer` has ended (a no-op when it no longer holds it). */
export function releaseOffer(offer: PasskeyOffer) {
  if (held?.kind === "offer" && held.offer === offer) set(null);
}

/** An offer's `done` that rejects anyway is its card's to report (the hook reports every
 *  failure before `done` settles); for the lock it only means the offer is over. */
const over = () => undefined;

/** `offer` ended, or `OFFER_END_WAIT_MS` passed: a stalled request never holds a button. */
async function endOf(offer: PasskeyOffer): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, OFFER_END_WAIT_MS);
  });
  await Promise.race([offer.done.catch(over), waited]);
  clearTimeout(timer);
}

/**
 * Takes the lock for a button's ceremony at once (so no offer starts and no second button
 * runs while it waits), then ends the offer it replaced. False when a ceremony already
 * runs, or that offer had a passkey picked: its sign-in is finishing, and a second dialog
 * would mint a second session. Never rejects, and never keeps the lock when it says false.
 */
export async function holdCeremony(): Promise<boolean> {
  const before = held;
  if (before?.kind === "ceremony") return false;
  set({ kind: "ceremony" });
  if (!before) return true;
  before.offer.controller.abort();
  await endOf(before.offer);
  if (!before.offer.picked) return true;
  releaseCeremony();
  return false;
}

/** Gives the lock back after a ceremony. */
export function releaseCeremony() {
  if (held?.kind === "ceremony") set(null);
}
