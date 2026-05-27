# Security policy

elvix is an identity provider. Auth flaws matter. We take every report seriously.

## Reporting a vulnerability

**Do not open a public GitHub issue for a security report.** Instead:

- Email: **security@elvix.is**
- Subject line: `[SECURITY] <short summary>`
- PGP optional, public key fingerprint: forthcoming (`security-pubkey.asc` will be added before v1.0).

Include if possible:
- A clear description of the vulnerability and its impact.
- Steps to reproduce (proof-of-concept code, request transcripts, screenshots).
- Affected version(s) — both `@elvix.is/sdk` and the elvix.is REST API surface.
- Your name + contact for credit (optional).

We acknowledge every report within **48 hours** and ship a triage decision within **5 business days**.

## Scope

In scope:
- `@elvix.is/sdk` package on npm (every version).
- The elvix.is REST API (`https://elvix.is/api/v1/*`, `/api/auth/*`, `/api/account/*`, `/api/console/*`).
- The hosted sign-in surface (`https://elvix.is/sign-in/*`).
- The MCP server bundled with the SDK.

Out of scope:
- Denial-of-service via expensive but legitimate API usage (we already rate-limit; reports of "I sent 10,000 requests and elvix slowed down" are not bugs).
- Reports requiring access to the customer's API key, session cookies, or device.
- Social engineering of edvone.
- Issues in transitive dependencies that we have already patched upstream.
- Anything affecting only end-of-life versions (we maintain the latest minor of each major).

## Disclosure timeline

We follow coordinated disclosure:

1. **Day 0** — report received, acknowledged.
2. **Day 1-5** — triage, severity classification.
3. **Day 5-30** — fix developed, tested, deployed to elvix.is, and shipped in a patch release.
4. **Day 30-90** — public advisory via GitHub Security Advisories. Reporter credited unless they opt out.

For criticals (RCE, auth bypass, key disclosure) we hot-patch the SaaS surface within 24 hours and ship the SDK patch within 72 hours.

## Safe harbour

Security research conducted in good faith, against your own elvix workspace, will not be pursued legally. Specifically:

- Do **not** access, modify, or exfiltrate other customers' data.
- Do **not** publish details before our coordinated-disclosure window closes.
- Do **not** test on production traffic beyond what's needed to demonstrate the issue.

Within those limits: dig in. We appreciate it.

## Hall of fame

Researchers who report valid issues get a public mention here (with their permission) once the advisory ships.

_None yet — be the first._

## Out-of-cycle disclosures

If you believe the issue is being actively exploited in the wild and our coordinated-disclosure window is too slow, write to security@elvix.is with `[ACTIVE EXPLOITATION]` in the subject. We will respond within 4 hours and treat it as P0.

---

Operator: **edvone** (Aachen, Germany).
Last updated: 2026-05-27.
