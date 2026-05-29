"use client";

/**
 * `<ElvixDateInput>` — single date input matching `<ElvixInput>`'s
 * chrome. Uses the browser's native date picker (one click for the
 * calendar, free keyboard typing path).
 *
 * Border colour follows the active brand via CSS vars installed by
 * `<ElvixProvider>` — same idle / hover / focus rhythm as
 * `<ElvixInput>`.
 *
 * Value contract: `""` or `"YYYY-MM-DD"`.
 */

import { type InputHTMLAttributes, forwardRef } from "react";

export type ElvixDateInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  "type" | "onChange"
> & {
  value: string;
  onChange: (next: string) => void;
  hasError?: boolean;
};

export const ElvixDateInput = forwardRef<HTMLInputElement, ElvixDateInputProps>(
  function ElvixDateInput(
    { value, onChange, onBlur, hasError = false, className = "", style, ...rest },
    ref,
  ) {
    return (
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        max={new Date().toISOString().slice(0, 10)}
        min="1900-01-01"
        {...rest}
        style={{
          boxShadow: hasError
            ? "inset 0 0 0 1.5px rgba(239,68,68,0.7)"
            : "inset 0 0 0 1.5px var(--elvix-primary-55)",
          colorScheme: "light",
          ...style,
        }}
        className={
          "w-full h-10 rounded-[10px] px-3 text-[14px] " +
          "bg-white text-[#0a0a0b] placeholder:text-black/35 " +
          "dark:bg-[#101013] dark:text-white dark:placeholder:text-white/30 " +
          "outline-none transition-shadow tabular-nums " +
          "hover:[box-shadow:inset_0_0_0_1.5px_var(--elvix-primary)] " +
          "focus:[box-shadow:inset_0_0_0_2px_var(--elvix-primary)] " +
          (hasError ? "focus:[box-shadow:inset_0_0_0_2px_#ef4444] " : "") +
          "[&::-webkit-calendar-picker-indicator]:cursor-pointer " +
          "[&::-webkit-calendar-picker-indicator]:opacity-70 " +
          "hover:[&::-webkit-calendar-picker-indicator]:opacity-100 " +
          className
        }
      />
    );
  },
);
