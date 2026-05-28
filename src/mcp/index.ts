/**
 * Programmatic entry to the elvix MCP server. The CLI in `bin.ts`
 * thin-wraps this so embedders can run an MCP server in-process if
 * they want (testing, custom transports, multi-server hosts).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const DEFAULT_BASE_URL = "https://elvix.is";

export type ElvixMcpOptions = {
  /** Bearer token used for every tool call. Required. */
  apiKey: string;
  /** Override the elvix origin (testing, proxy). */
  baseUrl?: string;
  /** When false, mutation tools (POST/PATCH/PUT/DELETE) are hidden
   *  from the tool list. Default true. Pass `--readonly`/`--admin`
   *  on the CLI to flip. */
  readonly?: boolean;
};

/**
 * Shape of `https://elvix.is/openapi.roles.json` — a top-level array.
 * Each entry's `endpoint` is a `"METHOD /path"` string (e.g.
 * `"POST /api/v1/verify"`), NOT split into method/path fields.
 */
type RoleManifestEntry = {
  endpoint: string;
  summary?: string;
  role: "api" | "sdk-only";
  adminScope?: boolean;
  system?: boolean;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Split `"POST /api/v1/verify"` → `{ method, path }`. */
function splitEndpoint(endpoint: string): { method: string; path: string } {
  const idx = endpoint.indexOf(" ");
  if (idx === -1) return { method: "GET", path: endpoint };
  return { method: endpoint.slice(0, idx), path: endpoint.slice(idx + 1) };
}

function toolName(method: string, path: string): string {
  return `${method.toLowerCase()}_${path
    .replace(/^\/api\//, "")
    .replace(/[\/{}]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")}`;
}

/**
 * Build (but don't connect) the MCP server. Returns the Server
 * instance + a `connect()` to wire stdio. Lets callers choose
 * transport.
 */
export async function createElvixMcpServer(opts: ElvixMcpOptions): Promise<{
  server: Server;
  connectStdio: () => Promise<void>;
}> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const readonly = opts.readonly ?? true;

  const manifestRes = await fetch(`${baseUrl}/openapi.roles.json`);
  const manifest = (await manifestRes.json()) as RoleManifestEntry[];

  const tools = manifest
    .filter((e) => e.role === "api")
    .map((e) => ({ entry: e, ...splitEndpoint(e.endpoint) }))
    .filter(({ method }) => (readonly ? SAFE_METHODS.has(method.toUpperCase()) : true))
    .map(({ entry, method, path }) => ({
      name: toolName(method, path),
      description: `${entry.summary ?? `${method} ${path}`}${entry.adminScope ? " (requires admin scope)" : ""}`,
      inputSchema: {
        type: "object" as const,
        properties: {
          path: { type: "string", description: "Final URL path (substitute {params})." },
          body: { type: "object", description: "JSON request body, when applicable." },
          query: { type: "object", description: "Query parameters." },
        },
        required: ["path"],
      },
      _meta: { method, path, adminScope: entry.adminScope ?? false },
    }));

  const server = new Server(
    { name: "elvix", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) {
      return { content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }], isError: true };
    }
    const args = (req.params.arguments ?? {}) as {
      path?: string;
      body?: Record<string, unknown>;
      query?: Record<string, string>;
    };
    const url = new URL(args.path ?? tool._meta.path, baseUrl);
    if (args.query) {
      for (const [k, v] of Object.entries(args.query)) url.searchParams.set(k, v);
    }
    const init: RequestInit = {
      method: tool._meta.method,
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        "content-type": "application/json",
      },
    };
    if (args.body && !SAFE_METHODS.has(tool._meta.method.toUpperCase())) {
      init.body = JSON.stringify(args.body);
    }
    const res = await fetch(url, init);
    const text = await res.text();
    return {
      content: [{ type: "text", text }],
      isError: !res.ok,
    };
  });

  return {
    server,
    connectStdio: async () => {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
  };
}
