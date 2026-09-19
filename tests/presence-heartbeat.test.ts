// @vitest-environment jsdom
/** One presence heartbeat per browser: the decision, and the hand-over. */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HEARTBEAT_MS,
  IDLE_AFTER_MS,
  presenceDecision,
  startHeartbeat,
} from "../src/react/presence-heartbeat";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("presenceDecision", () => {
  const now = 1_000_000;
  it("beats online while any tab is visible and recently used", () => {
    const reports = [
      { visible: false, inputAt: now - 5_000, at: now },
      { visible: true, inputAt: now - IDLE_AFTER_MS * 2, at: now },
    ];
    expect(presenceDecision(reports, now)).toBe("online");
  });

  it("says idle when no tab saw input for a minute", () => {
    const quiet = { visible: true, inputAt: now - IDLE_AFTER_MS - 1, at: now };
    expect(presenceDecision([quiet], now)).toBe("idle");
  });

  it("skips the beat when every tab is hidden or gone", () => {
    const stale = { visible: true, inputAt: now, at: now - HEARTBEAT_MS * 2 };
    expect(presenceDecision([{ visible: false, inputAt: now, at: now }, stale], now)).toBeNull();
  });
});

/** A single-process stand-in for `navigator.locks`: first come, first held. */
function fakeLocks() {
  const queue: (() => Promise<void>)[] = [];
  let held = false;
  const next = () => {
    const run = queue.shift();
    if (!run) return;
    held = true;
    void run().then(() => {
      held = false;
      next();
    });
  };
  return {
    request(_name: string, callback: () => Promise<void> | undefined) {
      queue.push(async () => {
        await callback();
      });
      if (!held) next();
      return Promise.resolve();
    },
  };
}

describe("startHeartbeat", () => {
  it("lets one tab beat, and hands over when it closes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { ...navigator, locks: fakeLocks() });
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = startHeartbeat("elvix-presence|test", first);
    const stopSecond = startHeartbeat("elvix-presence|test", second);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);

    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    stopFirst();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(second).toHaveBeenCalledWith("online");
    stopSecond();
  });
});
