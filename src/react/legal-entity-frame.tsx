"use client";

/**
 * How tall the legal-entity components are (0.18, Edvard: "the height
 * always must be same or customisable, fixed or flexible mode, and with max
 * height"). Shared by `<ElvixLegalEntities>` and `<ElvixLegalEntityPicker>`.
 *
 *   fixed     — one height for every pane, the list and each wizard step
 *               alike, so nothing jumps; a pane longer than the frame
 *               scrolls inside it. `height` sets it, `minHeight` and
 *               `maxHeight` bound it.
 *   flexible  — the frame is as tall as the pane showing, on every pane;
 *               nothing scrolls inside and no height is fixed. `maxHeight`
 *               caps it (then it scrolls), `minHeight` is its floor;
 *               `height` is not used.
 */

import { AnimatePresence } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { type ElvixSizeProps, sizeStyle } from "./size";
import { FadePane, FlowPane } from "./wizard-panes";

export const Sizing = {
  FIXED: "fixed",
  FLEXIBLE: "flexible",
} as const;
export type Sizing = (typeof Sizing)[keyof typeof Sizing];

export type FrameSize = Pick<ElvixSizeProps, "height" | "minHeight" | "maxHeight">;

/**
 * The frame's height, minimum and maximum. A fixed frame without a `height`
 * takes the component's defaults; an explicit `height` brings only the
 * bounds the host passed.
 */
export function frameStyle(sizing: Sizing, size: FrameSize, defaults: FrameSize): CSSProperties {
  if (sizing === Sizing.FLEXIBLE) {
    return sizeStyle({ minHeight: size.minHeight, maxHeight: size.maxHeight });
  }
  if (size.height !== undefined) return sizeStyle(size);
  return sizeStyle({
    height: defaults.height,
    minHeight: size.minHeight ?? defaults.minHeight,
    maxHeight: size.maxHeight ?? defaults.maxHeight,
  });
}

/** A capped flexible frame scrolls; any other frame never does as a whole. */
export function frameScrolls(sizing: Sizing, size: FrameSize): boolean {
  return sizing === Sizing.FLEXIBLE && size.maxHeight !== undefined;
}

/**
 * The panes' frame. Fixed: panes stack absolutely and cross-fade, each
 * scrolling inside. Flexible: the pane showing sits in normal flow, so the
 * frame takes its height; the next waits for it to leave.
 */
export function PaneFrame(props: {
  sizing: Sizing;
  /** The frame's height and bounds; omitted when an ancestor carries them. */
  style?: CSSProperties;
  /** One key per pane: a new key cross-fades to it. */
  paneKey: string;
  /** A fixed frame's list fades into its edges as it scrolls. */
  fadeEdges?: boolean;
  children: ReactNode;
}) {
  const { sizing, style, paneKey, fadeEdges, children } = props;
  if (sizing === Sizing.FLEXIBLE) {
    const scrolls = style?.maxHeight !== undefined;
    return (
      <div
        data-elvix-sizing={sizing}
        style={style}
        className={scrolls ? "overflow-y-auto" : undefined}
      >
        <AnimatePresence initial={false} mode="wait">
          <FlowPane key={paneKey}>{children}</FlowPane>
        </AnimatePresence>
      </div>
    );
  }
  return (
    <div
      data-elvix-sizing={sizing}
      style={style}
      className={`relative overflow-hidden ${style ? "" : "h-full"}`}
    >
      <AnimatePresence initial={false}>
        <FadePane key={paneKey} fadeEdges={fadeEdges}>
          {children}
        </FadePane>
      </AnimatePresence>
    </div>
  );
}
