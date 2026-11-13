"use client";

/**
 * The search box over a list (a language, a currency, a time zone, an address, a city): the
 * glass at its start, a spinner at its end while a search is out, focused when its pane opens.
 * Seven panes drew it by hand until 0.26.2, each with its own icons and a `pl-9` that a
 * Tailwind host's `.px-3` could override; it is one field now, and its icons are
 * `<ElvixInput>`'s slots, which choose the padding.
 */

import { Loader2, Search } from "lucide-react";
import { ElvixInput } from "./elvix-input";

export function SearchField({
  value,
  onChange,
  placeholder,
  searching = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /** A request for this query is out: the spinner shows at the field's end. */
  searching?: boolean;
}) {
  return (
    <ElvixInput
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus
      autoComplete="off"
      start={<Search className="size-4" />}
      end={searching && <Loader2 className="size-4 animate-spin" />}
    />
  );
}
