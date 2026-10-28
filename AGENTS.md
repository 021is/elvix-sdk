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
- **Photos and banners have ONE client-side source: the `useUserMedia` cache** (`src/react/user-media.ts`, 0.12). Read it; never copy media into `useState` at mount. 0.11's editors seeded state once, so an editor mounted before the session asked about `"preview-user"`, got elvix's honest "no photo", and kept it; and an upload never reached the cache, so the next mount showed the old photo. Editors publish with `publishMedia(kind, userId, state)`, which patches the cache in this tab and every other tab (`BroadcastChannel`). A per-app `membership.avatarSizes` is NOT the photo: it has been empty since 0.10 centralized it. Hosts get the same data through `useElvixUserMedia`.
- **Every editor refreshes the provider after a successful save** (`useElvixRefresh()`, 0.12). The provider's `sdk-context` envelope is what hosts render names, handles and previews from; before 0.12 it was fetched once per mount and every save left it stale until a reload. A new editor that writes user data calls it too.
- **`ElvixAppContext` never carries birthdate or gender.** The envelope reaches every allowed origin of every app a user signs into. Identity summary = given name, family name, pronouns.
- **`src/react/identity-schema.ts` is byte-identical with the elvix monorepo's `lib/sdk/identity-schema.ts`**, which validates the PATCH. Change both, or the form and the server disagree.
- **A new field on an envelope type is optional** (`?:`), so a host on an older elvix gets `undefined` rather than a type that lies. Same rule as 0.11's `ElvixUser`.
- **`<ElvixSaveButton onClick>` cancels the surrounding form's submit.** With both firing, every press ran its action twice (double PATCH, wizard step confirmed twice). Pass `onClick` OR rely on the form's `onSubmit`; either runs once.
- **An editor's action row is `<ElvixSaveRow>`** (0.13). The gap above Save is `SAVE_ROW_GAP`, defined once; `tests/save-row.test.tsx` fails on any hand-written `mt-auto flex items-center … pt-N` row.
- **Ending this device's session goes through `endLocalSession()`** (`sign-out.ts`, 0.13): token, `elvix_token` cookie, signed-out flag. `signOut()` and "Sign out everywhere" both call it; 0.12's sessions path skipped it and left a live token behind. A 401 from sign-out is success: the session had already ended.
- **`<ElvixAppPasskeys>` is first-party only** (0.13). The register ceremony needs elvix.is's account session, which a customer origin never has. Off elvix.is it renders a link to `/account/apps/<id>/passkeys`; never make it "work" cross-origin.

- **Every redirect sign-in carries the one-time `state`** (0.14, `signInState()` in `session.ts`; `oauthStartHref` and `hostedCeremonyUrl` add it). The return fragment is accepted only with the matching `elvix_state`; anything else is dropped, its landing payload too, and the fragment is stripped first either way. A new redirect start builds its URL through those two helpers. Without it a link `https://host/#elvix_token=<attacker's>` signs the visitor in as the attacker (login CSRF). The strip is `replaceState(null, …)`, never `history.state`: Next's App Router otherwise keeps the token in its own URL.
- **Every request to elvix goes through `elvixFetch`** (0.15, `src/react/elvix-fetch.ts`), never a bare `fetch`: it adds the DPoP proof to any call carrying the session token, keeps elvix's `DPoP-Nonce`, and retries once on a 401 with a fresher nonce. A bare `fetch` is a call that breaks the day an app turns DPoP on. The key lives in IndexedDB, non-extractable (`src/react/dpop.ts`); no key means no proof, never an error. `tests/dpop.test.ts` verifies proofs the way elvix does. **The key is stored with `add`, never `put`** (0.15.1): two tabs on a first visit both generate one, and with `put` the last write won while each tab signed with its own, so the session bound to one and the other was refused forever. The loser of `add` (ConstraintError) takes the stored key; the two-tab test pins it.
- **DPoP phase 2 (0.16): a session binds at sign-in, and backends check proofs.** `elvixFetch` also proves every call to a path in `SIGN_IN_FINISHERS` (no token in that proof): it must list every elvix route that mints a session in-frame (elvix: `grep -rln "createSession(" app lib`), or that method stays trust-on-first-use. Redirect starts (`oauthStartHref`, `hostedCeremonyUrl` for `passkey`) add `dpop_jkt` from `currentDpopThumbprint()`, primed by the provider on mount because those URLs are built synchronously. `elvixProof` makes a proof for a CUSTOMER backend URL and fetches a nonce first when this tab's is missing or older than 4 minutes, because the backend forwarding it cannot retry with a fresh one. `verifyElvixToken` forwards in `elvix-dpop-proof`, `elvix-dpop-htm`, `elvix-dpop-htu`, the names elvix's `lib/dpop-backend.ts` reads; change both together. `tests/dpop-phase2.test.ts` pins all of it.
- **Every sign-in method hands the finisher's whole landing to `applyLanding`** (0.14.6). The server decides what comes next (a step, or the destination); a method that rebuilds the landing itself drops steps. Passkey did, and skipped username and restore. A form on elvix's own origin sends no `returnUrl`: elvix refuses one there (0.14.6; Google and GitHub on the hosted page answered 403 until then).
- **Navigation to a URL the server or a prop supplied goes through `safeRedirect()`** (0.14). `http(s):` on the host's origin or one of the app's `allowedOrigins`, else `/`. Never `window.location.href = x` on a raw value.
- **The host must see a sign-in when it happens** (0.14). `finishSignIn` awaits the provider's `refresh()` before `onResult`; `endLocalSession()` and another tab's `storage` event refresh it too (`announceSessionChange`). A sign-in does not announce mid-onboarding, or `redirectIfAuthenticated` would skip the gate. Only the latest `sdk-context` read may settle.
- **Panes stack with `gap`, never `space-y`** (0.14, `pane-layout.ts`). `space-y` is a margin on the children and one `m-0` child (the OTP fieldset) cancelled it. `tests/pane-spacing.test.ts` fails on any `space-x/y` in a pane.
- **Colours that show state come from `--elvix-primary`** (0.14). Focus uses `BRAND_FOCUS`; no literal purple outside elvix's own mark (`tests/brand-colors.test.ts`). The sign-in card re-installs the brand variables because the modal and drawer portal out of the provider. Tailwind classes are full literals, never built by interpolation, or the CSS is not generated.
- **The translation CDN must hold every key a release reads** (0.14). `scripts/sync-catalogs.mjs` uploads the catalogs to R2 and `--check` reads them back from elvix.is; `publish.yml` runs both before `npm publish`. A new key goes into all 15 catalogs (`catalogs.test.ts`) and must exist for every `t()` literal (`catalog-keys.test.ts`). Run the sync yourself after adding keys if a host needs them before a release.

- **A redirect return that carries a step must be shown** (0.14.3). A redirect reloads the page, so the modal is closed on return and nothing is mounted to render the step; `consumeElvixReturnToken` records it (`isOnboardingPending`), the modal / drawer form opens itself on it (`resumeOnReturn`), `<ElvixOnboarding>` is the standalone surface, and `useElvixOnboarding()` lets a host build its own. While a step is pending the provider reports the session as ANONYMOUS; `finishSignIn` clears it. In-frame methods (email code, username, passkey) never reload, so they are not affected. `tests/redirect-return-onboarding.test.tsx` and `tests/onboarding-component.test.tsx` pin it.

- **`<ElvixEmailCodeSignIn>` sends one code per address, ever** (0.17, `email-code-once.ts`): a remount, StrictMode's double effect or a reload resumes the kept code; only "Send again" sends another. Its key is built from the provider's `clientId` PROP, never the bootstrap envelope's: the envelope lands after mount, the key changed, and the first draft sent two codes (caught by `tests/email-code-sign-in.test.tsx`). It is built from the form's own flow, code legs and panes; a fix to one is a fix to both.

## Lint rules turned off, and why

Three biome rules are `off` in `biome.json` because they are wrong for a framework-neutral SDK,
not because the code was too hard to fix. Every other rule is `error`.

| Rule | Why it is off |
|---|---|
| `performance/noImgElement` | It is Next.js's "use `next/image`" rule. The SDK runs in any React host (Next is an optional peer) and builds its own CDN `srcset`. |
| `suspicious/noDocumentCookie` | The alternative, the Cookie Store API, is missing from Safari before 18.4 and Firefox before 140; `document.cookie` is the portable API. Two call sites, both clearing a cookie on sign-out. |
| `a11y/noAutofocus` | Every use moves focus into a pane the user just opened (OTP entry, onboarding step, device code), which is WAI-ARIA dialog guidance, not the page-load focus steal the rule targets. |

`noLabelWithoutControl` is on, with `ElvixInput` / `ElvixDateInput` / `ElvixTaxIdInput` declared as
input components: they render a native `<input>`, which biome cannot see through.

## Component tests

`bun run test` is vitest. Component tests are `tests/*.test.tsx`, opt into a DOM with
`// @vitest-environment jsdom` on line 1, and render against `tests/helpers/fake-elvix.ts`:
an in-memory elvix that routes `fetch` by URL, answers like the real server where it matters
(media-meta for an unknown id is `ok` with empty sizes, not a 404), and can hold `sdk-context`
to reproduce a session that lands after mount. Every fix ships with a test that fails on the
previous release. CI runs `bun run test`; plain `bun test` is Bun's runner and ignores
`vitest.config.ts`.

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
bun run lint:ci     # what CI runs: biome ci --error-on-warnings
bun run lint:fix    # auto-fix what is safe
bun run build       # tsup → dist/
bun run test        # vitest (NOT `bun test`, Bun's own runner)
```

**What CI enforces** (`ci.yml`, job `test` — the required check on `main`, admins included):
biome with **zero warnings and zero errors** (`--error-on-warnings`), typecheck, build, vitest.
`publish.yml` calls the same workflow before `npm publish`, so a tag cannot ship what a PR would
reject. **A red check is never merged.** The lint debt reached zero on 2026-09-19 (140 findings
at the start); there is no baseline and no allowlist, so a new warning fails the build.

## The size gate

This repo had **no linter at all** until 2026-08-23, and CI ran only typecheck,
build and test. Nothing measured function length, which is how
`elvix-legal-entities.tsx` reached **3,292 lines** with a component of
cognitive complexity **255**, and how six components kept importing a symbol
they had stopped using.

Since 2026-10-28 the limits are DanceClub web's: **files ≤ 300 lines, functions ≤ 80,
cognitive complexity ≤ 15, at most 4 parameters**, all errors. What broke them that day is
recorded debt that may only shrink (`.file-lines-baseline.json`, the `biome.json`
`overrides`, `tests/debt-ratchet.test.ts`). The rules, their checks and the debt:
**[CODING-RULES.md](CODING-RULES.md)**, read before writing code.

`bun run lint` runs in CI **before** typecheck, over `src`, `tests` and `scripts`
(`scripts` went unlinted until 2026-10-28).

## How the components are built

Every multi-step component follows the same split. Copy it for a new one:

| Piece | Holds | Examples |
|---|---|---|
| a pure flow / reducer | which pane follows which; no React, no fetch; unit-tested | `legal-entity-flow.ts`, `address-book-wizard.ts` |
| a pure payload map | what each step reads and writes | `legal-entity-payload.ts`, `taxIdsBlockReason` |
| a `use-*` hook | state + requests; reports outcomes to the host | `use-legal-entities.ts`, `use-address-book.ts`, `use-region-editor.ts`, `use-languages-editor.ts`, `use-sign-in-flow.ts` |
| shared hooks | a flow two components share | `use-membership-challenge.ts` (deactivate + leave), `use-image-editor.ts` (avatar + banner) |
| panes | presentational, one per question, a `switch` per group | `sign-in-steps.tsx`, `legal-entity-*-views.tsx` |

Shared plumbing, never re-implemented per component:

- `wizard-panes.tsx` — `SlidePane` / `FadePane` / `FADE_MASK`, the only pane transitions.
- `profile-request.ts` — `send` (never rejects), `jsonInit`, `humanizeApiError`, and
  `profileCollection()`, the CRUD of `/api/account/profile/<resource>`.
- `use-stable-callback.ts` — for every host callback (`onChange`, `onResult`). A host
  callback in an effect's dependencies is how `ElvixLanguages` and `ElvixRegion` looped
  forever on an inline `onChange`; `tests/host-callbacks.test.tsx` pins both.

Rules the refactors above were driven by:

- **Extract the flow FIRST, and make the component use it.** `legal-entity-flow.ts`
  was a tested `nextView()` the component never called: it kept its own sixteen
  handlers, so the tests guarded a copy. Pane ordering carries product meaning (a
  company is never asked for a date of birth); it has one home.
- **Characterize before restructuring.** `tests/sign-in-form.test.tsx` was written
  against the 1,027-line `AuthBody` and passed unchanged on the split. A refactor
  test must also run against the old code (`git stash push <file>`), or it proves
  nothing.
- **A `switch` per pane group beats a ternary chain.** A 21-branch nested ternary
  was a complexity of 255 on its own.

Publishing is tag-driven via GitHub Actions: tag `v0.1.0` on main → CI publishes to npm public registry.

## Source of truth

**THIS repo is authoritative (since 2026-07-04).** The old `components/sdk/` fork in the private `021is/elvix` monorepo was DELETED — there is no second copy to keep in sync. `src/react/` here is the single source; elvix.is consumes `@elvix.is/sdk` from npm exactly like any customer (`import { … } from "@elvix.is/sdk/react"`) and bumps the dep version. To change a component's behaviour: change it HERE, `bun run build`, tag a release, then bump the version in the elvix monorepo. Never re-fork a component back into that repo.

Component reference docs (the `components/*` catalogs consumed by the docs site + MCP) currently live in the elvix monorepo at `lib/docs/components/*.ts` — update those alongside a component change so the published docs and the code stay aligned.
