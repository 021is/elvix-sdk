"use client";

import { type ChangeEvent, useState } from "react";
import { ElvixCard } from "./elvix-card";
import { useElvixContext } from "./elvix-provider";
import { appPatch } from "./lib";
import type { ElvixSizeProps } from "./size";
import type { ElvixActionResult } from "../types/index";

/**
 * `<ElvixBanner>` — upload / replace the end-user's profile banner
 * (16:9 cover image) for this Application.
 */
export function ElvixBanner({
  onResult,
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
}: {
  onResult?: (r: ElvixActionResult<{ bannerUrl: string }>) => void;
} & ElvixSizeProps) {
  const sizeProps: ElvixSizeProps = { width, height, minWidth, maxWidth, minHeight, maxHeight };
  const ctx = useElvixContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !ctx.app) return;
    if (file.size > 8 * 1024 * 1024) {
      setError("file_too_large");
      return;
    }
    setBusy(true);
    setError(null);
    const buf = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const dataUrl = `data:${file.type};base64,${b64}`;
    setPreview(dataUrl);
    const result = await appPatch<{ bannerUrl: string }>(
      { baseUrl: ctx.baseUrl, applicationId: ctx.app.applicationId },
      "/banner",
      { bannerDataUrl: dataUrl },
    );
    setBusy(false);
    if (!result.ok) setError(result.error);
    onResult?.(result);
  }

  return (
    <ElvixCard title="Banner" {...sizeProps}>
      {preview && (
        <img
          src={preview}
          alt="banner preview"
          style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 10, marginBottom: 12 }}
        />
      )}
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} disabled={busy} />
      {busy && <p>Uploading…</p>}
      {error && <p role="alert" className="elvix-error">{error}</p>}
    </ElvixCard>
  );
}
