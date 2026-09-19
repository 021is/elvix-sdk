"use client";

/**
 * The signed-in user's roles, scopes and memberships in one app, read-only,
 * kept current without polling.
 *
 * One entry per (origin, app, user, kind), shared by every hook reading it:
 * ten components asking for roles make one request, not ten. An entry
 * re-reads `/api/me/<kind>`:
 *   - when its first reader mounts;
 *   - when the live stream (`live-stream.ts`) opens or reopens, since the
 *     server announces nothing that changed while disconnected;
 *   - when the stream says `user.<kind>.changed` for this user;
 *   - on a slow safety interval while the tab is visible, in case the stream
 *     cannot connect at all.
 * Reads within `DEDUP_MS` of the last one are dropped, so a stream opening
 * right after mount does not double the first request.
 *
 * Only elvix admins change these (Console, the management API, the MCP), so
 * the SDK exposes no writer: a user cannot grant themselves a role.
 */

import { LIVE_OPEN, type LiveEvent, type LiveTarget, subscribeLive } from "./live-stream";
import { send } from "./profile-request";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";

export const AccessKind = {
  ROLES: "roles",
  SCOPES: "scopes",
  MEMBERSHIPS: "memberships",
} as const;
export type AccessKind = (typeof AccessKind)[keyof typeof AccessKind];

/** A role, scope or membership as the Console defines it. */
export type ElvixAccessItem = {
  id: string;
  slug: string;
  name: string;
  isSystem: boolean;
  isDefault: boolean;
  /** Memberships only: the tier's logo. */
  logoUrl?: string | null;
};

export type AccessSnapshot = {
  items: ElvixAccessItem[];
  /** `items.map(i => i.slug)`, precomputed: what authz checks compare. */
  slugs: string[];
  loading: boolean;
  /** The server's error code (`not_member`, `unauthenticated`, …) or `network`. */
  error: string | null;
};

const SAFETY_POLL_MS = 5 * 60_000;
const DEDUP_MS = 2_000;

export const EMPTY_ACCESS: AccessSnapshot = { items: [], slugs: [], loading: false, error: null };
const LOADING_ACCESS: AccessSnapshot = { ...EMPTY_ACCESS, loading: true };

type Entry = {
  target: LiveTarget;
  kind: AccessKind;
  snapshot: AccessSnapshot;
  listeners: Set<() => void>;
  lastReadAt: number;
  safetyMs: number;
  teardown: () => void;
};

const entries = new Map<string, Entry>();

const keyOf = (t: LiveTarget, kind: AccessKind) =>
  `${t.baseUrl}|${t.applicationId}|${t.userId}|${kind}`;

function publish(entry: Entry, snapshot: AccessSnapshot) {
  entry.snapshot = snapshot;
  for (const listener of entry.listeners) listener();
}

/** Re-reads the list; `force` skips the dedup window (a host's `refresh()`). */
async function read(entry: Entry, force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - entry.lastReadAt < DEDUP_MS) return;
  entry.lastReadAt = now;
  const { baseUrl, applicationId } = entry.target;
  const res = await send(
    `${baseUrl}/api/me/${entry.kind}?applicationId=${encodeURIComponent(applicationId)}`,
    { cache: "no-store", ...authInit() },
  );
  const body = res
    ? (unwrapEnvelope(await res.json().catch(() => null)) as Record<string, unknown> | null)
    : null;
  const items = body?.[entry.kind];
  if (res?.ok && Array.isArray(items)) {
    const list = items as ElvixAccessItem[];
    publish(entry, { items: list, slugs: list.map((i) => i.slug), loading: false, error: null });
    return;
  }
  const code = typeof body?.error === "string" ? body.error : `http_${res?.status}`;
  // A failed re-read keeps the last good list: a blip must not strip a
  // user's admin menu mid-session.
  publish(entry, { ...entry.snapshot, loading: false, error: res ? code : "network" });
}

function onLive(entry: Entry, event: LiveEvent) {
  if (event.type === LIVE_OPEN) {
    void read(entry);
    return;
  }
  if (event.type !== `user.${entry.kind}.changed`) return;
  const userId = (event.data as { userId?: string } | null)?.userId;
  if (userId === entry.target.userId) void read(entry, true);
}

function start(entry: Entry): () => void {
  const stopLive = subscribeLive(entry.target, (event) => onLive(entry, event));
  const onVisible = () => {
    if (document.visibilityState === "visible") void read(entry);
  };
  const timer = setInterval(() => {
    if (document.visibilityState !== "hidden") void read(entry);
  }, entry.safetyMs);
  document.addEventListener("visibilitychange", onVisible);
  void read(entry);
  return () => {
    stopLive();
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/**
 * Subscribes to one list. `safetyMs` shortens the safety interval for the
 * legacy `useUserRoles({ pollMs })` callers that asked for one.
 */
export function subscribeAccess(
  target: LiveTarget,
  kind: AccessKind,
  listener: () => void,
  safetyMs = SAFETY_POLL_MS,
): () => void {
  if (typeof window === "undefined") return () => {};
  const key = keyOf(target, kind);
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      target,
      kind,
      snapshot: LOADING_ACCESS,
      listeners: new Set(),
      lastReadAt: 0,
      safetyMs,
      teardown: () => {},
    };
    entries.set(key, entry);
    entry.teardown = start(entry);
  }
  const active = entry;
  active.listeners.add(listener);
  return () => {
    active.listeners.delete(listener);
    if (active.listeners.size > 0) return;
    active.teardown();
    entries.delete(key);
  };
}

export function accessSnapshot(target: LiveTarget | null, kind: AccessKind): AccessSnapshot {
  if (!target) return EMPTY_ACCESS;
  return entries.get(keyOf(target, kind))?.snapshot ?? LOADING_ACCESS;
}

/** Re-reads now, past the dedup window. */
export function refreshAccess(target: LiveTarget | null, kind: AccessKind): Promise<void> {
  const entry = target ? entries.get(keyOf(target, kind)) : undefined;
  return entry ? read(entry, true) : Promise.resolve();
}

/** Test seam. */
export function _resetAccessStore(): void {
  for (const entry of entries.values()) entry.teardown();
  entries.clear();
}
