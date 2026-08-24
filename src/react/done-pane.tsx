"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The terminal "done" pane every in-frame `<Elvix*>` lifecycle lands on.
 *
 * This existed six times, copy-pasted into `elvix-username`, `elvix-leave`,
 * `elvix-sessions`, `elvix-deactivate`, `elvix-export` and
 * `elvix-recover-gate`. The copies had already started to drift: the content
 * column was 300px wide in one and 320px in another, so the success pane
 * visibly changed width depending on which component you happened to finish.
 * That is exactly the kind of difference nobody reports as a bug and everyone
 * feels.
 *
 * Only four things ever varied between the copies, and they are the props
 * here. Everything else — the spring on the badge, the sizes, the brand
 * tokens — was identical, which is why it belongs in one place.
 */
const ACTION_CLASS =
  "text-[12.5px] font-medium text-fg-2 hover:text-fg-1 underline underline-offset-4 cursor-pointer";

export function DonePane({
  icon,
  title,
  body,
  action,
}: {
  /** Defaults to a brand-coloured check. Pass a node for destructive outcomes. */
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  /**
   * Optional footer link, e.g. "change it again" or "back to sessions".
   * Pass `href` for real navigation and `onClick` for an in-card pane change;
   * an anchor that only calls preventDefault is not a link, and a button that
   * navigates is not a button.
   */
  action?:
    | { label: string; onClick: () => void; href?: never }
    | { label: string; href: string; onClick?: never };
}) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-2">
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.34, ease: [0.22, 0.61, 0.36, 1] }}
        className="size-12 rounded-full inline-flex items-center justify-center"
        style={{ background: "var(--elvix-primary-12)" }}
      >
        {icon ?? (
          <CheckCircle2
            className="size-7"
            strokeWidth={2.2}
            style={{ color: "var(--elvix-primary-strong)" }}
          />
        )}
      </motion.span>

      {/* One width for every component, so the card does not resize depending
          on which flow the user just finished. */}
      <div className="space-y-1 max-w-[320px]">
        <div className="text-[15px] font-semibold tracking-tight text-fg-1">{title}</div>
        {body ? <div className="text-[12.5px] text-fg-3 leading-[1.55]">{body}</div> : null}
      </div>

      {action ? (
        action.href !== undefined ? (
          <a href={action.href} className={ACTION_CLASS}>
            {action.label}
          </a>
        ) : (
          <button type="button" onClick={action.onClick} className={ACTION_CLASS}>
            {action.label}
          </button>
        )
      ) : null}
    </div>
  );
}
