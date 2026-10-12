# Where the session token lives: trade-off and proposal

Status: **proposal, nothing changed.** The default stays as it is until Edvard decides.
Written 2026-10-12 for the 0.14.0 security review (item 10).

## Today

A cross-origin host (an app on its own domain, not elvix.is) cannot use elvix's
session cookie: third-party cookies are blocked. So sign-in returns a token, and
the SDK keeps it in `localStorage` (`elvix.session.token`, `src/react/session.ts`)
and sends it as `Authorization: Bearer` on every call. Same-origin hosts (elvix's
own Console and Account) never hold a token; they ride the cookie.

## The risk

Anything that runs JavaScript on the host page can read `localStorage`. One XSS
anywhere on a customer's origin (their own bug, a compromised dependency, a
third-party script) lets an attacker copy the token and use it from anywhere,
until it expires or the user signs out. `localStorage` is also readable by every
script on that origin for the life of the session, and survives browser restarts.

What it is NOT: a way for another website to read the token (storage is
origin-scoped), and not new in 0.14.0. The 0.14.0 fixes (the `state` nonce on the
redirect return, the redirect guard) close the ways a token could be injected or
leaked through URLs; they do not change where it rests.

## What each option buys

| Option | Stops XSS stealing the token | Cost |
|---|---|---|
| **A. Keep `localStorage` (today)** | No | Nothing. Works on every host, survives reloads and tabs. |
| **B. Memory only** | Partly: no copy at rest, nothing to read after the tab closes. A live XSS can still call the SDK or read the in-memory value. | Signed out on every reload and new tab unless the host re-establishes the session. Breaks the "open a second tab" and "refresh" cases for every host that relies on the SDK alone. |
| **C. Memory + host-set httpOnly cookie** | **Yes** for the host's own session: the browser never exposes an httpOnly cookie to script. | The host needs a backend route that verifies the token once and sets its own cookie (most already do: they mirror `elvix_token` today, but from `document.cookie`, which is script-readable). The SDK would then call elvix through the host's backend or with the cookie, which means a proxy or a same-site elvix subdomain. Real integration work per host. |
| **D. Short-lived access token + refresh** | Limits the window (minutes instead of the session). A stolen token dies quickly; a refresh token still has to live somewhere. | Needs a refresh endpoint, rotation, and a place for the refresh token that is not script-readable (back to option C). Moves the problem, shrinks the blast radius. |

## Recommendation

1. **Ship nothing silently.** Keep A as the default; it is the only option that
   works for an SDK-only host with no backend.
2. **Do D first, server-side, no host change:** make the session token
   shorter-lived with sliding renewal on use (the server already knows the
   session). A stolen token then has a bounded life without any host work.
3. **Offer C as the documented "hardened mode"** for hosts with a backend:
   `ElvixProvider tokenStorage="memory"` plus a one-page recipe (verify the token
   server-side, set an httpOnly `elvix_token` cookie yourself, read it in your own
   server components, never write it with `document.cookie`). DanceClub would be
   the first adopter. B alone is not worth shipping: it trades security for
   broken reloads.
4. **Tell hosts the real defence is not having XSS:** a strict CSP and no
   third-party scripts on authenticated pages. Add that to the SDK README.

## Needs Edvard's word

- Whether to ship D (sliding, shorter sessions) as the new server default.
- Whether C's `tokenStorage="memory"` is worth a minor release.
- Both change behaviour for existing hosts, so neither is in 0.14.0.
