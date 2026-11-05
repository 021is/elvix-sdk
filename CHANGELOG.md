# Changelog

All notable changes to `@elvix.is/sdk` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Older releases, each file under the 300-line limit: [0.15 to 0.16](docs/changelog/0.15-0.16.md), [0.14.3 to 0.14.7](docs/changelog/0.14.3-0.14.7.md),
[0.12 to 0.14.2](docs/changelog/0.12-0.14.md), [0.7 to 0.11](docs/changelog/0.7-0.11.md),
[0.1 to 0.6](docs/changelog/0.1-0.6.md). When this file passes 300 lines, its oldest
releases move there.

## [Unreleased]

### Added

### Changed

### Fixed

## [0.23.1] — 2026-11-05

### Fixed

- **A browser without `color-mix()` no longer paints fields, rows and tints in their full
  colour.** For a tint of a CSS variable, Tailwind's compiled fallback is the bare colour, so
  Safari before 16.2 and Chrome before 111 showed near-black fields and rows, and full-brand
  fills under dark text (33 rules: the field and row tints, the picked row, hovers, the
  `bg-fg-3/…` and `border-fg-3/…` utilities, the brand tints). The build now makes those
  fallbacks transparent, keeping a host's own variable in front (`scripts/styles-fallback.mjs`);
  focus rings and underlines keep their colour. Modern browsers see no change.
  `tests/styles-fallback.test.ts` checks the built stylesheet.

## [0.23.0] — 2026-11-05

The host's own bar can drive `<ElvixLegalEntityPicker>`'s add flow: one Back and one
Continue on screen, both the host's.

### Added

- **`useElvixLegalEntityPickerControls()`**, passed as `<ElvixLegalEntityPicker
  controls={controls}>`. Given controls, the picker draws no Back, Continue or Save of its own
  at any add step; the host's bar reads `adding`, `step` (`{ id, title }`, the step's
  question), `canContinue`, `busy` (a VAT or register check, or the save), and `label` (what the
  step's own button said: Continue, Skip, Save company), and calls `next()` (the step's action;
  the last step saves and picks, then `onPick` as always) and `back()` (`false` on the list,
  so the host leaves its pane). Choices that are the step's content stay in the pane: a type,
  Yes or No, Not right. Without `controls` nothing changes. Asked by DanceClub's Bookings
  session: inside "Add a company", elvix's Back and Continue showed beside DanceClub's.

### Changed

- Every legal-entity step draws its header, question and action through one place
  (`legal-entity-step-chrome.tsx`), which a host can take over. The address review's
  "Looks right" row now sits at the foot of the pane like every other step's action.

### Fixed

- **A legal entity is created once.** A second press of Save while the first was still
  saving created it twice; a host's `next()` could do the same. One save runs at a time.
- One controls object drives one picker: a second picker given the same controls logs
  `elvix_picker_controls_shared` and keeps its own buttons. During the save, `back()` stays
  `true` (a no-op), so a host never leaves its pane mid-save.

## [0.22.0] — 2026-11-04

Every SDK text field has the one field look: a tint, a deeper brand tint on focus, never a
border or a ring.

### Fixed

- **The sign-in card's own fields, the code boxes, the country search and the address note had
  an outline.** 0.19 tinted `<ElvixInput>` and its siblings, but these kept a 1px border and a
  brand focus ring (seen in the sign-in card on danceclub.dev). All are `.elvix-field` now; the
  bordered look (`BRAND_FOCUS`) is gone, and `tests/field-look.test.tsx` fails on any input or
  textarea without the field look. Buttons keep their focus ring.
- **A placeholder reads at 7:1.** The sign-in card's field has no visible label, so its
  placeholder is the only text saying what goes in it, and it was about 2.3:1 on the field
  (WCAG 1.4.3 asks 4.5:1). `--elvix-placeholder` is `#44444c` in light and `#b8b8bf` in dark,
  7:1 or more at rest, on hover and on focus with any brand (checked with black in light and
  white in dark); `tests/placeholder-contrast.test.ts` holds both copies of the palette to it.

## [0.21.0] — 2026-11-04

A component brings only its own English words. A page with `<ElvixProvider>` and
`<ElvixSecuredBadge>` costs 9 KB gzip of JavaScript under Next 16 / Turbopack, down from
22 KB in 0.20 and 249 KB in 0.19.

### Changed

- **English words ship per module.** The whole English catalog (19 namespaces, ~16 KB gzip)
  was bundled with the provider. The build now gives each module the namespaces of the keys
  it names (`scripts/english-plugin.mjs`), so the provider brings none and the badge only
  `signin`. Words are still there before the first render: no raw key, and the server HTML
  has them. Every component, bundled alone, renders the same HTML as in 0.20.
  `tests/english-split.test.ts` checks every export of the build.
- **A hidden tab counts as Away, not Offline.** The heartbeat skipped every beat while no
  tab of the app was visible, so a person with it open in a back tab showed offline after a
  minute. It now sends `idle` for a hidden tab; Offline means no beat at all (every tab
  closed, signed out, asleep). A hidden tab's timers are throttled to about a minute, so
  elvix keeps an idle beat alive longer than an online one (elvix, same day). After 8 hours
  with no tab visible the beats stop, so a forgotten back tab does not renew the session.

### Fixed

- **A signed-out visitor on another site is not asked about at elvix.** With no token the
  provider still asked `sdk-context`, a 401 in the console of every page on a host like
  danceclub.dev. elvix's session cookies are `SameSite=Lax`, which no browser sends on a
  cross-site request, so that answer could only be 401. Same origin and same site still ask.
- **The plain `.elvix-input` field has no border and no focus ring.** 0.19 tinted every field
  but this class, used by `<ElvixDeviceApproval>` and elvix's own `/device` page; it takes
  the field look now.

## [0.20.0] — 2026-11-04

A host downloads only the components it renders. A page with `<ElvixProvider>` and
`<ElvixSecuredBadge>` costs 22 KB gzip of JavaScript under Next 16 / Turbopack, down
from 249 KB.

### Changed

- **The React build is split, one module per file** (`dist/react/`), and `package.json`
  declares `"sideEffects": ["*.css"]`. `dist/react.js` was one 1.3 MB `"use client"`
  file holding all 169 modules, which no bundler could split: every DanceClub page, the
  public ones too, loaded the sign-in form, passkeys and the account UI. Each module now
  carries its own `"use client"`, and the entry carries none, because a client entry is one
  client reference that Turbopack ships whole. Imports are unchanged
  (`@elvix.is/sdk/react`). `tests/bundle-split.test.ts` pins the layout and a size budget.

### Fixed

- **`@elvix.is/sdk/types` resolves.** The build listed `src/types.ts`, which never
  existed, and tsup skipped it silently, so the documented subpath shipped no file. It is
  built from `src/types/index.ts`.
- **`elvix-mcp` offers only what elvix marks as an agent tool.** It read every `api` route
  of `openapi.roles.json` as a tool, so it offered device login, the OIDC flows, the public
  sign-in routes and step-up approvals, which take no API key, and `/api/v1/session` and
  `/api/v1/token`, which an API key can only 401 on. It now reads the manifest's `mcpTool`;
  against an elvix from before that field it still skips end-user and system routes.

## [0.19.0] — 2026-11-02

A focused field is tinted, never outlined, in every SDK component; an optional text step
says "Skip" while empty.

### Changed

- **A focused field is tinted, never outlined.** `--elvix-field-focus` is now the focused
  fill (default: the brand at 12%); 0.18's brand border is gone, and
  `--elvix-field-focus-border` brings one back. A host that set `--elvix-field-focus` to a
  border colour now gets that colour as the fill.

### Fixed

- **The apartment line (and every optional text step) says "Skip" while empty**, "Continue"
  once typed, like the other optional steps; it always said "Continue".

## [0.18.0] — 2026-11-01

Pick a legal entity for an invoice, read it by id on your server, and style fields and rows
as your own. Needs elvix.is with the legal-entity grants (deployed before this release).

### Added

- **`<ElvixLegalEntityPicker types selectedId purpose onPick>`**: the user's legal entities
  as a list; a tap picks and tints the row, and your own Continue ends the flow (no confirm
  button, no done pane). "Add a company" runs the add wizard in place and comes back with
  the new entity picked. Rows show what an invoice says: the legal name, the VAT ID or tax
  number and the city; "Verified" only when elvix's own check confirmed the VAT ID and the
  register's name does not differ (else "Name differs from the register"). `types` filters
  the list and the wizard; `onResult` reports each pick and a failed save.
- **The picker asks only what an invoice needs.** With `purpose="invoicing"` (the default)
  "Add" walks: the type (if more than one is offered) → the VAT ID, or "No VAT ID" → tax
  country → tax number (an individual: name → tax country → tax number) → the check → the
  legal name, prefilled (a company in one field, a person in given and family name) → the
  address (search prefilled from the authority, review, any missing part, apartment or
  floor optional) → an invoice email (optional) → an Italian or Belgian business's
  e-invoice address (optional) → saved. No trading name, birth data, nationality, registration or phone.
  `purpose="payouts"` and `<ElvixLegalEntities>` keep the full flow. The last step's
  button saves and shows a refused save; "Step 1 of N" counts the flow shown.
- **`sizing="fixed" | "flexible"`** on `<ElvixLegalEntityPicker>` and
  `<ElvixLegalEntities>`, with `height`, `minHeight`, `maxHeight`. Fixed: the list and
  every add step share one height (the picker's default `min(520px, 70dvh)`, the
  manager's `min(540px, 66dvh)` within 340–700 px; `height` overrides, `maxHeight` caps)
  and a longer pane scrolls inside. Flexible: as tall as each pane, nothing scrolls inside,
  no fixed height; `maxHeight` caps it and then it scrolls. The picker defaults to fixed in
  a card and flexible with `card={false}`; the manager to fixed. `ElvixLegalEntitySizing`
  names the two.
- **The Enter hint is off by default, on every device.** The "Enter" chip beside a save
  button carries `.elvix-kbd-hint` (`hints.css`); a host turns it on with
  `--elvix-key-hints: inline-flex` on any ancestor. The chip shows the key only, never
  prose: an optional pane's button says "Skip" while empty instead.
- **A tap is a grant; the pre-selection is not.** `onPick(entity, { granted })`: a tap or a
  new entity grants your application that one entity for `purpose` (`invoicing`, default,
  or `payouts`, which a note above the list discloses: your app's name and what it reads)
  before `onPick` fires with `granted: true`. The default (else the only entity) is shown
  picked with `granted: false` and nothing shared: grant it from your Continue with
  **`useElvixLegalEntityGrant()(entityId, purpose?)`**. The user revokes in their account.
- **`getElvixLegalEntity({ apiKey, applicationId, userId, entityId, purpose? })`** in
  `@elvix.is/sdk/server`: the picked entity by id for the purpose granted
  (`ElvixLegalEntity`): elvix's VAT verdict, `vatIdNameMatch`, EAS schemes, e-invoice
  addresses; `payouts` adds what the person saved of their birth data and phone (a
  payment provider's prefill; its own onboarding asks the rest). `not_found`, `invalid_id`,
  `invalid_purpose`; never throws.
- **Webhooks** `user.legal_entity_updated`, `user.legal_entity_deleted`,
  `user.legal_entity_revoked` (`UserLegalEntityData`, with `purpose`), to applications
  holding a grant.
- **A person's name in two parts** (`givenName`, `familyName`, required for individuals
  and sole proprietors), **where e-invoices go**: optional, asked only of an Italian (SDI
  code or PEC) or Belgian (Peppol ID) business and counted in "Step 1 of N" only there; the
  detail view edits all four fields, Leitweg-ID included, for any country.
- **Row variables**: `--elvix-row`, `--elvix-row-hover`, `--elvix-picked`,
  `--elvix-picked-text`, `--elvix-radius`, `--elvix-focus` (`rows.css`), next to the field
  variables; `--elvix-danger` outlines a field whose value is wrong. **Icon bubbles** (the
  tinted circle behind a type's icon, the empty state's, the detail header's) take
  `--elvix-icon` (the icon, default the brand) and `--elvix-icon-bg` (the fill, default
  the brand at 15%) through `.elvix-icon-bubble`.
- `LegalEntityRecord`, `LegalEntityType` and `VatVerdict` are exported from
  `@elvix.is/sdk/react`.

### Changed

- **One field look.** `<ElvixInput>` and `<ElvixDateInput>`, so every SDK form, take
  0.17's `.elvix-field`: a tint of the text colour, no outline at rest, the brand on
  focus. Their own white fill and 55% brand outline are gone. Legal-entity rows, choices,
  suggestions and tiles lose their borders; a tint shows state. Set the variables to
  bring an outline back.
- **A business starts at its VAT ID.** The prefix names the tax country, so a VAT holder
  is not asked for it (Norway, Australia and Brazil, whose numbers carry none, are offered
  beside the field). The authority's answer prefills the legal name and types its address
  into the address search. "No VAT ID" takes a sole proprietor through tax country and
  tax number. A private individual's steps are unchanged.
- **elvix checks the VAT ID itself.** The save sends the VAT ID only; `vatIdValidation`,
  `vatIdValidatedAt` and `vatIdValidatedName` left the input and are set by elvix (the
  record adds `vatIdValidatedAddress` and `vatIdRequestId`). Until now the browser sent
  the level it said it reached, which anyone could set to "live".
- **A business has its full address** (EU VAT Directive art. 226(5)): street, postal code,
  city and country are required for a sole proprietorship or company, and the address
  review asks in place for any part Google Places left empty. A sole proprietor without a
  VAT ID gives its tax number.
- **An entity needs what an invoice needs.** Date and place of birth, nationality and the
  registration number and authority are optional for every type (a registration number
  that is given must still match its country's format); their panes in the full flow say
  "Skip" while empty. Still required: the legal name (given and family name for a
  person), the tax country, a company's VAT ID, a sole proprietor's VAT ID or tax number,
  an individual's tax number, and a business's street, postal code, city and country.
- `<ElvixLegalEntities>`' `height`, `minHeight` and `maxHeight` take a CSS length as well
  as a number.
- **Inside an app, personal fields are write-only.** elvix answers an app's session with
  birth data, nationality, phone (and an individual's tax number and address) withheld
  (`withheld: true`); the detail view says they are shown only in the elvix account and
  still lets the user set a new value.
- The detail view takes one `onEdit(step)` instead of nine handlers, in its own file.

### Fixed

- A list of legal entities that could not be read showed as an empty list; the picker now
  says so, with a retry.

## [0.17.0] — 2026-10-28

A sign-in that starts at the email code, for a host that already knows the address.

### Added

- **`<ElvixEmailCodeSignIn email>`**: sends a code to `email` once when it mounts and draws
  only where it went, the six boxes, "Send again" and "Use another email" (an email field,
  then the code, in the same frame). No card, logo, method list or footer: it sits inside
  the host's own card. A remount, React StrictMode or a reload within the code's life never
  sends a second code; "Send again" is the only way to one. The onboarding steps after the
  code are the form's own panes; `deferOnboarding` signs in at once instead and names the
  step put off in the result's new `deferred` (`"username" | "passkey"`; restoring a
  membership is never put off). Same results contract as `<ElvixSignInForm>`, DPoP
  included. `mode="preview"` draws it with demo state and asks elvix nothing;
  `previewStep` picks the pane. It never navigates.
- **Made to be fitted into the host's page.** `onSignedIn(session)` fires once the person is
  signed in (the provider already refreshed), and `signedIn` is what the block shows then.
  `title` and `description` (any text or element) head the block, or leave nothing behind
  when omitted: it is one column with one gap. `autoFocus`, `className`, and `classNames`
  for each part (`header`, `title`, `description`, `line`, `code`, `field`, `button`,
  `links`, `link`, `error`). The fields' look is plain CSS (`.elvix-field`) driven by
  `--elvix-field`, `-hover`, `-border`, `-focus`, `-focus-ring`, `-radius` and `-text` on
  any ancestor, so no host stylesheet or load order can override it; by default a tint, no
  outline, a thin brand border on focus. Its words come from the provider's `messages`.

### Changed

- The code group is described by the line that says where the code went, and every sign-in
  error line is announced (`role="alert"`).
- This changelog keeps the recent releases; the older ones are in `docs/changelog/`.

### Fixed

- **The focus colour of the sign-in inputs and code boxes.** `BRAND_FOCUS` gave Tailwind a
  bare `var()`, which it cannot tell from a width, so a focused field drew a dark border and
  ring instead of the brand. Both now carry the `color:` hint.
- Three refusals of a code read "Something went wrong": too many wrong codes, a code already
  used, a code that no longer exists. Each now says what happened and to send a new one.

[Unreleased]: https://github.com/021is/elvix-sdk/compare/v0.23.1...HEAD
