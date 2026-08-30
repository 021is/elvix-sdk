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

- Passwordless from day one — email OTP, passkeys, Google.
- Drop-in React components. One provider, one form, no boilerplate.
- Server-side verification of a session token in a single call.
- Console-configured. Brand colours, allowed sign-in methods and redirects live in the elvix Console; the SDK reads them at runtime, so none of it is hardcoded in your app.
- Agent-friendly. Ships an MCP server so Claude, Cursor, Codex and Gemini can integrate elvix without hand-holding.

## Getting started

**→ [elvix.is/docs/install](https://elvix.is/docs/install)** walks the whole integration, with copyable code for every step.

The shape of it: create an application in the Console to get a `clientId`, install the package, wrap your app in the provider, and mount the sign-in form. Everything else — which methods appear, how the card looks, where users land — is Console configuration rather than props.

Sign-in and sign-up are the same door. There is no separate registration flow to build; a new user is upserted silently.

## What's in the package

| Import | What it gives you |
|---|---|
| `@elvix.is/sdk/react` | The `<Elvix*>` components and hooks |
| `@elvix.is/sdk/server` | Session-token verification, webhook verification, device login |
| `@elvix.is/sdk/types` | Shared TypeScript types, no runtime code |
| `@elvix.is/sdk/mcp` | The MCP server, embeddable in your own host |

**Components** — sign-in, username, identity form, avatar, banner, region, languages, address book, legal entities, sessions, data export, deactivate, leave. Full catalogue with live previews: **[elvix.is/docs/components](https://elvix.is/docs/components)**.

**Server helpers** — verify a session token against elvix on each protected request and get the live user, roles, scopes and memberships back. Because it re-checks on every call, a banned or signed-out user stops verifying within one request, so bans take effect server-side without you writing anything. Details: **[elvix.is/docs/verify-backend](https://elvix.is/docs/verify-backend)**.

If you would rather not call elvix on every request, exchange the session token once for a short-lived signed JWT and verify that locally against our JWKS. Same guide covers it.

## The two rules worth knowing before you ship

**Cross-origin passkeys must return to the page that launched them.** If your app is on its own domain, a passkey ceremony has to come back to the page holding the sign-in form, not to your final destination. Send the user straight to the dashboard and the passkey registers correctly but the session is never established, so they bounce back to the sign-in gate. The SDK does the right thing by default; this only bites if you override the return URL.

**Presence is automatic.** The provider reports a signed-in user as online by itself. You do not need to mount anything extra, and mounting the presence component "to be safe" is the common mistake. Turn it off with a single prop if you do not want it.

## CLI

The package ships an `elvix` command with three subcommands: `doctor` diagnoses an integration and prints a green/red checklist, `login` signs a headless tool into an app via the OAuth 2.0 device flow, and `mcp` launches the MCP server on stdio.

## For AI coding agents

Point your agent at **[elvix.is/docs/developers](https://elvix.is/docs/developers)**, or give it the MCP server so it can read and manage your elvix tenant directly. It is read-only unless you opt in to mutations, and it needs an API key from the Console.

Each MCP tool is bound to one endpoint. Callers fill in the placeholders of that endpoint's path; they cannot supply a path, host or scheme of their own, and the server refuses to follow redirects. That matters because an agent's context routinely contains untrusted text, and the server holds a live API key.

**If you ran the MCP server on 0.10.1 or earlier, upgrade and rotate that key** — those versions let a tool argument redirect the request and take the key with it. See [SECURITY.md](./SECURITY.md).

## Compatibility

React 18+, Next.js 15+ (optional), Node 20+. Published as ESM.

## Security

TLS 1.3 throughout. Session cookies are `Secure; HttpOnly; SameSite=Lax`, with a per-app TTL and sliding renewal you configure in the Console. API keys carry per-key rate limits. CSP, CORS, CSRF protection and allowed-origin enforcement live on elvix.is.

Found something? Read [SECURITY.md](./SECURITY.md) and report through [elvix.is/contact](https://elvix.is/contact) with the subject "Security report". The form confirms receipt automatically and routes to the maintainer privately. Past advisories are listed in SECURITY.md.

## Brand

Deep purple: `#5d4dff` on light, `#8e7dff` on dark. Override per application from the Console, or set it explicitly on the provider to win over the Console default.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). CI runs on every push and must be green before merge.

## License

MIT. See [LICENSE](./LICENSE).

## Maintained by

**[edvone](https://edvone.dev)** · Aachen, Germany. elvix is an edvone product.

- General enquiries: [edvone.dev/contact](https://edvone.dev/contact)
- Sales / integration call: [edvone.dev/book](https://edvone.dev/book)
- Security disclosure: [elvix.is/contact](https://elvix.is/contact) (subject "Security report")
