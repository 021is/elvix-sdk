import { getElvixToken, setElvixToken } from "./session";

/**
 * Forget `token` when elvix refused it as a session (0.26.3): it ended,
 * expired, was revoked, or is bound to another browser's DPoP key, so no call
 * from this browser can ever use it again. Until 0.26.3 it stayed in
 * localStorage and every visit asked with it again: one danceclub.dev session
 * bound to a key that browser no longer held was refused on every page from
 * 2026-11-17 to 11-22, each visit tripping elvix's DPoP alert (elvix TF175).
 * A token another tab stored meanwhile is a new sign-in and is kept.
 */
export function forgetRefusedToken(token: string): void {
  if (getElvixToken() === token) setElvixToken(null);
}
