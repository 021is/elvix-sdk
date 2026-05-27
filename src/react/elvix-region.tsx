"use client";

import { type FormEvent, useState } from "react";
import { ElvixCard } from "./elvix-card";
import { useElvixContext } from "./elvix-provider";
import { appPatch } from "./lib";
import type { ElvixActionResult } from "../types/index";

/**
 * `<ElvixRegion>` — set the end-user's region (ISO 3166-1 alpha-2
 * country code + timezone). Used by elvix for data-residency hints
 * and locale defaults.
 */
export function ElvixRegion({
  initialCountry = "",
  initialTimezone = "",
  onResult,
}: {
  initialCountry?: string;
  initialTimezone?: string;
  onResult?: (r: ElvixActionResult<{ country: string; timezone: string }>) => void;
}) {
  const ctx = useElvixContext();
  const [country, setCountry] = useState(initialCountry);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ctx.app) return;
    setBusy(true);
    setError(null);
    const result = await appPatch<{ country: string; timezone: string }>(
      { baseUrl: ctx.baseUrl, applicationId: ctx.app.applicationId },
      "/region",
      { country: country.toUpperCase().slice(0, 2), timezone: timezone.trim() },
    );
    setBusy(false);
    if (!result.ok) setError(result.error);
    else setSaved(true);
    onResult?.(result);
  }

  return (
    <ElvixCard title="Region">
      <form onSubmit={submit} className="elvix-form">
        <label>
          Country (ISO-2)
          <input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} pattern="[A-Z]{2}" disabled={busy} className="elvix-input" />
        </label>
        <label>
          Timezone
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Europe/Berlin" disabled={busy} className="elvix-input" />
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
