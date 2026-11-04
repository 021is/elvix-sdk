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
 *     BroadcastChannel, so the leader says "online" while any tab is visible
 *     and used in the last minute, and "idle" (Away) otherwise, hidden tabs
 *     included (0.21).
 *
 * A browser without the Web Locks API (Safari before 15.4) lets every tab
 * beat, as before. Losing a beat is harmless: the server's TTL is twice the
 * interval.
 */

export const HEARTBEAT_MS = 30_000;
export const IDLE_AFTER_MS = 60_000;
/** A tab not heard from in this long is gone (closed, frozen). */
const TAB_TTL_MS = HEARTBEAT_MS * 1.5;
/**
 * Hidden this long, every tab of the app, and the beats stop (0.21, Edvard):
 * each beat renews the elvix session, so a forgotten back tab would keep the
 * person signed in and Away forever. A working day, then Offline.
 */
export const HIDDEN_BEATS_FOR_MS = 8 * 60 * 60_000;

/** `visibleAt`: when the tab was last visible (absent from SDKs before 0.21). */
export type TabReport = { visible: boolean; inputAt: number; at: number; visibleAt?: number };

export const PresenceStatus = {
  ONLINE: "online",
  IDLE: "idle",
} as const;
export type PresenceStatus = (typeof PresenceStatus)[keyof typeof PresenceStatus];

/**
 * What the leader should send now, or `null` to skip this beat. A hidden tab
 * still beats, as "idle" (Away), so a person with the app open in a back tab
 * is not shown offline (0.21; until then only a visible tab beat). Offline is
 * left to the server: no beat at all (every tab closed, signed out, asleep).
 * A hidden tab's timers are throttled to about a minute, so elvix keeps an
 * idle beat alive longer than an online one. After `HIDDEN_BEATS_FOR_MS` with
 * no tab visible the beats stop, until a tab is shown again.
 */
export function presenceDecision(reports: Iterable<TabReport>, now: number): PresenceStatus | null {
  let live = false;
  let visible = false;
  let inputAt = 0;
  let visibleAt = Number.NEGATIVE_INFINITY;
  for (const r of reports) {
    if (now - r.at > TAB_TTL_MS) continue;
    live = true;
    visible ||= r.visible;
    inputAt = Math.max(inputAt, r.inputAt);
    // A tab from an SDK before 0.21 does not say; read it as visible now.
    visibleAt = Math.max(visibleAt, r.visibleAt ?? r.at);
  }
  if (!live) return null;
  if (!visible) return now - visibleAt > HIDDEN_BEATS_FOR_MS ? null : PresenceStatus.IDLE;
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

  let visibleAt = Date.now();
  const self = (): TabReport => {
    const at = Date.now();
    const visible = document.visibilityState !== "hidden";
    if (visible) visibleAt = at;
    return { visible, inputAt, at, visibleAt };
  };
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
