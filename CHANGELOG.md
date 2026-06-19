# Changelog

All notable changes to `@elvix.is/sdk` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

## [0.9.0] — 2026-06-16

### Added

- **Device login (OAuth 2.0 device authorization grant, RFC 8628).** New server helpers `requestDeviceCode({ clientId, baseUrl })` + `pollDeviceToken({ clientId, deviceCode, interval, expiresIn })` from `@elvix.is/sdk/server`: request a code, show the user `verificationUriComplete` + `userCode`, poll until approved, receive an `eak_` access token. Sign-in methods + branding on the approval card are Console-configured.
- **`elvix login` CLI command.** Wraps the device flow so a CLI or headless tool signs into an elvix app without an inline browser: prints the verification URL + user code, polls until approval, stores the `eak_` token.

### Changed

- **`<ElvixSignInForm>` derives `clientId` from the bootstrap envelope.** The `clientId` prop is now optional; the component falls back to the `<ElvixProvider>` envelope when it isn't passed.

## [0.8.1] — 2026-06-15

### Fixed

- **`<ElvixSignIn>` cross-origin Google sign-in returns in-frame.** The Google start now carries `returnUrl`, so the callback bounces back to the host page with `#elvix_token` + `#elvix_landing` and onboarding renders in the host frame, instead of stranding the user on elvix's hosted `/sign-in` onboarding. (`<ElvixSignInForm>` already did this.)

## [0.8.0] — 2026-06-15

### Added

- **Real-time bootstrap refresh.** `<ElvixProvider>` re-fetches the render envelope on an interval (default 20s) and when the tab regains focus, so Console changes to sign-in methods, brand, or the sign-in gate appear on an open page with no reload. Tune or disable with `bootstrapRefreshMs` (`0` = mount-only).

### Fixed

- **`<ElvixLifecycleWatcher>` no longer reload-loops** when mounted on a signed-out page. It now only evicts a session that was alive at least once (`wasOk` guard); the cross-origin poll no longer treats an initial `{ok:false}` as a revocation. Mount it in an authenticated context as documented.

## [0.7.24] — 2026-06-05

### Changed

- Version badge now sits below the card on `<ElvixSignIn>` too (0.7.23 only moved it on `<ElvixSignInForm>`). Both sign-in surfaces now render it outside/under the box.

## [0.7.23] — 2026-06-05

### Changed

- Version badge now sits BELOW the sign-in card instead of inside it.

## [0.7.22] — 2026-06-05

### Added

- Inline cross-origin passkey ENROLLMENT (no redirect). `register/finish` trusts the app's configured `allowedOrigins` (Console "developer domains") via `clientId`, so enrollment persists inline when the browser honours the ROR manifest. Falls back to the hosted ceremony otherwise, so it always works.

## [0.7.21] — 2026-06-05

### Added

- **Automatic presence.** `<ElvixProvider>` beats `/api/presence/heartbeat` automatically while the user is signed in (30s cadence, pauses on a hidden tab, "idle" after 60s, bearer cross-origin / cookie same-origin). Users show online in the Console with zero wiring. Opt out with `presence={false}`.

### Changed

- `<ElvixPresence>` is now optional (kept for `applicationId` overrides / manual control); the provider handles presence by default.

## [0.7.20] — 2026-06-05

### Added

- `verifyElvixToken(...)` now returns `membershipBrands: [{ slug, name, logoUrl }]` so consumer apps render partner branding from the session instead of hardcoding it per slug. `memberships: string[]` (slugs) is unchanged.

## [0.7.19] — 2026-06-05

### Changed

- Cross-origin passkey enrollment routed through the hosted ceremony (superseded by inline enrollment in 0.7.22).

## [0.7.18] — 2026-06-05

### Fixed

- `redirectIfAuthenticated` no longer skips onboarding (e.g. passkey enrollment) on a cross-origin sign-in return: the resume yields when a fresh session token was just consumed from the URL fragment.

## [0.7.17] — 2026-06-05

### Fixed

- Sign-out works cross-origin. `signOut()` now calls `${baseUrl}/api/auth/sign-out` with the bearer (it previously used a relative URL with no bearer and never reached elvix), always clears the local token, and sets a one-shot marker so `redirectIfAuthenticated` can't sign the user back in on the post-logout landing.

## [0.7.16] — 2026-06-05

### Added

- `redirectIfAuthenticated` on the sign-in surfaces (SSO silent-resume): an already-signed-in visitor skips the form and resumes to the dashboard. Adds `useElvixSession()` and `<ElvixProvider>` session-status (`loading | authenticated | anonymous`).

## [0.7.15] — 2026-06-05

### Fixed

- Cross-origin passkey enrollment completes sign-in: the hosted register ceremony returns to the originating form page with `#elvix_token`, so the SDK fires `onResult` and the host establishes its session (previously the passkey saved but the user bounced to the gate).

## [0.7.14] — 2026-06-04

### Added

- Cross-origin passkey ENROLLMENT fallback: an "Add a passkey" step that can't run inline falls back to a hosted register ceremony on elvix.is. Plus a small version badge under the sign-in forms.

## [0.7.13] — 2026-06-04

### Added

- `<ElvixPresence>` cross-origin presence heartbeat component.
- `onResult` terminal contract documented + `navigate` prop to let the host own post-sign-in routing.

## [0.7.12] — 2026-06-04

### Added

- Per-app passkeys, the `animated` cascade on `<ElvixProvider>`, and canonical `<ElvixCard>` chrome.

## [0.7.11] — 2026-06-03

### Added

- Cross-origin passkey sign-in: redirect through elvix.is (hosted ceremony) when the host origin can't run WebAuthn inline.

## [0.7.10] — 2026-06-03

### Fixed

- Gate-state badge also paints on `<ElvixSignIn>` (not just `<ElvixSignInForm>`).

## [0.7.9] — 2026-06-03

### Added

- Automatic gate-state badge + friendly error copy for gated / deleted / archived apps.

## [0.7.8] — 2026-06-03

### Added

- `brandColor`, `align`, `fontSize`, and `borderRadius` props on the sign-in + sign-out buttons.

## [0.7.7] — 2026-06-02

### Added

- `<ElvixSignOutButton>`, the `useSignOut()` hook, and the `signOut()` primitive.

## [0.7.6] — 2026-06-01

### Fixed

- Fire `onAuthenticated` after the URL-fragment token return (cross-origin Google redirect callback).

## [0.6.5] — 2026-05-30

### Added

- **`verifyElvixToken({ token, clientId })` object signature.** New canonical call shape — the positional `verifyElvixToken(token)` form keeps working for back-compat, but the docs and templates have moved to the object form. `clientId` is sent as `x-elvix-client-id` so elvix can scope verifies against the right application.

### Changed

- Docs and SDK templates now standardise on the `elvix_token` cookie name for the client-set / server-read round-trip (previously every doc invented its own name like `app_session`). No SDK behaviour change — naming convention only.

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

[Unreleased]: https://github.com/021is/elvix-sdk/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/021is/elvix-sdk/compare/v0.8.1...v0.9.0
[0.4.0]: https://github.com/021is/elvix-sdk/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/021is/elvix-sdk/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/021is/elvix-sdk/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/021is/elvix-sdk/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/021is/elvix-sdk/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/021is/elvix-sdk/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/021is/elvix-sdk/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/021is/elvix-sdk/releases/tag/v0.1.0
