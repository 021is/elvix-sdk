/**
 * `getElvixLegalEntity` (0.18): a backend reads the entity a user picked, by
 * id, with the app's API key, and never throws.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixWebhookEventType, getElvixLegalEntity } from "../src/server";

afterEach(() => vi.unstubAllGlobals());

const args = {
  apiKey: "elvix_sk_test",
  applicationId: "app_1",
  userId: "usr 1",
  entityId: "le/1",
  baseUrl: "https://elvix.test",
};

function stubFetch(answer: () => Promise<Response>) {
  const fetchMock = vi.fn(answer);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("getElvixLegalEntity", () => {
  it("GETs the entity with the API key, ids encoded, and unwraps the envelope", async () => {
    const entity = { id: "le/1", legalName: "Grei Events GmbH", vatIdValidation: "live" };
    const fetchMock = stubFetch(async () =>
      Response.json({ success: true, data: { entity } }, { status: 200 }),
    );
    const out = await getElvixLegalEntity(args);
    expect(out).toEqual({ ok: true, entity });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://elvix.test/api/applications/app_1/users/usr%201/legal-entities/le%2F1",
    );
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer elvix_sk_test");
    expect(init.redirect).toBe("error");
  });

  it.each([
    [404, "not_found"],
    [401, "unauthorized"],
    [403, "unauthorized"],
    [500, "http_500"],
  ])("answers %i as %s", async (status, error) => {
    stubFetch(async () => Response.json({ success: false }, { status }));
    expect(await getElvixLegalEntity(args)).toEqual({ ok: false, error });
  });

  it("answers a network failure as network, without throwing", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await getElvixLegalEntity(args)).toEqual({ ok: false, error: "network" });
  });
});

describe("legal-entity webhooks", () => {
  it("names the three events", () => {
    expect(ElvixWebhookEventType.USER_LEGAL_ENTITY_UPDATED).toBe("user.legal_entity_updated");
    expect(ElvixWebhookEventType.USER_LEGAL_ENTITY_DELETED).toBe("user.legal_entity_deleted");
    expect(ElvixWebhookEventType.USER_LEGAL_ENTITY_REVOKED).toBe("user.legal_entity_revoked");
  });
});
