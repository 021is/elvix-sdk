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
