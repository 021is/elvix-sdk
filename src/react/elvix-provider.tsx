"use client";

import { LocaleProvider } from "@021.is/spine-i18n/react";
import { MotionConfig } from "framer-motion";
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { buildEnglishRuntime } from "../locale/runtime";
import type { Pronouns } from "./identity-schema";
import type { LanguageLevel } from "./languages";
import {
  DEFAULT_LOCALE,
  ElvixSessionStatus,
  useBootstrap,
  useCatalogLocale,
  usePresenceHeartbeat,
  useSystemDark,
  useUserEnvelope,
} from "./provider-state";
import { consumeElvixReturnToken } from "./session";
import type { ElvixBootstrapEnvelope, ElvixBrand, ElvixTheme } from "./types";

export { ElvixSessionStatus } from "./provider-state";

/**
 * Per-app user envelope returned by
 * `GET /api/account/apps/<clientId>/sdk-context`. The provider fetches it on
 * mount alongside the public bootstrap whenever a session is present (cookie
 * same-origin, bearer cross-origin). Mirrors the monorepo `ElvixAppContext`
 * shape exactly so the ported `<Elvix*>` identity / account components read
 * `useElvixAppContext()` and skip the `appId` / `appName` / `current` /
 * `membership` props a host would otherwise thread down. `null` while loading,
 * with no `clientId`, or when there's no user session (the SDK falls back to
 * its empty / "sign in to see this" state).
 */
export type ElvixAppContext = {
  user: {
    id: string;
    /** Display name, derived by elvix from given + family name. */
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
    /** Identity summary (elvix 2026-09-18+; `undefined` from an older
     *  server). Birthdate and gender are deliberately not here;
     *  `<ElvixIdentityForm>` reads them itself. */
    givenName?: string | null;
    familyName?: string | null;
    pronouns?: Pronouns | null;
    /** The user's languages, in the order `<ElvixLanguages>` lists them
     *  (elvix 2026-09-18+). */
    languages?: { code: string; level: LanguageLevel }[];
  };
  membership: {
    username: string | null;
    status: string;
    inactiveAt: string | null;
    inactivatedBy: string | null;
    deletedAt: string | null;
    deletedBy: string | null;
    avatarSizes: number[];
    avatarUpdatedAt: string;
    bannerSizes: number[];
    bannerUpdatedAt: string;
  } | null;
};

/**
 * `<ElvixProvider>` — root context for every elvix React surface.
 *
 *   <ElvixProvider clientId="acme">
 *     <ElvixSignIn />
 *   </ElvixProvider>
 *
 * Responsibilities:
 *   1. Fetch the public render envelope (`GET /api/v1/bootstrap/<clientId>`)
 *      once on mount, expose it via context. Every nested `<Elvix*>`
 *      reads appName, logo, brand, enabled methods, legal URLs from
 *      the same envelope — no prop drilling.
 *   2. Resolve the active brand colour pair from `brand` + the
 *      resolved theme. Install CSS custom properties (`--elvix-primary`,
 *      `--elvix-on-primary`, alpha tiers) on the wrapper so SDK
 *      descendants paint with `var(--elvix-primary)`.
 *   3. Scope the dark/light variant to the SDK subtree so the SDK
 *      doesn't inherit the host's global theme.
 *
 * Override the Console-configured defaults by passing explicit
 * `theme` and/or `brand` props.
 */
const ELVIX_DEFAULT_BRAND: ElvixBrand = {
  light: { primary: "#5d4dff", on: "#ffffff" },
  dark: { primary: "#8e7dff", on: "#0a0a0b" },
};

const DEFAULT_BASE_URL = "https://elvix.is";

type ElvixContextValue = {
  clientId: string | undefined;
  baseUrl: string;
  app: ElvixBootstrapEnvelope | null;
  appError: string | null;
  appContext: ElvixAppContext | null;
  sessionStatus: ElvixSessionStatus;
  /**
   * Re-fetch the signed-in user's envelope (`appContext`) now. Every SDK
   * editor calls it after a successful save, so the new name, username,
   * photo or languages reach every consumer without a reload. Hosts that
   * change the user through their own backend can call it too. Resolves when
   * the new envelope is in context; never rejects.
   */
  refresh: () => Promise<void>;
  resolvedTheme: "light" | "dark";
  /** The provider's explicit `theme` prop when it is "light" or "dark", else
   *  null. A host that pins the theme on the provider pins it for every
   *  surface, including the sign-in card, over the Console default. */
  hostTheme: "light" | "dark" | null;
  /** The provider's `brand` prop, else the app's Console brand from the
   *  bootstrap, else null (elvix's own default applies). Both theme variants. */
  brand: ElvixBrand | null;
  /** Whether nested `<Elvix*>` components should run their mount /
   *  transition animations. Cascades from `<ElvixProvider animated>`
   *  to every consumer; per-component `animated` props still win. */
  animated: boolean;
};

const ElvixContext = createContext<ElvixContextValue | null>(null);

export function useElvixApp(): ElvixBootstrapEnvelope | null {
  const ctx = useContext(ElvixContext);
  return ctx?.app ?? null;
}

/** Per-app signed-in user envelope (session-bound). `null` while loading,
 *  with no clientId, or when there's no user session. */
export function useElvixAppContext(): ElvixAppContext | null {
  const ctx = useContext(ElvixContext);
  return ctx?.appContext ?? null;
}

/**
 * Resolution state of the per-app session probe: "loading" (still checking),
 * "authenticated" (an active elvix session exists for this app), or "anonymous"
 * (no session). Use it to gate `redirectIfAuthenticated`-style flows without
 * the `appContext === null` ambiguity (null = loading OR anonymous).
 */
export function useElvixSession(): ElvixSessionStatus {
  const ctx = useContext(ElvixContext);
  return ctx?.sessionStatus ?? ElvixSessionStatus.LOADING;
}

const NO_REFRESH = async () => {};

/**
 * `refresh()` for the signed-in user's envelope — see `ElvixContextValue.refresh`.
 * A no-op outside a provider, so an editor rendered standalone still saves.
 */
export function useElvixRefresh(): () => Promise<void> {
  return useContext(ElvixContext)?.refresh ?? NO_REFRESH;
}

export function useElvixContext(): ElvixContextValue {
  const ctx = useContext(ElvixContext);
  if (!ctx) {
    throw new Error("Elvix components must be wrapped in <ElvixProvider>.");
  }
  return ctx;
}

/**
 * The provider's resolved light/dark theme (it folds `theme="auto"` against
 * the system scheme), or `null` outside a provider. Non-throwing so a
 * standalone component (e.g. `<ElvixSignInButton>` linking to hosted sign-in)
 * can read it and fall back gracefully instead of crashing.
 */
export function useElvixResolvedTheme(): "light" | "dark" | null {
  const ctx = useContext(ElvixContext);
  return ctx?.resolvedTheme ?? null;
}

/** The provider's explicit light/dark `theme` prop, else `null` (no provider,
 *  or "system"). Non-throwing, like `useElvixResolvedTheme`. */
export function useElvixHostTheme(): "light" | "dark" | null {
  return useContext(ElvixContext)?.hostTheme ?? null;
}

/**
 * The configured brand colour pair for `theme` — the provider's `brand` prop,
 * else the app's Console brand (`brandColor` / `brandColorDark` and their
 * `onBrandColor*`) — or `null` when neither exists or there is no provider.
 * Components fall back to elvix's default on `null`; an explicit colour prop
 * on the component always wins over this.
 */
export function useElvixBrandPair(theme: "light" | "dark"): { primary: string; on: string } | null {
  const ctx = useContext(ElvixContext);
  return ctx?.brand?.[theme] ?? null;
}

/**
 * Read the SDK-wide animation flag set on `<ElvixProvider animated>`.
 * Returns `true` outside a provider so component authors can call it
 * unconditionally — the absence of a provider means defaults apply.
 * Per-component `animated` props override this; callers compose like:
 *
 *   const animated = animatedProp ?? useElvixAnimated();
 */
export function useElvixAnimated(): boolean {
  const ctx = useContext(ElvixContext);
  return ctx?.animated ?? true;
}

/**
 * Resolve the effective elvix origin for a hook / component:
 *   1. explicit `propBaseUrl` (caller wins),
 *   2. `<ElvixProvider baseUrl>` from context if present + non-empty,
 *   3. public default `"https://elvix.is"`.
 *
 * SSR-safe — never touches `window`. Use this in every SDK hook /
 * component that takes an optional `baseUrl` so a host that wires the
 * provider once doesn't have to re-thread it through every prop.
 */
export function useResolvedBaseUrl(propBaseUrl?: string): string {
  const ctx = useContext(ElvixContext);
  // Use `typeof === "string"` so an empty string survives the resolver. `""`
  // is a deliberate same-origin signal (elvix's own dogfood passes it via
  // <ElvixProvider baseUrl="">). A truthy check silently collapsed it to the
  // elvix.is default and the SDK cross-origined to prod — which the host's
  // CSP then blocked.
  if (typeof propBaseUrl === "string") return propBaseUrl;
  if (ctx && typeof ctx.baseUrl === "string") return ctx.baseUrl;
  return DEFAULT_BASE_URL;
}

export function ElvixProvider({
  clientId,
  theme,
  brand,
  baseUrl,
  locale,
  i18nBase,
  animated = true,
  presence = true,
  bootstrapRefreshMs = 300_000,
  children,
  className = "",
}: {
  clientId?: string;
  theme?: ElvixTheme;
  brand?: ElvixBrand;
  /** Override the elvix origin (testing, proxy setups). */
  baseUrl?: string;
  /**
   * SDK-wide animation toggle. Defaults to `true`. Pass `false` to
   * disable mount + transition animations across every nested
   * `<Elvix*>` component in one move — useful for screenshot/print
   * surfaces, embedded checkouts, low-motion preferences, or tests.
   * Per-component `animated` props (e.g. `<ElvixCard animated>`)
   * still override the cascade.
   */
  animated?: boolean;
  /**
   * Automatic presence heartbeat. Defaults to `true`. While a clientId is set
   * and the user is signed in, `${baseUrl}/api/presence/heartbeat` is beaten
   * every 30s so the user shows ONLINE on the app's users list in the elvix
   * Console, with no `<ElvixPresence>` mount. ONE tab per browser beats (the
   * others hand it their activity), it stops when every tab is hidden, and
   * it reports "idle" after 60s without input in any tab. Pass `false` to
   * disable (e.g. a public marketing page that happens to wrap the provider).
   */
  presence?: boolean;
  /**
   * Bootstrap refresh interval in ms while the tab is visible. Defaults to
   * `300_000` (5 minutes). The envelope is also re-fetched whenever the tab
   * regains focus or visibility, which is when a Console change to sign-in
   * methods, brand or the gate matters, so a short interval only re-reads
   * config that rarely changes. `0` loads once, on mount.
   */
  bootstrapRefreshMs?: number;
  /**
   * BCP-47 locale tag (`"en"`, `"de"`, `"pt-BR"`). Switches every nested
   * `<Elvix*>` component's copy to the matching translation. The 14
   * non-English catalogs are lazy-fetched from `i18nBase`; English is
   * bundled so the SDK renders immediately while the fetch is in flight.
   * Falls back to English if the locale is missing or the fetch fails.
   */
  locale?: string;
  /**
   * Override the translation CDN. Defaults to
   * `https://elvix.is/api/v1/i18n/elvix` which serves the catalogs
   * published to the shared `i18n` R2 bucket under `elvix/main/<locale>.json`.
   */
  i18nBase?: string;
  children: ReactNode;
  className?: string;
}) {
  const resolvedBaseUrl = baseUrl ?? DEFAULT_BASE_URL;
  // `initial` is locked at LocaleProvider mount; later swaps go through
  // `switchLocale(...)` inside useCatalogLocale, and the next render sees the
  // new runtime in every nested `useT()`.
  const initialRuntime = useMemo(() => buildEnglishRuntime(), []);
  useCatalogLocale(locale ?? DEFAULT_LOCALE, i18nBase);

  // Cross-origin Google redirect return: store `#elvix_token=<token>` and
  // strip it from the URL before anything else runs. No-op without one.
  useEffect(() => {
    consumeElvixReturnToken();
  }, []);

  const { app, appError } = useBootstrap(clientId, resolvedBaseUrl, bootstrapRefreshMs);
  const { appContext, sessionStatus, refresh } = useUserEnvelope(clientId, resolvedBaseUrl);

  // Every elvix app gets presence for free, no <ElvixPresence> mount; only for
  // a signed-in user (the route requires a session). presence={false} opts out.
  usePresenceHeartbeat({
    enabled: presence && sessionStatus === ElvixSessionStatus.AUTHENTICATED,
    applicationId: app?.applicationId ?? null,
    baseUrl: resolvedBaseUrl,
  });

  const systemDark = useSystemDark();
  const effectiveTheme: "light" | "dark" =
    theme === "light" || theme === "dark" ? theme : systemDark ? "dark" : "light";

  const configuredBrand = useMemo(() => brand ?? appBrand(app), [brand, app]);
  const pair = (configuredBrand ?? ELVIX_DEFAULT_BRAND)[effectiveTheme];
  const cssVars = useMemo(() => brandCssVars(pair.primary, pair.on), [pair.primary, pair.on]);

  const value: ElvixContextValue = useMemo(
    () => ({
      clientId,
      baseUrl: resolvedBaseUrl,
      app,
      appError,
      appContext,
      sessionStatus,
      refresh,
      resolvedTheme: effectiveTheme,
      hostTheme: theme === "light" || theme === "dark" ? theme : null,
      brand: configuredBrand,
      animated,
    }),
    [
      clientId,
      resolvedBaseUrl,
      app,
      appError,
      appContext,
      sessionStatus,
      refresh,
      effectiveTheme,
      theme,
      configuredBrand,
      animated,
    ],
  );

  return (
    <ElvixContext.Provider value={value}>
      {/* `MotionConfig` broadcasts `reducedMotion` to every nested
          `framer-motion` animation in the SDK tree. `animated=false`
          maps to `"always"` (force-reduced, every transition resolves
          instantly); `animated=true` maps to `"user"`, which respects
          the browser's `prefers-reduced-motion` — so the SDK is
          accessibility-aware by default and can be disabled wholesale
          via the provider when a host wants a static surface. */}
      <MotionConfig reducedMotion={animated ? "user" : "always"}>
        <LocaleProvider initial={initialRuntime}>
          <div
            data-elvix-theme={effectiveTheme}
            style={cssVars}
            className={`${effectiveTheme === "dark" ? "dark " : ""}elvix-sdk-root ${className}`}
          >
            {children}
          </div>
        </LocaleProvider>
      </MotionConfig>
    </ElvixContext.Provider>
  );
}

function appBrand(app: ElvixBootstrapEnvelope | null): ElvixBrand | null {
  if (!app?.brandColor) return null;
  return {
    light: { primary: app.brandColor, on: app.onBrandColor },
    dark: {
      primary: app.brandColorDark ?? app.brandColor,
      on: app.onBrandColorDark ?? app.onBrandColor,
    },
  };
}

/** The brand CSS custom properties every SDK surface paints with. */
function brandCssVars(primary: string, on: string): CSSProperties {
  return {
    "--elvix-primary": primary,
    "--elvix-on-primary": on,
    "--elvix-primary-8": withAlpha(primary, 0.08),
    "--elvix-primary-12": withAlpha(primary, 0.12),
    "--elvix-primary-20": withAlpha(primary, 0.2),
    "--elvix-primary-35": withAlpha(primary, 0.35),
    "--elvix-primary-55": withAlpha(primary, 0.55),
    "--elvix-primary-strong": primary,
  } as CSSProperties;
}

function withAlpha(hex: string, a: number): string {
  const digits = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  if (!digits) return hex;
  const n = Number.parseInt(digits, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
