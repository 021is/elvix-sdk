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
 */

import { forwardRef, type InputHTMLAttributes } from "react";

export type ElvixInputProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
};

/** The geometry every SDK text field shares; the colours are the class's. */
export const FIELD_CLASS = "elvix-field w-full h-10 px-3 text-[14px]";

export const ElvixInput = forwardRef<HTMLInputElement, ElvixInputProps>(function ElvixInput(
  { hasError = false, className = "", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={hasError || undefined}
      {...rest}
      className={`${FIELD_CLASS} ${className}`}
    />
  );
});
