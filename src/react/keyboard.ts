/**
 * The sign-in card on a phone, with the on-screen keyboard (0.26, Edvard 2026-11-11: "the
 * elvix sdk for sign in must be aware of the keyboard on mobile"). The host makes room for
 * the keyboard (its sheet's inset, the browser resizing the page); the card keeps the field
 * a person is typing in, and the step's button, in that room, and never raises the keyboard
 * by itself on a touch screen.
 */

import { type RefObject, useEffect, useRef } from "react";

/** Autofocus only with a fine pointer (a mouse, a trackpad). On a touch screen focusing a
 *  field on open throws the keyboard up over the sheet before the person chose to type. */
export function canAutoFocus(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return true;
  return !window.matchMedia("(pointer: coarse)").matches;
}

/** An overlay just opened: its first control takes focus with a fine pointer; on a touch
 *  screen the panel itself does (it must be focusable, `tabIndex={-1}`), so a screen reader
 *  is inside the dialog, no keyboard jumps up, and no field's focus starts a passkey offer. */
export function focusOnOpen(panel: HTMLElement | null) {
  const first = canAutoFocus() ? panel?.querySelector<HTMLElement>("input, button") : null;
  (first ?? panel)?.focus();
}

/**
 * A ref whose field is focused once it is mounted, when `wanted` and the pointer is fine.
 * Never the `autoFocus` attribute: a server would write it into the page's HTML, where a
 * phone acts on it at load, and React does not focus a field on hydration anyway.
 */
export function useAutoFocus<T extends HTMLElement>(wanted: boolean): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (wanted && canAutoFocus()) ref.current?.focus();
  }, [wanted]);
  return ref;
}

/** How long the keyboard's own animation may keep resizing the viewport after a focus. */
const KEYBOARD_SETTLE_MS = 1000;

function isTypingField(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

function reveal(el: Element | null | undefined) {
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
}

/**
 * A field that gets focus, and its form's submit button, scrolled into view in whatever
 * scrolls around the card (the host's sheet, the page), the field last so it wins when both
 * do not fit. Again while the keyboard opens (`visualViewport` resizes), never with a guessed
 * keyboard height. A field outside a form brings only itself.
 */
function keepFieldInView(event: FocusEvent) {
  const field = event.target;
  if (!isTypingField(field)) return;
  const button = field.form?.querySelector('button[type="submit"]');
  const run = () => {
    if (!field.isConnected) return; // The card closed before the frame came.
    reveal(button);
    reveal(field);
  };
  requestAnimationFrame(run);
  const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
  if (!viewport) return;
  viewport.addEventListener("resize", run);
  const stop = () => {
    viewport.removeEventListener("resize", run);
    field.removeEventListener("blur", stop);
    clearTimeout(timer);
  };
  const timer = setTimeout(stop, KEYBOARD_SETTLE_MS);
  field.addEventListener("blur", stop);
}

/** `keepFieldInView` for every field inside `root`, one listener on the root (`focusin`). */
export function useKeepFieldsInView(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.addEventListener("focusin", keepFieldInView);
    return () => el.removeEventListener("focusin", keepFieldInView);
  }, [root]);
}
