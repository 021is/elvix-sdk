# AGENTS.md — @elvix.is/sdk

Public elvix SDK. Lives at github.com/021is/elvix-sdk. npm-published under `@elvix.is/sdk`.

## Rules

- MIT license, public source. Treat every line as customer-readable.
- No telemetry, no opaque background fetches, no closed-source binaries.
- Brand colors and runtime config come from `<ElvixProvider>` reading the Console-served bootstrap envelope at `https://elvix.is/api/v1/bootstrap/<clientId>`. Never hard-code per-customer values.
- Every `<Elvix*>` mutation component ships an `onResult` callback returning a Spine ResponseDto shape. No raw payloads.
- **Cross-origin passkey ceremonies (sign-in + enrollment) MUST return to the page that launched them** (`window.location.href`), WITH `#elvix_token` and WITHOUT `elvix_landing`, so the SDK on the mounted sign-in surface consumes the token and fires `onResult` to complete sign-in. Returning to the final destination instead (or omitting the token) registers/authenticates but leaves the host session unestablished → the user bounces to the gate. The enrollment ceremony runs mid-onboarding, before `onResult` — same rule. Mirror `onPasskey`'s `redirectToHosted` for any new ceremony. Scar 2026-06-05 (aixum enrollment bounced to /studio/login). Host-facing contract is documented in README → "Cross-origin passkeys".
- **Presence is automatic in `<ElvixProvider>`** (0.7.21+): it beats `/api/presence/heartbeat` whenever `sessionStatus === AUTHENTICATED`. Don't tell consumers to mount `<ElvixPresence>` — that's now opt-in for overrides only. Opt out with `presence={false}`.
- **Cross-origin passkey ENROLLMENT is inline-first** (0.7.22+): `onAddPasskey` tries inline (sending `clientId` so elvix's `register/finish` trusts the app's `allowedOrigins` / console "developer domains"), and falls back to the hosted ceremony on any non-cancel failure. Keep both paths; never drop the ceremony fallback (browsers without ROR, or origins not allow-listed, depend on it).
- MCP server (`bin/elvix-mcp`) is read-only by default. `--admin` opts in to mutation tools. Never log bearer tokens.

## Source layout (target)

```
src/
  react/      drop-in components (extracted from elvix monorepo)
  server/     verifyElvixToken helper
  types/      shared TS types
  mcp/        MCP server (reads openapi.roles.json from elvix.is at startup)
docs/         agent-consumable Markdown, generated from @021is/agent-docs
```

## Build + publish

```bash
bun install
bun run build       # tsup → dist/
bun test            # vitest
```

Publishing is tag-driven via GitHub Actions: tag `v0.1.0` on main → CI publishes to npm public registry.

## Source of truth

**THIS repo is authoritative (since 2026-07-04).** The old `components/sdk/` fork in the private `021is/elvix` monorepo was DELETED — there is no second copy to keep in sync. `src/react/` here is the single source; elvix.is consumes `@elvix.is/sdk` from npm exactly like any customer (`import { … } from "@elvix.is/sdk/react"`) and bumps the dep version. To change a component's behaviour: change it HERE, `bun run build`, tag a release, then bump the version in the elvix monorepo. Never re-fork a component back into that repo.

Component reference docs (the `components/*` catalogs consumed by the docs site + MCP) currently live in the elvix monorepo at `lib/docs/components/*.ts` — update those alongside a component change so the published docs and the code stay aligned.
