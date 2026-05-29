"use client";

import { useEffect, useState } from "react";
import { ElvixCard } from "./elvix-card";
import { useElvixContext } from "./elvix-provider";
import { appDelete } from "./lib";
import { authInit } from "./session";
import type { ElvixSizeProps } from "./size";
import type { ElvixActionResult } from "../types/index";

/**
 * `<ElvixSessions>` — lists the end-user's active sessions on this
 * Application and lets them revoke any single one or "sign out
 * everywhere except this device."
 */
type SessionRow = {
  id: string;
  device: string;
  country: string | null;
  createdAt: string;
  current: boolean;
};

export function ElvixSessions({
  onResult,
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
}: {
  onResult?: (r: ElvixActionResult<{ revoked: number }>) => void;
} & ElvixSizeProps) {
  const sizeProps: ElvixSizeProps = { width, height, minWidth, maxWidth, minHeight, maxHeight };
  const ctx = useElvixContext();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ctx.app) return;
    fetch(`${ctx.baseUrl}/api/account/apps/${ctx.app.applicationId}/sessions`, {
      ...authInit(),
    })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: { sessions: SessionRow[] } }) => {
        if (j.success && j.data) setRows(j.data.sessions);
        else setError("load_failed");
      })
      .catch(() => setError("network"));
  }, [ctx.app, ctx.baseUrl]);

  async function revoke(id: string) {
    if (!ctx.app) return;
    setBusy(true);
    const result = await appDelete<{ revoked: number }>(
      { baseUrl: ctx.baseUrl, applicationId: ctx.app.applicationId },
      `/sessions/${id}`,
    );
    setBusy(false);
    if (result.ok) setRows((prev) => prev?.filter((s) => s.id !== id) ?? null);
    onResult?.(result);
  }

  return (
    <ElvixCard title="Active sessions" {...sizeProps}>
      {error && <p role="alert" className="elvix-error">{error}</p>}
      {!rows && !error && <p>Loading…</p>}
      {rows && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((s) => (
            <li key={s.id} style={{ padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {s.device}
                    {s.current && <span style={{ marginLeft: 8, color: "var(--elvix-primary-strong)", fontSize: 11 }}>· this device</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>
                    {s.country ?? "—"} · since {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                </div>
                {!s.current && (
                  <button type="button" disabled={busy} onClick={() => revoke(s.id)} className="elvix-btn elvix-btn-ghost">
                    Revoke
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </ElvixCard>
  );
}
