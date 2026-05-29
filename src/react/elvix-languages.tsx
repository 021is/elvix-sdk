"use client";

import { type FormEvent, useState } from "react";
import { ElvixCard } from "./elvix-card";
import { useElvixContext } from "./elvix-provider";
import { appPatch } from "./lib";
import type { ElvixSizeProps } from "./size";
import type { ElvixActionResult } from "../types/index";

/**
 * `<ElvixLanguages>` — set the end-user's preferred languages (BCP-47
 * tag list, ordered by preference). The first entry drives UI locale.
 */
export function ElvixLanguages({
  initial = [],
  onResult,
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
}: {
  initial?: string[];
  onResult?: (r: ElvixActionResult<{ languages: string[] }>) => void;
} & ElvixSizeProps) {
  const sizeProps: ElvixSizeProps = { width, height, minWidth, maxWidth, minHeight, maxHeight };
  const ctx = useElvixContext();
  const [raw, setRaw] = useState(initial.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ctx.app) return;
    setBusy(true);
    setError(null);
    const languages = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const result = await appPatch<{ languages: string[] }>(
      { baseUrl: ctx.baseUrl, applicationId: ctx.app.applicationId },
      "/languages",
      { languages },
    );
    setBusy(false);
    if (!result.ok) setError(result.error);
    else setSaved(true);
    onResult?.(result);
  }

  return (
    <ElvixCard title="Languages" {...sizeProps}>
      <form onSubmit={submit} className="elvix-form">
        <label>
          Preferred languages (comma-separated BCP-47 tags)
          <input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="en-GB, de-DE" disabled={busy} className="elvix-input" />
        </label>
        <button type="submit" disabled={busy} className="elvix-btn elvix-btn-primary">
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <p className="elvix-muted">Saved.</p>}
        {error && <p role="alert" className="elvix-error">{error}</p>}
      </form>
    </ElvixCard>
  );
}
