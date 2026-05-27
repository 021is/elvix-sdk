"use client";

import type { ReactNode } from "react";

/**
 * `<ElvixCard>` — the chrome every nested `<Elvix*>` mutation surface
 * lives in. Brand-tinted border, secured-by-elvix footer, scrollable
 * body + pinned footer pattern. Pure presentation; no state.
 *
 * Customers don't usually need to wrap manually — most `<Elvix*>`
 * components render their own ElvixCard internally. Exported for
 * cases where a host wants to compose multiple components inside one
 * card (e.g. an account page row).
 */
export function ElvixCard({
  title,
  footer,
  className = "",
  children,
}: {
  title?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
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
