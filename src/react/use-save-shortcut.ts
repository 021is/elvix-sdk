"use client";

import { useEffect } from "react";
import { useStableCallback } from "./use-stable-callback";

/**
 * Registers a global Cmd/Ctrl+S handler that calls `onSave` when
 * pressed. The browser's native "save page" dialog is suppressed
 * via preventDefault().
 *
 * Pass `enabled={false}` to temporarily detach (e.g. while another
 * modal owns the keyboard).
 */
export function useSaveShortcut(onSave: () => void, enabled = true) {
  // One listener for the component's life: `onSave` changes with every edit
  // in a form, and re-binding a window listener per keystroke is waste.
  const save = useStableCallback(onSave);
  useEffect(() => {
    if (!enabled) return;
    function handler(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key !== "s" && e.key !== "S") return;
      e.preventDefault();
      save();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save, enabled]);
}
