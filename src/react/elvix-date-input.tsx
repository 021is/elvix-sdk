"use client";

/**
 * `<ElvixDateInput>` — single date input matching `<ElvixInput>`'s
 * chrome. Uses the browser's native date picker (one click for the
 * calendar, free keyboard typing path).
 *
 * The same field look as `<ElvixInput>` (`.elvix-field`), so a host's
 * field variables restyle both.
 *
 * Value contract: `""` or `"YYYY-MM-DD"`.
 */

import { forwardRef, type InputHTMLAttributes } from "react";
import { FIELD_CLASS, FIELD_PADDING } from "./elvix-input";

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
    { value, onChange, onBlur, hasError = false, className = "", ...rest },
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
        aria-invalid={hasError || undefined}
        {...rest}
        className={
          `${FIELD_CLASS} ${FIELD_PADDING.plain} tabular-nums ` +
          "[&::-webkit-calendar-picker-indicator]:cursor-pointer " +
          "[&::-webkit-calendar-picker-indicator]:opacity-70 " +
          "hover:[&::-webkit-calendar-picker-indicator]:opacity-100 " +
          className
        }
      />
    );
  },
);
