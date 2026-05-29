"use client";

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
 * Selected and idle styles paint with the active brand colour via
 * the CSS vars installed by `<ElvixProvider>` — no hard-coded
 * brand hex here, so a customer rebrand restyles the chips too.
 */

export type ElvixChipOption<T extends string> = {
  value: T;
  label: string;
};

export function ElvixChipGroup<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
  variant = "grid",
}: {
  options: ReadonlyArray<ElvixChipOption<T>>;
  value: T | "";
  onChange: (v: T) => void;
  columns?: 2 | 3 | 4;
  variant?: Variant;
}) {
  if (variant === "pills") {
    return (
      <div role="radiogroup" className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className={
                "cursor-pointer rounded-full px-3 py-1.5 text-[12.5px] font-medium leading-tight transition-all duration-150 " +
                (selected ? "text-[var(--elvix-on-primary)]" : "text-fg-2 hover:text-fg-1")
              }
              style={
                selected
                  ? {
                      backgroundColor: "var(--elvix-primary-strong)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                    }
                  : {
                      backgroundColor: "var(--elvix-primary-12)",
                      boxShadow: "inset 0 0 0 1px var(--elvix-primary-35)",
                    }
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (variant === "segmented") {
    return (
      <div
        role="radiogroup"
        className="flex w-full items-stretch overflow-hidden rounded-full p-0.5"
        style={{
          backgroundColor: "var(--elvix-primary-12)",
          boxShadow: "inset 0 0 0 1px var(--elvix-primary-35)",
        }}
      >
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className={
                "flex-1 cursor-pointer rounded-full px-2 py-1.5 text-[12.5px] font-medium leading-tight transition-all duration-150 " +
                (selected ? "text-[var(--elvix-on-primary)]" : "text-fg-2 hover:text-fg-1")
              }
              style={
                selected
                  ? {
                      backgroundColor: "var(--elvix-primary-strong)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                    }
                  : undefined
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }
  const cols = columns === 4 ? "grid-cols-4" : columns === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div className={"grid gap-2 " + cols}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={
              selected
                ? {
                    backgroundColor: "var(--elvix-primary-12)",
                    boxShadow: "inset 0 0 0 2px var(--elvix-primary)",
                  }
                : {
                    boxShadow: "inset 0 0 0 1.5px var(--elvix-primary-55)",
                  }
            }
            className={
              "cursor-pointer rounded-[10px] h-10 px-3 text-[13px] font-medium " +
              "transition-all duration-150 " +
              (selected
                ? "text-fg-1 "
                : "text-fg-2 hover:[box-shadow:inset_0_0_0_1.5px_var(--elvix-primary)] ")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
