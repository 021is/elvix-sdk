"use client";

import {
  type CSSProperties,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authInit, consumeElvixReturnToken } from "./session";
import type { ElvixBootstrapEnvelope, ElvixBrand, ElvixTheme } from "./types";

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
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
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

const BOOTSTRAP_URL = (baseUrl: string, clientId: string) =>
  `${baseUrl}/api/v1/bootstrap/${encodeURIComponent(clientId)}`;

type ElvixContextValue = {
  clientId: string | undefined;
  baseUrl: string;
  app: ElvixBootstrapEnvelope | null;
  appError: string | null;
  appContext: ElvixAppContext | null;
  resolvedTheme: "light" | "dark";
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

export function useElvixContext(): ElvixContextValue {
  const ctx = useContext(ElvixContext);
  if (!ctx) {
    throw new Error("Elvix components must be wrapped in <ElvixProvider>.");
  }
  return ctx;
}

export function ElvixProvider({
  clientId,
  theme,
  brand,
  baseUrl,
  children,
  className = "",
}: {
  clientId?: string;
  theme?: ElvixTheme;
  brand?: ElvixBrand;
  /** Override the elvix origin (testing, proxy setups). */
  baseUrl?: string;
  children: ReactNode;
  className?: string;
}) {
  const resolvedBaseUrl = baseUrl ?? DEFAULT_BASE_URL;
  const [app, setApp] = useState<ElvixBootstrapEnvelope | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [appContext, setAppContext] = useState<ElvixAppContext | null>(null);
  const [systemDark, setSystemDark] = useState(false);

  // Cross-origin Google redirect return: if elvix bounced the user back here
  // with `#elvix_token=<token>` in the fragment, store it and strip it from
  // the URL before anything else runs. Runs once on mount; no-op when there's
  // no fragment token (the common case) or on the server.
  useEffect(() => {
    consumeElvixReturnToken();
  }, []);

  useEffect(() => {
    if (!clientId) {
      setApp(null);
      setAppError(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(BOOTSTRAP_URL(resolvedBaseUrl, clientId), { signal: ctrl.signal })
      .then((r) => r.json())
      .then((body) => {
        if (body?.success && body?.data) {
          setApp(body.data as ElvixBootstrapEnvelope);
          setAppError(null);
        } else {
          setAppError(body?.errorMessage ?? "bootstrap_failed");
        }
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setAppError(e instanceof Error ? e.message : "bootstrap_failed");
      });
    return () => ctrl.abort();
  }, [clientId, resolvedBaseUrl]);

  // Per-app user envelope. Carries the session cookie same-origin, the bearer
  // cross-origin (via authInit). A non-OK response is the no-session case —
  // silent; the ported identity / account components fall back to their empty
  // / "not signed in" surface.
  useEffect(() => {
    if (!clientId) {
      setAppContext(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(`${resolvedBaseUrl}/api/account/apps/${encodeURIComponent(clientId)}/sdk-context`, {
      ...authInit(),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.success && body?.data) setAppContext(body.data as ElvixAppContext);
        else setAppContext(null);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setAppContext(null);
      });
    return () => ctrl.abort();
  }, [clientId, resolvedBaseUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const sync = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const effectiveTheme: "light" | "dark" = useMemo(() => {
    if (theme === "light") return "light";
    if (theme === "dark") return "dark";
    return systemDark ? "dark" : "light";
  }, [theme, systemDark]);

  const effectiveBrand: ElvixBrand = brand ?? appBrand(app) ?? ELVIX_DEFAULT_BRAND;
  const pair = effectiveBrand[effectiveTheme];

  const cssVars: CSSProperties = useMemo(
    () =>
      ({
        "--elvix-primary": pair.primary,
        "--elvix-on-primary": pair.on,
        "--elvix-primary-12": withAlpha(pair.primary, 0.12),
        "--elvix-primary-35": withAlpha(pair.primary, 0.35),
        "--elvix-primary-55": withAlpha(pair.primary, 0.55),
        "--elvix-primary-strong": pair.primary,
      }) as CSSProperties,
    [pair.primary, pair.on],
  );

  const value: ElvixContextValue = {
    clientId,
    baseUrl: resolvedBaseUrl,
    app,
    appError,
    appContext,
    resolvedTheme: effectiveTheme,
  };

  return (
    <ElvixContext.Provider value={value}>
      <div
        data-elvix-theme={effectiveTheme}
        style={cssVars}
        className={(effectiveTheme === "dark" ? "dark " : "") + "elvix-sdk-root " + className}
      >
        {children}
      </div>
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

function withAlpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = Number.parseInt(m[1]!, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
