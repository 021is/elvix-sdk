"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ElvixCard } from "./elvix-card";
import { useElvixContext } from "./elvix-provider";
import { appDelete, appPost } from "./lib";
import { authInit } from "./session";
import type { ElvixSizeProps } from "./size";
import type { ElvixActionResult } from "../types/index";

type Entity = {
  id: string;
  legalName: string;
  taxId: string;
  country: string;
};

/**
 * `<ElvixLegalEntities>` — list / add / remove the end-user's legal
 * entities (company names + tax IDs) on this Application. Useful for
 * B2B apps that bill at the entity level.
 */
export function ElvixLegalEntities({
  onResult,
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
}: {
  onResult?: (r: ElvixActionResult) => void;
} & ElvixSizeProps) {
  const sizeProps: ElvixSizeProps = { width, height, minWidth, maxWidth, minHeight, maxHeight };
  const ctx = useElvixContext();
  const [rows, setRows] = useState<Entity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Omit<Entity, "id">>({
    legalName: "",
    taxId: "",
    country: "",
  });

  function reload() {
    if (!ctx.app) return;
    fetch(`${ctx.baseUrl}/api/account/apps/${ctx.app.applicationId}/legal-entities`, {
      ...authInit(),
    })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: { entities: Entity[] } }) => {
        if (j.success && j.data) setRows(j.data.entities);
        else setError("load_failed");
      })
      .catch(() => setError("network"));
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.app, ctx.baseUrl]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!ctx.app) return;
    setBusy(true);
    const result = await appPost(
      { baseUrl: ctx.baseUrl, applicationId: ctx.app.applicationId },
      "/legal-entities",
      form,
    );
    setBusy(false);
    if (result.ok) {
      setAdding(false);
      setForm({ legalName: "", taxId: "", country: "" });
      reload();
    } else {
      setError(result.error);
    }
    onResult?.(result);
  }

  async function remove(id: string) {
    if (!ctx.app) return;
    setBusy(true);
    const result = await appDelete(
      { baseUrl: ctx.baseUrl, applicationId: ctx.app.applicationId },
      `/legal-entities/${id}`,
    );
    setBusy(false);
    if (result.ok) setRows((prev) => prev?.filter((a) => a.id !== id) ?? null);
    onResult?.(result);
  }

  return (
    <ElvixCard title="Legal entities" {...sizeProps}>
      {error && <p role="alert" className="elvix-error">{error}</p>}
      {!rows && !error && <p>Loading…</p>}
      {rows && rows.length === 0 && <p className="elvix-muted">No legal entities yet.</p>}
      {rows?.map((e) => (
        <div key={e.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 500 }}>{e.legalName}</div>
            <div style={{ color: "rgba(0,0,0,0.55)" }}>
              {e.taxId} · {e.country}
            </div>
          </div>
          <button type="button" disabled={busy} onClick={() => remove(e.id)} className="elvix-btn elvix-btn-ghost">
            Remove
          </button>
        </div>
      ))}
      {!adding && (
        <button type="button" onClick={() => setAdding(true)} className="elvix-btn elvix-btn-primary" style={{ marginTop: 12 }}>
          Add entity
        </button>
      )}
      {adding && (
        <form onSubmit={add} className="elvix-form" style={{ marginTop: 12 }}>
          <input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} placeholder="Legal name" required className="elvix-input" />
          <input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} placeholder="Tax / VAT ID" required className="elvix-input" />
          <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} placeholder="Country (ISO-2)" maxLength={2} required className="elvix-input" />
          <button type="submit" disabled={busy} className="elvix-btn elvix-btn-primary">
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </ElvixCard>
  );
}
