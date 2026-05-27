"use client";

import { useState } from "react";
import { ElvixCard } from "./elvix-card";
import { useElvixContext } from "./elvix-provider";
import { appPost } from "./lib";
import type { ElvixActionResult } from "../types/index";

/**
 * `<ElvixExport>` — GDPR Art. 15 data-export request. Triggers an
 * async server-side zip + emails a single-use download link to the
 * end-user's bound email address.
 */
export function ElvixExport({
  onResult,
}: {
  onResult?: (r: ElvixActionResult<{ requestId: string }>) => void;
}) {
  const ctx = useElvixContext();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!ctx.app) return;
    setBusy(true);
    setError(null);
    const result = await appPost<{ requestId: string }>(
      { baseUrl: ctx.baseUrl, applicationId: ctx.app.applicationId },
      "/export",
      {},
    );
    setBusy(false);
    if (!result.ok) setError(result.error);
    else setDone(true);
    onResult?.(result);
  }

  return (
    <ElvixCard title="Export my data">
      <p style={{ fontSize: 13, color: "rgba(0,0,0,0.6)" }}>
        Request a zip of every record we hold for you in this app. Delivery by email; single-use download link valid for 24h.
      </p>
      {done ? (
        <p className="elvix-muted">Request queued. Check your email.</p>
      ) : (
        <button type="button" onClick={start} disabled={busy} className="elvix-btn elvix-btn-primary">
          {busy ? "Queuing…" : "Request export"}
        </button>
      )}
      {error && <p role="alert" className="elvix-error">{error}</p>}
    </ElvixCard>
  );
}
