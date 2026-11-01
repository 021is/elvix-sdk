# Changelog

All notable changes to `@elvix.is/sdk` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Older releases, each file under the 300-line limit: [0.12 to 0.14.0](docs/changelog/0.12-0.14.md),
[0.7 to 0.11](docs/changelog/0.7-0.11.md), [0.1 to 0.6](docs/changelog/0.1-0.6.md). When this
file passes 300 lines, its oldest releases move there.

## [Unreleased]

### Added

### Changed

### Fixed

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
- **A tap is a grant; the pre-selection is not.** `onPick(entity, { granted })`: a tap or a
  new entity grants your application that one entity for `purpose` (`invoicing`, default,
  or `payouts`) before `onPick` fires with `granted: true`. The default (else the only
  entity) is shown picked with `granted: false` and nothing shared: grant it from your
  Continue with **`useElvixLegalEntityGrant()(entityId, purpose?)`**. The user can revoke
  any grant in their elvix account.
- **`getElvixLegalEntity({ apiKey, applicationId, userId, entityId, purpose? })`** in
  `@elvix.is/sdk/server`: the picked entity by id for the purpose granted
  (`ElvixLegalEntity`): elvix's VAT verdict, `vatIdNameMatch`, EAS schemes, e-invoice
  addresses; `payouts` adds birth data, phone and `people`. `not_found`, `invalid_id`,
  `invalid_purpose`; never throws.
- **Webhooks** `user.legal_entity_updated`, `user.legal_entity_deleted`,
  `user.legal_entity_revoked` (`UserLegalEntityData`, with `purpose`), to applications
  holding a grant.
- **A person's name in two parts** (`givenName`, `familyName`, required for individuals
  and sole proprietors; the legal name is built from them), **where e-invoices go** (an
  optional step for businesses: a Peppol ID everywhere, Italy's SDI code and PEC, a German
  public body's Leitweg-ID), and **the people of a business** (representative, owners with
  their share, directors, executives) in the detail view (`LegalEntityPerson`).
- **Row variables**: `--elvix-row`, `--elvix-row-hover`, `--elvix-picked`,
  `--elvix-picked-text`, `--elvix-radius`, `--elvix-focus` (`rows.css`), next to the field
  variables; `--elvix-danger` outlines a field whose value is wrong.
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

## [0.16.0] — 2026-10-22

DPoP phase 2: the binding reaches your own backend, and a session binds the moment it exists.
Needs elvix with DPoP phase 2 (live 2026-10-22); against an older elvix every addition is
ignored, never an error.

### Added

- **`elvixProof(url, { method, token })`** (`@elvix.is/sdk/react`): a DPoP proof for one request
  to YOUR backend's route. Send it next to the token; your backend passes it on. It fetches a
  fresh nonce from elvix first when the tab holds none (`/api/v1/dpop/nonce`), since the backend
  that forwards it cannot ask for a second one. Null where the browser holds no key.
- **`verifyElvixToken({ token, proof, htm, htu })`** (`@elvix.is/sdk/server`): forwards the
  browser's proof to elvix. An app with DPoP on answers a bound session only with one, so a token
  copied out of the browser is useless at your backend too. The result carries `boundTo` (the
  key's thumbprint) for a bound session, and a refusal is `error: "dpop_refused"` with elvix's
  reason in `message`.
- **`exchangeElvixToken()`** (`@elvix.is/sdk/react`): the session exchanged for a JWT your
  backend verifies locally. A bound session gets a DPoP-bound one (`tokenType: "DPoP"`,
  `cnf.jkt`): send it as `Authorization: DPoP <jwt>` with `elvixProof(url, { method, token: jwt })`.

### Changed

- **Sessions bind at sign-in.** The call that finishes an in-frame sign-in (email code, username,
  passkey, One Tap) carries a proof with no token in it, and a redirect start (Google, GitHub,
  the hosted passkey page) carries the key's thumbprint as `dpop_jkt` (RFC 9449 §10). elvix binds
  the new session to the key at once, so a token taken before its first call cannot be bound to
  someone else's. The finisher list lives in `elvixFetch` (`SIGN_IN_FINISHERS`), not at the call
  sites, so no method can forget it.

## [0.15.1] — 2026-10-22

### Fixed

- **DPoP: two tabs opened at the same moment now share one key.** On a first visit both tabs
  found no key, both made one, and the last to store it won while each kept signing with its own.
  The session bound to one of them, so the other tab was refused on every call, and after a reload
  so was the first, with no way out but signing in again. The key is now stored with `add`: the
  tab that loses the race takes the stored key. Sessions already bound to a key that was then
  overwritten stay refused until they sign in again (DPoP is on for one app, since 2026-10-22).

## [0.15.0] — 2026-10-21

### Added

- **DPoP: sessions bound to the browser (RFC 9449).** The SDK keeps one P-256 key per browser in
  IndexedDB, created with `extractable: false` so no script can read its private half, and every
  call to elvix that carries the session token also carries a proof signed with it (method, URL,
  the token's hash, elvix's nonce). An app that switches DPoP on in the Console (Sessions) binds
  each session to that key at its first call, and from then on refuses the token alone: a token
  copied out of `localStorage` is useless elsewhere. Browsers without IndexedDB or WebCrypto send
  no proof and stay unbound, never an error. With DPoP off nothing changes. Needs elvix with the
  DPoP proxy (live 2026-10-21): older elvix rejects the `DPoP` header in its CORS preflight.
- **`elvixFetch`**, exported: `fetch` for your own calls to elvix with the session token, adding
  the same proof, so they keep working when your app turns DPoP on.

### Changed

- Every SDK request goes through `elvixFetch` (one place for auth headers, the proof, and elvix's
  nonce, with one retry when elvix answers 401 with a fresher nonce).

## [0.14.7] — 2026-10-21

### Security

- **`@modelcontextprotocol/sdk` 1.32.1** (was 1.31.0), under the `elvix-mcp` server. 1.24 to
  1.31 carry four advisories: bearer authentication accepting tokens issued for another
  service (GHSA-rvq5-wwqv-78pq), one request exhausting memory during validation
  (GHSA-46jr-4wx8-v453), experimental tasks not tied to their session (GHSA-22jm-h49p-29qw),
  and client transports re-sending headers across a cross-origin redirect
  (GHSA-6prh-2h8m-c8cw). Same major; nothing else changes.

## [0.14.6] — 2026-10-21

### Fixed

- **Google and GitHub work on elvix's hosted sign-in page again.** `oauthStartHref` sent a
  `returnUrl` (and `state`) from every `intent="app"` form, including the one elvix renders
  at `/sign-in/<clientId>`. elvix refuses a return URL on its own origin, which no app
  lists, so both buttons answered `403 return_url_not_allowed`. A form on elvix's own
  origin (`baseUrl` same-origin or `""`) now sends neither and completes with the cookie
  session, as elvix expects. Cross-origin forms are unchanged.
- **A passkey sign-in shows the username and restore steps.** The passkey finish answer
  was cut to `redirect` and `token` and treated as done, so a member who still owed a
  username or a restore skipped it and was sent to `/` (the step names `final`, not
  `redirect`). The whole landing now reaches the form, like every other method.

## [0.14.5] — 2026-10-16

### Added

- **`<ElvixLogo>` is exported** (`size`, `withText`, `className`; `ElvixLogoProps`): the
  elvix mark, so a host can show what elvix handles, e.g. a small mark on the rows of its
  own settings that open elvix's editors (name, username, languages, photo). The shield
  is `currentColor`, so it follows the host's text colour in light and dark, and the "e"
  is cut out of it; the accent dot is elvix violet. It reaches screen readers as "elvix".

### Changed

- `<ElvixLogo>`'s root is a `<span>` (was a `<div>`), so the mark is valid inside a
  button or a link. It is `inline-flex` as before; nothing moves.

## [0.14.4] — 2026-10-12

### Added

- **`previewStep` on `<ElvixSignInForm mode="preview">`** (`"username" | "passkey" | "recover"`):
  renders a post-redirect onboarding step inline with demo data, inert (no session,
  no network). For documentation and design tools; ignored in a real sign-in. It
  lets the docs show what `<ElvixOnboarding>` opens on without faking a redirect
  return, which would store a bearer token in the page.

## [0.14.3] — 2026-10-12

### Added

- **`<ElvixOnboarding>`**: the surface for what happens AFTER a redirect sign-in.
  Mount it once in a layout inside `<ElvixProvider>`; it renders nothing until a
  Google / GitHub / hosted-passkey return brings a step (username, passkey,
  recover), then opens itself on that step as a modal or drawer, finishes it in
  place and closes. `steps={["passkey"]}` limits what it offers; closing it means
  "not now". Props: `steps`, `presentation`, `drawerSide`, `width`, `dismissable`,
  `redirectAfterSignIn`, `navigate` (default `false`), `onResult`, `onAuthenticated`.
- **`useElvixOnboarding()`** returns `{ pending, step }` for hosts that build their
  own surface.
- **`resumeOnReturn`** on `<ElvixSignInForm presentation="modal" | "drawer">`
  (default `true`): the form opens itself on a redirect return that carries a step.

### Fixed

- **Google / GitHub sign-in never offered the passkey (or username) step.** A
  redirect reloads the page, so the sign-in modal was closed when the person came
  back; the SDK read the step from the URL and dropped it. Username and email-code
  sign-ins were fine (the modal was open the whole time). The modal now opens on
  the step, on the right pane, and until the step is done the session is NOT
  reported to the host (`useElvixSession()` stays anonymous), so a host that reacts
  to "signed in" does not tear the form down first.

## [0.14.2] — 2026-10-12

### Fixed

- **`<ElvixLifecycleWatcher>` reloaded the page on a cookie session.** Its
  session check calls `/api/v1/session`, which only answers a bearer token. A
  cookie session (elvix's own Console and Account, any same-origin host) has none,
  so the check was always refused and, with the live stream open, that read as
  "the session ended": the page reloaded on every poll (the Account security
  wizard reloaded the moment it asked for an OTP). A session with no token is now
  watched by the live stream alone; a bearer session still ends on a failed check.
  Each refused poll also counted against the per-IP failure limiter on the
  server; they no longer happen.

## [0.14.1] — 2026-10-12

### Fixed

- **A refused passkey says why.** Picking a passkey made for another app, or one
  that lives on the elvix account (which an app sign-in refuses), failed with
  "Something went wrong". `credential_not_for_app` and `credential_not_for_surface`
  now read "This passkey was made for a different app. Sign in another way, then
  add a passkey for this one." in all 15 locales (`tests/passkey-errors.test.ts`
  pins every refusal a person can act on). Pairs with an elvix server fix: an
  account-level passkey that has never been used no longer counts as "you have a
  passkey", so the add-a-passkey step is offered again.

[Unreleased]: https://github.com/021is/elvix-sdk/compare/v0.17.0...HEAD
