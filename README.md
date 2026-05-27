<p align="center">
  <img src="https://elvix.is/brand/elvix-icon-512.png" width="96" height="96" alt="elvix" />
</p>

<h1 align="center">@elvix.is/sdk</h1>

<p align="center">
  <strong>Identity, kept in Europe.</strong><br/>
  Passwordless authentication for React + Next.js. Hosted in Aachen, German legal frame.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@elvix.is/sdk"><img src="https://img.shields.io/npm/v/@elvix.is/sdk.svg" alt="npm" /></a>
  <a href="https://github.com/021is/elvix-sdk/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-black.svg" alt="MIT" /></a>
  <a href="https://elvix.is/docs"><img src="https://img.shields.io/badge/docs-elvix.is-5d4dff.svg" alt="docs" /></a>
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
         "command": "bunx",
         "args": ["@elvix.is/sdk", "elvix-mcp"],
         "env": { "ELVIX_API_KEY": "eak_..." }
       }
     }
   }
   ```

   Read-only by default. `--admin` opts in to mutation tools. Never logs the bearer token.

Full agent guide: <https://elvix.is/docs/agents>

## Components

Every `<Elvix*>` component the SDK ships. Drop-in React, brand chord from `<ElvixProvider>`, no prop drilling.

- Primitives: `ElvixCard`, `ElvixProvider`
- Sign-in: `ElvixSignIn`, `ElvixSignInButton`, `ElvixRecoverGate`
- Identity: `ElvixUsername`, `ElvixIdentityForm`, `ElvixAvatar`, `ElvixBanner`, `ElvixRegion`, `ElvixLanguages`
- Account: `ElvixAddressBook`, `ElvixLegalEntities`, `ElvixSessions`, `ElvixExport`, `ElvixDeactivate`, `ElvixLeave`

Full catalog with previews: <https://elvix.is/docs/components>

## Server helpers

```ts
import { verifyElvixToken } from "@elvix.is/sdk/server";

const result = await verifyElvixToken(token, { apiKey: process.env.ELVIX_API_KEY! });
if (result.ok) {
  // result.user, result.roles, result.scopes, result.memberships
}
```

## Brand

Deep purple chord: `#5d4dff` (light) and `#8e7dff` (dark). Override per-app from the Console. Set explicit `brand` on `<ElvixProvider>` to win over the Console default.

## Security

- All requests over TLS 1.3.
- Session cookies `Secure; HttpOnly; SameSite=Lax`.
- Per-app session TTL + sliding-window renewal, owner-configurable.
- API keys carry per-key rate limits (60/min, 10000/day default).
- CSP, CORS, CSRF double-submit, allowedOrigins enforcement all live on `elvix.is`.
- Disclosure: <security@elvix.is>.

## License

MIT. See [LICENSE](./LICENSE).

## Maintained by

[edvone](https://edvone.dev) in Aachen, Germany. Operator: Edvard Grei trading as elvix.
