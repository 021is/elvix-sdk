"use client";

/**
 * The two pane transitions the SDK's in-card wizards use. One definition, so
 * every component moves the same way and a timing change is made once.
 *
 *   SlidePane — horizontal slide in the navigation direction (forward = from
 *               the right). Username, sessions, deactivate, leave.
 *   FadePane  — cross-fade with a slight rise and blur, stacked absolutely so
 *               the card keeps its height. Languages, region, address book.
 *
 * Both are children of an `<AnimatePresence>` in the host component; give
 * each a stable `key`.
 */

import { motion } from "framer-motion";
import type { ReactNode } from "react";

const slideVariants = {
  enter: (dir: 1 | -1) => ({ x: dir * 24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: 1 | -1) => ({ x: dir * -24, opacity: 0 }),
};
const slideTransition = { duration: 0.24, ease: [0.22, 0.61, 0.36, 1] as const };

export function SlidePane({ direction, children }: { direction: 1 | -1; children: ReactNode }) {
  return (
    <motion.div
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={slideTransition}
    >
      {children}
    </motion.div>
  );
}

const fadeVariants = {
  enter: { opacity: 0, y: 6, filter: "blur(4px)" },
  center: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -4, filter: "blur(4px)" },
};
const fadeTransition = { duration: 0.22, ease: [0.32, 0.72, 0, 1] as const };

/** Fades the top and bottom edges of a scrolling pane so a long list
 *  dissolves into the chrome instead of ending on a hard edge. */
export const FADE_MASK =
  "linear-gradient(to bottom, transparent 0, rgba(0,0,0,0.4) 12px, black 28px, black calc(100% - 28px), rgba(0,0,0,0.4) calc(100% - 12px), transparent 100%)";

export function FadePane({
  children,
  fadeEdges = false,
}: {
  children: ReactNode;
  /** For panes that are all scrolling content (lists); panes with a fixed
   *  header or footer leave it off. */
  fadeEdges?: boolean;
}) {
  return (
    <motion.div
      variants={fadeVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={fadeTransition}
      className="absolute inset-0 overflow-y-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={fadeEdges ? { maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK } : undefined}
    >
      {children}
    </motion.div>
  );
}
