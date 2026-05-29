"use client";

/**
 * Segmented 6-box OTP input. Moved VERBATIM from the elvix monorepo
 * (`components/otp-input.tsx`) so the SDK's `<ElvixSignInForm>` code step
 * renders identically to the surface served at elvix.is. No host
 * dependencies — only React. Do not restyle.
 */

import {
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";

const OTP_LENGTH = 6;

export function OtpInput({
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const focus = useCallback((i: number) => refs.current[i]?.focus(), []);

  const onCharChange = useCallback(
    (i: number, e: ChangeEvent<HTMLInputElement>) => {
      // Mobile browsers (Chrome on Android in particular) route the
      // browser-suggested OTP autofill + clipboard paste through the
      // INPUT event instead of the PASTE event. When that happens,
      // `e.target.value` arrives with the full 6-digit string in a
      // single fire. Detect and distribute instead of slicing off
      // five of the six digits.
      const stripped = e.target.value.replace(/\D/g, "");
      if (stripped.length > 1) {
        const fill = stripped.slice(0, OTP_LENGTH - i);
        const next = [...digits];
        for (let k = 0; k < fill.length; k += 1) {
          next[i + k] = fill[k]!;
        }
        const merged = next.join("");
        onChange(merged);
        focus(Math.min(i + fill.length, OTP_LENGTH - 1));
        return;
      }
      const ch = stripped.slice(-1);
      const next = [...digits];
      next[i] = ch;
      onChange(next.join(""));
      if (ch && i < OTP_LENGTH - 1) focus(i + 1);
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
    <div className="grid grid-cols-6 gap-2 w-full">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          value={d}
          disabled={disabled}
          onChange={(e) => onCharChange(i, e)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className="w-full aspect-square min-w-0 max-w-12 mx-auto text-center text-[20px] font-semibold tabular-nums rounded-[10px] bg-surface border border-border-base text-fg-1 focus:outline-none focus:border-[#8e7dff] focus:ring-2 focus:ring-[#8e7dff]/20 transition disabled:opacity-50"
        />
      ))}
    </div>
  );
}
