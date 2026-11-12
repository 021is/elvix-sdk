/**
 * One passkey request per document (0.26). A browser holds one WebAuthn request at a time,
 * a page may show two cards (an inline form and a sign-in button's modal), and a person
 * signs in once, so every card's `usePasskeySignIn` shares this one lock (the security
 * reviews, 2026-11-12):
 *
 * - an autofill offer starts only when nothing is open;
 * - a button tapped while an offer waits for its pick ends it (its start and its prompt),
 *   then opens its dialog;
 * - an offer with a passkey picked is a sign-in: it keeps the lock until it is done, and no
 *   button opens a second ceremony meanwhile, ever.
 *
 * Nothing holds it forever because every request is bounded (`passkey-timeout.ts`), not
 * because anyone takes it over. Module state, no React: the hook holds and releases it and
 * reads `passkeyLockState` through `subscribePasskeyLock`.
 */

/** An autofill offer: aborted to end it; `done` resolves once its work is over (it never
 *  rejects), `picked` once the person chose a passkey from it (see `pickOffer`). */
export type PasskeyOffer = { controller: AbortController; picked: boolean; done: Promise<void> };

type Held = { kind: "offer"; offer: PasskeyOffer } | { kind: "ceremony" };

/** What every card sees: nothing, an offer still waiting for a pick (it shows nothing), or a
 *  sign-in running (a button's ceremony, or an offer with a passkey picked). */
export const PasskeyLock = { FREE: "free", OFFER: "offer", BUSY: "busy" } as const;
export type PasskeyLock = (typeof PasskeyLock)[keyof typeof PasskeyLock];

let held: Held | null = null;
const listeners = new Set<() => void>();

function set(next: Held | null) {
  held = next;
  for (const listener of listeners) listener();
}

export function passkeyLockState(): PasskeyLock {
  if (!held) return PasskeyLock.FREE;
  return held.kind === "offer" && !held.offer.picked ? PasskeyLock.OFFER : PasskeyLock.BUSY;
}

export function subscribePasskeyLock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Leaving for the back-forward cache ends an offer still waiting for its pick (its own end
 *  then gives the lock back); a picked one is a sign-in, and finishes. */
let pagehideWatched = false;
function watchPagehide() {
  if (pagehideWatched || typeof window === "undefined") return;
  pagehideWatched = true;
  window.addEventListener("pagehide", () => {
    if (held?.kind === "offer" && !held.offer.picked) held.offer.controller.abort();
  });
}

/** Takes the lock for `offer`; false when any request, from any card, is open. */
export function holdOffer(offer: PasskeyOffer): boolean {
  if (held) return false;
  watchPagehide();
  set({ kind: "offer", offer });
  return true;
}

/** The person chose a passkey from `offer`: from here it is a sign-in, shown on every
 *  button. */
export function pickOffer(offer: PasskeyOffer) {
  offer.picked = true;
  set(held);
}

/** Gives the lock back once `offer` is done (a no-op when it no longer holds it). */
export function releaseOffer(offer: PasskeyOffer) {
  if (held?.kind === "offer" && held.offer === offer) set(null);
}

/**
 * Takes the lock for a button's ceremony; false while a ceremony or a picked offer runs.
 * An offer still waiting for its pick is ended, with the lock taken at once so no offer
 * starts and no second button runs meanwhile. Picked in the instant before the abort
 * landed, its sign-in is over once `done` resolves, and there is no dialog.
 */
export async function holdCeremony(): Promise<boolean> {
  const before = held;
  if (before && (before.kind === "ceremony" || before.offer.picked)) return false;
  set({ kind: "ceremony" });
  if (!before) return true;
  before.offer.controller.abort();
  await before.offer.done;
  if (!before.offer.picked) return true;
  releaseCeremony();
  return false;
}

/** Gives the lock back after a ceremony. */
export function releaseCeremony() {
  if (held?.kind === "ceremony") set(null);
}
