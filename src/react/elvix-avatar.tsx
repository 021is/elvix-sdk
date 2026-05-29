"use client";

import { type ChangeEvent, useState } from "react";
import { ElvixCard } from "./elvix-card";
import { useElvixContext } from "./elvix-provider";
import { appPatch } from "./lib";
import type { ElvixSizeProps } from "./size";
import type { ElvixActionResult } from "../types/index";

/**
 * `<ElvixAvatar>` — upload / replace the end-user's avatar for this
 * Application. Reads file → base64 → PATCH /api/account/apps/<appId>/avatar.
 */
export function ElvixAvatar({
  onResult,
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
}: {
  onResult?: (r: ElvixActionResult<{ avatarUrl: string }>) => void;
} & ElvixSizeProps) {
  const sizeProps: ElvixSizeProps = { width, height, minWidth, maxWidth, minHeight, maxHeight };
  const ctx = useElvixContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !ctx.app) return;
    if (file.size > 4 * 1024 * 1024) {
      setError("file_too_large");
      return;
    }
    setBusy(true);
    setError(null);
    const buf = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const dataUrl = `data:${file.type};base64,${b64}`;
    setPreview(dataUrl);
    const result = await appPatch<{ avatarUrl: string }>(
      { baseUrl: ctx.baseUrl, applicationId: ctx.app.applicationId },
      "/avatar",
      { avatarDataUrl: dataUrl },
    );
    setBusy(false);
    if (!result.ok) setError(result.error);
    onResult?.(result);
  }

  return (
    <ElvixCard title="Avatar" {...sizeProps}>
      {preview && (
        <img
          src={preview}
          alt="avatar preview"
          style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", marginBottom: 12 }}
        />
      )}
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} disabled={busy} />
      {busy && <p>Uploading…</p>}
      {error && <p role="alert" className="elvix-error">{error}</p>}
    </ElvixCard>
  );
}
