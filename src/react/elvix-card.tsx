"use client";

import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { useElvixAnimated } from "./elvix-provider";
import { ElvixSecuredBadge } from "./elvix-secured-badge";
import { type ElvixSizeProps, sizeStyle } from "./size";

/**
 * `<ElvixCard>` — the chrome every nested `<Elvix*>` mutation surface
 * lives in. Brand-tinted border, top-left Secured-by-elvix badge
 * breaking through the border (outline-variant pill), scrollable
 * body + optional pinned footer. The canonical SDK card design — see
 * `elvix.is/docs/components/elvix-card`. Pure presentation; no state.
 *
 * Customers don't usually need to wrap manually — most `<Elvix*>`
 * components render their own ElvixCard internally. Exported for
 * cases where a host wants to compose multiple components inside one
 * card (e.g. an account page row).
 *
 * Mount animation (opt-in/out via `animated`):
 *
 *   1. badge fades in at 200ms
 *   2. brand-coloured trace draws clockwise around the perimeter
 *      starting at the right edge of the badge (400-1200ms), ending
 *      back at the badge's left edge
 *   3. static brand-tinted border fades in (1200ms)
 *   4. content fades + slides in (400-680ms)
 *
 * Pass `animated={false}` to skip the mount animation and paint the
 * card static from first frame. The badge + border + content all
 * render immediately. Useful for screenshot / print surfaces and any
 * surface where the cinematic intro is noise (embedded checkouts,
 * tests, etc.).
 *
 * `<ElvixProvider animated={false}>` disables animation across every
 * nested `<Elvix*>` component in one move; per-card `animated` props
 * still override the cascade.
 *
 * Accepts `ElvixSizeProps` (width/height/min/max) merged into the root
 * element so every component built on ElvixCard is sizable by default.
 */
export function ElvixCard({
  title,
  footer,
  secured = true,
  animated: animatedProp,
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
  /**
   * Whether to render the Secured-by-elvix badge breaking through
   * the top-left border. Defaults to `true` — the badge is the SDK's
   * identity signal for any surface the card hosts. Set `false` only
   * when the host's outer layout already shows the badge elsewhere
   * (e.g. an AccountStage header) and you'd otherwise duplicate it.
   */
  secured?: boolean;
  /**
   * Whether to play the mount animation (badge fade-in → brand-trace
   * → static border fade-in → content fade-in). When omitted,
   * inherits from `<ElvixProvider animated>` (default `true`).
   * Explicit per-card override wins:
   *   - `animated={false}` → skip animation, render static immediately
   *   - `animated={true}` → force animation even if provider is off
   */
  animated?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & ElvixSizeProps) {
  const providerAnimated = useElvixAnimated();
  const animated = animatedProp ?? providerAnimated;
  const sized = sizeStyle({ width, height, minWidth, maxWidth, minHeight, maxHeight });

  return (
    <div
      className={`elvix-card ${className}`.trim()}
      style={{
        position: "relative",
        borderRadius: "18px",
        // Transparent by default so the page canvas (whatever the
        // host's surrounding background is) shows through — matches
        // `elvix.is/docs/components/elvix-card`'s preview chrome.
        // Consumers fill via the `--elvix-card-bg` CSS var on a
        // wrapping element OR pass `style={{ background: "..." }}`
        // directly on `<ElvixCard>` to lay an opaque colour / image
        // behind the content.
        background: "var(--elvix-card-bg, transparent)",
        display: "flex",
        flexDirection: "column",
        maxWidth: "432px",
        width: "100%",
        // Override the `.elvix-card` class-level defaults that
        // conflict with the canonical SDK card design:
        //   - `overflow: hidden` would clip the badge breakout
        //   - `border` would compete with Layer 1's static border
        //   - `padding`/`gap` would shift the absolute children + add
        //     redundant spacing on top of Layer 4's inline padding
        // Inline reset wins via CSS specificity; the class still works
        // standalone for any non-React consumer that uses
        // `<div className="elvix-card">` directly.
        overflow: "visible",
        border: 0,
        padding: 0,
        gap: 0,
        ...style,
        ...sized,
      }}
    >
      {/* Layer 1 — static soft brand-tinted border. Visible from
          first paint when not animating; fades in after the trace
          finishes when animating. */}
      <motion.div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "18px",
          pointerEvents: "none",
          border: "1px solid var(--elvix-primary-20, rgba(93,77,255,0.20))",
        }}
        initial={animated ? { opacity: 0 } : false}
        animate={animated ? { opacity: 1 } : undefined}
        transition={
          animated ? { delay: 1.2, duration: 0.18, ease: "easeOut" } : undefined
        }
      />

      {/* Layer 2 — brand-coloured trace drawn around the perimeter.
          Only mounted when animating. `pathOffset: 0.08` starts the
          stroke just past the badge at left:20; `pathLength: 1.03`
          overshoots slightly so the trace ends meeting the badge
          cleanly. The whole svg fades to 0 after the draw completes,
          handing off to Layer 1. */}
      {animated && (
        <motion.svg
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            overflow: "visible",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [1, 1, 0] }}
          transition={{
            delay: 0.4,
            duration: 0.98,
            times: [0, 0.8 / 0.98, 1],
            ease: "easeOut",
          }}
        >
          <motion.rect
            x="0.75"
            y="0.75"
            rx="17"
            ry="17"
            fill="none"
            stroke="var(--elvix-primary, #5d4dff)"
            strokeWidth={1.5}
            strokeLinecap="round"
            style={{ width: "calc(100% - 1.5px)", height: "calc(100% - 1.5px)" }}
            pathLength={1}
            initial={{ pathLength: 0, pathOffset: 0.08 }}
            animate={{ pathLength: 1.03, pathOffset: 0.08 }}
            transition={{ delay: 0.4, duration: 0.8, ease: [0.65, 0, 0.35, 1] }}
          />
        </motion.svg>
      )}

      {/* Layer 3 — Secured-by-elvix badge, top-left, breaks the
          border. Outer div owns absolute positioning + the vertical
          centering transform; inner motion.span owns the opacity
          fade. Splitting them is load-bearing: framer-motion writes
          `transform` when animating, which would overwrite our
          `translateY(-50%)` and drop the badge below the border. */}
      {secured && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 20,
            transform: "translateY(-50%)",
            zIndex: 10,
            display: "inline-flex",
          }}
        >
          <motion.span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0 6px",
              background: "var(--elvix-card-bg-cutout, var(--elvix-canvas, white))",
            }}
            initial={animated ? { opacity: 0 } : false}
            animate={animated ? { opacity: 1 } : undefined}
            transition={
              animated ? { delay: 0.2, duration: 0.18, ease: "easeOut" } : undefined
            }
          >
            <ElvixSecuredBadge variant="outline" theme="light" size="sm" />
          </motion.span>
        </div>
      )}

      {/* Layer 4 — content. Padding `28px 24px 20px` keeps the title
          / content top clear of the badge breakout (badge bottom edge
          sits ~12px below the card top, so 28px leaves room) and
          gives the content comfortable horizontal breathing. Title +
          footer keep their own padding so the visual rhythm matches
          every other SDK card surface. NO mask — Save buttons, "Add"
          rows, and other bottom CTAs always render at full opacity. */}
      <motion.div
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
        initial={animated ? { opacity: 0, y: 6 } : false}
        animate={animated ? { opacity: 1, y: 0 } : undefined}
        transition={
          animated ? { delay: 0.4, duration: 0.28, ease: "easeOut" } : undefined
        }
      >
        {title && (
          <div
            style={{
              padding: "28px 32px 0",
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--elvix-primary-strong, #5d4dff)",
            }}
          >
            {title}
          </div>
        )}
        <div style={{ padding: title ? "16px 32px 20px" : "28px 32px 20px", flex: 1 }}>
          {children}
        </div>
        {footer !== undefined && (
          <div
            style={{
              padding: "12px 24px",
              borderTop: "1px solid var(--elvix-primary-12, rgba(93,77,255,0.12))",
              background: "rgba(0,0,0,0.02)",
              fontSize: "12px",
              color: "rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "12px",
              borderBottomLeftRadius: "17px",
              borderBottomRightRadius: "17px",
            }}
          >
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
}
