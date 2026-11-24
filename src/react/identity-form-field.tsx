"use client";

/**
 * `<ElvixIdentityForm>`'s labelled fields, apart from the form (0.27, which added the field hint
 * and the Display name and took the form past 300 lines).
 */

import { type ReactNode, useId } from "react";
import { useT } from "../locale/use-t";
import { ElvixInput } from "./elvix-input";

export const LABEL_CLASS = "block text-[13px] font-medium text-fg-2 mb-1.5";

type FieldA11y = { id: string; "aria-invalid": boolean; "aria-describedby"?: string };

/** A labelled single control: the label names it (`htmlFor`), and the hint
 *  and the error are announced with it (`aria-describedby`). The control
 *  spreads `a11y`. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  /** A line under the control saying what the field is for. */
  hint?: string;
  error: string | undefined;
  children: (a11y: FieldA11y) => ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy || undefined,
      })}
      {hint && (
        <span id={hintId} className="block mt-1 text-[12px] text-fg-3">
          {hint}
        </span>
      )}
      <FieldError id={errorId} error={error} />
    </div>
  );
}

export function FieldError({ id, error }: { id?: string; error: string | undefined }) {
  if (!error) return null;
  return (
    <span id={id} className="block mt-1 text-[12px] text-red-600 dark:text-red-400">
      {error}
    </span>
  );
}

/** What others see in the app (Edvard, TF175): under the names, with what it is for. */
export function DisplayNameField({
  value,
  error,
  onChange,
  onBlur,
}: {
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const t = useT();
  return (
    <Field label={t("identity.displayName")} hint={t("identity.displayNameHint")} error={error}>
      {(a11y) => (
        <ElvixInput
          {...a11y}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoComplete="nickname"
          maxLength={80}
          hasError={Boolean(error)}
        />
      )}
    </Field>
  );
}
