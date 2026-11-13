"use client";

/**
 * `<ElvixInput>` — themed text input used by every SDK form.
 *
 * Its look is the one field look (`.elvix-field`, `src/styles/fields.css`):
 * a tint of the text colour, no outline at rest, the brand on focus, every
 * value a CSS variable a host sets on any ancestor. Until 0.18 it painted its
 * own white (dark: near-black) fill and a 55% brand outline, which no host
 * could change. A wrong value is `aria-invalid`, which the class outlines in
 * `--elvix-danger`, and which a screen reader announces.
 *
 * An icon over the field goes in `start` or `end` (0.26.2), never in a
 * caller's own `absolute` element with a `pl-9` beside it: the field then
 * carried `px-3` and `pl-9`, two classes for one side, and a Tailwind host's
 * own `.px-3`, loaded after the SDK's styles, put the text back under the
 * icon (danceclub.dev, the "@" on the "e" of "edvard"). The field picks one
 * padding class per side from its slots, so no stylesheet order can move it.
 */

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export type ElvixInputProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
  /** A 16 px icon drawn over the field's start (a search glass, an "@"); the text starts after it. */
  start?: ReactNode;
  /** A 16 px icon drawn over the field's end (a status, a spinner); the text stops before it. */
  end?: ReactNode;
};

/** The geometry every SDK text field shares; the colours are the class's, the padding
 *  `FIELD_PADDING`'s. */
export const FIELD_CLASS = "elvix-field w-full h-10 text-[14px]";

/** The padding, one class per side: a slot's icon sits at 12 px and is 16 px wide, so the
 *  text starts 36 px in, 8 px after it. Full literals, or Tailwind does not emit them. */
export const FIELD_PADDING = {
  plain: "px-3",
  start: "pl-9 pr-3",
  end: "pl-3 pr-9",
  both: "pl-9 pr-9",
} as const;

const SLOT = "pointer-events-none absolute top-1/2 -translate-y-1/2 flex text-fg-3";

function paddingFor(start: boolean, end: boolean): string {
  if (start) return end ? FIELD_PADDING.both : FIELD_PADDING.start;
  return end ? FIELD_PADDING.end : FIELD_PADDING.plain;
}

export const ElvixInput = forwardRef<HTMLInputElement, ElvixInputProps>(function ElvixInput(
  { hasError = false, className = "", start, end, ...rest },
  ref,
) {
  const input = (
    <input
      ref={ref}
      aria-invalid={hasError || undefined}
      {...rest}
      className={`${FIELD_CLASS} ${paddingFor(Boolean(start), Boolean(end))} ${className}`}
    />
  );
  if (!start && !end) return input;
  return (
    <div className="relative">
      {start && <span className={`${SLOT} left-3`}>{start}</span>}
      {input}
      {end && <span className={`${SLOT} right-3`}>{end}</span>}
    </div>
  );
});
