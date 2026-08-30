/**
 * MCP server tests.
 *
 * Two jobs here:
 *
 *  1. Pin the manifest contract. `openapi.roles.json` is a TOP-LEVEL ARRAY
 *     of { endpoint: "METHOD /path", role, adminScope, summary }, so the
 *     parser can't silently regress to expecting { endpoints: [...] }.
 *  2. Pin the security boundary. The server attaches a live elvix API key
 *     to every call, so no tool argument may steer the destination. These
 *     are regression tests for the 0.10.2 advisory (a caller-supplied
 *     absolute `path` hijacked the request and leaked the bearer).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createElvixMcpServer, fillPath, resolveOrigin } from "../src/mcp/index";

const ORIG_FETCH = globalThis.fetch;

const SAMPLE_MANIFEST = [
  { endpoint: "GET /api/v1/users/{id}", summary: "Read a user", role: "api", adminScope: false },
  { endpoint: "GET /api/v1/apps", summary: "List apps", role: "api", adminScope: false },
  { endpoint: "POST /api/v1/users", summary: "Create a user", role: "api", adminScope: true },
  {
    endpoint: "DELETE /api/v1/users/{id}",
    summary: "Delete a user",
    role: "api",
    adminScope: true,
  },
  { endpoint: "GET /api/account/profile", summary: "SDK-only", role: "sdk-only" },
];

type FetchCall = { url: string; init?: RequestInit };
let calls: FetchCall[] = [];

/** Response stub good enough for the code under test (ok/status/type/headers/json/text). */
function stubResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    type: "default",
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

/** Route the manifest fetch; every other call is a tool call the test inspects. */
function mockFetch(toolResponse: () => Response = () => stubResponse({ ok: true })): void {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/openapi.roles.json")) return stubResponse(SAMPLE_MANIFEST);
    return toolResponse();
  }) as unknown as typeof fetch;
}

async function connectedClient(opts: { readonly?: boolean } = {}): Promise<Client> {
  const { server } = await createElvixMcpServer({
    apiKey: "eak_test",
    baseUrl: "https://elvix.is",
    readonly: opts.readonly ?? true,
  });
  const client = new Client({ name: "test", version: "0" }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/** Tool calls only — drops the startup manifest fetch. */
function toolCalls(): FetchCall[] {
  return calls.filter((c) => !c.url.endsWith("/openapi.roles.json"));
}

beforeEach(() => {
  calls = [];
  mockFetch();
});

afterEach(() => {
  globalThis.fetch = ORIG_FETCH;
});

describe("resolveOrigin", () => {
  it("accepts https", () => {
    expect(resolveOrigin("https://elvix.is").origin).toBe("https://elvix.is");
  });

  it("accepts http on loopback, for local elvix testing", () => {
    expect(resolveOrigin("http://localhost:4400").origin).toBe("http://localhost:4400");
    expect(resolveOrigin("http://127.0.0.1:4400").origin).toBe("http://127.0.0.1:4400");
  });

  it("rejects plaintext http to a remote host — the bearer would ride in clear", () => {
    expect(() => resolveOrigin("http://elvix.is")).toThrow(/must be https/);
  });

  it("rejects a non-URL", () => {
    expect(() => resolveOrigin("not a url")).toThrow(/not a valid URL/);
  });
});

describe("fillPath", () => {
  it("substitutes and percent-encodes", () => {
    expect(fillPath("/api/v1/users/{id}", { id: "a b/c" })).toBe("/api/v1/users/a%20b%2Fc");
  });

  it("rejects a missing parameter instead of emitting a literal placeholder", () => {
    expect(() => fillPath("/api/v1/users/{id}", {})).toThrow(/Missing path parameter/);
  });

  it("rejects dot segments that would climb during URL normalisation", () => {
    expect(() => fillPath("/api/v1/users/{id}", { id: ".." })).toThrow(/Invalid path parameter/);
  });

  it("leaves a template with no placeholders alone", () => {
    expect(fillPath("/api/v1/apps", {})).toBe("/api/v1/apps");
  });
});

describe("manifest handling", () => {
  it("fetches /openapi.roles.json from the configured baseUrl", async () => {
    await createElvixMcpServer({ apiKey: "eak_test", baseUrl: "https://staging.elvix.is" });
    expect(calls[0]?.url).toBe("https://staging.elvix.is/openapi.roles.json");
  });

  it("throws a named error when the manifest is unreachable", async () => {
    globalThis.fetch = vi.fn(async () =>
      stubResponse("nope", { status: 503 }),
    ) as unknown as typeof fetch;
    await expect(createElvixMcpServer({ apiKey: "eak_test" })).rejects.toThrow(/could not read/);
  });

  it("throws when the manifest is not a top-level array", async () => {
    globalThis.fetch = vi.fn(async () =>
      stubResponse({ endpoints: [] }),
    ) as unknown as typeof fetch;
    await expect(createElvixMcpServer({ apiKey: "eak_test" })).rejects.toThrow(/top-level array/);
  });
});

describe("tool list", () => {
  it("exposes only safe methods in read-only mode", async () => {
    const client = await connectedClient({ readonly: true });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(["get_v1_users_id", "get_v1_apps"]);
  });

  it("exposes mutations in admin mode, and never sdk-only endpoints", async () => {
    const client = await connectedClient({ readonly: false });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("post_v1_users");
    expect(names).toContain("delete_v1_users_id");
    expect(names).not.toContain("get_account_profile");
  });

  it("advertises no free-form path input — only the template's placeholders", async () => {
    const client = await connectedClient();
    const tools = (await client.listTools()).tools;
    const withParam = tools.find((t) => t.name === "get_v1_users_id");
    const withoutParam = tools.find((t) => t.name === "get_v1_apps");
    if (!withParam || !withoutParam) throw new Error("expected both tools in the list");
    const properties = withParam.inputSchema.properties as Record<string, { required?: string[] }>;
    expect(properties).not.toHaveProperty("path");
    expect(withParam.inputSchema.required).toEqual(["params"]);
    expect(properties.params.required).toEqual(["id"]);
    expect(withoutParam.inputSchema.properties).not.toHaveProperty("params");
  });
});

describe("tool calls stay on the configured origin", () => {
  it("builds the URL from the template and sends the bearer to elvix", async () => {
    const client = await connectedClient();
    await client.callTool({ name: "get_v1_users_id", arguments: { params: { id: "usr_1" } } });
    const call = toolCalls()[0];
    expect(call?.url).toBe("https://elvix.is/api/v1/users/usr_1");
    const headers = call?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer eak_test");
  });

  it("ignores a legacy absolute `path` argument — the 0.10.2 advisory", async () => {
    const client = await connectedClient();
    await client.callTool({
      name: "get_v1_users_id",
      arguments: { path: "http://127.0.0.1:8888/", params: { id: "usr_1" }, body: {}, query: {} },
    });
    expect(toolCalls().map((c) => c.url)).toEqual(["https://elvix.is/api/v1/users/usr_1"]);
  });

  it("makes no request at all when a hostile path is the only argument", async () => {
    const client = await connectedClient();
    const res = await client.callTool({
      name: "get_v1_users_id",
      arguments: { path: "http://127.0.0.1:8888/" },
    });
    expect(res.isError).toBe(true);
    expect(toolCalls()).toHaveLength(0);
  });

  it("appends query parameters without letting them alter the origin", async () => {
    const client = await connectedClient();
    await client.callTool({
      name: "get_v1_apps",
      arguments: { query: { limit: "10", q: "a b" } },
    });
    expect(toolCalls()[0]?.url).toBe("https://elvix.is/api/v1/apps?limit=10&q=a+b");
  });

  it("refuses to follow a redirect rather than re-sending the bearer", async () => {
    mockFetch(() =>
      stubResponse("", { status: 302, headers: { location: "http://127.0.0.1:8888/" } }),
    );
    const client = await connectedClient();
    const res = await client.callTool({ name: "get_v1_apps", arguments: {} });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("Not followed");
    expect(toolCalls()).toHaveLength(1);
  });

  it("reports an unknown tool without calling anything", async () => {
    const client = await connectedClient();
    const res = await client.callTool({ name: "get_nope", arguments: {} }).catch((e) => e);
    expect(JSON.stringify(res)).toMatch(/nope/i);
    expect(toolCalls()).toHaveLength(0);
  });
});
