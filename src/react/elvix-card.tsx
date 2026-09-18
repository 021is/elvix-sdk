"use client";

import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
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

  // The border trace must start at the badge gap's RIGHT edge and end
  // at its LEFT edge on EVERY card size. A fixed pathOffset fraction
  // (the old 0.08) is 8% of the perimeter, which only lands at the
  // badge on the one card width it was tuned against; taller preview
  // cards put the start point mid-badge. So: measure the real card box
  // + the real badge-gap box once at mount (the animation is a one-shot
  // mount effect; later resizes don't replay it) and convert pixels to
  // path fractions.
  const rootRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const [trace, setTrace] = useState<{ start: number; drawn: number } | null>(null);

  useLayoutEffect(() => {
    if (!animated) return;
    const root = rootRef.current;
    if (!root) return;
    const W = root.offsetWidth;
    const H = root.offsetHeight;
    if (W === 0 || H === 0) return;
    // Geometry mirrors the motion.rect below: inset 0.75, radius 17.
    const r = 17;
    const w = W - 1.5;
    const h = H - 1.5;
    const perimeter = 2 * (w + h) - 8 * r + 2 * Math.PI * r;
    // An SVG rounded-rect path begins at (x + r) on the TOP edge and
    // runs clockwise. Distances along the top edge measure from there.
    const pathStartX = 0.75 + r;
    const badge = badgeRef.current;
    if (!badge) {
      setTrace({ start: 0, drawn: 1 });
      return;
    }
    // The overlay div IS the border gap box (the legend clones it):
    // left:20, width = 6 + pill + 6.
    const gapLeft = badge.offsetLeft;
    const gapRight = gapLeft + badge.offsetWidth;
    const start = Math.max(0, gapRight - pathStartX) / perimeter;
    // Draw clockwise from the gap's right edge all the way around to
    // its left edge: everything except the gap itself.
    const drawn = Math.max(0, perimeter - (gapRight - gapLeft)) / perimeter;
    setTrace({ start, drawn });
  }, [animated]);

  return (
    <div
      ref={rootRef}
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
          finishes when animating.

          Rendered as a fieldset so the Secured badge sits in a REAL
          border gap (the legend), instead of masking the border with a
          painted rectangle. A painted mask can only guess the host's
          background — on any non-white host it showed up as a hard-
          cornered white patch behind the badge. The legend holds an
          invisible zero-height clone of the badge, so the gap is
          always exactly the badge's width and the host background
          shows through untouched. */}
      <motion.fieldset
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          margin: 0,
          padding: 0,
          minInlineSize: 0,
          borderRadius: "18px",
          pointerEvents: "none",
          border: "1px solid var(--elvix-primary-20, rgba(93,77,255,0.20))",
        }}
        initial={animated ? { opacity: 0 } : false}
        animate={animated ? { opacity: 1 } : undefined}
        transition={animated ? { delay: 1.2, duration: 0.18, ease: "easeOut" } : undefined}
      >
        {secured && (
          <legend
            style={{
              // Mirror the badge overlay's box EXACTLY: overlay outer
              // div sits at left:20 (from the card edge) with 6px span
              // padding each side. The fieldset's 1px border shifts
              // content by 1, so 19 + 1 = 20 -> gap spans the same
              // 20..(20+6+pill+6) box as the overlay. 6px breathing on
              // BOTH sides -- 14 here left an 11px dead gap on the left.
              marginLeft: 19,
              padding: "0 6px",
              lineHeight: 0,
            }}
          >
            {/* Invisible clone — sizes the gap, never seen. */}
            <span
              style={{
                visibility: "hidden",
                display: "inline-flex",
                height: 0,
                overflow: "hidden",
              }}
            >
              <ElvixSecuredBadge variant="outline" theme="light" size="sm" />
            </span>
          </legend>
        )}
      </motion.fieldset>

      {/* Layer 2 — brand-coloured trace drawn around the perimeter.
          Only mounted when animating AND once the mount-time
          measurement has resolved the badge gap into path fractions:
          the stroke starts at the gap's right edge, runs clockwise,
          and ends at the gap's left edge, exact on every card size.
          The whole svg fades to 0 after the draw completes, handing
          off to Layer 1. */}
      {animated && trace && (
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
            initial={{ pathLength: 0, pathOffset: trace.start }}
            animate={{ pathLength: trace.drawn, pathOffset: trace.start }}
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
          ref={badgeRef}
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
              // No painted background: the border has a REAL gap here
              // (the fieldset legend below), so the host background
              // shows through cleanly on any surface.
            }}
            initial={animated ? { opacity: 0 } : false}
            animate={animated ? { opacity: 1 } : undefined}
            transition={animated ? { delay: 0.2, duration: 0.18, ease: "easeOut" } : undefined}
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
        transition={animated ? { delay: 0.4, duration: 0.28, ease: "easeOut" } : undefined}
      >
        {title && (
          <div
            style={{
              padding: "28px 20px 0",
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--elvix-primary-strong, #5d4dff)",
            }}
          >
            {title}
          </div>
        )}
        <div style={{ padding: title ? "16px 20px 20px" : "28px 20px 20px", flex: 1 }}>
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

/**
 * `<MaybeCard card>` — render `children` inside an `<ElvixCard>` when `card`
 * is true (the default), or bare when false. Every self-wrapping `<Elvix*>`
 * mutation component uses this so a host can opt out of the card chrome with
 * `card={false}` (e.g. to compose several components inside one shared card,
 * or to drop the form into their own surface) while the card stays on by
 * default.
 */
export function MaybeCard({
  card = true,
  className,
  children,
}: {
  card?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return card ? <ElvixCard className={className}>{children}</ElvixCard> : children;
}
