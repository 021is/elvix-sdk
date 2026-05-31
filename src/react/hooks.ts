"use client";

/**
 * Live role / scope / membership hooks. Each polls the caller's own
 * (applicationId, userId) every ~7s and exposes the current slugs, so when an
 * elvix admin attaches or detaches a role/scope/membership the host sees it
 * within a few seconds — no logout, no token swap.
 *
 *   const { slugs } = useUserRoles({ applicationId, userId, baseUrl });
 *   if (slugs.includes("admin")) showAdminMenu();
 *
 * Polling (not SSE) because EventSource can't carry the bearer token a
 * cross-origin embed relies on. `authInit()` attaches the bearer when present
 * (cross-origin) or sends the cookie (same-origin).
 */

import { authInit } from "./session";
import { useResolvedBaseUrl } from "./elvix-provider";
import { useCallback, useEffect, useState } from "react";

const POLL_MS = 7000;

export type UseUserListResult = {
  slugs: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

type Opts = {
  applicationId: string;
  userId: string;
  /** elvix origin. Defaults to "https://elvix.is" — the public elvix
   *  identity host. Override only for self-hosted elvix instances or
   *  dev mirrors; production consumers never need to pass this. */
  baseUrl?: string;
  /** Poll interval in ms. Default 7000. */
  pollMs?: number;
};

function useUserList(kind: "roles" | "scopes" | "memberships", opts: Opts): UseUserListResult {
  const { applicationId, pollMs = POLL_MS } = opts;
  const resolvedBaseUrl = useResolvedBaseUrl(opts.baseUrl);
  const [slugs, setSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // Host hasn't supplied applicationId yet (e.g. useElvixApp() bootstrap
    // hasn't resolved). Stay in `loading` and skip the fetch — calling
    // /api/me/<kind>?applicationId= would 400.
    if (!applicationId) {
      setSlugs([]);
      setLoading(true);
      setError(null);
      return;
    }
    setError(null);
    try {
      const res = await fetch(
        `${resolvedBaseUrl}/api/me/${kind}?applicationId=${encodeURIComponent(applicationId)}`,
        authInit(),
      );
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { slugs?: string[] };
        errorMessage?: string;
      };
      if (!res.ok || json.success === false) {
        setError(json.errorMessage ?? `http_${res.status}`);
        return;
      }
      setSlugs(json.data?.slugs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    } finally {
      setLoading(false);
    }
  }, [applicationId, resolvedBaseUrl, kind]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { slugs, loading, error, refresh };
}

export const useUserRoles = (opts: Opts): UseUserListResult => useUserList("roles", opts);
export const useUserScopes = (opts: Opts): UseUserListResult => useUserList("scopes", opts);
export const useUserMemberships = (opts: Opts): UseUserListResult =>
  useUserList("memberships", opts);
