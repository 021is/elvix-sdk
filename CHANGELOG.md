# Changelog

All notable changes to `@elvix.is/sdk` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

## [0.4.0] — 2026-05-28

### Added

- **`elvix` CLI.** New primary bin with subcommands:
  - `elvix mcp [--admin] [--base-url=…]` — launches the MCP server (what `elvix-mcp` did).
  - `elvix doctor [--client-id=…]` — diagnoses an integration with a green/red checklist: base-URL reachability, clientId resolution via `/api/v1/bootstrap`, verify-endpoint liveness, `ELVIX_API_KEY` presence. Exit 1 only on critical (base URL / verify) failure; clientId + key are warnings.
  - `elvix help`.

### Changed

- MCP config now recommends `npx -y -p @elvix.is/sdk elvix mcp`.
- `elvix-mcp` bin retained as a back-compat alias for `elvix mcp` — existing MCP configs keep working.

## [0.3.2] — 2026-05-28

### Fixed

- **MCP server parsed the wrong `openapi.roles.json` shape.** The published manifest is a top-level array of `{ endpoint: "METHOD /path", role, adminScope, summary }`; the server expected `{ endpoints: [{ method, path }] }` and crashed on startup against the real manifest. Now parses the array + splits the `"METHOD /path"` endpoint string. Caught by dogfooding the agent flow against live elvix.is.
- **MCP invocation in README** corrected from `bunx @elvix.is/sdk elvix-mcp` (can't resolve a differently-named bin) to `npx -y -p @elvix.is/sdk elvix-mcp`.
- README component list dropped two never-shipped components (`ElvixSignInButton`, `ElvixRecoverGate`); added the hooks.

## [0.3.1] — 2026-05-27

### Changed

- **`@modelcontextprotocol/sdk` exact-pinned to `1.29.0`** (was `^1.0.4`). MCP SDK has 6 npm maintainers across `@anthropic.com` and personal `@gmail.com` accounts — Socket flags this as "unstable ownership". Exact pin closes the door on a hijacked semver-range upgrade; manual bumps land via PR with a CHANGELOG entry.
- `socket.yml` ships in the repo, documenting the acknowledged alert and the rationale.
- `SECURITY.md` adds a "Supply chain" section covering `--provenance` attestation, exact pins, lockfile-frozen CI installs, and the planned MCP-subpackage split so React-only consumers never pull the MCP-SDK transitive.

## [0.3.0] — 2026-05-27

### Added

- **Wave 2 — identity components** (6 new):
  - `<ElvixUsername>` — claim / change username (PATCH `/api/account/apps/<id>/username`).
  - `<ElvixAvatar>` — file → base64 → PATCH `/avatar`. 4 MB cap.
  - `<ElvixBanner>` — same as Avatar, 8 MB cap, 16:9 aspect.
  - `<ElvixIdentityForm>` — display name + bio. Per-app profile.
  - `<ElvixRegion>` — ISO-3166 country + IANA timezone.
  - `<ElvixLanguages>` — BCP-47 preference list.
- **Wave 3 — account-lifecycle components** (6 new):
  - `<ElvixSessions>` — list + revoke active sessions.
  - `<ElvixExport>` — GDPR Art. 15 data export request.
  - `<ElvixDeactivate>` — two-pane OTP-gated pause flow.
  - `<ElvixLeave>` — two-pane OTP-gated leave flow.
  - `<ElvixAddressBook>` — list + add + remove addresses.
  - `<ElvixLegalEntities>` — list + add + remove tax / VAT entities.
- **`<ElvixCard>` primitive** exported for hosts composing multiple
  components in one card frame.
- All mutation components carry a single discriminated `onResult`
  callback shaped as `ElvixActionResult<T>`. Hosts opt in to
  post-success navigation without the SDK calling `router.push`
  itself.

### Notes

- Same clean-room minimum approach as wave 1: each component is a
  fresh public implementation, not a literal copy of the private
  elvix monorepo. Full-featured monorepo versions remain private and
  converge over time.
- Internal helper `src/react/lib.ts` adds `appPost` / `appPatch` /
  `appDelete` so every component uses one shared fetch path with
  `credentials: include` and Spine ResponseDto decoding.

## [0.2.0] — 2026-05-27

### Added

- **`@elvix.is/sdk/react` is now a runtime export, no longer a type-only stub.**
- `<ElvixProvider clientId>` — root context. Fetches `GET /api/v1/bootstrap/<clientId>` on mount, exposes the envelope via `useElvixApp()` + `useElvixContext()`, installs the brand chord as CSS custom properties (`--elvix-primary`, alpha tiers). `theme` + `brand` props override the Console defaults.
- `<ElvixSignIn>` — drop-in sign-in surface. Renders only the methods the Console enabled (passkey / username flows arrive in 0.2.x). Email-OTP and Google-redirect supported today. Single `onResult({ ok, ... })` callback for terminal outcomes; the component never navigates itself.
- Types: `ElvixBootstrapEnvelope`, `ElvixBrand`, `ElvixSignInMethod`, `ElvixSignInResult`, `ElvixTheme`.

### Notes

- This is a fresh public minimum, not a literal copy of the private elvix monorepo SDK. The full feature set (passkey enrollment, recovery gates, in-frame card chrome, identity + account lifecycle components) ships in 0.3.x and 0.4.x as wave 2 + wave 3 extractions.

## [0.1.2] — 2026-05-27

### Changed

- Public contact channels now route through `edvone.dev/contact` (general) and `edvone.dev/book` (sales / integration call). `hi@edvone.dev` removed from every surface. Security disclosures still flow through `security@elvix.is`.
- `package.json` `author` is now a structured object (`{ name: "edvone", url: "https://edvone.dev" }`).
- Added `engines.node >= 20` and `funding: "https://edvone.dev/book"` for registry scoring + Node-version warnings.
- `bun.lock` is now committed for reproducible installs (lifts Socket Supply Chain Security score).

## [0.1.1] — 2026-05-27

### Changed

- `LICENSE` attribution moved to **edvone** as commercial imprint; personal name removed from all public surfaces. Trademark notice added covering the elvix name + logomark + brand chord, with nominative-use carveout.
- `package.json` `author` field now reads `edvone <hi@edvone.dev>`.
- Added `SECURITY.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue + PR templates.
- README: CI / npm / downloads / bundle-size badges.

### Repo-level (not in tarball)

- Description, homepage `https://elvix.is`, 15 topic tags.
- Discussions enabled.
- Branch protection on `main`: linear history required, CI required, force-push blocked.

## [0.1.0] — 2026-05-27

Initial public release. Replaces the `0.0.0` scope-reservation stub on npm.

### Added

- `@elvix.is/sdk/server` — `verifyElvixToken(token, { apiKey })` exchanges an end-user session token for the verified user envelope (roles + scopes + memberships) via `POST https://elvix.is/api/v1/verify`. Returns a discriminated union, never throws on auth failure.
- `@elvix.is/sdk/types` — wire-level shared types (`ElvixUser`, `ElvixVerifyResult`, `ElvixActionResult`).
- `@elvix.is/sdk/mcp` — embeddable MCP (Model Context Protocol) server. Reads `openapi.roles.json` from elvix.is at startup and exposes every `api`-labelled endpoint as a typed MCP tool. Read-only by default; `--admin` opts in to mutation tools.
- `elvix-mcp` bin — `bunx @elvix.is/sdk elvix-mcp` launches the MCP server on stdio. Reads `ELVIX_API_KEY` from the environment.
- `@elvix.is/sdk/react` — type-only stub. Components ship in 0.2.x.

### Security

- Bearer-token auth on every server call. Customer cookies never touched.
- `--provenance` attestation on npm publishes.
- MIT licence + explicit trademark notice (see `LICENSE`).

[Unreleased]: https://github.com/021is/elvix-sdk/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/021is/elvix-sdk/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/021is/elvix-sdk/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/021is/elvix-sdk/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/021is/elvix-sdk/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/021is/elvix-sdk/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/021is/elvix-sdk/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/021is/elvix-sdk/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/021is/elvix-sdk/releases/tag/v0.1.0
