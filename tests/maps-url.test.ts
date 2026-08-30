/**
 * The maps proxy fronts a metered Google API on elvix's key, so every call
 * must name the application that is spending. These tests pin that the SDK
 * never builds a maps URL without a clientId — a request that omits one is
 * refused by the backend, and building it anyway turns a clear configuration
 * mistake into an opaque "http 403".
 */
import { describe, expect, it } from "vitest";

import { MAPS_MISSING_CLIENT_ID, mapsUrl } from "../src/react/maps-url";

const CTX = { baseUrl: "https://elvix.is", clientId: "client_abc" };

describe("mapsUrl", () => {
  it("builds an autocomplete URL carrying the clientId", () => {
    const url = mapsUrl(CTX, "autocomplete", { q: "Berlin", session: "sess_1" });
    expect(url).toBe(
      "https://elvix.is/public/api/maps/autocomplete?q=Berlin&session=sess_1&clientId=client_abc",
    );
  });

  it("builds a place-details URL carrying the clientId", () => {
    const url = mapsUrl(CTX, "place-details", { placeId: "p_1", session: "sess_1" });
    expect(url).toBe(
      "https://elvix.is/public/api/maps/place-details?placeId=p_1&session=sess_1&clientId=client_abc",
    );
  });

  it("returns null when the provider has no clientId, instead of a doomed URL", () => {
    expect(mapsUrl({ ...CTX, clientId: undefined }, "autocomplete", { q: "a" })).toBeNull();
    expect(mapsUrl({ ...CTX, clientId: "" }, "autocomplete", { q: "a" })).toBeNull();
  });

  it("percent-encodes every parameter, including the clientId", () => {
    const url = mapsUrl({ baseUrl: "https://elvix.is", clientId: "a b&c" }, "autocomplete", {
      q: "Jülicher Str. 72, Aachen",
      session: "s/1",
    });
    expect(url).toContain("clientId=a+b%26c");
    expect(url).toContain("J%C3%BClicher+Str.+72%2C+Aachen");
    expect(url).toContain("session=s%2F1");
  });

  it("cannot be talked into another origin through a parameter", () => {
    const url = mapsUrl(CTX, "autocomplete", { q: "https://evil.example/#" });
    expect(url?.startsWith("https://elvix.is/public/api/maps/autocomplete?")).toBe(true);
    expect(new URL(url as string).origin).toBe("https://elvix.is");
  });

  it("respects a same-origin baseUrl", () => {
    const url = mapsUrl({ baseUrl: "", clientId: "client_abc" }, "autocomplete", { q: "a" });
    expect(url).toBe("/public/api/maps/autocomplete?q=a&clientId=client_abc");
  });

  it("exports a stable error key for components to surface", () => {
    expect(MAPS_MISSING_CLIENT_ID).toBe("missing_client_id");
  });
});
