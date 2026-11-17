# Coding rules: @elvix.is/sdk

**Pin:** `021is/code-rules` v0.6.0. Read in order:
1. [PRINCIPLES.md](https://github.com/021is/code-rules/blob/v0.6.0/PRINCIPLES.md)
2. [ts/CODING-RULES.md](https://github.com/021is/code-rules/blob/v0.6.0/ts/CODING-RULES.md)
3. this file: only what is the SDK's own, each with its reason. A copied shared rule is a bug.

On edvone-dev the same files are in `~/projects/danceclub/code-rules/`.

## Exceptions to the shared rules

- **The gates are the SDK's own** (a public MIT library built with bun): `bun run lint:ci` (Biome
  over `src`, `tests`, `scripts`, warnings failing), typecheck, `bun run test` (vitest, the rule
  tests included), CI `ci.yml` (the required check on `main`); `publish.yml` runs the same before
  `npm publish`. The shared checks map to: lines `tests/file-length.test.ts`; functions,
  complexity, at most 4 parameters: Biome. [ci: ci.yml]
- **Debt is recorded and only shrinks** (since 2026-10-28): files over 300 lines in
  `.file-lines-baseline.json`; functions over 80 or complexity 15 in `biome.json` `overrides`
  (old limits 150 / 25); `tests/debt-ratchet.test.ts` pins both list lengths. A paid file leaves
  its list in the same change. `CHANGELOG.md`'s older releases move to `docs/changelog/` whenever
  it passes 300. [ci: debt-ratchet, file-length]
- **Every user-visible string is a `t()` key in all 15 catalogs in the same change** (unlike the
  apps: a host never shows English inside a German page). [ci: tests/catalogs, tests/catalog-keys;
  `scripts/sync-catalogs.mjs --check` in publish.yml]
- **No non-null assertion either;** the three rules off for the whole repo are in AGENTS.md § Lint
  rules turned off; another needs Edvard's word. [ci: Biome]
- **Colours from the provider's variables, never literals** (`--elvix-primary`,
  `--elvix-field`, `--elvix-field-border`); Tailwind classes are full literals.
  [ci: tests/brand-colors]

## The SDK's own rules

- **A public export is a promise to hosts:** remove one only in a breaking release with its
  changelog line; a new field on an envelope type is optional. [review]
- **Build sign-in from its pieces, never beside them:** `use-sign-in-flow.ts`, `use-otp.ts`,
  `sign-in-controls.tsx`, `sign-in-theme.ts`, `card-look.ts`, `keyboard.ts`,
  `use-passkey-sign-in.ts` + `passkey-lock.ts`, `prefix-inset.ts`,
  `sign-in-identifier-step.tsx`, `sign-in-social.tsx`, `sign-in-username-field.tsx`,
  `sign-in-steps.tsx`. [review]
- **A multi-step component has five pieces** (AGENTS.md § How the components are built): a pure
  flow, a pure payload map, a `use-*` hook, presentational panes, the shared plumbing; extract the
  flow first. [review]
- **Report every failure to `onResult` with its code;** "Something went wrong" only for a code
  elvix has never sent. [review]
- **Every line is customer-readable:** no telemetry, no opaque fetch, never a token in a log; every
  request through `elvixFetch`, every redirect through `safeRedirect`. [ci: tests/no-bare-fetch,
  tests/safe-redirect]
- **A host pays for every byte and request:** no dependency without a reason that holds for every
  host; components share the provider's answers (`useElvixApp`, `useUserMedia`). [review]
- **Every host callback through `useStableCallback`.** [ci: tests/host-callbacks]
- **Panes stack with `gap`, never `space-y`.** [ci: tests/pane-spacing]
- **`ErrorLine` is `role="alert"`;** a pressed toggle says so. [review]
- **Document a component where agents read it in the same change** (elvix's
  `lib/docs/components/<slug>.ts`: the page, its `.md`, MCP `get_component`, `list_components`),
  with a working example and its gotchas. [ci: elvix tests/lib/docs-components-complete]
