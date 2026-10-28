"use client";

import type { CSSProperties } from "react";
import {
  useElvixApp,
  useElvixBrandPair,
  useElvixHostTheme,
  useElvixResolvedTheme,
} from "./elvix-provider";

export const Theme = {
  LIGHT: "light",
  DARK: "dark",
  AUTO: "auto",
} as const;
export type Theme = (typeof Theme)[keyof typeof Theme];

// Hard-coded theme values so a sign-in surface's chrome can be isolated from
// the surrounding page (e.g., Console can be dark while the preview shows the
// light-theme appearance to the customer, or vice-versa). When the user
// picks "auto", we don't override — descendants inherit the host's theme.
const ELVIX_LIGHT_VARS: CSSProperties = {
  ["--elvix-canvas" as string]: "#fafafa",
  ["--elvix-surface" as string]: "#ffffff",
  ["--elvix-surface-2" as string]: "#f4f4f5",
  ["--elvix-surface-hover" as string]: "rgba(0, 0, 0, 0.04)",
  ["--elvix-surface-active" as string]: "rgba(0, 0, 0, 0.06)",
  ["--elvix-border" as string]: "rgba(0, 0, 0, 0.08)",
  ["--elvix-border-strong" as string]: "rgba(0, 0, 0, 0.14)",
  ["--elvix-fg-1" as string]: "#18181b",
  ["--elvix-fg-2" as string]: "#52525b",
  ["--elvix-fg-3" as string]: "#71717a",
  ["--elvix-placeholder" as string]: "#a1a1aa",
};
const ELVIX_DARK_VARS: CSSProperties = {
  ["--elvix-canvas" as string]: "#0a0a0b",
  ["--elvix-surface" as string]: "#0d0d10",
  ["--elvix-surface-2" as string]: "#08080a",
  ["--elvix-surface-hover" as string]: "rgba(255, 255, 255, 0.04)",
  ["--elvix-surface-active" as string]: "rgba(255, 255, 255, 0.06)",
  ["--elvix-border" as string]: "rgba(255, 255, 255, 0.06)",
  ["--elvix-border-strong" as string]: "rgba(255, 255, 255, 0.12)",
  ["--elvix-fg-1" as string]: "#fafafa",
  ["--elvix-fg-2" as string]: "#a1a1aa",
  ["--elvix-fg-3" as string]: "#71717a",
  ["--elvix-placeholder" as string]: "#52525b",
};

/** The pinned palette of `theme`; `undefined` for "auto", which inherits the page. */
export function themeVars(theme: Theme): CSSProperties | undefined {
  if (theme === Theme.AUTO) return undefined;
  return theme === Theme.DARK ? ELVIX_DARK_VARS : ELVIX_LIGHT_VARS;
}

/**
 * The theme a sign-in surface renders in and its brand pair: explicit prop >
 * the host's theme pinned on <ElvixProvider theme> > the Console default. The
 * brand pair follows the theme the surface actually renders in ("auto"
 * inherits the page, so it takes the provider's), which is how a Console
 * `brandColorDark` reaches a dark surface with no host props.
 */
export function useSignInTheme(explicit: Theme | undefined) {
  const app = useElvixApp();
  const hostTheme = useElvixHostTheme();
  const providerTheme = useElvixResolvedTheme();
  const theme = explicit ?? hostTheme ?? (app?.theme as Theme | undefined) ?? Theme.LIGHT;
  const brandPair = useElvixBrandPair(
    theme === Theme.AUTO ? (providerTheme ?? Theme.LIGHT) : theme,
  );
  return { theme, brandPair };
}
