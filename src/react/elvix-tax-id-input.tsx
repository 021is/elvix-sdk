"use client";

/**
 * `<ElvixTaxIdInput>` — VAT / tax identifier input. Runs a purely
 * client-side per-country format check (regex from `lib/tax-validation`)
 * and surfaces three inline states:
 *
 *   ✗   invalid format   — doesn't match the country's pattern
 *   ⚠   format-only      — matches format, awaiting authority verification
 *   (none)               — empty input
 *
 * No network requests. The live authority lookup (VIES, BRREG, …) is
 * the responsibility of the surrounding wizard's Verifying pane,
 * which calls `/public/api/tax/validate` exactly once on submit.
 * Keeping the input network-free avoids double-validation per
 * keystroke + per pane-advance.
 */

import { ElvixInput } from "./elvix-input";
import type { TaxValidationLevel } from "./legal-entity-schema";
import { normaliseTaxId, vatIdFormatMatches } from "./tax-validation";
import { AlertTriangle, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

export type TaxIdValidationState = {
  level: TaxValidationLevel | "checking" | "invalid";
  name: string | null;
  authority: string | null;
  normalisedId: string;
};

export type ElvixTaxIdInputProps = {
  /** ISO-3166-1 alpha-2 of the tax-residence country. */
  country: string;
  value: string;
  onChange: (next: string) => void;
  /** Fires whenever the format-check verdict changes. */
  onValidationChange?: (state: TaxIdValidationState) => void;
  placeholder?: string;
  /** Initial validation state from a saved record. */
  initialState?: TaxIdValidationState;
  autoFocus?: boolean;
  className?: string;
};

export function ElvixTaxIdInput({
  country,
  value,
  onChange,
  onValidationChange,
  placeholder,
  autoFocus,
  className,
}: ElvixTaxIdInputProps) {
  const lastCountry = useRef<string>(country);

  const computeState = useCallback((input: string, isoCountry: string): TaxIdValidationState => {
    const trimmed = input.trim();
    if (!trimmed || !isoCountry) {
      return { level: "none", name: null, authority: null, normalisedId: "" };
    }
    const normalised = normaliseTaxId(trimmed);
    if (vatIdFormatMatches(isoCountry, trimmed)) {
      return { level: "format", name: null, authority: null, normalisedId: normalised };
    }
    return { level: "invalid", name: null, authority: null, normalisedId: normalised };
  }, []);

  // Reset when country changes — a VAT id is meaningful only against
  // the country it was issued in.
  useEffect(() => {
    if (lastCountry.current !== country) {
      lastCountry.current = country;
      onValidationChange?.(computeState(value, country));
    }
  }, [country, value, computeState, onValidationChange]);

  // Emit on every value change synchronously — no debounce needed,
  // the format check is a pure regex/checksum.
  useEffect(() => {
    onValidationChange?.(computeState(value, country));
  }, [value, country, computeState, onValidationChange]);

  const state = computeState(value, country);

  return (
    <div className={"relative w-full " + (className ?? "")}>
      <ElvixInput
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        className="pr-10"
        // LEGACY: spine-lint-disable-next-line spine/enum-over-string
        hasError={state.level === "invalid"}
      />
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
        <StatusBadge level={state.level} />
      </div>
    </div>
  );
}

function StatusBadge({ level }: { level: TaxIdValidationState["level"] }) {
  if (level === "invalid") {
    return <XCircle className="size-4 text-red-500" aria-label="Invalid format" />;
  }
  if (level === "format") {
    return (
      <AlertTriangle
        className="size-4 text-amber-500"
        aria-label="Format OK — pending authority verification"
      />
    );
  }
  return null;
}
