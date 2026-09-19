"use client";

/**
 * Read-only hooks for what an elvix admin granted the signed-in user in this
 * app: roles, scopes, memberships.
 *
 *   const { roles, has } = useElvixRoles();
 *   if (has("admin")) showAdminMenu();
 *   roles.map((r) => <Badge key={r.id}>{r.name}</Badge>);
 *
 * Inside `<ElvixProvider clientId>` they need no arguments: the app and user
 * come from the provider. They update live (a change in the Console reaches
 * the page within about a second, over one shared stream, with no polling;
 * see `access-store.ts`), and every component reading the same list shares
 * one request.
 *
 * There is deliberately no setter. Roles, scopes and memberships are
 * assigned by the app's admins in the Console, the management API or the
 * MCP, never by the user they describe.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  AccessKind,
  type AccessSnapshot,
  accessSnapshot,
  type ElvixAccessItem,
  EMPTY_ACCESS,
  refreshAccess,
  subscribeAccess,
} from "./access-store";
import {
  ElvixSessionStatus,
  useElvixApp,
  useElvixAppContext,
  useElvixContext,
  useElvixSession,
  useResolvedBaseUrl,
} from "./elvix-provider";
import type { LiveTarget } from "./live-stream";

export type { ElvixAccessItem };

const LOADING: AccessSnapshot = { ...EMPTY_ACCESS, loading: true };

type AccessState = AccessSnapshot & {
  /** Whether the user holds `slug`. */
  has: (slug: string) => boolean;
  /** Re-read now, for a host that knows something changed. */
  refresh: () => Promise<void>;
};

function useAccess(target: LiveTarget | null, kind: AccessKind, safetyMs?: number): AccessState {
  const subscribe = useCallback(
    (onChange: () => void) =>
      target ? subscribeAccess(target, kind, onChange, safetyMs) : () => {},
    [target, kind, safetyMs],
  );
  const getSnapshot = useCallback(() => accessSnapshot(target, kind), [target, kind]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => LOADING);
  const has = useCallback((slug: string) => snapshot.slugs.includes(slug), [snapshot.slugs]);
  const refresh = useCallback(() => refreshAccess(target, kind), [target, kind]);
  return useMemo(() => ({ ...snapshot, has, refresh }), [snapshot, has, refresh]);
}

/** The provider's app and signed-in user; `null` when either is unknown. */
function useProviderTarget(): { target: LiveTarget | null; pending: boolean } {
  const { baseUrl } = useElvixContext();
  const applicationId = useElvixApp()?.applicationId;
  const userId = useElvixAppContext()?.user.id;
  const pending = useElvixSession() === ElvixSessionStatus.LOADING;
  const target = useMemo(
    () => (applicationId && userId ? { baseUrl, applicationId, userId } : null),
    [baseUrl, applicationId, userId],
  );
  return { target, pending };
}

function useProviderAccess(kind: AccessKind): AccessState {
  const { target, pending } = useProviderTarget();
  const state = useAccess(target, kind);
  // Signed out: empty and settled. Session still resolving: loading.
  return !target && pending ? { ...state, loading: true } : state;
}

export type ElvixRolesState = Omit<AccessState, "items"> & { roles: ElvixAccessItem[] };
export type ElvixScopesState = Omit<AccessState, "items"> & { scopes: ElvixAccessItem[] };
export type ElvixMembershipsState = Omit<AccessState, "items"> & {
  memberships: ElvixAccessItem[];
};

/** The signed-in user's roles in this app, with their Console names. */
export function useElvixRoles(): ElvixRolesState {
  const { items, ...rest } = useProviderAccess(AccessKind.ROLES);
  return { ...rest, roles: items };
}

/** The signed-in user's scopes in this app. */
export function useElvixScopes(): ElvixScopesState {
  const { items, ...rest } = useProviderAccess(AccessKind.SCOPES);
  return { ...rest, scopes: items };
}

/** The signed-in user's memberships (tiers) in this app, with their logos. */
export function useElvixMemberships(): ElvixMembershipsState {
  const { items, ...rest } = useProviderAccess(AccessKind.MEMBERSHIPS);
  return { ...rest, memberships: items };
}

// ─── Explicit-target hooks (pre-0.12 API) ────────────────────────────

export type UseUserListResult = {
  slugs: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

type Opts = {
  /** The app's id; the internal id from `useElvixApp().applicationId`. */
  applicationId: string;
  /** The signed-in user; the lists are always the caller's own. */
  userId: string;
  /** elvix origin. Defaults to the provider's, else "https://elvix.is". */
  baseUrl?: string;
  /**
   * Safety re-read interval in ms. Changes arrive over the live stream, so
   * this only matters where the stream cannot connect. Default 5 minutes.
   */
  pollMs?: number;
};

function useUserList(kind: AccessKind, opts: Opts): UseUserListResult {
  const baseUrl = useResolvedBaseUrl(opts.baseUrl);
  const { applicationId, userId, pollMs } = opts;
  const target = useMemo(
    () => (applicationId && userId ? { baseUrl, applicationId, userId } : null),
    [baseUrl, applicationId, userId],
  );
  const { slugs, loading, error, refresh } = useAccess(target, kind, pollMs);
  // Without an app id yet (bootstrap still resolving) the list is pending.
  return { slugs, loading: target ? loading : true, error, refresh };
}

/** Slugs only, for an explicit app and user. Prefer `useElvixRoles()`. */
export const useUserRoles = (opts: Opts): UseUserListResult => useUserList(AccessKind.ROLES, opts);
/** Slugs only, for an explicit app and user. Prefer `useElvixScopes()`. */
export const useUserScopes = (opts: Opts): UseUserListResult =>
  useUserList(AccessKind.SCOPES, opts);
/** Slugs only, for an explicit app and user. Prefer `useElvixMemberships()`. */
export const useUserMemberships = (opts: Opts): UseUserListResult =>
  useUserList(AccessKind.MEMBERSHIPS, opts);
