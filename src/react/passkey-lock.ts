/**
 * One passkey request per document (0.26). A browser holds one WebAuthn request at a time,
 * and a page may show two cards (an inline form and a sign-in button's modal), so every
 * card's `usePasskeySignIn` shares this one lock: an autofill offer starts only when nothing
 * is open, and a passkey button ends whatever offer is open, in any card, before its dialog.
 * Without it, card B's button opened its dialog over card A's offer, the browser refused
 * one, and B fell back to the hosted page (the security review, 2026-11-12).
 *
 * Pure module state, no React: the hook holds and releases it.
 */

/** An autofill offer: aborted to end it; `done` settles once it has, `picked` once the
 *  person chose a passkey from it (its sign-in is then under way). */
export type PasskeyOffer = { controller: AbortController; picked: boolean; done: Promise<void> };

type Held = { kind: "offer"; offer: PasskeyOffer } | { kind: "ceremony" };

let held: Held | null = null;

/** Takes the lock for `offer`; false when any request, from any card, is open. */
export function holdOffer(offer: PasskeyOffer): boolean {
  if (held) return false;
  held = { kind: "offer", offer };
  return true;
}

/** Gives the lock back once `offer` has ended (a no-op when it no longer holds it). */
export function releaseOffer(offer: PasskeyOffer) {
  if (held?.kind === "offer" && held.offer === offer) held = null;
}

/**
 * Takes the lock for a button's ceremony at once (so no offer starts and no second button
 * runs while it waits), then ends the offer it replaced. False when a ceremony already
 * runs, or that offer had a passkey picked: its sign-in is finishing, and a second dialog
 * would mint a second session.
 */
export async function holdCeremony(): Promise<boolean> {
  const before = held;
  if (before?.kind === "ceremony") return false;
  held = { kind: "ceremony" };
  if (!before) return true;
  before.offer.controller.abort();
  await before.offer.done;
  if (!before.offer.picked) return true;
  releaseCeremony();
  return false;
}

/** Gives the lock back after a ceremony. */
export function releaseCeremony() {
  if (held?.kind === "ceremony") held = null;
}
