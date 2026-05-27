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
import type { ElvixBootstrapEnvelope, ElvixBrand, ElvixTheme } from "./types";

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
  resolvedTheme: "light" | "dark";
};

const ElvixContext = createContext<ElvixContextValue | null>(null);

export function useElvixApp(): ElvixBootstrapEnvelope | null {
  const ctx = useContext(ElvixContext);
  return ctx?.app ?? null;
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
  const [systemDark, setSystemDark] = useState(false);

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
  if (!app?.brand) return null;
  return app.brand;
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
