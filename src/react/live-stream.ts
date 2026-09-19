"use client";

/**
 * One live connection to `/api/presence/stream` per (elvix origin, app, user),
 * shared by everything that reacts to account changes: the role / scope /
 * membership hooks and `<ElvixLifecycleWatcher>`.
 *
 * WHY fetch AND NOT EventSource: `EventSource` cannot send an Authorization
 * header, and a customer app on its own origin authenticates with a bearer
 * token (no third-party cookie). A streamed `fetch` carries it, so the same
 * push path works cross-origin. Before this, every cross-origin consumer
 * polled instead: `/api/me/<kind>` every 7s per hook and `/api/v1/session`
 * every 7s per watcher, in every open tab.
 *
 * The server writes Server-Sent Events, driven by Postgres LISTEN/NOTIFY, so
 * a quiet stream costs nothing. This side:
 *   - opens when the first listener subscribes and closes with the last;
 *   - closes after a tab has been hidden for `HIDDEN_GRACE_MS` and reopens
 *     when it is shown again;
 *   - reconnects with exponential backoff; after an auth-shaped refusal
 *     (401 / 403 / 404) it waits the longest delay, since retrying sooner
 *     cannot succeed;
 *   - tells listeners every time it opens (`open`), because the server
 *     records role / scope / membership timestamps silently on connect:
 *     whatever changed while disconnected has to be re-read.
 */

import { authInit } from "./session";

export type LiveEvent = { type: string; data: unknown };
export type LiveListener = (event: LiveEvent) => void;
export type LiveTarget = { baseUrl: string; applicationId: string; userId: string };

/** Sent to listeners each time the stream (re)opens. */
export const LIVE_OPEN = "open";

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 60_000;
const HIDDEN_GRACE_MS = 30_000;

type Connection = {
  target: LiveTarget;
  listeners: Set<LiveListener>;
  controller: AbortController | null;
  /** The response arrived and events are flowing (not merely connecting). */
  isOpen: boolean;
  retryMs: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
};

const connections = new Map<string, Connection>();
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityBound = false;

const keyOf = (t: LiveTarget) => `${t.baseUrl}|${t.applicationId}|${t.userId}`;
const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

/**
 * Splits complete Server-Sent Event frames off `buffer`. Frames end with a
 * blank line; `data` lines join with "\n"; comment lines (`:`) are
 * keep-alives. Returns the events and the unfinished remainder.
 */
export function parseSseFrames(buffer: string): { events: LiveEvent[]; rest: string } {
  const frames = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = frames.pop() ?? "";
  const events: LiveEvent[] = [];
  for (const frame of frames) {
    let type = "message";
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) type = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length === 0) continue;
    const raw = data.join("\n");
    try {
      events.push({ type, data: JSON.parse(raw) });
    } catch {
      events.push({ type, data: raw });
    }
  }
  return { events, rest };
}

function broadcast(conn: Connection, event: LiveEvent) {
  for (const listener of conn.listeners) listener(event);
}

function scheduleReconnect(conn: Connection, delayMs: number) {
  if (conn.retryTimer || conn.listeners.size === 0) return;
  conn.retryTimer = setTimeout(() => {
    conn.retryTimer = null;
    void open(conn);
  }, delayMs);
}

async function read(conn: Connection, body: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) return;
    const parsed = parseSseFrames(buffer + decoder.decode(value, { stream: true }));
    buffer = parsed.rest;
    for (const event of parsed.events) broadcast(conn, event);
  }
}

async function open(conn: Connection) {
  if (conn.controller || conn.listeners.size === 0 || isHidden()) return;
  const controller = new AbortController();
  conn.controller = controller;
  const { baseUrl, applicationId, userId } = conn.target;
  const url = `${baseUrl}/api/presence/stream?applicationId=${encodeURIComponent(applicationId)}&userId=${encodeURIComponent(userId)}`;
  const auth = authInit();
  let refused = false;
  try {
    const res = await fetch(url, {
      headers: { accept: "text/event-stream", ...auth.headers },
      credentials: auth.credentials,
      cache: "no-store",
      signal: controller.signal,
    });
    refused = [401, 403, 404].includes(res.status);
    if (res.ok && res.body) {
      conn.retryMs = MIN_RETRY_MS;
      conn.isOpen = true;
      broadcast(conn, { type: LIVE_OPEN, data: null });
      await read(conn, res.body, controller.signal);
    }
  } catch {
    // Aborted (closed on purpose) or a network error: decided below.
  }
  if (conn.controller !== controller) return;
  conn.controller = null;
  conn.isOpen = false;
  if (controller.signal.aborted) return;
  const delay = refused ? MAX_RETRY_MS : conn.retryMs;
  conn.retryMs = Math.min(conn.retryMs * 2, MAX_RETRY_MS);
  scheduleReconnect(conn, delay);
}

function close(conn: Connection) {
  if (conn.retryTimer) clearTimeout(conn.retryTimer);
  conn.retryTimer = null;
  conn.controller?.abort();
  conn.controller = null;
  conn.isOpen = false;
}

function bindVisibility() {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (hiddenTimer) clearTimeout(hiddenTimer);
    hiddenTimer = null;
    if (isHidden()) {
      hiddenTimer = setTimeout(() => {
        for (const conn of connections.values()) close(conn);
      }, HIDDEN_GRACE_MS);
      return;
    }
    for (const conn of connections.values()) void open(conn);
  });
}

/**
 * Listens to the account-change stream of `target`; returns the unsubscribe.
 * Every listener of a target shares one connection.
 */
export function subscribeLive(target: LiveTarget, listener: LiveListener): () => void {
  if (typeof window === "undefined") return () => {};
  bindVisibility();
  const key = keyOf(target);
  let conn = connections.get(key);
  if (!conn) {
    conn = {
      target,
      listeners: new Set(),
      controller: null,
      isOpen: false,
      retryMs: MIN_RETRY_MS,
      retryTimer: null,
    };
    connections.set(key, conn);
  }
  const active = conn;
  active.listeners.add(listener);
  // A late subscriber on an already-open stream still needs its first read;
  // one arriving mid-connect gets the `open` everyone else does.
  if (active.isOpen) listener({ type: LIVE_OPEN, data: null });
  else void open(active);
  return () => {
    active.listeners.delete(listener);
    if (active.listeners.size > 0) return;
    close(active);
    connections.delete(key);
  };
}

/** Test seam: drop every connection. */
export function _resetLiveStreams(): void {
  for (const conn of connections.values()) close(conn);
  connections.clear();
}
