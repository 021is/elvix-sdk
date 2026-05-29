import type { CSSProperties } from "react";

/** Size overrides every <Elvix*> component accepts so hosts can fit it to any slot. */
export type ElvixSizeProps = {
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  minHeight?: number | string;
  maxHeight?: number | string;
};

/** Pick the size props into a CSSProperties object (only the keys that are set). */
export function sizeStyle(p: ElvixSizeProps): CSSProperties {
  const s: CSSProperties = {};
  if (p.width !== undefined) s.width = p.width;
  if (p.height !== undefined) s.height = p.height;
  if (p.minWidth !== undefined) s.minWidth = p.minWidth;
  if (p.maxWidth !== undefined) s.maxWidth = p.maxWidth;
  if (p.minHeight !== undefined) s.minHeight = p.minHeight;
  if (p.maxHeight !== undefined) s.maxHeight = p.maxHeight;
  return s;
}
