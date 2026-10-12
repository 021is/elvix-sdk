import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { humanError } from "../src/react/sign-in-copy";

/**
 * A person who picks a passkey and is refused must be told why in words they
 * can act on, not "Something went wrong". These are the refusals elvix's
 * passkey sign-in finish route answers (`/api/auth/passkey/sign-in/finish`)
 * that the person can do something about. `credential_not_for_app` (a passkey
 * made for another app) once fell through to the generic line.
 */
const en = JSON.parse(readFileSync(join(__dirname, "../src/locale/catalogs/en.json"), "utf8")) as {
  namespaces: Record<string, Record<string, { other: string }>>;
};
const t = (key: string) => {
  const [ns, name] = key.split(/\.(.+)/);
  return en.namespaces[ns as string]?.[name as string]?.other ?? `MISSING:${key}`;
};
const generic = humanError(t, "something_unmapped");

describe("passkey sign-in refusals read as something the person can act on", () => {
  it.each([
    "unknown_credential",
    "verify_failed",
    "not_verified",
    "challenge_invalid",
    "credential_not_for_app",
    "credential_not_for_surface",
    "user_deleted",
    "user_paused",
    "user_banned",
    "method_disabled",
  ])("%s", (code) => {
    const text = humanError(t, code);
    expect(text).not.toBe(generic);
    expect(text).not.toMatch(/^MISSING/);
  });

  it("a passkey for another app says so and names the way out", () => {
    expect(humanError(t, "credential_not_for_app")).toMatch(/different app/i);
    expect(humanError(t, "credential_not_for_app")).toMatch(/sign in another way/i);
  });
});
