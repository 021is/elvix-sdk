/**
 * An in-memory elvix for component tests: routes `fetch` by URL to the four
 * endpoints the SDK's identity surfaces call, with state the test controls.
 *
 * It answers the way the real server does where that matters. In particular,
 * media-meta for an id it has never heard of returns `ok: true` with EMPTY
 * sizes (elvix does not 404 there) — which is exactly what the pre-0.12
 * `<ElvixAvatar>` seeded from when it asked about `"preview-user"` before the
 * session arrived.
 */
import { vi } from "vitest";

export const BASE = "https://elvix.test";
export const CLIENT_ID = "elvix_pub_test_abc";

type Media = {
  slug: string;
  avatar: { sizes: number[]; updatedAt: number | null; googleUrl: string | null };
  banner: { sizes: number[]; updatedAt: number | null };
};

export type FakeElvixState = {
  bootstrap: Record<string, unknown>;
  /** `null` = no session (401). */
  context: Record<string, unknown> | null;
  media: Record<string, Media>;
  identity: Record<string, unknown>;
  /** Set to hold the next sdk-context response until `release()` is called. */
  holdContext: boolean;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export function sampleContext(userId = "usr_1", overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: userId,
      name: "Ada Lovelace",
      email: "ada@example.test",
      avatarUrl: null,
      givenName: "Ada",
      familyName: "Lovelace",
      pronouns: null,
      languages: [],
      ...overrides,
    },
    // The per-app meta: empty since the photo was centralized (0.10).
    membership: {
      username: "ada",
      status: "active",
      inactiveAt: null,
      inactivatedBy: null,
      deletedAt: null,
      deletedBy: null,
      avatarSizes: [],
      avatarUpdatedAt: new Date(0).toISOString(),
      bannerSizes: [],
      bannerUpdatedAt: new Date(0).toISOString(),
    },
  };
}

export function photo(updatedAt: number): Media {
  return {
    slug: "elvix-account",
    avatar: { sizes: [128, 256], updatedAt, googleUrl: null },
    banner: { sizes: [], updatedAt: null },
  };
}

/** jsdom ships no `matchMedia`; the provider reads the system scheme from it. */
export function stubColorScheme(scheme: "light" | "dark") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("dark") && scheme === "dark",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

export function installFakeElvix(initial: Partial<FakeElvixState> = {}) {
  const state: FakeElvixState = {
    bootstrap: {
      applicationId: "app_1",
      clientId: CLIENT_ID,
      urlSlug: "acme",
      appName: "Acme",
      brandColor: "#112233",
      brandColorDark: "#ddeeff",
      onBrandColor: "#ffffff",
      onBrandColorDark: "#000000",
      theme: "light",
    },
    context: sampleContext(),
    media: {},
    identity: {},
    holdContext: false,
    ...initial,
  };
  const held: (() => void)[] = [];
  const patches: unknown[] = [];

  const route = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    if (url.includes("/api/v1/bootstrap/")) return json({ success: true, data: state.bootstrap });
    if (url.includes("/sdk-context")) {
      if (state.holdContext) await new Promise<void>((resolve) => held.push(resolve));
      return state.context
        ? json({ success: true, data: state.context })
        : json({ success: false, errorMessage: "unauthenticated" }, 401);
    }
    const media = /\/public\/api\/users\/([^/]+)\/media-meta/.exec(url);
    if (media) {
      const m = state.media[decodeURIComponent(media[1] ?? "")];
      return json({
        ok: true,
        slug: m?.slug ?? "elvix-account",
        avatar: m?.avatar ?? { sizes: [], updatedAt: null, googleUrl: null },
        banner: m?.banner ?? { sizes: [], updatedAt: null },
      });
    }
    if (url.endsWith("/api/account/profile/identity")) {
      if (method === "PATCH") {
        const patch = JSON.parse(String(init?.body)) as Record<string, unknown>;
        patches.push(patch);
        Object.assign(state.identity, patch);
        return json({ success: true, data: null });
      }
      return json({ success: true, data: { ok: true, identity: state.identity } });
    }
    if (url.endsWith("/api/account/self/images/avatar") && method === "PUT") {
      const updatedAt = Date.now();
      return json({
        success: true,
        data: { avatarSizes: [128, 256], avatarUpdatedAt: new Date(updatedAt).toISOString() },
      });
    }
    return json({ success: false, errorMessage: `unrouted ${method} ${url}` }, 404);
  };

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    route(String(input), init),
  );
  vi.stubGlobal("fetch", fetchMock);
  stubColorScheme("light");

  return {
    state,
    fetchMock,
    patches,
    /** Let every held sdk-context response through. */
    release() {
      state.holdContext = false;
      for (const resolve of held.splice(0)) resolve();
    },
    calls(fragment: string) {
      return fetchMock.mock.calls.filter(([u]) => String(u).includes(fragment)).length;
    },
  };
}
