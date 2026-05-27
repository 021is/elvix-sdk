# Contributing to `@elvix.is/sdk`

Thanks for considering a contribution. This is the public SDK for elvix. Most code today is extracted from the private elvix monorepo — the source of truth for components is still upstream, so PRs that touch React surfaces may take longer to land.

## What we accept

- **Bug fixes** to the public surface (`/server`, `/types`, `/mcp`, future `/react`).
- **Doc fixes** — typos, broken links, clearer examples.
- **New examples** under `examples/` once the directory ships.
- **MCP tool improvements** — better tool descriptions, additional safety policies, transport plugins.

## What we don't accept (yet)

- New React components — those live in the private monorepo first, then sync down. File a feature request issue instead.
- Breaking changes to the public API surface without prior discussion.
- Dependencies that don't pass licence checks (anything copyleft beyond LGPL).

## Workflow

1. Open an issue first for anything non-trivial. We'd rather agree on the shape before you spend an evening on it.
2. Fork the repo, branch off `main`.
3. `bun install`, make your change, `bun test`, `bun run typecheck`, `bun run build`.
4. Conventional Commit subject line (`fix:`, `feat:`, `docs:`, `chore:`, `test:`, `refactor:`).
5. Open a PR. CI runs on every push.
6. We squash-merge when green.

## Code style

- TypeScript strict mode. No `any` outside `tests/`.
- Const-as-object enums, never inline string-literal unions (the same Spine rule we follow upstream).
- One named export per file when possible.
- No comments restating what the code does. Comments explain why.

## Tests

- Tests live in `tests/` mirroring `src/`.
- We use Vitest. Mock at the `fetch` level (see `tests/verify.test.ts`); avoid mocking elvix internals.

## CLA

By submitting a PR you agree your contribution is licenced under the MIT terms in [LICENSE](./LICENSE).

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). TL;DR: be kind, assume good intent, no harassment.

## Questions

Open a [Discussion](https://github.com/021is/elvix-sdk/discussions) for anything that isn't a bug or feature.
