# Changelog

All notable changes to `@elvix.is/sdk` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

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

[Unreleased]: https://github.com/021is/elvix-sdk/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/021is/elvix-sdk/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/021is/elvix-sdk/releases/tag/v0.1.0
