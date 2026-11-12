/**
 * A text field with a prefix drawn over its start (the username step's "@", 0.26): the
 * field's text starts at the prefix's measured right edge plus `PREFIX_GAP_PX`, so no font,
 * page text size or card spacing can put the prefix on the first letter. 0.25 had a fixed
 * `pl-7` in `rem` beside a prefix in `px`: on a page with a smaller root text size the "@"
 * sat on the "e" of "edvard" (Edvard, 2026-11-12).
 *
 * Before the first measure (a server's HTML, a pane not laid out yet) the padding is the
 * same geometry in the field's own `em`, which is the prefix's size too. Measured with
 * offsets, never `getBoundingClientRect`: a pane's opening scale must not shrink it.
 */

import { type RefObject, useLayoutEffect, useRef, useState } from "react";

/** The prefix's distance from the field's left edge, and the space between it and the text. */
export const PREFIX_INSET_PX = 12;
export const PREFIX_GAP_PX = 6;

const ESTIMATE = `calc(${PREFIX_INSET_PX}px + 1em + ${PREFIX_GAP_PX}px)`;

/** The field's left padding that starts its text `PREFIX_GAP_PX` after the prefix. */
export function prefixPadding(prefix: HTMLElement, field: HTMLElement): number {
  return (
    prefix.offsetLeft + prefix.offsetWidth - field.offsetLeft - field.clientLeft + PREFIX_GAP_PX
  );
}

/** The prefix's ref and the field's `paddingLeft`, measured again whenever either resizes
 *  (a web font arriving, the page's text size changing). */
export function usePrefixInset(field: RefObject<HTMLInputElement | null>) {
  const prefix = useRef<HTMLSpanElement | null>(null);
  const [padding, setPadding] = useState<number | null>(null);
  useLayoutEffect(() => {
    const own = prefix.current;
    const input = field.current;
    if (!own || !input) return;
    const measure = () => {
      if (own.offsetWidth > 0) setPadding(prefixPadding(own, input));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(own);
    observer.observe(input);
    return () => observer.disconnect();
  }, [field]);
  return { prefix, paddingLeft: padding === null ? ESTIMATE : `${padding}px` };
}
