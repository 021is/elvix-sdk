"use client";

import { useEffect } from "react";

/**
 * Registers a global Cmd/Ctrl+S handler that calls `onSave` when
 * pressed. The browser's native "save page" dialog is suppressed
 * via preventDefault().
 *
 * Pass `enabled={false}` to temporarily detach (e.g. while another
 * modal owns the keyboard).
 */
export function useSaveShortcut(onSave: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function handler(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key !== "s" && e.key !== "S") return;
      e.preventDefault();
      onSave();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSave, enabled]);
}
