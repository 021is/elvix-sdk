# Changelog

All notable changes to `@elvix.is/sdk` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Older releases, each file under the 300-line limit: [0.18](docs/changelog/0.18.md), [0.17](docs/changelog/0.17.md), [0.15 to 0.16](docs/changelog/0.15-0.16.md), [0.14.3 to 0.14.7](docs/changelog/0.14.3-0.14.7.md),
[0.12 to 0.14.2](docs/changelog/0.12-0.14.md), [0.7 to 0.11](docs/changelog/0.7-0.11.md),
[0.1 to 0.6](docs/changelog/0.1-0.6.md). When this file passes 300 lines, its oldest
releases move there.

## [Unreleased]

## [0.26.0] — 2026-11-12

The sign-in card takes an app's type and spacing, and knows the phone's keyboard. An app
that sets nothing gets the card it had: every default is 0.25's value (measured in
Chromium: 62 elements, same boxes, weights and fonts).

### Added

- **`cardStyle`**, an app's type and spacing on the sign-in card (Edvard: "it must be super
  adaptive"): `fontText`, `fontDisplay`, `headingWeight` (400–800, default 600),
  `logoHeight`, `paddingX`, `paddingTop`, and every gap between the card's parts:
  `gapLogoTitle`, `gapTitleMethods`, `gapMethods`, `gapDivider`, `gapFieldButton`,
  `gapButtonSlot`, `gapLegal`, `gapFooter`. Whole pixels, each the distance a person sees,
  clamped to its range (`CARD_STYLE_RANGES`). On `<ElvixProvider cardStyle>` (every card
  under it) and on `<ElvixSignInCard>` / `<ElvixSignInForm>` (that card); the Console's
  value comes with the bootstrap envelope (`cardStyle`, elvix 0.26+). The card's prop wins
  over the provider's, the provider's over the Console's, key by key.
- **Fonts are names, never downloads.** A family your page already loads (`"Inter"`,
  `"var(--font-inter)"`); the SDK requests no font and no stylesheet. A host family is a
  comma-separated list of bare names, closed `"…"` / `'…'` strings and `var(--name)`, and
  anything else (a URL, a declaration, a quote left open, a control character) is
  refused; a Console family is one of `CONSOLE_FONTS` (Inter, Urbanist, Geist, DM Sans,
  Manrope, Plus Jakarta Sans, Nunito, Montserrat, Poppins, Lato, Lora), the fonts elvix
  serves.
- **The legal line and "Secured by elvix" cannot be spaced or styled away**: no token
  reaches their size, colour, visibility or font (the app's fonts stop above the legal
  line), the gaps above them never go under 12 px, and the modal scrolls on a short screen.
- `@elvix.is/sdk/server` exports `CARD_STYLE_RANGES`, `CARD_STYLE_TOKENS`,
  `CONSOLE_FONTS`, `isCardTokenInRange`, `isConsoleFontName` and the `ElvixCardStyle` /
  `CardStyleToken` / `ConsoleFont` types: what elvix's API refuses a Console value with.
  `@elvix.is/sdk/react` exports `CARD_STYLE_RANGES` and `ElvixCardStyle`.
- **The phone's keyboard** (Edvard: "the elvix sdk for sign in must be aware of the
  keyboard on mobile"): every field's action key says what Enter does (`go` on a step's
  last field, `next` between the code boxes); the identifier field offers the person's
  passkeys in its autofill (`autocomplete="… webauthn"`, a conditional request started
  on a focus of the field while no passkey request is open in any card on the page, never
  on open or while a passkey button runs, and ended before a button's dialog, its start
  request included; a passkey picked from it is a sign-in no button interrupts or repeats:
  one prompt, one session; a sign-in running in any card shows on every card's passkey
  button; every passkey request gives up after 20 s with "Network hiccup. Try again."); a
  focused field and its step's button are scrolled into view inside whatever scrolls
  around the card, again while the keyboard opens; and a touch screen gets no autofocus,
  so the keyboard never jumps up as a sheet or the modal opens (the modal focuses its own
  panel there). That holds for every set of code boxes (export and deactivate too), and a
  focus is given after mount, never as an `autofocus` attribute a server would write into
  the page.
- **A refused `cardStyle` value says so, in development only:** the console names the
  key, the value and what is allowed, once per key (a number out of range is still held
  at its edge, a bad font still ignored). Nothing in production.

### Changed

- **Breaking (types):** `ElvixAppPasskeysResult.message` is gone; read `error`.
- The entry step is `sign-in-identifier-step.tsx` and its method buttons
  `sign-in-social.tsx`, the username field `sign-in-username-field.tsx`;
  `sign-in-steps.tsx` went from 889 to 488 lines and left the complexity debt list. Adding
  a passkey is `passkey-register.ts`, out of `passkey.ts` (which left the file-length debt).

### Fixed

- **The username step's "@" could sit on the first letter.** 0.25 put the text at a fixed
  padding in `rem` beside a 14 px "@" it never measured, so a page with a smaller root
  text size, or a wider font, overlapped them. The text now starts at the "@"'s measured
  right edge plus 6 px, measured again when a font arrives or the text size changes.
- The username check reads elvix's answer field by field: "available" only when it is
  `true`, a reason only when it is a string and one of the step's own. A check that got no
  answer (the network, a refused request) says "Network hiccup. Try again." under the
  field; it showed the rules hint with Continue off (a network error) or "That username
  isn't valid." (a 429 or a 500).
- The entry step's error line is announced to a screen reader (`role="alert"`), as every
  other step's is, and shows on a card with no email or username field too: a refused
  passkey there said nothing.
- **No browser, extension or server words reach the page or `onResult`.** A passkey
  failure was shown in the browser's own message (an extension wrapping WebAuthn could
  put any text there), and `<ElvixAppPasskeys>` showed a server's raw error. Every
  failure is now a code, worded from elvix's own catalog (an unknown code, the generic
  line); a server's `errorMessage` counts as a code only when it looks like one
  (`not_a_member`), so a 500's stack or database address never reaches `onResult`;
  `PasskeySignInResult` and `PasskeyRegisterResult` carry no `message`.
- Adding a passkey holds the page's one passkey request, as signing in does: a
  `create()` never opens beside another card's prompt (`passkey_busy` while one runs,
  "A passkey prompt is already open.").

## [0.25.0] — 2026-11-11

### Added

- **`<ElvixSignInCard>`: the sign-in card with no container**, for your own sheet, page or
  dialog. elvix ships the card and its brand (your logo and title, every method enabled in
  the Console, every step incl. username and passkey, the legal links, "Secured by elvix");
  you own the container, so a change to your sheet never waits for an elvix release. It
  fills its parent's width, never scrolls itself, draws no background, stays a card whatever
  the Console's presentation says, and sends nothing on mount once the provider has loaded.
  It ships without the form's overlays (no `vaul`): `tests/bundle-split.test.ts`.
- **`useElvixOnboarding().dismiss()`**: "not now" for a host's own surface after a redirect
  sign-in; the sign-in completes without the step. `<ElvixOnboarding>` uses it too.
- **`headline`** on the form and the card: the one line under the logo on the entry step, in
  place of the title, where the host knows why the person signs in ("Save events you love").

### Changed

- **The entry step's head is the logo plus one line, in every app**: "Pick how you want to
  continue." is gone (Edvard, on a phone: "too much going on here"). Later steps keep their
  title and the one fact they need ("We sent a code to …"). `belowHeading` is for the gate
  badge's place; a host's reason for the sign-in belongs in `headline`.

- `<ElvixSignInForm>` draws its inline card, modal and drawer from the same card
  (`elvix-sign-in-card.tsx`, its content in `sign-in-card-body.tsx`, the steps as one
  `switch`); the form file went from 935 to under 700 lines.

### Fixed

- **The host's `belowMethods` line no longer sits glued to Continue**: it gets the legal
  line's 20 px above it (DanceClub's tagline, on a phone).

## [0.24.0] — 2026-11-05

### Removed

- **`useElvixLegalEntityPickerControls()` and the picker's `controls` prop** (added in
  0.23.0), with the `ElvixLegalEntityPickerControls` and `ElvixLegalEntityPickerConnection`
  types. The picker always draws elvix's own Back, Continue and Save, in elvix's card: one
  design in every app, and the visible elvix chrome is elvix's own. A host passing
  `controls` gets a type error; without it nothing changes. The 0.23.0 fix that saves a
  legal entity once stays.

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

[Unreleased]: https://github.com/021is/elvix-sdk/compare/v0.26.0...HEAD
