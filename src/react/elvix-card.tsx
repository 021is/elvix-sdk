"use client";

import type { CSSProperties, ReactNode } from "react";
import { type ElvixSizeProps, sizeStyle } from "./size";

/**
 * `<ElvixCard>` — the chrome every nested `<Elvix*>` mutation surface
 * lives in. Brand-tinted border, secured-by-elvix footer, scrollable
 * body + pinned footer pattern. Pure presentation; no state.
 *
 * Customers don't usually need to wrap manually — most `<Elvix*>`
 * components render their own ElvixCard internally. Exported for
 * cases where a host wants to compose multiple components inside one
 * card (e.g. an account page row).
 *
 * Accepts `ElvixSizeProps` (width/height/min/max) merged into the root
 * element so every component built on ElvixCard is sizable by default;
 * the size props win over the card's maxWidth/width defaults.
 */
export function ElvixCard({
  title,
  footer,
  className = "",
  style,
  children,
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
}: {
  title?: ReactNode;
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & ElvixSizeProps) {
  const sized = sizeStyle({ width, height, minWidth, maxWidth, minHeight, maxHeight });
  return (
    <div
      className={`elvix-card ${className}`.trim()}
      style={{
        border: "1px solid var(--elvix-primary-12, rgba(93,77,255,0.12))",
        borderRadius: "14px",
        background: "white",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        maxWidth: "440px",
        width: "100%",
        ...style,
        ...sized,
      }}
    >
      {title && (
        <div
          style={{
            padding: "20px 24px 0",
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--elvix-primary-strong, #5d4dff)",
          }}
        >
          {title}
        </div>
      )}
      <div style={{ padding: "16px 24px", flex: 1 }}>{children}</div>
      {footer && (
        <div
          style={{
            padding: "12px 24px",
            borderTop: "1px solid var(--elvix-primary-12, rgba(93,77,255,0.12))",
            background: "rgba(0,0,0,0.02)",
            fontSize: "12px",
            color: "rgba(0,0,0,0.55)",
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
