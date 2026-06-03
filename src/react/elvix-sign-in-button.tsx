"use client";

import { type CSSProperties, useState } from "react";
import { ElvixSignIn } from "./elvix-sign-in";
import { ElvixShield } from "./elvix-shield";
import { type ElvixSizeProps, sizeStyle } from "./size";
import type { ElvixSignInResult } from "./types";

/**
 * `<ElvixSignInButton>` — the official "Sign in with elvix" button.
 *
 * Styled inline so it renders correctly in any host with no CSS setup. Three
 * modes:
 *   - "redirect" (default): links to `${baseUrl}/sign-in/${clientId}`.
 *   - "callback": fires `onClick`; the host owns the flow.
 *   - "embed": toggles an in-frame `<ElvixSignIn>` below the button (requires
 *     an `<ElvixProvider>` ancestor). `onResult` reports the terminal outcome.
 */

const ELVIX_URL = "https://elvix.is";

export type ElvixSignInButtonSize = "sm" | "md" | "lg";
export type ElvixSignInButtonTheme = "light" | "dark" | "auto";
export type ElvixSignInButtonVariant = "filled" | "filled-black" | "white" | "outline" | "ghost";
export type ElvixSignInButtonShape = "rectangle" | "pill" | "square" | "circle";
export type ElvixSignInButtonType = "standard" | "icon";
export type ElvixSignInButtonMode = "redirect" | "callback" | "embed";
export type ElvixSignInButtonAlign = "left" | "center" | "right";
export type ElvixSignInPreset =
  | "sign-in-with-elvix"
  | "continue-with-elvix"
  | "sign-up-with-elvix"
  | "sign-in"
  | "log-in"
  | "continue";

export type ElvixSignInButtonProps = {
  clientId?: string;
  /** elvix origin for redirect mode. Defaults to https://elvix.is. */
  baseUrl?: string;
  returnUrl?: string;
  type?: ElvixSignInButtonType;
  variant?: ElvixSignInButtonVariant;
  shape?: ElvixSignInButtonShape;
  size?: ElvixSignInButtonSize;
  theme?: ElvixSignInButtonTheme;
  preset?: ElvixSignInPreset;
  label?: string;
  className?: string;
  href?: string;
  mode?: ElvixSignInButtonMode;
  onClick?: () => void;
  /** Terminal outcome of mode="embed": success (with token) or error. */
  onResult?: (result: ElvixSignInResult) => void;
  /**
   * Override the brand chord on `variant="filled"`. Defaults to elvix
   * lavender (#6c5ce7). Pair with `onBrandColor` for the foreground.
   */
  brandColor?: string;
  /** Foreground (shield + label) on top of `brandColor`. Defaults to #ffffff. */
  onBrandColor?: string;
  /** Content alignment inside the button. Defaults to "center". */
  align?: ElvixSignInButtonAlign;
  /**
   * Override the label font size (px when number, any CSS length when
   * string). Defaults to the `size` preset's text token.
   */
  fontSize?: number | string;
  /**
   * Custom corner radius. Wins over the `shape` preset. Number = px;
   * string = any CSS length (e.g. `"8px"`, `"50%"`). Use `0` for sharp.
   */
  borderRadius?: number | string;
} & /**
 * Dimensional sizing (width/height/min/max), additive to the `size` preset.
 * Merged last into the root element so an explicit width/height wins.
 */
  ElvixSizeProps;

const PRESET_LABEL: Record<ElvixSignInPreset, string> = {
  "sign-in-with-elvix": "Sign in with elvix",
  "continue-with-elvix": "Continue with elvix",
  "sign-up-with-elvix": "Sign up with elvix",
  "sign-in": "Sign in",
  "log-in": "Log in",
  continue: "Continue",
};

const SIZE_STANDARD: Record<ElvixSignInButtonSize, { height: number; padX: number; font: number; gap: number }> = {
  sm: { height: 36, padX: 12, font: 14, gap: 8 },
  md: { height: 40, padX: 12, font: 14, gap: 10 },
  lg: { height: 48, padX: 16, font: 15, gap: 12 },
};
const SIZE_ICON: Record<ElvixSignInButtonSize, number> = { sm: 36, md: 40, lg: 48 };
const ICON_SIZE: Record<ElvixSignInButtonSize, number> = { sm: 18, md: 20, lg: 22 };
const RADIUS: Record<ElvixSignInButtonShape, number> = { rectangle: 10, pill: 9999, square: 10, circle: 9999 };

type Tone = { bg: string; color: string; border: string; shadow?: string };
function variantTone(variant: ElvixSignInButtonVariant, theme: ElvixSignInButtonTheme): Tone {
  const dark = theme === "dark" || theme === "auto";
  switch (variant) {
    case "filled":
      return { bg: "#6c5ce7", color: "#fff", border: "1px solid rgba(0,0,0,0.1)", shadow: "0 4px 16px -4px rgba(108,92,231,0.45)" };
    case "filled-black":
      return { bg: "#0a0a0b", color: "#fff", border: `1px solid ${dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}` };
    case "white":
      return { bg: "#fff", color: "#0a0a0b", border: `1px solid ${dark ? "transparent" : "#e4e4e7"}` };
    case "outline":
      return dark
        ? { bg: "transparent", color: "#fff", border: "1px solid rgba(142,125,255,0.4)" }
        : { bg: "#fff", color: "#0a0a0b", border: "1px solid rgba(0,0,0,0.15)" };
    case "ghost":
      return { bg: "transparent", color: dark ? "#fff" : "#0a0a0b", border: "1px solid transparent" };
  }
}

function shieldColor(variant: ElvixSignInButtonVariant, theme: ElvixSignInButtonTheme): string {
  if (variant === "filled" || variant === "filled-black") return "#ffffff";
  if (variant === "white") return "#0a0a0b";
  return theme === "light" ? "#0a0a0b" : "#ffffff";
}

export function ElvixSignInButton({
  clientId,
  baseUrl = ELVIX_URL,
  returnUrl,
  type = "standard",
  variant = "filled",
  shape = "rectangle",
  size = "md",
  theme = "dark",
  preset = "sign-in-with-elvix",
  label,
  className,
  href,
  mode = "redirect",
  onClick,
  onResult,
  brandColor,
  onBrandColor,
  align = "center",
  fontSize,
  borderRadius,
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
}: ElvixSignInButtonProps) {
  const sized = sizeStyle({ width, height, minWidth, maxWidth, minHeight, maxHeight });
  const [embedOpen, setEmbedOpen] = useState(false);
  const isIcon = type === "icon";
  const resolvedLabel = label ?? PRESET_LABEL[preset];
  const tone = variantTone(variant, theme);
  const std = SIZE_STANDARD[size];
  const effectiveShape: ElvixSignInButtonShape = isIcon
    ? shape === "pill" || shape === "circle"
      ? "circle"
      : "square"
    : shape;

  // Brand override applies on filled variant only; other variants paint
  // neutral / transparent by design and the override would muddy them.
  const useBrandOverride = brandColor && variant === "filled";
  const resolvedOnBrand = onBrandColor ?? "#ffffff";

  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
    textAlign: align,
    fontWeight: 500,
    fontSize:
      fontSize !== undefined
        ? typeof fontSize === "number"
          ? `${fontSize}px`
          : fontSize
        : std.font,
    cursor: "pointer",
    userSelect: "none",
    textDecoration: "none",
    borderRadius:
      borderRadius !== undefined
        ? typeof borderRadius === "number"
          ? `${borderRadius}px`
          : borderRadius
        : RADIUS[effectiveShape],
    background: useBrandOverride ? brandColor : tone.bg,
    color: useBrandOverride ? resolvedOnBrand : tone.color,
    border: tone.border,
    boxShadow: tone.shadow,
    transition: "background 0.15s, border-color 0.15s",
    ...(isIcon
      ? { height: SIZE_ICON[size], width: SIZE_ICON[size] }
      : { height: std.height, paddingLeft: std.padX, paddingRight: std.padX, gap: std.gap }),
    // Dimensional overrides win over the size preset above.
    ...sized,
  };

  const content = (
    <>
      <ElvixShield
        size={ICON_SIZE[size]}
        fill={useBrandOverride ? resolvedOnBrand : shieldColor(variant, theme)}
        accent="#8e7dff"
      />
      {isIcon ? null : <span>{resolvedLabel}</span>}
    </>
  );

  if (mode === "callback") {
    return (
      <button type="button" onClick={onClick} className={className} style={style} aria-label={isIcon ? resolvedLabel : undefined}>
        {content}
      </button>
    );
  }

  if (mode === "embed") {
    return (
      <div data-elvix-signin-button-embed="" style={sized}>
        {!embedOpen && (
          <button
            type="button"
            onClick={() => setEmbedOpen(true)}
            className={className}
            style={style}
            aria-label={isIcon ? resolvedLabel : undefined}
          >
            {content}
          </button>
        )}
        {embedOpen && (
          <ElvixSignIn
            onResult={(r) => {
              onResult?.(r);
            }}
          />
        )}
      </div>
    );
  }

  const destination = (() => {
    if (href) return href;
    const base = clientId ? `${baseUrl}/sign-in/${clientId}` : `${baseUrl}/sign-in`;
    if (!returnUrl) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}return=${encodeURIComponent(returnUrl)}`;
  })();

  return (
    <a href={destination} className={className} style={style} aria-label={isIcon ? resolvedLabel : undefined}>
      {content}
    </a>
  );
}
