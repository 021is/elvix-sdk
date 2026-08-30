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
- **Every `/public/api/maps/*` call carries `clientId`** (2026-08-30). The proxy fronts a metered Google Places API on elvix's key; without an application to charge, spend can be neither attributed nor contained, and the endpoint was serving the open internet. Build these URLs with `mapsUrl()` from `src/react/maps-url.ts` — never by hand — which encodes via `URLSearchParams` and returns `null` when the provider has no clientId, so the component reports `missing_client_id` rather than firing a request that is certain to 403. `<ElvixProvider clientId>` is optional, so that null case is real.
- MCP server (`bin/elvix-mcp`) is read-only by default. `--admin` opts in to mutation tools. Never log bearer tokens.
- **No MCP tool argument may influence the request destination** (locked 0.10.2). The server attaches a live `ELVIX_API_KEY` to every call, so the target origin is a security boundary — and the caller is an LLM whose context holds untrusted text, which makes "attacker-controlled tool arguments" the default assumption, not an edge case. Path structure comes only from the role manifest's own `METHOD /path` template; callers fill `{placeholders}` via `params`, percent-encoded, with `.` / `..` rejected. The resolved URL is re-checked against the configured origin, redirects are never followed, and `baseUrl` must be https unless loopback. `tests/mcp.test.ts` pins all of it. Scar: 0.10.1 shipped a free-form `path` that an absolute URL hijacked, sending the key to any host — 88 tools, one shared handler, found by a stranger rather than by a test. If a later change reintroduces caller-supplied path input, the origin re-check is the line that fails loudly; do not delete it as unreachable.

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
bun run lint        # biome: format + the size/complexity gate
bun run lint:fix    # auto-fix what is safe
bun run build       # tsup → dist/
bun test            # vitest
```

## The size gate

This repo had **no linter at all** until 2026-08-23, and CI ran only typecheck,
build and test. Nothing measured function length, which is how
`elvix-legal-entities.tsx` reached **3,292 lines** with a component of
cognitive complexity **255**, and how six components kept importing a symbol
they had stopped using.

`biome.json` now enforces, as errors:

| Rule | Limit |
|---|---|
| `noExcessiveLinesPerFunction` | 150 |
| `noExcessiveCognitiveComplexity` | 25 |
| `useMaxParams` | 4 |
| `noUnusedImports` / `noUnusedVariables` | — |

`bun run lint` runs in CI **before** typecheck.

**The `overrides` block in `biome.json` is a shrinking allowlist, not a
settings section.** It lists the 23 files that already violated the size rules
when the gate went in, downgraded to warnings so CI could be green on day one.
New code cannot violate these rules anywhere. When you touch a file on that
list, split what you touched and delete its entry. Never add a file to it.

Rules set to `warn` outside that block (a11y, `noNonNullAssertion`,
`useExhaustiveDependencies`) are pre-existing debt, visible in `bun run lint`
output and worth fixing opportunistically. They are warnings because turning
them red on day one would have meant either 130 unrelated fixes in one commit
or a gate nobody could keep green.

## Splitting a large component

`elvix-legal-entities.tsx` is the worked example, split 3,292 → 931 lines:

- `legal-entity-flow.ts` — the wizard step machine as **pure functions**, with
  tests. Extract this FIRST when refactoring a wizard: the pane ordering is
  the part carrying product meaning (a company is never asked for a date of
  birth) and therefore the part most likely to lose a feature silently.
- `legal-entity-copy.ts` — placeholders and per-country formatting; pure.
- `legal-entity-primitives.tsx` — shared presentational pieces.
- `legal-entity-{wizard,detail}-views.tsx` — panes, one per question.
- `use-legal-entity-draft.ts` — the in-progress entity as ONE object with a
  typed `setField`, replacing eighteen `useState` calls and a hand-written
  reset.

Two patterns worth copying:

- **A pane registry beats a ternary chain.** A 21-branch nested ternary was
  the entire complexity of 255; as a `Partial<Record<View, () => ReactNode>>`
  it is effectively zero, and each entry is a thunk so only the visible pane
  is built.
- **Verify "no feature lost" mechanically.** After the split the `View` enum
  had 22 values and the pane registry 22 keys, with `comm` reporting zero on
  both sides. That is evidence; re-reading the diff is not.

Publishing is tag-driven via GitHub Actions: tag `v0.1.0` on main → CI publishes to npm public registry.

## Source of truth

**THIS repo is authoritative (since 2026-07-04).** The old `components/sdk/` fork in the private `021is/elvix` monorepo was DELETED — there is no second copy to keep in sync. `src/react/` here is the single source; elvix.is consumes `@elvix.is/sdk` from npm exactly like any customer (`import { … } from "@elvix.is/sdk/react"`) and bumps the dep version. To change a component's behaviour: change it HERE, `bun run build`, tag a release, then bump the version in the elvix monorepo. Never re-fork a component back into that repo.

Component reference docs (the `components/*` catalogs consumed by the docs site + MCP) currently live in the elvix monorepo at `lib/docs/components/*.ts` — update those alongside a component change so the published docs and the code stay aligned.
