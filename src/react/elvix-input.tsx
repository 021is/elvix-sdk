"use client";

/**
 * `<ElvixInput>` — themed text input used by every SDK form.
 *
 * Border is the active brand primary at three intensities:
 *
 *   idle  — 55% alpha (calm, visible, doesn't shout)
 *   hover — 100% alpha (the row is interactive)
 *   focus — 100% alpha at 2px (the row is being edited)
 *
 * All resolved at runtime from the CSS vars `<ElvixProvider>`
 * installs — no hard-coded colour. Light/dark surface flips with
 * the `dark` class the provider applies.
 */

import { type InputHTMLAttributes, forwardRef } from "react";

export type ElvixInputProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
};

export const ElvixInput = forwardRef<HTMLInputElement, ElvixInputProps>(function ElvixInput(
  { hasError = false, className = "", style, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      style={{
        boxShadow: hasError
          ? "inset 0 0 0 1.5px rgba(239,68,68,0.7)"
          : "inset 0 0 0 1.5px var(--elvix-primary-55)",
        ...style,
      }}
      className={
        "w-full h-10 rounded-[10px] px-3 text-[14px] " +
        "bg-white text-[#0a0a0b] placeholder:text-black/35 " +
        "dark:bg-[#101013] dark:text-white dark:placeholder:text-white/30 " +
        "outline-none transition-shadow " +
        "hover:[box-shadow:inset_0_0_0_1.5px_var(--elvix-primary)] " +
        "focus:[box-shadow:inset_0_0_0_2px_var(--elvix-primary)] " +
        (hasError ? "focus:[box-shadow:inset_0_0_0_2px_#ef4444] " : "") +
        className
      }
    />
  );
});
