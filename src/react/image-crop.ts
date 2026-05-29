/**
 * Client-side image-crop helpers for the elvix Profile SDK.
 *
 * The Console and the new `<ElvixAvatar>` / `<ElvixBanner>` wizards
 * both pick a region with `react-easy-crop` and need to ship a
 * cropped JPEG blob to the server (multipart/form-data). Server-
 * side `sharp` then re-encodes to the response size variants.
 *
 * Pure DOM helpers; only callable from a "use client" surface.
 */

export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Crop `src` to `area`, scale the long edge down to `maxEdge` px if
 * larger, and JPEG-encode at `quality`. Returns the resulting Blob
 * ready for FormData upload.
 *
 * JPEG keeps the wire upload small and is universally supported;
 * the server-side pipeline re-encodes to WebP for storage anyway.
 */
export async function cropToBlob(
  src: string,
  area: CropArea,
  maxEdge: number,
  quality: number,
): Promise<Blob> {
  const img = await loadImage(src);
  const longEdge = Math.max(area.width, area.height);
  const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
  const outW = Math.round(area.width * scale);
  const outH = Math.round(area.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, outW, outH);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("blob_failed"))),
      "image/jpeg",
      quality,
    );
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
