"use client";

/**
 * `<ElvixCountrySelect>` — searchable country picker for the elvix
 * SDK. Used by the Legal Entities wizard for nationality and tax-
 * residence pickers; reusable anywhere we need an ISO-3166 input.
 *
 * Renders the picker as an inline expanding combobox (no popover /
 * portal) so it fits inside the wizard panes without z-index
 * games. Single-select; multi-select callers (e.g. nationality
 * with dual citizenship) compose this primitive twice rather than
 * baking multi-select here.
 *
 * Props:
 *   value         — ISO alpha-2 currently selected, or null.
 *   onChange      — fired with the new ISO alpha-2 on selection.
 *   restrictTo    — optional allowlist; only these codes are picker-
 *                    able. Falls back to all ISO countries.
 *   placeholder   — copy in the search input when no value.
 */

import { COUNTRIES, type Country, findCountry } from "./countries";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type ElvixCountrySelectProps = {
  value: string | null;
  onChange: (code: string) => void;
  restrictTo?: readonly string[];
  placeholder?: string;
  /**
   * Show only the selected button when collapsed, and reveal the
   * search + list on click. Default `true`. Set `false` to force
   * the list always visible (e.g. when the picker IS the whole pane).
   */
  collapsible?: boolean;
  className?: string;
  /**
   * Tailwind max-h class for the scrollable listbox. Default
   * `max-h-52` (208px). Pickers stacked with other content (e.g.
   * NationalityView's chip row) should shrink it so the surrounding
   * pane's Continue button stays in view.
   */
  listMaxHeightClass?: string;
};

export function ElvixCountrySelect({
  value,
  onChange,
  restrictTo,
  placeholder = "Search countries",
  collapsible = true,
  className = "",
  listMaxHeightClass = "max-h-52",
}: ElvixCountrySelectProps) {
  const [open, setOpen] = useState(!collapsible);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRowRef = useRef<HTMLLIElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const allow = restrictTo;
  // When no query is active and there's a selection, pin it to the top
  // of the list so the user can always see what's currently picked
  // without scrolling. While typing, fall back to plain search order.
  const filtered = useMemo<readonly Country[]>(() => {
    const list = allow
      ? COUNTRIES.filter((co) => (allow as readonly string[]).includes(co.code))
      : COUNTRIES;
    const q = query.trim().toLowerCase();
    if (q) {
      return list.filter(
        (co) => co.name.toLowerCase().includes(q) || co.code.toLowerCase().includes(q),
      );
    }
    if (!value) return list;
    const selectedIdx = list.findIndex((co) => co.code === value);
    if (selectedIdx <= 0) return list;
    const sel = list[selectedIdx]!;
    return [sel, ...list.slice(0, selectedIdx), ...list.slice(selectedIdx + 1)];
  }, [allow, query, value]);

  const selected = findCountry(value);

  useEffect(() => {
    if (open && collapsible) inputRef.current?.focus();
  }, [open, collapsible]);

  // When the list opens or the value changes, snap the scroll back to
  // the top so the pinned selected row is in view immediately.
  useEffect(() => {
    if (!open) return;
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [open, value]);

  const pick = (code: string) => {
    onChange(code);
    setQuery("");
    if (collapsible) setOpen(false);
  };

  return (
    <div className={"w-full " + className}>
      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-[10px] border border-fg-3/25 bg-canvas px-3 py-2 text-left text-[14px] text-fg-1 transition hover:border-[var(--elvix-primary)] focus:border-[var(--elvix-primary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--elvix-primary)_25%,transparent)] cursor-pointer"
        >
          {selected ? (
            <>
              <span aria-hidden className="text-base leading-none">
                {selected.flag}
              </span>
              <span className="truncate">{selected.name}</span>
              <span className="text-fg-3 text-[12px]">({selected.code})</span>
            </>
          ) : (
            <span className="text-fg-3">{placeholder}</span>
          )}
          <ChevronDown
            className={"ml-auto size-4 shrink-0 text-fg-3 transition " + (open ? "rotate-180" : "")}
          />
        </button>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={collapsible ? { height: 0, opacity: 0 } : false}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className={collapsible ? "mt-2" : ""}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={placeholder}
                  className="w-full rounded-[10px] border border-fg-3/25 bg-canvas py-2 pl-9 pr-3 text-[14px] text-fg-1 placeholder:text-fg-3 focus:border-[var(--elvix-primary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--elvix-primary)_25%,transparent)]"
                />
              </div>

              <ul
                ref={listRef}
                role="listbox"
                className={
                  "mt-2 overflow-y-auto rounded-[10px] border border-fg-3/15 bg-surface [scrollbar-width:none] [&::-webkit-scrollbar]:hidden " +
                  listMaxHeightClass
                }
              >
                {filtered.length === 0 && (
                  <li className="px-3 py-2 text-[13px] text-fg-3">No matches</li>
                )}
                {filtered.map((co, idx) => {
                  const isSelected = co.code === value;
                  // When there's no query and a selection exists, the
                  // first row is the pinned selected country — separate
                  // it visually with a "Selected" caption + divider.
                  const showSelectedCaption =
                    !query.trim() && isSelected && idx === 0 && filtered.length > 1;
                  return (
                    <li
                      key={co.code}
                      ref={isSelected ? selectedRowRef : undefined}
                      className={
                        showSelectedCaption ? "border-b border-fg-3/15 pb-1 [&+li]:pt-1" : ""
                      }
                    >
                      {showSelectedCaption && (
                        <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--elvix-primary)]">
                          Selected
                        </div>
                      )}
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => pick(co.code)}
                        className={
                          "flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] transition cursor-pointer " +
                          (isSelected
                            ? "bg-[color-mix(in_srgb,var(--elvix-primary)_14%,transparent)] text-fg-1 ring-1 ring-inset ring-[var(--elvix-primary)] font-medium"
                            : "text-fg-1 hover:bg-[color-mix(in_srgb,var(--elvix-primary)_5%,transparent)]")
                        }
                      >
                        <span aria-hidden className="text-base leading-none">
                          {co.flag}
                        </span>
                        <span className="flex-1 truncate">{co.name}</span>
                        <span
                          className={isSelected ? "text-[11px] text-fg-2" : "text-[11px] text-fg-3"}
                        >
                          {co.code}
                        </span>
                        {isSelected && <Check className="size-4 text-[var(--elvix-primary)]" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
