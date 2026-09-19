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
import { defaultsFor } from "../../src/react/regions";

export const BASE = "https://elvix.test";
export const CLIENT_ID = "elvix_pub_test_abc";
/** The code the fake's membership challenges accept. */
export const VALID_CODE = "424242";

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
  sessions: { id: string; isCurrent: boolean; [k: string]: unknown }[];
  addresses: { id: string; kind: string; isDefault: boolean; [k: string]: unknown }[];
  entities: { id: string; kind?: string; isDefault: boolean; [k: string]: unknown }[];
  languages: { id: string; code: string; level: string }[];
  /** `null` = the user has not set a region yet. */
  region: Record<string, unknown> | null;
  passkeys: { id: string; [k: string]: unknown }[];
};

export const json = (body: unknown, status = 200) =>
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

/** A region record with the country's cascaded defaults. */
export function regionFor(country: string) {
  return {
    id: "reg_1",
    country,
    ...defaultsFor(country),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
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

export type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
export type Route = [method: string, test: (url: string) => boolean, handler: Handler];

const idParam = (url: string) => new URL(url).searchParams.get("id");

/** The profile editors' endpoints: addresses, legal entities, languages,
 *  region, plus app passkeys and the membership challenge. Writes are
 *  recorded in `patches` in order. */
function profileRoutes(state: FakeElvixState, patches: unknown[]): Route[] {
  const bodyOf = (init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    patches.push(body);
    return body;
  };

  /** A `profileCollection` resource: list under its own key, writes by `?id=`.
   *  The address list is filtered by `?kind=`, as the server does. */
  const collection =
    (key: "addresses" | "entities"): Handler =>
    (url, init) => {
      const method = init?.method ?? "GET";
      const id = idParam(url);
      if (method === "GET") {
        const kind = new URL(url).searchParams.get("kind");
        const list = state[key].filter((row) => !kind || row.kind === kind);
        return json({ success: true, data: { ok: true, [key]: list } });
      }
      if (method === "DELETE") {
        state[key] = state[key].filter((row) => row.id !== id) as never;
      } else if (method === "POST") {
        state[key].push({ ...bodyOf(init), id: `${key}_${state[key].length + 1}` } as never);
      } else {
        Object.assign(state[key].find((row) => row.id === id) ?? {}, bodyOf(init));
      }
      return json({ success: true, data: { ok: true } });
    };

  const languages: Handler = (url, init) => {
    const method = init?.method ?? "GET";
    const id = idParam(url);
    if (method === "DELETE") {
      state.languages = state.languages.filter((l) => l.id !== id);
    } else if (method === "POST") {
      const { code, level } = bodyOf(init) as { code: string; level: string };
      state.languages.push({ id: `lang_${code}`, code, level });
    } else if (method === "PATCH") {
      Object.assign(state.languages.find((l) => l.id === id) ?? {}, bodyOf(init));
    }
    return json({ success: true, data: { languages: state.languages } });
  };

  // PUT sets a country and cascades its defaults, as the server does.
  const region: Handler = (_url, init) => {
    const method = init?.method ?? "GET";
    if (method === "PUT") state.region = regionFor(String(bodyOf(init).country));
    if (method === "PATCH") {
      state.region = { ...(state.region ?? regionFor("DE")), ...bodyOf(init) };
    }
    return json({ success: true, data: { region: state.region } });
  };

  // The emailed code is always VALID_CODE; anything else costs an attempt.
  let attemptsLeft = 3;
  const challenge: Handler = () =>
    json({
      success: true,
      data: { ok: true, challengeId: "ch_1", deliveredTo: "a***@example.test" },
    });
  const membership: Handler = (_url, init) => {
    const body = bodyOf(init) as { action: string; code?: string };
    if (body.code !== undefined && body.code !== VALID_CODE) {
      attemptsLeft -= 1;
      return json({ success: true, data: { ok: false, error: "wrong_code", attemptsLeft } }, 400);
    }
    return json({ success: true, data: { ok: true } });
  };

  const passkeys: Handler = (url, init) => {
    if (init?.method === "DELETE") {
      const id = new URL(url).searchParams.get("passkeyId");
      state.passkeys = state.passkeys.filter((p) => p.id !== id);
      return json({ success: true, data: { ok: true } });
    }
    return json({ success: true, data: { ok: true, passkeys: state.passkeys } });
  };

  return [
    ["*", (u) => /\/api\/account\/apps\/[^/]+\/passkeys/.test(u), passkeys],
    ["POST", (u) => u.endsWith("/membership/challenge"), challenge],
    ["POST", (u) => u.endsWith("/membership"), membership],
    ["*", (u) => u.includes("/api/account/profile/addresses"), collection("addresses")],
    ["*", (u) => u.includes("/api/account/profile/entities"), collection("entities")],
    ["*", (u) => u.includes("/api/account/profile/languages"), languages],
    ["*", (u) => u.includes("/api/account/profile/region"), region],
  ];
}

/** `extra` routes are tried first, for endpoints one test file owns. */
export function installFakeElvix(initial: Partial<FakeElvixState> = {}, extra: Route[] = []) {
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
    sessions: [],
    addresses: [],
    entities: [],
    languages: [],
    region: null,
    passkeys: [],
    ...initial,
  };
  const held: (() => void)[] = [];
  const patches: unknown[] = [];
  const MEDIA = /\/public\/api\/users\/([^/]+)\/media-meta/;

  const sdkContext: Handler = async () => {
    if (state.holdContext) await new Promise<void>((resolve) => held.push(resolve));
    return state.context
      ? json({ success: true, data: state.context })
      : json({ success: false, errorMessage: "unauthenticated" }, 401);
  };
  const mediaMeta: Handler = (url) => {
    const m = state.media[decodeURIComponent(MEDIA.exec(url)?.[1] ?? "")];
    return json({
      ok: true,
      slug: m?.slug ?? "elvix-account",
      avatar: m?.avatar ?? { sizes: [], updatedAt: null, googleUrl: null },
      banner: m?.banner ?? { sizes: [], updatedAt: null },
    });
  };
  const identity: Handler = (_url, init) => {
    if (init?.method !== "PATCH") {
      return json({ success: true, data: { ok: true, identity: state.identity } });
    }
    const patch = JSON.parse(String(init.body)) as Record<string, unknown>;
    patches.push(patch);
    Object.assign(state.identity, patch);
    return json({ success: true, data: null });
  };
  const avatarUpload: Handler = () =>
    json({
      success: true,
      data: { avatarSizes: [128, 256], avatarUpdatedAt: new Date().toISOString() },
    });

  const revokeOne: Handler = (url) => {
    const id = /\/sessions\/([^/]+)\/revoke$/.exec(url)?.[1];
    state.sessions = state.sessions.filter((s) => s.id !== id);
    return json({ success: true, data: { ok: true } });
  };
  const revokeAll: Handler = () => {
    const ended = state.sessions.filter((s) => !s.isCurrent).length;
    state.sessions = state.sessions.filter((s) => s.isCurrent);
    return json({ success: true, data: { ok: true, ended } });
  };

  // First match wins: [method or "*", url test, handler].
  const routes: Route[] = [
    ...extra,
    [
      "*",
      (u) => u.includes("/api/v1/bootstrap/"),
      () => json({ success: true, data: state.bootstrap }),
    ],
    ["*", (u) => u.includes("/sdk-context"), sdkContext],
    ["*", (u) => MEDIA.test(u), mediaMeta],
    ["*", (u) => u.endsWith("/api/account/profile/identity"), identity],
    ...profileRoutes(state, patches),
    ["PUT", (u) => u.endsWith("/api/account/self/images/avatar"), avatarUpload],
    ["POST", (u) => u.endsWith("/revoke-all"), revokeAll],
    ["POST", (u) => /\/sessions\/[^/]+\/revoke$/.test(u), revokeOne],
    [
      "GET",
      (u) => u.endsWith("/sessions"),
      () => json({ success: true, data: { ok: true, sessions: state.sessions } }),
    ],
  ];

  const route = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const hit = routes.find(([m, test]) => (m === "*" || m === method) && test(url));
    return hit
      ? hit[2](url, init)
      : json({ success: false, errorMessage: `unrouted ${method} ${url}` }, 404);
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
