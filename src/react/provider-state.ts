"use client";

/**
 * The state behind `<ElvixProvider>`, one hook per concern: the locale
 * catalog, the app's public bootstrap, the signed-in user's envelope, the
 * presence heartbeat, and the system colour scheme. The provider composes
 * them; nothing else should need to.
 */

import { switchLocale } from "@021.is/spine-i18n/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { bundledEnglishCatalog, fetchCatalog } from "../locale/runtime";
import type { ElvixAppContext } from "./elvix-provider";
import { authInit } from "./session";
import type { ElvixBootstrapEnvelope } from "./types";

export const DEFAULT_LOCALE = "en";

/**
 * Resolution state of the per-app session probe (`sdk-context`). Lets a
 * consumer tell "still checking" from "definitely no session" — `appContext`
 * alone is `null` for both. `redirectIfAuthenticated` uses it so the sign-in
 * surfaces don't flash the form before a signed-in user is redirected.
 */
export const ElvixSessionStatus = {
  LOADING: "loading",
  AUTHENTICATED: "authenticated",
  ANONYMOUS: "anonymous",
} as const;
export type ElvixSessionStatus = (typeof ElvixSessionStatus)[keyof typeof ElvixSessionStatus];

const isAbort = (e: unknown) => (e as { name?: string })?.name === "AbortError";

/**
 * Keep the SDK's copy in `locale`. English is bundled and switches with no
 * network; other catalogs are fetched from `i18nBase`, with English kept as
 * the fallback so a missing key never shows raw. A failed fetch falls back to
 * English silently.
 */
export function useCatalogLocale(locale: string, i18nBase: string | undefined): void {
  useEffect(() => {
    if (locale === DEFAULT_LOCALE) {
      switchLocale({ primary: bundledEnglishCatalog(), fallback: null });
      return;
    }
    let cancelled = false;
    void fetchCatalog(locale, i18nBase).then((primary) => {
      if (cancelled) return;
      switchLocale(
        primary
          ? { primary, fallback: bundledEnglishCatalog() }
          : { primary: bundledEnglishCatalog(), fallback: null },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [locale, i18nBase]);
}

/** Turn a failed bootstrap response into the error the sign-in card shows. */
function bootstrapError(status: number, errorMessage: string | undefined): string {
  if (status === 404) return "client_id_not_found";
  if (status === 403) return errorMessage ?? "origin_not_allowed";
  return errorMessage ?? `bootstrap_failed_${status}`;
}

/** A refresh within this long of the last one is skipped: returning to a tab
 *  fires both `focus` and `visibilitychange`, which used to load twice. */
const REFRESH_DEDUP_MS = 2_000;

/**
 * The app's public render envelope (`GET /api/v1/bootstrap/<clientId>`),
 * loaded on mount and refreshed every `refreshMs` and when the tab becomes
 * visible again, so Console changes (methods, brand, gate) reach an open page
 * with no reload. `refreshMs={0}` loads once.
 */
export function useBootstrap(
  clientId: string | undefined,
  baseUrl: string,
  refreshMs: number,
): { app: ElvixBootstrapEnvelope | null; appError: string | null } {
  const [app, setApp] = useState<ElvixBootstrapEnvelope | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const lastLoad = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!clientId) {
        setApp(null);
        setAppError(null);
        return;
      }
      lastLoad.current = Date.now();
      try {
        const r = await fetch(`${baseUrl}/api/v1/bootstrap/${encodeURIComponent(clientId)}`, {
          signal,
        });
        // Tolerate a non-JSON body: a CORS-blocked or 5xx response may have
        // none, and the card must still show why instead of rendering empty.
        const body = (await r.json().catch(() => null)) as {
          success?: boolean;
          data?: unknown;
          errorMessage?: string;
        } | null;
        if (r.ok && body?.success && body.data) {
          setApp(body.data as ElvixBootstrapEnvelope);
          setAppError(null);
        } else {
          setAppError(bootstrapError(r.status, body?.errorMessage));
        }
      } catch (e: unknown) {
        // DNS, blocked preflight, offline: a visible error, not an empty card.
        if (!isAbort(e)) setAppError(e instanceof Error ? e.message : "network_error");
      }
    },
    [clientId, baseUrl],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  useEffect(() => {
    if (!clientId || !refreshMs || typeof window === "undefined") return;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastLoad.current < REFRESH_DEDUP_MS) return;
      void load();
    };
    const id = setInterval(refresh, refreshMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [clientId, refreshMs, load]);

  return { app, appError };
}

/**
 * The signed-in user's per-app envelope (`sdk-context`): cookie same-origin,
 * bearer cross-origin. A non-OK response is the no-session case. `refresh()`
 * re-reads it without flipping to LOADING, so consumers keep the old value
 * until the new one lands instead of flashing their signed-out state.
 */
export function useUserEnvelope(
  clientId: string | undefined,
  baseUrl: string,
): {
  appContext: ElvixAppContext | null;
  sessionStatus: ElvixSessionStatus;
  refresh: () => Promise<void>;
} {
  const [appContext, setAppContext] = useState<ElvixAppContext | null>(null);
  const [sessionStatus, setSessionStatus] = useState<ElvixSessionStatus>(
    ElvixSessionStatus.LOADING,
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const settle = (ctx: ElvixAppContext | null) => {
        setAppContext(ctx);
        setSessionStatus(ctx ? ElvixSessionStatus.AUTHENTICATED : ElvixSessionStatus.ANONYMOUS);
      };
      if (!clientId) return settle(null);
      try {
        const r = await fetch(
          `${baseUrl}/api/account/apps/${encodeURIComponent(clientId)}/sdk-context`,
          { ...authInit(), signal },
        );
        const body = r.ok ? await r.json() : null;
        settle(body?.success && body?.data ? (body.data as ElvixAppContext) : null);
      } catch (e: unknown) {
        if (!isAbort(e)) settle(null);
      }
    },
    [clientId, baseUrl],
  );

  useEffect(() => {
    setSessionStatus(ElvixSessionStatus.LOADING);
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const refresh = useCallback(() => load(), [load]);
  return { appContext, sessionStatus, refresh };
}

const HEARTBEAT_MS = 30_000;
const IDLE_AFTER_MS = 60_000;

/**
 * Presence: while `enabled`, beat `/api/presence/heartbeat` every 30s so the
 * user shows ONLINE in the Console, reporting "idle" after 60s without input
 * and skipping beats while the tab is hidden.
 */
export function usePresenceHeartbeat(opts: {
  enabled: boolean;
  applicationId: string | null;
  baseUrl: string;
}): void {
  const { enabled, applicationId, baseUrl } = opts;
  useEffect(() => {
    if (!enabled || !applicationId || typeof window === "undefined") return;
    let lastInputAt = Date.now();
    let cancelled = false;
    const onInput = () => {
      lastInputAt = Date.now();
    };
    window.addEventListener("mousemove", onInput, { passive: true });
    window.addEventListener("keydown", onInput, { passive: true });
    window.addEventListener("focus", onInput);
    const beat = () => {
      if (cancelled || document.visibilityState === "hidden") return;
      const status = Date.now() - lastInputAt > IDLE_AFTER_MS ? "idle" : "online";
      const init = authInit();
      // A lost beat does not matter: the next tick catches up.
      fetch(`${baseUrl}/api/presence/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...init.headers },
        credentials: init.credentials,
        body: JSON.stringify({ applicationId, status }),
      }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("mousemove", onInput);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("focus", onInput);
    };
  }, [enabled, applicationId, baseUrl]);
}

/** Whether the OS prefers a dark scheme, live. False on the server. */
export function useSystemDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const sync = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return dark;
}
