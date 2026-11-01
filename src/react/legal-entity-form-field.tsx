"use client";

/**
 * One labelled text field with its error and hint, for the legal-entity
 * panes that ask for one or several values (a person's name, where
 * e-invoices go, the invoice email). The input is `<ElvixInput>`, so the
 * host's field variables style it; the error line is announced.
 */

import type { HTMLInputTypeAttribute } from "react";
import { ElvixInput } from "./elvix-input";

export function FormField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: HTMLInputTypeAttribute;
  maxLength?: number;
  /** Shown under the field and marks it invalid; null when the value is fine. */
  error?: string | null;
  /** A quiet line under the field when there is no error. */
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{props.label}</span>
      <ElvixInput
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        maxLength={props.maxLength ?? 240}
        hasError={Boolean(props.error)}
        aria-invalid={Boolean(props.error)}
        autoFocus={props.autoFocus}
      />
      {props.error ? (
        <span role="alert" className="mt-1.5 block text-[12px] text-red-600 dark:text-red-300">
          {props.error}
        </span>
      ) : props.hint ? (
        <span className="mt-1.5 block text-[12px] text-fg-3">{props.hint}</span>
      ) : null}
    </label>
  );
}
