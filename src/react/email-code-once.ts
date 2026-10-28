"use client";

/**
 * One code per email, however often `<ElvixEmailCodeSignIn>` mounts.
 *
 * The block sends its code when it mounts, and a host remounts freely (a route
 * change, a parent's key, React's StrictMode running every effect twice). Each
 * of those used to be a second email, and elvix's resend limit then answered
 * the second one with "wait N seconds" for a code the person never asked for.
 * So a sent code is kept for its lifetime: in memory while its request is in
 * flight (two mounts share one request), and in `sessionStorage` once it
 * landed (a remount or a reload picks it up). "Send again" is the only way to
 * a second code.
 */

/** A code elvix sent: its challenge, and when. */
export type SentCode = { challengeId: string; sentAt: number };

/** elvix keeps a code 10 minutes (`OTP_TTL_MIN`); reuse stops a minute short. */
const KEEP_MS = 9 * 60 * 1000;
const STORAGE_KEY = "elvix-email-code";

const inFlight = new Map<string, Promise<SentCode | null>>();
/** Where kept codes live when the browser refuses `sessionStorage` (a private
 *  window, blocked site data): this page's memory, so a remount still finds them. */
let memory: Record<string, SentCode> = {};

/** Which code a mount may reuse: same elvix, same app, same address. */
export function codeKey(baseUrl: string, clientId: string | undefined, email: string): string {
  return `${baseUrl}|${clientId ?? ""}|${email.trim().toLowerCase()}`;
}

function readStore(): Record<string, SentCode> {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SentCode>) : {};
  } catch {
    // No storage: the page's memory serves instead.
    return memory;
  }
}

function writeStore(store: Record<string, SentCode>): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // No storage: keep it in the page's memory instead.
    memory = store;
  }
}

/** The code still worth entering for `key`, or `null`. */
export function keptCode(key: string): SentCode | null {
  const sent = readStore()[key];
  return sent && Date.now() - sent.sentAt < KEEP_MS ? sent : null;
}

export function keepCode(key: string, sent: SentCode): void {
  writeStore({ ...readStore(), [key]: sent });
}

/** A code that signed the person in, or was replaced, is never offered again. */
export function forgetCode(key: string): void {
  const { [key]: _gone, ...rest } = readStore();
  writeStore(rest);
}

/**
 * The code for `key`: the kept one, the one already on its way, or a new one
 * from `send` (which answers the new challenge, or `null` when none was sent).
 */
export function sendOnce(
  key: string,
  send: () => Promise<string | null>,
): Promise<SentCode | null> {
  const kept = keptCode(key);
  if (kept) return Promise.resolve(kept);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = send()
    .then((challengeId) => {
      if (!challengeId) return null;
      const sent = { challengeId, sentAt: Date.now() };
      keepCode(key, sent);
      return sent;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}
