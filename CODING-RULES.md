# Coding rules: @elvix.is/sdk

Every change follows these, from the first line written. Edvard's bar (2026-10-11): **NO BAD
CODE. HIGH PERFORMANCE. BEST UI AND UX. AND SEO AWARE + AGENT DISCOVERY FOR PUBLIC CONTENT.**

Taken on 2026-10-28 from DanceClub web's and team's `CODING-RULES.md` (Edvard: "learn from the
coding rule of web and team and replace our own coding rule or improve it"), with what differs
for a public, framework-neutral React library said in place. Each rule says what enforces it.
"By hand" means nothing executes it yet: check every change against it yourself, and prefer
adding the check to adding prose (a rule nothing executes is a wish).

The gates: **lint:ci** (`bun run lint:ci`: Biome over `src`, `tests` and `scripts`, warnings
failing) · **typecheck** · **test** (`bun run test`, vitest: the rule tests below run with the
rest) · **CI** (`ci.yml`, the required check on `main`; `publish.yml` runs the same before
`npm publish`, so a tag cannot ship what a PR would reject).

## Principles

1. **Lego bricks: small pieces, composed, never inherited.** A component or function does one
   thing and reads at a glance; it is extended by props and children, never by subclassing.
   *Files ≤ 300 lines: `tests/file-length.test.ts`. Functions ≤ 80 lines, cognitive complexity
   ≤ 15, at most 4 parameters: Biome.*
2. **Reusing the wrong thing is worse than copying it once.** Share what means the same, not
   what looks the same; never a flag that switches a shared component between two jobs. Look
   before you write: the sign-in pieces are `use-sign-in-flow.ts` (the funnel), `use-otp.ts`
   (the code legs), `sign-in-controls.tsx` (the button, the error line), `sign-in-theme.ts`,
   the panes in `sign-in-steps.tsx`. `<ElvixEmailCodeSignIn>` is built from them, not beside
   them. *By hand.*
3. **Make wrong states impossible to write.** A value is a union of its real cases, never
   booleans that can contradict; a `switch` over a union handles every case; string literals
   that mean something are a `const` object (`Step`, `NextStep`). *tsc; Biome.*
4. **Keep logic pure; push side effects to the edges.** Which pane follows which, what a
   landing opens, what a keystroke makes of the code: plain functions (`gateOf`,
   `typeIntoBox`, `legal-entity-flow.ts`), unit-tested. Requests and storage live in `use-*`
   hooks. *By hand.*
5. **Never fail silently.** Every failure is shown with its cause and what to do, and reported
   to `onResult` with its code; no empty `catch`, no swallowed promise. A swallow that is
   truly right says why in a comment inside the `catch`. "Something went wrong" is a last
   resort for a code elvix has never sent, never the answer to one it does send. *Unhandled
   promises: Biome. The rest by hand.*
6. **Simple until proven otherwise.** Build what a host needs today: no prop, option or
   dependency "for later". *By hand.*
7. **Trust nothing that crosses a boundary.** Server answers, URLs, fragments and host props
   are checked where they enter (`safeRedirect`, the one-time `state`, `elvixFetch`). Every
   line is customer-readable source (MIT): no telemetry, no opaque fetches, never a token in a
   log. *`tests/no-bare-fetch.test.ts`, `tests/safe-redirect.test.ts`; the rest by hand.*

## Debt

Code that broke a checkable rule when it became a check (2026-10-28) is **debt**, recorded and
allowed only to shrink; nothing new is ever recorded.

- Files over 300 lines: `.file-lines-baseline.json`, each with its length. A recorded file may
  not grow, a shorter one fails until its record is lowered, one back under 300 leaves it.
- Functions over 80 lines or over complexity 15: listed in `biome.json` `overrides`, where they
  keep the old limits (150, 25) so they cannot get worse. `tests/debt-ratchet.test.ts` pins
  both list lengths; a paid file leaves its list and the number drops in the same change.

**Add none, and leave every file you touch better than you found it**: a file over a limit
that a change touches pays some of it in that change (split it, move a pure helper out); say
what was left and why. On 2026-10-28 the sign-in files paid this way: `use-sign-in-flow.ts`
(551 lines before its split), `elvix-sign-in-form.tsx` (989 → 935), `sign-in-steps.tsx`
(1012 → 933), and `CHANGELOG.md` (844 → 225; its older releases are in `docs/changelog/`,
and move there whenever it passes 300 again).

## Size and structure

- **No file over 300 lines, Markdown included; no function over 80.** Split by concern
  before a file gets there (a pane, a hook, a pure helper), never by squeezing lines. *Above.*
- **A multi-step component has the same five pieces** (AGENTS.md § How the components are
  built): a pure flow, a pure payload map, a `use-*` hook, presentational panes, and the
  shared plumbing. Extract the flow first, and make the component use it. *By hand.*
- **A file is named after its main export**, one concern per file. *By hand.*

## Clean code

- **No zombie code.** What a change supersedes dies in the same commit: no shims, dual paths,
  commented-out blocks, exports nothing uses. A public export is a promise to hosts: remove
  one only in a breaking release, with its changelog line. *Biome (unused imports and
  variables); the rest by hand.*
- **No `any`, no non-null assertion, no suppression to quiet an error.** Fix the root. The
  three rules switched off for the whole repo are in AGENTS.md § Lint rules turned off, each
  with its reason; another needs Edvard's word. *Biome.*
- **Types are honest**: `tsc --noEmit` clean, and a new field on an envelope type is
  optional, so a host on an older elvix gets `undefined` rather than a lie. *tsc; by hand.*

## Performance (part of correctness)

- **A host pays for every byte and every request.** No new dependency without a reason that
  holds for every host; components share the provider's answers (`useElvixApp`,
  `useUserMedia`) and never fetch what the provider already holds. *By hand.*
- **Every host callback through `useStableCallback`**: a host's inline arrow in an effect's
  dependencies is a request per render. *`tests/host-callbacks.test.tsx`.*
- **Animate only `transform` / `opacity`.** *By hand.*

## Agents and discovery

The SDK is integrated by agents more than by people. A component is documented where agents
read it (elvix's `lib/docs/components/<slug>.ts`: the docs page, its `.md`, the MCP
`get_component`, `list_components`), with a working example and its gotchas, in the same
change that ships it. *In elvix: `tests/lib/docs-components-complete.test.ts`.*

## UI

- **UX for the least capable user:** one step at a time, plain words, no dead ends (a wrong
  address has "Use another email", a refused code says to send a new one). *By hand.*
- **Colours from the provider's variables, never literals** (`--elvix-primary` for state,
  `--elvix-field` / `--elvix-field-border` for fields); Tailwind classes are full literals.
  *`tests/brand-colors.test.ts`.*
- **Panes stack with `gap`, never `space-y`.** *`tests/pane-spacing.test.ts`.*
- **Seven states** on every interactive element: hover, focus, active, disabled, loading,
  empty, error. Light and dark; keyboard and screen reader (a labelled control, an announced
  error: `ErrorLine` is `role="alert"`). *By hand.*

## Words

- **Every user-visible string is a `t()` key, in all 15 catalogs in the same change.** Unlike
  DanceClub's apps, the SDK ships every locale at once: a host never shows English inside a
  German page. *`tests/catalogs.test.ts`, `tests/catalog-keys.test.ts`; the CDN copy:
  `scripts/sync-catalogs.mjs --check` in `publish.yml`.*

## Edits and git

- **All source edits go through Write/Edit**, never `sed -i`, heredocs, `tee`, redirection or a
  formatter's `--write` (apply Biome's suggested diff by hand): every change is seen as a
  diff. **Stage files by name, commit in pieces;** no `Co-Authored-By` or "Generated with";
  never set git authorship. A release is a tag, published by CI; never `npm publish` by hand.
  *By hand.*
