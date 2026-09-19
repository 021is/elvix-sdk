"use client";

/**
 * The presence heartbeat, once per browser instead of once per tab.
 *
 * Every tab of the app used to POST `/api/presence/heartbeat` every 30s, so
 * five open tabs wrote the same presence row five times. Now:
 *
 *   - one tab holds a Web Lock named for the (origin, app) pair and is the
 *     only one that beats; when it closes, the lock passes to another tab;
 *   - every tab reports its visibility and last input to the others over a
 *     BroadcastChannel, so the leader beats while ANY tab is visible and
 *     says "idle" only when no tab has seen input for a minute.
 *
 * A browser without the Web Locks API (Safari before 15.4) lets every tab
 * beat, as before. Losing a beat is harmless: the server's TTL is twice the
 * interval.
 */

export const HEARTBEAT_MS = 30_000;
export const IDLE_AFTER_MS = 60_000;
/** A tab not heard from in this long is gone (closed, frozen). */
const TAB_TTL_MS = HEARTBEAT_MS * 1.5;

export type TabReport = { visible: boolean; inputAt: number; at: number };

export const PresenceStatus = {
  ONLINE: "online",
  IDLE: "idle",
} as const;
export type PresenceStatus = (typeof PresenceStatus)[keyof typeof PresenceStatus];

/** What the leader should send now, or `null` to skip this beat. */
export function presenceDecision(reports: Iterable<TabReport>, now: number): PresenceStatus | null {
  let visible = false;
  let inputAt = 0;
  for (const r of reports) {
    if (now - r.at > TAB_TTL_MS) continue;
    visible ||= r.visible;
    inputAt = Math.max(inputAt, r.inputAt);
  }
  if (!visible) return null;
  return now - inputAt > IDLE_AFTER_MS ? PresenceStatus.IDLE : PresenceStatus.ONLINE;
}

type Beat = (status: PresenceStatus) => void;

/**
 * Starts this tab's part of the heartbeat for one (origin, app). Returns the
 * stop function.
 */
export function startHeartbeat(lockName: string, beat: Beat): () => void {
  const tabId = Math.random().toString(36).slice(2);
  const reports = new Map<string, TabReport>();
  let inputAt = Date.now();
  let leader = false;
  let stopped = false;
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(lockName);

  const self = (): TabReport => ({
    visible: document.visibilityState !== "hidden",
    inputAt,
    at: Date.now(),
  });
  const report = () => {
    const mine = self();
    reports.set(tabId, mine);
    channel?.postMessage({ tabId, ...mine });
  };
  if (channel) {
    channel.onmessage = (e: MessageEvent<TabReport & { tabId: string }>) => {
      if (e.data?.tabId) reports.set(e.data.tabId, { ...e.data, at: Date.now() });
    };
  }

  // Input is reported at most once per beat; visibility at once.
  let lastInputReport = 0;
  const onInput = () => {
    inputAt = Date.now();
    if (inputAt - lastInputReport > HEARTBEAT_MS / 2) {
      lastInputReport = inputAt;
      report();
    }
  };
  const tick = () => {
    report();
    if (!leader) return;
    const status = presenceDecision(reports.values(), Date.now());
    if (status) beat(status);
  };
  window.addEventListener("mousemove", onInput, { passive: true });
  window.addEventListener("keydown", onInput, { passive: true });
  window.addEventListener("focus", onInput);
  document.addEventListener("visibilitychange", report);
  const timer = setInterval(tick, HEARTBEAT_MS);

  let release: () => void = () => {};
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (locks) {
    void locks
      .request(lockName, () => {
        if (stopped) return;
        leader = true;
        tick();
        // Held until this tab stops; the next tab in line takes over.
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch(() => {});
  } else {
    leader = true;
  }
  tick();

  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener("mousemove", onInput);
    window.removeEventListener("keydown", onInput);
    window.removeEventListener("focus", onInput);
    document.removeEventListener("visibilitychange", report);
    channel?.close();
    release();
  };
}
