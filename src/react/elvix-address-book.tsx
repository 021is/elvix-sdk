"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ElvixCard } from "./elvix-card";
import { useElvixContext } from "./elvix-provider";
import { appDelete, appPost } from "./lib";
import { authInit } from "./session";
import type { ElvixSizeProps } from "./size";
import type { ElvixActionResult } from "../types/index";

type Address = {
  id: string;
  label: string;
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  country: string;
};

/**
 * `<ElvixAddressBook>` — list / add / remove the end-user's addresses
 * on this Application. Read uses GET /api/account/apps/<appId>/addresses;
 * mutations POST + DELETE on the same path.
 */
export function ElvixAddressBook({
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
  const [rows, setRows] = useState<Address[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Omit<Address, "id">>({
    label: "Home",
    line1: "",
    postalCode: "",
    city: "",
    country: "",
  });

  function reload() {
    if (!ctx.app) return;
    fetch(`${ctx.baseUrl}/api/account/apps/${ctx.app.applicationId}/addresses`, {
      ...authInit(),
    })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: { addresses: Address[] } }) => {
        if (j.success && j.data) setRows(j.data.addresses);
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
      "/addresses",
      form,
    );
    setBusy(false);
    if (result.ok) {
      setAdding(false);
      setForm({ label: "Home", line1: "", postalCode: "", city: "", country: "" });
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
      `/addresses/${id}`,
    );
    setBusy(false);
    if (result.ok) setRows((prev) => prev?.filter((a) => a.id !== id) ?? null);
    onResult?.(result);
  }

  return (
    <ElvixCard title="Addresses" {...sizeProps}>
      {error && <p role="alert" className="elvix-error">{error}</p>}
      {!rows && !error && <p>Loading…</p>}
      {rows && rows.length === 0 && <p className="elvix-muted">No addresses yet.</p>}
      {rows?.map((a) => (
        <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 500 }}>{a.label}</div>
            <div style={{ color: "rgba(0,0,0,0.55)" }}>
              {a.line1}
              {a.line2 ? `, ${a.line2}` : ""}, {a.postalCode} {a.city}, {a.country}
            </div>
          </div>
          <button type="button" disabled={busy} onClick={() => remove(a.id)} className="elvix-btn elvix-btn-ghost">
            Remove
          </button>
        </div>
      ))}
      {!adding && (
        <button type="button" onClick={() => setAdding(true)} className="elvix-btn elvix-btn-primary" style={{ marginTop: 12 }}>
          Add address
        </button>
      )}
      {adding && (
        <form onSubmit={add} className="elvix-form" style={{ marginTop: 12 }}>
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Label" className="elvix-input" />
          <input value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} placeholder="Street" required className="elvix-input" />
          <input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} placeholder="Postal code" required className="elvix-input" />
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" required className="elvix-input" />
          <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} placeholder="Country (ISO-2)" maxLength={2} required className="elvix-input" />
          <button type="submit" disabled={busy} className="elvix-btn elvix-btn-primary">
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </ElvixCard>
  );
}
