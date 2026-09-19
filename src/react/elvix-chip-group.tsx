"use client";

import { type CSSProperties, type ReactNode, useId } from "react";

const Variant = {
  GRID: "grid",
  PILLS: "pills",
  SEGMENTED: "segmented",
} as const;
type Variant = (typeof Variant)[keyof typeof Variant];

/**
 * `<ElvixChipGroup>` — single-select chip selector. Used for any
 * enum small enough to render inline (gender, plan tier, country
 * preference, etc).
 *
 * Three variants:
 *
 *   `grid` (default) — chunky 2/3/4-column tiles. Best when each
 *                       option warrants real estate (subscription
 *                       plans, app types, etc).
 *
 *   `pills`          — RECOMMENDED for short enums (gender, plan,
 *                       yes/no). Content-sized rounded-pill chips
 *                       that flex-wrap. i18n-safe: chips auto-size
 *                       to each translated label, the row overflows
 *                       to a second line gracefully under long
 *                       German/French copy. Compact when labels
 *                       fit, no squashing when they don't.
 *
 *   `segmented`      — iOS-style single-row segmented control with
 *                       equal-width segments in a shared track.
 *                       BEWARE: forces every locale into the same
 *                       per-segment width — long-label locales
 *                       wrap awkwardly inside their cell. Use only
 *                       when label length is guaranteed bounded
 *                       (numeric/short fixed enums, never user copy).
 *
 * Semantics: a `<fieldset>` of native radio inputs (visually hidden) inside
 * styled labels, so arrow keys move between options, a screen reader
 * announces "radio, 2 of 4", and the choice takes part in a form, all without
 * custom key handling. Pass `legend` to name the group; never wrap the group
 * in a `<label>` (a label names one control, not a set).
 *
 * Selected and idle styles paint with the active brand colour via
 * the CSS vars installed by `<ElvixProvider>` — no hard-coded
 * brand hex here, so a customer rebrand restyles the chips too.
 */

export type ElvixChipOption<T extends string> = {
  value: T;
  label: string;
};

const SELECTED_FILL: CSSProperties = {
  backgroundColor: "var(--elvix-primary-strong)",
  boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
};

type Look = {
  group: string;
  groupStyle?: CSSProperties;
  chip: string;
  selected: { className: string; style?: CSSProperties };
  idle: { className: string; style?: CSSProperties };
};

const PILL_TEXT = "text-[12.5px] font-medium leading-tight";

const LOOKS: Record<Exclude<Variant, "grid">, Look> = {
  pills: {
    group: "flex flex-wrap gap-1.5",
    chip: `rounded-full px-3 py-1.5 ${PILL_TEXT}`,
    selected: { className: "text-[var(--elvix-on-primary)]", style: SELECTED_FILL },
    idle: {
      className: "text-fg-2 hover:text-fg-1",
      style: {
        backgroundColor: "var(--elvix-primary-12)",
        boxShadow: "inset 0 0 0 1px var(--elvix-primary-35)",
      },
    },
  },
  segmented: {
    group: "flex w-full items-stretch overflow-hidden rounded-full p-0.5",
    groupStyle: {
      backgroundColor: "var(--elvix-primary-12)",
      boxShadow: "inset 0 0 0 1px var(--elvix-primary-35)",
    },
    chip: `flex-1 rounded-full px-2 py-1.5 text-center ${PILL_TEXT}`,
    selected: { className: "text-[var(--elvix-on-primary)]", style: SELECTED_FILL },
    idle: { className: "text-fg-2 hover:text-fg-1" },
  },
};

const GRID_COLS = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" } as const;

function gridLook(columns: 2 | 3 | 4): Look {
  return {
    group: `grid gap-2 ${GRID_COLS[columns]}`,
    chip: "grid h-10 place-items-center rounded-[10px] px-3 text-[13px] font-medium",
    selected: {
      className: "text-fg-1",
      style: {
        backgroundColor: "var(--elvix-primary-12)",
        boxShadow: "inset 0 0 0 2px var(--elvix-primary)",
      },
    },
    idle: {
      className: "text-fg-2 hover:[box-shadow:inset_0_0_0_1.5px_var(--elvix-primary)]",
      style: { boxShadow: "inset 0 0 0 1.5px var(--elvix-primary-55)" },
    },
  };
}

export function ElvixChipGroup<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
  variant = "grid",
  legend,
  legendClassName,
}: {
  options: ReadonlyArray<ElvixChipOption<T>>;
  value: T | "";
  onChange: (v: T) => void;
  columns?: 2 | 3 | 4;
  variant?: Variant;
  /** Names the group for assistive tech (rendered as its `<legend>`). */
  legend?: ReactNode;
  legendClassName?: string;
}) {
  const name = useId();
  const look = variant === "grid" ? gridLook(columns) : LOOKS[variant];
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      {legend ? <legend className={legendClassName}>{legend}</legend> : null}
      <div className={look.group} style={look.groupStyle}>
        {options.map((opt) => {
          const selected = value === opt.value;
          const state = selected ? look.selected : look.idle;
          return (
            <label
              key={opt.value}
              className={`${look.chip} ${state.className} cursor-pointer transition-all duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--elvix-primary)] has-[:focus-visible]:ring-offset-1`}
              style={state.style}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={selected}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              {opt.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
