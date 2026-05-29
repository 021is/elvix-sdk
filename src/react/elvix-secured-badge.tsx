import type { CSSProperties } from "react";
import { ElvixShield } from "./elvix-shield";
import { type ElvixSizeProps, sizeStyle } from "./size";

/**
 * The official "Secured by elvix" badge — a pill chip with the shield mark and
 * "Secured by elvix", same visual language as Stripe's "powered by" chip. Drop
 * it anywhere a customer app integrates elvix and wants to show users their
 * sign-in is governed by us.
 *
 * Styled inline so it renders correctly in any host with no CSS setup. Three
 * variants cover every surface; pair `theme` with the outline variant (which
 * inherits the host page's contrast) so it paints right on light or dark.
 */

const ELVIX_URL = "https://elvix.is";

export type ElvixSecuredBadgeVariant = "white" | "dark" | "outline";
export type ElvixSecuredBadgeSize = "sm" | "md" | "lg";
export type ElvixSecuredBadgeTheme = "light" | "dark";

export type ElvixSecuredBadgeProps = {
  variant?: ElvixSecuredBadgeVariant;
  size?: ElvixSecuredBadgeSize;
  /** Which side of the colour wheel the host page is on (for the outline variant). */
  theme?: ElvixSecuredBadgeTheme;
  /** Active-protection dot colour. Defaults to brand lavender. */
  accentColor?: string;
  /** Where the badge links. Defaults to elvix. */
  href?: string;
  className?: string;
} & /** Dimensional sizing, additive to the `size` preset; merged last so it wins. */
  ElvixSizeProps;

const SIZE: Record<ElvixSecuredBadgeSize, { height: number; padX: number; font: number; icon: number; gap: number }> = {
  sm: { height: 28, padX: 10, font: 11.5, icon: 14, gap: 6 },
  md: { height: 32, padX: 12, font: 12.5, icon: 16, gap: 7 },
  lg: { height: 36, padX: 14, font: 13, icon: 18, gap: 8 },
};

type Tone = { bg: string; border: string; lead: string; brand: string; shield: string };

const TONE: Record<ElvixSecuredBadgeVariant, Record<ElvixSecuredBadgeTheme, Tone>> = {
  white: {
    light: { bg: "#ffffff", border: "#e4e4e7", lead: "#71717a", brand: "#0a0a0b", shield: "#0a0a0b" },
    dark: { bg: "#ffffff", border: "transparent", lead: "#71717a", brand: "#0a0a0b", shield: "#0a0a0b" },
  },
  dark: {
    light: { bg: "#0a0a0b", border: "rgba(0,0,0,0.1)", lead: "#d4d4d8", brand: "#ffffff", shield: "#ffffff" },
    dark: { bg: "#0a0a0b", border: "rgba(255,255,255,0.1)", lead: "#d4d4d8", brand: "#ffffff", shield: "#ffffff" },
  },
  outline: {
    light: { bg: "transparent", border: "rgba(0,0,0,0.15)", lead: "#71717a", brand: "#0a0a0b", shield: "#0a0a0b" },
    dark: { bg: "transparent", border: "rgba(142,125,255,0.4)", lead: "#d4d4d8", brand: "#ffffff", shield: "#ffffff" },
  },
};

export function ElvixSecuredBadge({
  variant = "white",
  size = "md",
  theme = "dark",
  accentColor = "#8e7dff",
  href = ELVIX_URL,
  className = "",
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
}: ElvixSecuredBadgeProps) {
  const s = SIZE[size];
  const t = TONE[variant][theme];
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: s.gap,
    height: s.height,
    paddingLeft: s.padX,
    paddingRight: s.padX,
    fontSize: s.font,
    fontWeight: 500,
    borderRadius: 9999,
    background: t.bg,
    border: `1px solid ${t.border}`,
    color: t.brand,
    textDecoration: "none",
    userSelect: "none",
    lineHeight: 1,
    // Dimensional overrides win over the size preset above.
    ...sizeStyle({ width, height, minWidth, maxWidth, minHeight, maxHeight }),
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
      data-elvix-secured-badge=""
    >
      <ElvixShield size={s.icon} fill={t.shield} accent={accentColor} />
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ color: t.lead }}>Secured by</span>
        <span style={{ color: t.brand, fontWeight: 600 }}>elvix</span>
      </span>
    </a>
  );
}
