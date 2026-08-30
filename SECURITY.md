# Security Policy

## Reporting a vulnerability

If you've found a security issue in @elvix.is/sdk or in the elvix
platform itself, report it via [the contact form on elvix.is](https://elvix.is/contact).
Mark the message subject "Security report" so it routes to the
maintainer fast.

The contact form ferries the message to the maintainer privately and
auto-confirms receipt to you, so you have a record that the report
landed without exposing a mailbox to scrapers.

We will acknowledge your report within 1 business day and aim to
respond with a triage decision within 5 business days. Please don't
file public GitHub issues for security reports — the form keeps the
exchange private until a fix is ready.

elvix can't accept PGP or signed reports through the web form yet. If
you're a journalist or researcher handling a high-sensitivity report
and need an encrypted channel, a PGP key URL will be published here in
a future revision; in the meantime, mention the constraint in your
first message via the form and we'll arrange an out-of-band channel.

<!-- PGP key URL: TBD -->

## Scope

- @elvix.is/sdk (this package)
- @elvix.is/sdk MCP server (`bunx @elvix.is/sdk mcp`)
- elvix platform: /api/v1/*, /api/account/*, /api/auth/*, /api/console/*

## Out of scope

- Customer-side integrations (your own host code, your cookie storage,
  your reverse proxy, etc.) — those are your security boundary.
- Brute-force on rate-limited endpoints, automated scanners, social
  engineering, denial of service.

## Supported versions

The latest minor of @elvix.is/sdk receives security updates. Older
minors are deprecated; `bun add @elvix.is/sdk@latest` migrates you.

## Advisories

### 0.10.2 — MCP tool arguments could redirect the request and leak the API key

**Affected:** `@elvix.is/sdk` <= 0.10.1, MCP server only (`elvix mcp` /
`elvix-mcp` / `@elvix.is/sdk/mcp`). React components and server helpers
are unaffected. **Fixed in 0.10.2.** All earlier versions are deprecated
on npm.

Every generated MCP tool accepted a free-form `path` argument, and the
shared handler resolved it with `new URL(args.path ?? tool._meta.path,
baseUrl)`. An absolute URL supplied as `path` replaces `baseUrl`
entirely, so the outbound request — which carries
`Authorization: Bearer <ELVIX_API_KEY>` — went to any host the caller
named. That reaches loopback and internal services, and it hands the
API key to an external one.

The caller is an LLM agent, and its context routinely includes untrusted
text (web pages, issue bodies, repository files). A prompt injection is
therefore a tool call with attacker-chosen arguments. The impact is
scoped to the machine running the MCP server and to the API key it was
started with — there is no exposure of elvix.is itself, and no
cross-tenant impact.

**If you ran the MCP server with a real key on a version <= 0.10.1,
rotate that key** (Console → API keys → rotate) and upgrade. Upgrading
is the entire migration: `path` is gone, replaced by `params`, and
agents re-read the tool schema on every start.

Reported privately on 2026-08-27 by **Xunhang He**, through this policy's
contact form. Thanks for the clear write-up and the reproduction.
