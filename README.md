<p align="center">
  <img src="https://elvix.is/brand/elvix-icon-512.png" width="96" height="96" alt="elvix" />
</p>

<h1 align="center">@elvix.is/sdk</h1>

<p align="center">
  <strong>Identity, kept in Europe.</strong><br/>
  Passwordless authentication for React + Next.js. Hosted in Aachen, German legal frame.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@elvix.is/sdk"><img src="https://img.shields.io/npm/v/@elvix.is/sdk.svg?color=5d4dff" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/@elvix.is/sdk"><img src="https://img.shields.io/npm/dm/@elvix.is/sdk.svg?color=8e7dff" alt="downloads" /></a>
  <a href="https://github.com/021is/elvix-sdk/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/021is/elvix-sdk/ci.yml?branch=main&label=CI" alt="CI" /></a>
  <a href="https://github.com/021is/elvix-sdk/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-black.svg" alt="MIT" /></a>
  <a href="https://elvix.is/docs"><img src="https://img.shields.io/badge/docs-elvix.is-5d4dff.svg" alt="docs" /></a>
  <a href="https://bundlephobia.com/package/@elvix.is/sdk"><img src="https://img.shields.io/bundlephobia/minzip/@elvix.is/sdk?label=min%2Bgzip&color=black" alt="bundle size" /></a>
</p>

---

## Why elvix

Auth is the highest-leverage place to get an integration right or wrong. Roll your own and you ship an insecure copy of OAuth that future-you debugs at 2am. Use a US provider and your German users live under American legal frame. elvix is opinionated so the first answer is the safe answer, and EU-resident so the legal frame matches your customers.

- Passwordless from day one. Email OTP, passkeys, Google.
- Drop-in React components. One provider, one form, zero boilerplate.
- Server-side verify in three lines.
- Console-configured. Brand colors, allowed methods, redirects all live in elvix Console. The SDK reads them at runtime. No prop drilling.
- Agent-friendly. Ships an MCP server so Claude, Cursor, Codex, and Gemini can integrate elvix without human shepherding.

## Install

```bash
bun add @elvix.is/sdk
# or
npm install @elvix.is/sdk
```

## Quickstart

```tsx
// app/layout.tsx
import { ElvixProvider } from "@elvix.is/sdk/react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <ElvixProvider clientId={process.env.NEXT_PUBLIC_ELVIX_CLIENT_ID!}>
          {children}
        </ElvixProvider>
      </body>
    </html>
  );
}
```

```tsx
// app/sign-in/page.tsx
"use client";

import { ElvixSignIn } from "@elvix.is/sdk/react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();
  return (
    <ElvixSignIn
      onResult={(r) => {
        if (r.ok) router.push(r.redirect ?? "/dashboard");
        else console.warn(r.error, r.message);
      }}
    />
  );
}
```

```ts
// app/api/protected/route.ts
export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return new Response("Unauthorized", { status: 401 });

  const res = await fetch("https://elvix.is/api/v1/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ELVIX_API_KEY!}`,
    },
    body: JSON.stringify({ token }),
  });
  const { ok, user, roles } = await res.json();
  if (!ok) return new Response("Unauthorized", { status: 401 });
  return Response.json({ hello: user.id, roles });
}
```

That is the entire integration.

## Post-sign-in: `onResult` + navigation

`onResult` fires **exactly once per sign-in, at the terminal state** — after any in-frame onboarding panes (passkey enrollment, username claim, membership recovery) that the SDK renders itself. The host never sees those intermediate steps, so it is always correct to redirect from `onResult`. The success payload is self-describing:

```ts
type ElvixSignInResult =
  | { ok: true; phase: "complete"; method: "google" | "email_otp" | "passkey" | "username"; redirect: string; token?: string }
  | { ok: false; error: string; message?: string };
```

- `phase: "complete"` — terminal. Safe to redirect.
- `method` — the factor that completed sign-in.
- `redirect` — resolved destination (`redirectAfterSignIn` ?? backend final ?? `/`).
- `token` — present cross-origin only; verify it server-side with `verifyElvixToken`.

**Who navigates.** By default the SDK navigates to `result.redirect` itself after firing `onResult`. If you want to route yourself (SPA navigation, or to set a session cookie first), pass `navigate={false}` and redirect from `onResult`:

```tsx
<ElvixSignInForm
  navigate={false}                 // SDK stays put; host owns routing
  onResult={(r) => {
    if (!r.ok) return;
    if (r.token) setSessionCookie(r.token);  // cross-origin: persist the bearer
    router.push(r.redirect);                 // SPA navigation
  }}
/>
```

> `onAuthenticated` is **deprecated** — it predates `onResult` carrying `method` + a resolved `redirect`. It still fires, and its presence implies `navigate={false}`. Migrate to `navigate={false}` + `onResult`.
>
> Migration note (0.7.13): if you previously redirected in `onResult` **without** `onAuthenticated`, add `navigate={false}` — otherwise the SDK and your handler will both navigate.

### Cross-origin passkeys (the one host rule that matters)

A passkey is bound to elvix's RP id (`elvix.is`). On your own origin the browser may refuse the WebAuthn call with **"rp.id cannot be used with the current origin"**. The SDK handles this for you: it tries inline first, and on failure (passkey **sign-in** *and* passkey **enrollment**) it navigates the whole tab to a hosted ceremony on `elvix.is`, runs WebAuthn there where the RP id matches, and returns to **the page it left** with the session token in the URL fragment (`#elvix_token=…`). `<ElvixProvider>` reads + strips that fragment on mount and the SDK fires `onResult` to finish.

**So the only rule for your host: mount the SDK on your sign-in PAGE and finish sign-in in `onResult`. Do not navigate away from the sign-in page until `onResult` fires.**

- The ceremony returns to the page that launched it (your sign-in page, including any `?next=`). If the SDK isn't still mounted there, the returned token is never consumed and the user lands **unauthenticated** — they'll bounce back to your gate even though the passkey was created. This is the #1 integration mistake.
- Establish your own session from the token **inside `onResult`** (verify it with `verifyElvixToken`, set your cookie), then navigate:

```tsx
// app/sign-in/page.tsx — keep this mounted; let onResult finish the flow.
<ElvixSignInForm
  navigate={false}
  onResult={async (r) => {
    if (!r.ok) return setError(r.message);
    if (r.token) await establishSession(r.token);   // server action → your httpOnly cookie
    router.replace(r.redirect ?? nextParam ?? "/dashboard");
  }}
/>
```

- Nothing else is required cross-origin — no manifest config, no second redirect handler. If inline WebAuthn happens to work (browsers that honour elvix's Related Origin Requests manifest), there's no hop at all; the same `onResult` fires. Either way your code is identical.
- **Set `redirectAfterSignIn` to your post-sign-in destination.** It's the *declarative* landing target and it survives the ceremony round-trip (it's a prop, re-applied on mount). `result.redirect` is best-effort and **falls back to `/` after a cross-origin hop** (the backend's per-method redirect lived in state that the full-page navigation wiped). So if you have an intended destination (e.g. a `?next=` your gate set), pass it as `redirectAfterSignIn={next}` rather than relying on `result.redirect ?? next` — otherwise `"/"` wins and the user lands on your home page instead of where they were headed.

### Already signed in? Skip the form (`redirectIfAuthenticated`)

Pass `redirectIfAuthenticated` to send an already-signed-in visitor straight to the dashboard instead of showing them the sign-in form. On mount the SDK probes the session; while it checks it shows a brief loader (no form flash), and if a session exists it fires `onResult` with `method: "session"` + your resolved `redirect` (and navigates unless `navigate={false}`). No session → the form renders as normal.

```tsx
<ElvixSignInForm
  redirectIfAuthenticated
  redirectAfterSignIn={next}
  onResult={async (r) => {
    if (!r.ok) return;
    if (r.token) await establishSession(r.token);  // same handler as a fresh sign-in
    router.replace(r.redirect);
  }}
/>
```

It's opt-in (default off) so account-switch flows that *want* to show the form to a signed-in user keep working. You can also read the raw state via `useElvixSession()` → `"loading" | "authenticated" | "anonymous"`.

## Presence (automatic)

`<ElvixProvider>` beats a presence heartbeat **automatically** whenever the user is signed in — so they show as **online** on your app's users list in the elvix Console with **zero wiring**. It beats every 30s, pauses on a hidden tab, reports "idle" after 60s without input, and works cross-origin (bearer) or same-origin (cookie). Nothing to mount.

```tsx
<ElvixProvider clientId={CLIENT_ID}>{children}</ElvixProvider>  // presence is on
<ElvixProvider clientId={CLIENT_ID} presence={false}>…</ElvixProvider>  // opt out
```

`<ElvixPresence>` still exists for edge cases (beat for a different `applicationId`, or manual control when you set `presence={false}`), but you no longer need it.

## AI coding agents

elvix ships first-class agent support. Three surfaces:

1. **Discovery via [llmstxt.org](https://llmstxt.org)**

   ```
   https://elvix.is/llms.txt          index
   https://elvix.is/llms-full.txt     flat dump of every doc page
   https://elvix.is/docs/install.md   per-page Markdown twin
   https://elvix.is/agent-prompt.md   ready-to-paste system prompt
   ```

2. **OpenAPI for typed REST access**

   ```
   https://elvix.is/openapi.yaml          full spec
   https://elvix.is/openapi.roles.json    per-endpoint role + admin scope
   ```

3. **MCP server bundled with the SDK**

   ```json
   {
     "mcpServers": {
       "elvix": {
         "command": "npx",
         "args": ["-y", "-p", "@elvix.is/sdk", "elvix", "mcp"],
         "env": { "ELVIX_API_KEY": "eak_..." }
       }
     }
   }
   ```

   Read-only by default. `--admin` opts in to mutation tools. Never logs the bearer token.

## CLI

The package ships an `elvix` command:

```bash
# Diagnose an integration — base URL, clientId, verify endpoint, API key.
ELVIX_CLIENT_ID=client_… npx -p @elvix.is/sdk elvix doctor

# Sign a CLI / headless tool into an elvix app (OAuth 2.0 device flow).
ELVIX_CLIENT_ID=client_… npx -p @elvix.is/sdk elvix login

# Launch the MCP server on stdio.
ELVIX_API_KEY=eak_… npx -p @elvix.is/sdk elvix mcp
```

`elvix doctor` prints a green/red checklist so "why isn't elvix working" is a two-second answer. (`elvix-mcp` is kept as an alias for `elvix mcp`.)

`elvix login` runs the OAuth 2.0 device authorization grant (RFC 8628): it prints a verification URL + user code, you approve in a browser, and it stores an `eak_` access token bound to the approving user. This is how a CLI or headless tool signs into an elvix app without an inline browser.

Full agent guide: <https://elvix.is/docs/agents>

## Components

Every `<Elvix*>` component the SDK ships. Drop-in React, brand chord from `<ElvixProvider>`, no prop drilling.

- Primitives: `ElvixCard`, `ElvixProvider`
- Sign-in: `ElvixSignIn`
- Identity: `ElvixUsername`, `ElvixIdentityForm`, `ElvixAvatar`, `ElvixBanner`, `ElvixRegion`, `ElvixLanguages`
- Account: `ElvixAddressBook`, `ElvixLegalEntities`, `ElvixSessions`, `ElvixExport`, `ElvixDeactivate`, `ElvixLeave`
- Hooks: `useElvixApp()`, `useElvixContext()`

Full catalog with previews: <https://elvix.is/docs/components>

## Server helpers

```ts
import { verifyElvixToken } from "@elvix.is/sdk/server";

const result = await verifyElvixToken({ token, clientId: process.env.ELVIX_CLIENT_ID });
if (result.ok) {
  // result.user, result.roles, result.scopes, result.memberships
  // result.membershipBrands → [{ slug, name, logoUrl }] — full membership
  //   brand so you render partner branding from the session, not hardcoded
  //   per slug. `memberships` (slugs) stays for back-compat.
}
```

The session token is self-authenticating: it is POSTed as a `Bearer` to `/api/v1/session`, so no API key is needed for verify. `clientId` is optional but recommended (it scopes the verify against the right application). `VerifyOptions` is `{ baseUrl?, timeoutMs? }`.

### Device login (CLI / headless)

For tools that can't open an inline browser, sign in with the OAuth 2.0 device authorization grant (RFC 8628). Request a code, show the user `verificationUriComplete` + `userCode`, poll until they approve, and receive an `eak_` access token bound to the approving user.

```ts
import { requestDeviceCode, pollDeviceToken } from "@elvix.is/sdk/server";

const code = await requestDeviceCode({ clientId: process.env.ELVIX_CLIENT_ID });

// Show the user where to approve.
console.log(`Open ${code.verificationUriComplete} and confirm: ${code.userCode}`);

const result = await pollDeviceToken({
  clientId: process.env.ELVIX_CLIENT_ID,
  deviceCode: code.deviceCode,
  interval: code.interval,    // server-provided poll cadence (seconds)
  expiresIn: code.expiresIn,  // server-provided code lifetime (seconds)
});

if (result.ok) {
  // result.accessToken → store the eak_ token
}
```

The sign-in methods and branding on the approval card are configured in the elvix Console. The bundled `elvix login` CLI command wraps these two helpers.

## Brand

Deep purple chord: `#5d4dff` (light) and `#8e7dff` (dark). Override per-app from the Console. Set explicit `brand` on `<ElvixProvider>` to win over the Console default.

## Security

- All requests over TLS 1.3.
- Session cookies `Secure; HttpOnly; SameSite=Lax`.
- Per-app session TTL + sliding-window renewal, owner-configurable.
- API keys carry per-key rate limits (60/min, 10000/day default).
- CSP, CORS, CSRF double-submit, allowedOrigins enforcement all live on `elvix.is`.
- Disclosure: [elvix.is/contact](https://elvix.is/contact) (subject "Security report").

## License

MIT. See [LICENSE](./LICENSE).

## Security

Found something? Read [SECURITY.md](./SECURITY.md). Reports go through [elvix.is/contact](https://elvix.is/contact) (mark the subject "Security report"). The form confirms receipt automatically and routes to the maintainer privately.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). PRs welcome — we run CI on every push and require it green before merge.

## Maintained by

**[edvone](https://edvone.dev)** · Aachen, Germany

elvix is an edvone product.

- General enquiries: [edvone.dev/contact](https://edvone.dev/contact)
- Sales / integration call: [edvone.dev/book](https://edvone.dev/book)
- Security disclosure: [elvix.is/contact](https://elvix.is/contact) (subject "Security report"; see [SECURITY.md](./SECURITY.md))
