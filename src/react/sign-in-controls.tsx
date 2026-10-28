"use client";

/**
 * The two controls every sign-in pane shares, in `<ElvixSignInForm>` and
 * `<ElvixEmailCodeSignIn>` alike: the branded call to action and the error
 * line.
 */

import { Loader2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/** Brand pair for the primary button: the customer picks both colours, so
 *  contrast is theirs; hover and press only change brightness. */
export type Cta = { brand?: string; onBrand?: string };

const CTA_CLASS =
  "cursor-pointer w-full inline-flex items-center justify-center h-9 px-4 rounded-[10px] font-semibold text-[13px] tracking-tight transition hover:brightness-[0.94] active:brightness-[0.88] disabled:cursor-not-allowed disabled:hover:brightness-100";

function ArrowGlyph() {
  return (
    <svg width="11" height="10" viewBox="0 0 11 10" fill="none" aria-hidden>
      <path
        d="M7.75 5L4.25 2.75V7.25L7.75 5Z"
        fill="currentColor"
        stroke="currentColor"
        opacity="0.6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Solid brand fill with a soft top sheen and a grounded three-layer shadow,
 *  matching the Console's primary button. */
export function CtaButton({
  cta,
  busy,
  disabled,
  arrow = false,
  faint = false,
  submit = false,
  className = "",
  onClick,
  children,
}: {
  cta: Cta;
  busy: boolean;
  disabled: boolean;
  arrow?: boolean;
  /** Disabled at half opacity rather than 60%: the identifier step's look. */
  faint?: boolean;
  submit?: boolean;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    backgroundImage: "linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0) 40%)",
    backgroundColor: cta.brand,
    color: cta.onBrand,
    boxShadow:
      "0 1px 0 rgba(255,255,255,0.06) inset, 0 2px 3px -1px rgba(0,0,0,0.18), 0 0 0 1px rgba(25,28,33,0.08)",
  };
  return (
    <button
      type={submit ? "submit" : "button"}
      onClick={onClick}
      disabled={disabled}
      className={`${CTA_CLASS} ${faint ? "disabled:opacity-50" : "disabled:opacity-60"} ${className}`}
      style={style}
    >
      <span
        className="inline-flex items-center gap-1.5"
        style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.18))" }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : children}
        {arrow && !busy && <ArrowGlyph />}
      </span>
    </button>
  );
}

/** An error, announced the moment it appears (`role="alert"`). */
export function ErrorLine({ error, center = false }: { error: string | null; center?: boolean }) {
  if (!error) return null;
  return (
    <p role="alert" className={`text-[11.5px] text-red-400${center ? " text-center" : ""}`}>
      {error}
    </p>
  );
}
