"use client";

import { type FormEvent, useState } from "react";
import { ElvixCard } from "./elvix-card";
import { useElvixContext } from "./elvix-provider";
import { appPatch } from "./lib";
import type { ElvixActionResult } from "../types/index";

/**
 * `<ElvixUsername>` — claim or change the end-user's username for the
 * current Application. PATCH /api/account/apps/<appId>/username.
 * Render a single in-frame card with two panes: edit + done.
 */
export function ElvixUsername({
  onResult,
}: {
  onResult?: (r: ElvixActionResult<{ username: string }>) => void;
}) {
  const ctx = useElvixContext();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ctx.app) return;
    setBusy(true);
    setError(null);
    const result = await appPatch<{ username: string }>(
      { baseUrl: ctx.baseUrl, applicationId: ctx.app.applicationId },
      "/username",
      { username: value.trim().toLowerCase() },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
    } else {
      setDone(result.data?.username ?? value.trim().toLowerCase());
    }
    onResult?.(result);
  }

  if (done) {
    return (
      <ElvixCard title="Username saved">
        <p>You are now <strong>@{done}</strong>.</p>
      </ElvixCard>
    );
  }

  return (
    <ElvixCard title="Choose a username">
      <form onSubmit={submit} className="elvix-form">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase())}
          placeholder="alice"
          pattern="[a-z][a-z0-9._]{2,28}[a-z0-9]"
          required
          disabled={busy}
          className="elvix-input"
        />
        <button type="submit" disabled={busy || value.length < 4} className="elvix-btn elvix-btn-primary">
          {busy ? "Saving…" : "Claim"}
        </button>
        {error && <p role="alert" className="elvix-error">{error}</p>}
      </form>
    </ElvixCard>
  );
}
