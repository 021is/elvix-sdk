/**
 * Which sessions a host sees.
 *
 * ⚠ The regression this pins: `<ElvixSessions>` without `appId` used to select
 * the ACCOUNT surface. A customer app's embedded user authenticates with an app
 * bearer, which cannot read that surface, so the request succeeded and returned
 * nothing — a component that rendered correctly and listed zero sessions, with
 * no error anywhere to explain it. The SDK docs called it out as a "common past
 * mistake", which means it had already cost someone a debugging session.
 *
 * A customer app always wants its own sessions. Deriving that from the provider
 * makes the wrong thing unreachable rather than merely documented.
 */
import { describe, expect, it } from "vitest";

import { resolveSessionsAppId, sessionsBasePath } from "../src/react/elvix-sessions";

describe("sessions scope", () => {
  it("defaults to the provider's app so a customer app cannot get an empty list", () => {
    const appId = resolveSessionsAppId(undefined, "elvix_pub_test_danceclub");
    expect(appId).toBe("elvix_pub_test_danceclub");
    expect(sessionsBasePath(appId)).toBe("/api/account/apps/elvix_pub_test_danceclub/sessions");
  });

  it("lets an explicit appId win over the provider", () => {
    expect(resolveSessionsAppId("explicit_app", "provider_app")).toBe("explicit_app");
  });

  it("still selects the global account surface for elvix's own first-party pages", () => {
    // elvix's account pages mount <ElvixProvider> with no clientId. That is the
    // ONLY case that should reach the account-wide list, and it must keep
    // working — it is the user's global security screen.
    const appId = resolveSessionsAppId(undefined, undefined);
    expect(appId).toBeUndefined();
    expect(sessionsBasePath(appId)).toBe("/api/account/sessions");
  });

  it("encodes an app id that would otherwise break the path", () => {
    expect(sessionsBasePath("a/b?c")).toBe("/api/account/apps/a%2Fb%3Fc/sessions");
  });
});
