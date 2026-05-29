"use client";

import { type FormEvent, useState } from "react";
import { ElvixCard } from "./elvix-card";
import { useElvixContext } from "./elvix-provider";
import { appPatch } from "./lib";
import type { ElvixSizeProps } from "./size";
import type { ElvixActionResult } from "../types/index";

/**
 * `<ElvixIdentityForm>` — edit the end-user's display name + bio for
 * the current Application. Lightweight per-app profile fields.
 */
export function ElvixIdentityForm({
  initialName = "",
  initialBio = "",
  onResult,
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
}: {
  initialName?: string;
  initialBio?: string;
  onResult?: (r: ElvixActionResult<{ name: string; bio: string }>) => void;
} & ElvixSizeProps) {
  const sizeProps: ElvixSizeProps = { width, height, minWidth, maxWidth, minHeight, maxHeight };
  const ctx = useElvixContext();
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ctx.app) return;
    setBusy(true);
    setError(null);
    const result = await appPatch<{ name: string; bio: string }>(
      { baseUrl: ctx.baseUrl, applicationId: ctx.app.applicationId },
      "/identity",
      { name: name.trim(), bio: bio.trim() },
    );
    setBusy(false);
    if (!result.ok) setError(result.error);
    else setSaved(true);
    onResult?.(result);
  }

  return (
    <ElvixCard title="Identity" {...sizeProps}>
      <form onSubmit={submit} className="elvix-form">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={busy} className="elvix-input" />
        </label>
        <label>
          Bio
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={3} disabled={busy} className="elvix-input" />
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
