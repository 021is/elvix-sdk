"use client";

import { Loader2, LogOut } from "lucide-react";
import type * as React from "react";
import type { ReactNode } from "react";
import { cssLength } from "./css-length";
import { useElvixBrandPair, useElvixResolvedTheme } from "./elvix-provider";
import { useSignOut } from "./use-sign-out";

const Size = {
  SM: "sm",
  MD: "md",
  LG: "lg",
} as const;
type Size = (typeof Size)[keyof typeof Size];

const Theme = {
  AUTO: "auto",
  LIGHT: "light",
  DARK: "dark",
} as const;
type Theme = (typeof Theme)[keyof typeof Theme];

export const ElvixSignOutPreset = {
  SIGN_OUT: "sign-out",
  LOG_OUT: "log-out",
  SIGN_OUT_OF_ELVIX: "sign-out-of-elvix",
  SIGN_OUT_OF_APP: "sign-out-of-app",
} as const;
export type ElvixSignOutPreset = (typeof ElvixSignOutPreset)[keyof typeof ElvixSignOutPreset];

const PRESET_LABEL: Record<ElvixSignOutPreset, string> = {
  "sign-out": "Sign out",
  "log-out": "Log out",
  "sign-out-of-elvix": "Sign out of elvix",
  "sign-out-of-app": "Sign out",
};

/**
 * Tone = the affordance the button communicates.
 *   neutral     — low-key footer / menu-item style (the default).
 *   brand       — emphasised primary action in your brand chord.
 *   destructive — red, danger. Reach for this when the click is part
 *                 of a "sign out everywhere" / "end this session"
 *                 surface where the host wants explicit weight.
 */
export const ElvixSignOutTone = {
  NEUTRAL: "neutral",
  BRAND: "brand",
  DESTRUCTIVE: "destructive",
} as const;
export type ElvixSignOutTone = (typeof ElvixSignOutTone)[keyof typeof ElvixSignOutTone];

export const ElvixSignOutVariant = {
  FILLED: "filled",
  OUTLINE: "outline",
  GHOST: "ghost",
} as const;
export type ElvixSignOutVariant = (typeof ElvixSignOutVariant)[keyof typeof ElvixSignOutVariant];

export const ElvixSignOutShape = {
  RECTANGLE: "rectangle",
  PILL: "pill",
  SQUARE: "square",
  CIRCLE: "circle",
} as const;
export type ElvixSignOutShape = (typeof ElvixSignOutShape)[keyof typeof ElvixSignOutShape];

export const ElvixSignOutType = {
  STANDARD: "standard",
  ICON: "icon",
} as const;
export type ElvixSignOutType = (typeof ElvixSignOutType)[keyof typeof ElvixSignOutType];

/**
 * The FORM the sign-out action takes — one component, every placement:
 *   button   — a standalone styled button (default; honours tone/variant/shape).
 *   menuitem — a full-width row for a dropdown / account menu (role="menuitem").
 *   link     — an inline text link for footers / settings rows.
 * For anything else, pass a render-fn as children to go fully headless.
 */
export const ElvixSignOutAs = {
  BUTTON: "button",
  MENUITEM: "menuitem",
  LINK: "link",
} as const;
export type ElvixSignOutAs = (typeof ElvixSignOutAs)[keyof typeof ElvixSignOutAs];

export const ElvixSignOutAlign = {
  LEFT: "left",
  CENTER: "center",
  RIGHT: "right",
} as const;
export type ElvixSignOutAlign = (typeof ElvixSignOutAlign)[keyof typeof ElvixSignOutAlign];

const ALIGN_CLASS: Record<ElvixSignOutAlign, string> = {
  left: "justify-start text-left",
  center: "justify-center text-center",
  right: "justify-end text-right",
};

export type ElvixSignOutResult =
  | { ok: true; redirect?: string }
  | { ok: false; error: string; message?: string };

export type ElvixSignOutButtonProps = {
  /** Override the button label. Falls back to `preset`. */
  label?: string;
  preset?: ElvixSignOutPreset;
  type?: ElvixSignOutType;
  /** Affordance / weight of the action. */
  tone?: ElvixSignOutTone;
  variant?: ElvixSignOutVariant;
  shape?: ElvixSignOutShape;
  size?: Size;
  theme?: Theme;
  /** Show the leading icon. Default true. Set false for label-only. */
  showIcon?: boolean;
  /**
   * Replace the default LogOut icon with a custom node. Receives the
   * resolved pixel size as a number, returns a ReactNode. Useful when
   * you want a brand-aware glyph or a Heroicons / Tabler icon instead.
   */
  icon?: (size: number) => ReactNode;
  /**
   * Override the brand chord on `tone="brand"` + `variant="filled"`.
   * Defaults to elvix lavender (#6c5ce7). Pair with `onBrandColor`.
   */
  brandColor?: string;
  /** Foreground on top of `brandColor`. Defaults to #ffffff. */
  onBrandColor?: string;
  /** Content alignment inside the button. Defaults to "center". */
  align?: ElvixSignOutAlign;
  /**
   * Override label font size. Number is treated as px; string is any
   * CSS length. Defaults to the `size` preset's text token.
   */
  fontSize?: number | string;
  /**
   * Custom corner radius. Wins over `shape`. Number = px; string =
   * any CSS length (e.g. `"8px"`, `"50%"`). Use `0` for sharp corners.
   */
  borderRadius?: number | string;
  className?: string;
  /**
   * The form this action takes: "button" (default), "menuitem" (a full-width
   * dropdown row), or "link" (inline text link). Same behaviour, different
   * placement.
   */
  as?: ElvixSignOutAs;
  /**
   * Headless escape hatch: pass a render function and YOU own the element.
   * Receives `{ signOut, busy }` so you can wire sign-out onto any element
   * from any design system (a Radix `<DropdownMenuItem>`, your own button,
   * etc.). When provided, `as` and all styling props are ignored.
   *
   *   <ElvixSignOutButton>
   *     {({ signOut, busy }) => (
   *       <DropdownMenuItem onSelect={signOut} disabled={busy}>Log out</DropdownMenuItem>
   *     )}
   *   </ElvixSignOutButton>
   */
  children?: (api: { signOut: () => void; busy: boolean }) => ReactNode;
  /**
   * Where to navigate after a successful sign-out. Defaults to the
   * current origin's root. Pass `null` to disable navigation (the
   * host owns the next step via `onResult`).
   */
  redirectAfterSignOut?: string | null;
  /**
   * Optional cookie name to clear client-side after sign-out. Defaults
   * to `elvix_token` (the SDK's canonical name). Set to `null` to
   * skip the cookie clear; useful when the host writes an httpOnly
   * cookie server-side and tears it down through its own route.
   */
  cookieName?: string | null;
  /**
   * Fires once the elvix backend has invalidated the session AND the
   * SDK has cleared its local token store. Receives a ResponseDto
   * envelope so the host can branch on `r.ok`.
   */
  onResult?: (result: ElvixSignOutResult) => void;
};

const SIZE_STANDARD = {
  sm: "h-9 px-3 text-[14px] gap-2 tracking-[0.01em]",
  md: "h-10 px-3 text-[14px] gap-2.5 tracking-[0.01em]",
  lg: "h-12 px-4 text-[15px] gap-3 tracking-[0.01em]",
} as const;

const SIZE_ICON = {
  sm: "h-9 w-9",
  md: "h-10 w-10",
  lg: "h-12 w-12",
} as const;

const ICON_SIZE = { sm: 16, md: 18, lg: 20 } as const;

/**
 * One palette per (tone, variant). Light + dark are handled inside
 * each entry. The class string is the WHOLE button skin: bg, text,
 * border, hover, active. Adding a tone = adding three entries.
 */
const PALETTE: Record<ElvixSignOutTone, Record<ElvixSignOutVariant, Record<Theme, string>>> = {
  neutral: {
    filled: {
      light:
        "bg-[#0a0a0b] text-white ring-1 ring-black/10 hover:bg-[#1a1a1f] active:bg-black shadow-[0_4px_16px_-4px_rgba(0,0,0,0.18)]",
      dark: "bg-white text-[#0a0a0b] ring-1 ring-white/[0.10] hover:bg-zinc-100 active:bg-zinc-200",
      auto: "bg-[#0a0a0b] text-white ring-1 ring-black/10 hover:bg-[#1a1a1f]",
    },
    outline: {
      light:
        "bg-white text-[#0a0a0b] border border-black/15 hover:bg-zinc-50 hover:border-black/25",
      dark: "bg-white/[0.04] text-white border border-white/20 hover:bg-white/[0.08] hover:border-white/30",
      auto: "bg-transparent text-[#0a0a0b] border border-black/15 hover:bg-black/[0.04] dark:bg-white/[0.04] dark:text-white dark:border-white/20 dark:hover:bg-white/[0.08]",
    },
    ghost: {
      light: "bg-transparent text-[#0a0a0b] hover:bg-black/[0.05]",
      dark: "bg-transparent text-white hover:bg-white/[0.06]",
      auto: "bg-transparent text-[#0a0a0b] hover:bg-black/[0.05] dark:text-white dark:hover:bg-white/[0.06]",
    },
  },
  brand: {
    filled: {
      light:
        "bg-[#6c5ce7] text-white hover:bg-[#5d4ede] active:bg-[#5040d4] ring-1 ring-black/10 shadow-[0_4px_16px_-4px_rgba(108,92,231,0.45)]",
      dark: "bg-[#6c5ce7] text-white hover:bg-[#5d4ede] active:bg-[#5040d4] ring-1 ring-black/10 shadow-[0_4px_16px_-4px_rgba(108,92,231,0.45)]",
      auto: "bg-[#6c5ce7] text-white hover:bg-[#5d4ede] active:bg-[#5040d4] ring-1 ring-black/10 shadow-[0_4px_16px_-4px_rgba(108,92,231,0.45)]",
    },
    outline: {
      light:
        "bg-white text-[#6c5ce7] border border-[#6c5ce7]/30 hover:bg-[#6c5ce7]/[0.06] hover:border-[#6c5ce7]/50",
      dark: "bg-white/[0.02] text-[#a59cff] border border-[#a59cff]/30 hover:bg-[#a59cff]/[0.08] hover:border-[#a59cff]/50",
      auto: "bg-transparent text-[#6c5ce7] border border-[#6c5ce7]/30 hover:bg-[#6c5ce7]/[0.06] hover:border-[#6c5ce7]/50",
    },
    ghost: {
      light: "bg-transparent text-[#6c5ce7] hover:bg-[#6c5ce7]/[0.08]",
      dark: "bg-transparent text-[#a59cff] hover:bg-[#a59cff]/[0.10]",
      auto: "bg-transparent text-[#6c5ce7] hover:bg-[#6c5ce7]/[0.08]",
    },
  },
  // Destructive: solid red for filled (the affordance for security-
  // leaning surfaces). Outline + ghost for menu-item placements that
  // still need to read as dangerous.
  destructive: {
    filled: {
      light:
        "bg-[#dc2626] text-white hover:bg-[#b91c1c] active:bg-[#991b1b] ring-1 ring-black/10 shadow-[0_4px_16px_-4px_rgba(220,38,38,0.45)]",
      dark: "bg-[#dc2626] text-white hover:bg-[#b91c1c] active:bg-[#991b1b] ring-1 ring-black/10 shadow-[0_4px_16px_-4px_rgba(220,38,38,0.45)]",
      auto: "bg-[#dc2626] text-white hover:bg-[#b91c1c] active:bg-[#991b1b] ring-1 ring-black/10 shadow-[0_4px_16px_-4px_rgba(220,38,38,0.45)]",
    },
    outline: {
      light:
        "bg-white text-[#b91c1c] border border-[#dc2626]/35 hover:bg-[#dc2626]/[0.06] hover:border-[#dc2626]/55",
      dark: "bg-white/[0.02] text-[#fca5a5] border border-[#fca5a5]/30 hover:bg-[#fca5a5]/[0.08] hover:border-[#fca5a5]/50",
      auto: "bg-transparent text-[#b91c1c] border border-[#dc2626]/35 hover:bg-[#dc2626]/[0.06]",
    },
    ghost: {
      light: "bg-transparent text-[#b91c1c] hover:bg-[#dc2626]/[0.08]",
      dark: "bg-transparent text-[#fca5a5] hover:bg-[#fca5a5]/[0.10]",
      auto: "bg-transparent text-[#b91c1c] hover:bg-[#dc2626]/[0.08]",
    },
  },
};

const SHAPE_CLASS: Record<ElvixSignOutShape, string> = {
  rectangle: "rounded-[10px]",
  pill: "rounded-full",
  square: "rounded-[10px]",
  circle: "rounded-full",
};

/**
 * `<ElvixSignOutButton>` — the symmetric counterpart of
 * `<ElvixSignInButton>`. One click invalidates the elvix session
 * server-side (emits `user.signed_out` for the host's webhook
 * receiver), clears the SDK's in-memory + localStorage token, drops
 * the `elvix_token` cookie, then navigates.
 *
 * Three tones cover the common placements:
 *   - `neutral` (default): low-key footer / account-menu item.
 *   - `brand`: emphasised primary action in your brand chord.
 *   - `destructive`: explicit red for security-leaning surfaces
 *     ("Sign out everywhere", "End this session", etc.).
 *
 * Default leading icon is lucide's `LogOut` (door + arrow), the
 * universal sign-out glyph. Override via `icon` or hide with
 * `showIcon={false}`.
 *
 * Same-origin (the user is on elvix.is itself) authenticates via
 * cookie. Cross-origin (a customer app) authenticates via the
 * SDK-managed bearer token; the SDK's cross-origin fetch interceptor
 * attaches `Authorization: Bearer <token>` and rewrites the URL to
 * `https://elvix.is` transparently.
 */
export function ElvixSignOutButton({
  label,
  preset = "sign-out",
  type = "standard",
  tone = "neutral",
  variant = "outline",
  shape = "rectangle",
  size = "md",
  theme = "auto",
  showIcon = true,
  icon,
  brandColor,
  onBrandColor,
  align = "center",
  fontSize,
  borderRadius,
  className,
  as = "button",
  children,
  redirectAfterSignOut,
  cookieName = "elvix_token",
  onResult,
}: ElvixSignOutButtonProps) {
  const { run: doSignOut, busy } = useSignOut({ redirectAfterSignOut, cookieName });
  const { fill, onFill } = useBrandFill({ tone, variant, theme, brandColor, onBrandColor });

  const isIconOnly = type === "icon";
  const handleClick = async () => onResult?.(await doSignOut());
  const iconNode = <SignOutGlyph busy={busy} show={showIcon} icon={icon} px={ICON_SIZE[size]} />;
  const liveLabel = busy ? "Signing out…" : (label ?? PRESET_LABEL[preset]);

  // Headless: the host owns the element; we just hand over `signOut` + `busy`.
  if (typeof children === "function") {
    return <>{children({ signOut: () => void handleClick(), busy })}</>;
  }

  // Menu item (account menus) and link (footers / settings rows) use
  // hardcoded colours + `dark:` variants so they read on any host page
  // without the SDK theme vars.
  if (as === "menuitem" || as === "link") {
    const menu = as === "menuitem";
    return (
      <button
        type="button"
        role={menu ? "menuitem" : undefined}
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy || undefined}
        className={joinClasses(
          menu ? MENU_BASE : LINK_BASE,
          (menu ? MENU_TONE : LINK_TONE)[tone],
          className,
        )}
      >
        {menu || showIcon ? iconNode : null}
        <span>{liveLabel}</span>
      </button>
    );
  }

  const style: React.CSSProperties = {
    fontSize: cssLength(fontSize, undefined),
    borderRadius: cssLength(borderRadius, undefined),
    ...(fill ? { backgroundColor: fill, color: onFill } : {}),
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={joinClasses(
        BUTTON_BASE,
        ALIGN_CLASS[align],
        FOCUS_RING[tone],
        borderRadius === undefined && SHAPE_CLASS[isIconOnly ? iconShape(shape) : shape],
        isIconOnly ? SIZE_ICON[size] : SIZE_STANDARD[size],
        !fill && PALETTE[tone][variant][theme],
        className,
      )}
      style={style}
      aria-label={isIconOnly ? liveLabel : undefined}
      aria-busy={busy || undefined}
    >
      {iconNode}
      {isIconOnly ? null : <span>{liveLabel}</span>}
    </button>
  );
}

/** The leading glyph, swapped for a spinner while the sign-out is in flight
 *  so the click reads as ack'd instead of looking dead until navigation. */
function SignOutGlyph({
  busy,
  show,
  icon,
  px,
}: {
  busy: boolean;
  show: boolean;
  icon: ElvixSignOutButtonProps["icon"];
  px: number;
}) {
  if (busy) return <Loader2 size={px} strokeWidth={2} className="animate-spin" aria-hidden />;
  if (!show) return null;
  return icon?.(px) ?? <LogOut size={px} strokeWidth={2} aria-hidden />;
}

/** The brand fill for tone="brand" + variant="filled": an explicit colour,
 *  else the provider / Console brand for this theme (the same default as
 *  <ElvixSignInButton>). Other tones and variants paint from the palette. */
function useBrandFill(p: {
  tone: ElvixSignOutTone;
  variant: ElvixSignOutButtonProps["variant"];
  theme: ElvixSignOutButtonProps["theme"];
  brandColor?: string;
  onBrandColor?: string;
}): { fill: string | undefined; onFill: string } {
  const providerTheme = useElvixResolvedTheme();
  const pair = useElvixBrandPair(
    p.theme === "light" || p.theme === "dark" ? p.theme : (providerTheme ?? "light"),
  );
  const fill =
    p.tone === "brand" && p.variant === "filled" ? (p.brandColor ?? pair?.primary) : undefined;
  const onFill = p.onBrandColor ?? (p.brandColor ? undefined : pair?.on) ?? "#ffffff";
  return { fill, onFill };
}

const joinClasses = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ").trim();

/** An icon-only button is round or square, whatever shape was asked for. */
const iconShape = (shape: ElvixSignOutShape): ElvixSignOutShape =>
  shape === "pill" || shape === "circle" ? "circle" : "square";

const BUTTON_BASE =
  "inline-flex items-center font-medium select-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer";

const FOCUS_RING: Record<ElvixSignOutTone, string> = {
  neutral: "focus-visible:ring-black/30",
  brand: "focus-visible:ring-[#8e7dff]/60",
  destructive: "focus-visible:ring-[#dc2626]/60",
};

const MENU_BASE =
  "w-full inline-flex items-center gap-2.5 px-3 h-10 rounded-md text-[14px] font-medium text-left transition cursor-pointer hover:bg-black/[0.05] dark:hover:bg-white/[0.06] disabled:opacity-60 disabled:cursor-not-allowed";

const MENU_TONE: Record<ElvixSignOutTone, string> = {
  neutral: "text-[#0a0a0b] dark:text-white",
  brand: "text-[#0a0a0b] dark:text-white",
  destructive:
    "text-[#b91c1c] dark:text-[#fca5a5] hover:bg-[#dc2626]/[0.06] dark:hover:bg-[#fca5a5]/[0.10]",
};

const LINK_BASE =
  "inline-flex items-center gap-1.5 text-[14px] font-medium underline-offset-4 hover:underline transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:no-underline";

const LINK_TONE: Record<ElvixSignOutTone, string> = {
  neutral: "text-[#0a0a0b] dark:text-white",
  brand: "text-[#6c5ce7] dark:text-[#a59cff]",
  destructive: "text-[#b91c1c] dark:text-[#fca5a5]",
};

/**
 * `<ElvixSignOutMenuItem>` — the sign-out action as a dropdown/account-menu
 * row. Thin alias for `<ElvixSignOutButton as="menuitem">`; same props.
 */
export function ElvixSignOutMenuItem(props: Omit<ElvixSignOutButtonProps, "as">) {
  return <ElvixSignOutButton {...props} as="menuitem" />;
}

/**
 * `<ElvixSignOutLink>` — the sign-out action as an inline text link. Thin
 * alias for `<ElvixSignOutButton as="link">`; same props.
 */
export function ElvixSignOutLink(props: Omit<ElvixSignOutButtonProps, "as">) {
  return <ElvixSignOutButton {...props} as="link" />;
}
