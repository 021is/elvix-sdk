"use client";

/**
 * Segmented 6-box OTP input, the one every code step uses (sign-in, export,
 * deactivate). No host dependencies — only React.
 *
 * `compact` (0.17) draws the boxes as `<ElvixEmailCodeSignIn>`'s fields: a
 * tint, no outline, every look a `--elvix-field*` variable
 * (`styles/fields.css`). Otherwise they are the card's bordered boxes.
 */

import {
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useT } from "../locale/use-t";
import { BRAND_FOCUS, FIELD_COMPACT, FIELD_OUTLINED } from "./brand-focus";

const OTP_LENGTH = 6;
/** The six fixed positions. A box IS its position (it never moves or
 *  reorders), so the slot number is its stable identity and React key. */
const SLOTS = Array.from({ length: OTP_LENGTH }, (_, slot) => slot);

/**
 * What typing `raw` into box `i` makes of the code, and which box takes focus
 * next (`null`: stay). Mobile browsers (Chrome on Android in particular) route
 * the browser-suggested OTP autofill and a clipboard paste through the INPUT
 * event instead of the PASTE event, so `raw` can arrive with the full code in
 * one fire: it is spread over the boxes from `i` on instead of slicing off
 * five of the six digits.
 */
function typeIntoBox(
  digits: readonly string[],
  i: number,
  raw: string,
): { value: string; focus: number | null } {
  const stripped = raw.replace(/\D/g, "");
  const next = [...digits];
  if (stripped.length > 1) {
    const fill = stripped.slice(0, OTP_LENGTH - i);
    for (const [k, ch] of [...fill].entries()) next[i + k] = ch;
    return { value: next.join(""), focus: Math.min(i + fill.length, OTP_LENGTH - 1) };
  }
  const ch = stripped.slice(-1);
  next[i] = ch;
  return { value: next.join(""), focus: ch && i < OTP_LENGTH - 1 ? i + 1 : null };
}

export function OtpInput({
  value,
  onChange,
  disabled,
  autoFocus,
  compact = false,
  describedBy,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** `<ElvixEmailCodeSignIn>`'s fields (`FIELD_COMPACT`) instead of the bordered boxes. */
  compact?: boolean;
  /** The id of the line that says where the code went, read with the group. */
  describedBy?: string;
  /** More classes on each box (a host's `classNames.code`). */
  className?: string;
}) {
  const t = useT();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const focus = useCallback((i: number) => refs.current[i]?.focus(), []);

  const onCharChange = useCallback(
    (i: number, e: ChangeEvent<HTMLInputElement>) => {
      const typed = typeIntoBox(digits, i, e.target.value);
      onChange(typed.value);
      if (typed.focus !== null) focus(typed.focus);
    },
    [digits, onChange, focus],
  );

  const onKeyDown = useCallback(
    (i: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[i] && i > 0) {
        e.preventDefault();
        const next = [...digits];
        next[i - 1] = "";
        onChange(next.join(""));
        focus(i - 1);
      } else if (e.key === "ArrowLeft" && i > 0) {
        focus(i - 1);
      } else if (e.key === "ArrowRight" && i < OTP_LENGTH - 1) {
        focus(i + 1);
      }
    },
    [digits, onChange, focus],
  );

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
      if (pasted) {
        onChange(pasted);
        focus(Math.min(pasted.length, OTP_LENGTH - 1));
      }
    },
    [onChange, focus],
  );

  return (
    // 6-column grid keeps every box equal-width and never overflows
    // its container, so the input fits cleanly inside an ElvixCard
    // on the narrowest mobile viewports without a horizontal scroll.
    // `aspect-square` keeps each box visually balanced as width
    // shrinks. `max-w-12` caps the boxes at the original 48px on
    // wide surfaces so they don't bloat on desktop.
    <fieldset
      className="grid grid-cols-6 gap-2 w-full min-w-0 border-0 p-0 m-0"
      aria-label={t("common.codeGroupLabel")}
      aria-describedby={describedBy}
    >
      {SLOTS.map((i) => (
        <input
          key={i}
          aria-label={t("common.codeDigitLabel", { n: i + 1, total: OTP_LENGTH })}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          value={digits[i]}
          disabled={disabled}
          onChange={(e) => onCharChange(i, e)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className={`w-full aspect-square min-w-0 max-w-12 mx-auto text-center text-[20px] font-semibold tabular-nums ${compact ? FIELD_COMPACT : `rounded-[10px] ${FIELD_OUTLINED} text-fg-1 ${BRAND_FOCUS} transition disabled:opacity-50`} ${className}`}
        />
      ))}
    </fieldset>
  );
}
