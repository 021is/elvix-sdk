/**
 * Programmatic entry to the elvix MCP server. The CLI in `bin.ts`
 * thin-wraps this so embedders can run an MCP server in-process if
 * they want (testing, custom transports, multi-server hosts).
 *
 * Security model — read this before touching the request path.
 * The server holds a live elvix API key and attaches it as a bearer to
 * every call, so **the destination of a request is a security boundary**.
 * Tool arguments are attacker-reachable in practice: the caller is an LLM
 * whose context routinely contains untrusted text (web pages, issue
 * bodies, repo files), so a prompt injection is a tool call with hostile
 * arguments. Therefore:
 *
 *   - Path structure comes ONLY from the manifest template. Callers fill
 *     `{placeholders}`; they never supply a path, an origin, or a scheme.
 *   - The resolved URL is re-checked against the configured origin.
 *   - Redirects are never followed — a 3xx would re-send the bearer to
 *     whatever host it names.
 *
 * Fixed in 0.10.2: a free-form `path` argument that an absolute URL could
 * hijack, sending the API key to an arbitrary host. Reported privately
 * 2026-08-27 by Xunhang He.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const DEFAULT_BASE_URL = "https://elvix.is";
/** Ceiling on any single elvix call, so a hung request can't wedge the agent. */
const REQUEST_TIMEOUT_MS = 30_000;

export type ElvixMcpOptions = {
  /** Bearer token used for every tool call. Required. */
  apiKey: string;
  /** Override the elvix origin (testing, proxy). Must be https, or http on loopback. */
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

type ElvixTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  _meta: { method: string; path: string; adminScope: boolean };
};

type ToolArgs = {
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
};

type ToolResult = { content: { type: "text"; text: string }[]; isError: boolean };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PATH_PARAM_RE = /\{([^}]+)\}/g;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Split `"POST /api/v1/verify"` → `{ method, path }`. */
function splitEndpoint(endpoint: string): { method: string; path: string } {
  const idx = endpoint.indexOf(" ");
  if (idx === -1) return { method: "GET", path: endpoint };
  return { method: endpoint.slice(0, idx), path: endpoint.slice(idx + 1) };
}

function toolName(method: string, path: string): string {
  return `${method.toLowerCase()}_${path
    .replace(/^\/api\//, "")
    .replace(/[/{}]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")}`;
}

function textResult(text: string, isError: boolean): ToolResult {
  return { content: [{ type: "text", text }], isError };
}

/**
 * The configured origin is where a live API key gets sent, so it is
 * validated once at startup rather than trusted. Plaintext http would
 * put the bearer on the wire in clear; loopback is exempted because
 * that is how the server is tested against a local elvix.
 */
export function resolveOrigin(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`elvix MCP: baseUrl is not a valid URL: ${baseUrl}`);
  }
  const isLoopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol === "https:" || (url.protocol === "http:" && isLoopback)) return url;
  throw new Error(
    `elvix MCP: baseUrl must be https (http allowed on loopback only); got ${url.protocol}//${url.host}`,
  );
}

function pathParamNames(path: string): string[] {
  return Array.from(path.matchAll(PATH_PARAM_RE), (m) => m[1] as string);
}

/**
 * Substitute `{name}` placeholders in a manifest template with
 * percent-encoded caller values. The template is the only source of path
 * structure: a caller fills segments, it never invents them. `.` and `..`
 * are rejected because they survive percent-encoding and would let a
 * value climb a segment during URL normalisation.
 */
export function fillPath(template: string, params: Record<string, unknown>): string {
  return template.replace(PATH_PARAM_RE, (_match, name: string) => {
    const raw = params[name];
    if (typeof raw !== "string" || raw === "") {
      throw new Error(`Missing path parameter "${name}" for ${template}`);
    }
    if (raw === "." || raw === "..") {
      throw new Error(`Invalid path parameter "${name}": ${raw}`);
    }
    return encodeURIComponent(raw);
  });
}

function buildInputSchema(path: string): Record<string, unknown> {
  const names = pathParamNames(path);
  const properties: Record<string, unknown> = {
    body: { type: "object", description: "JSON request body, when applicable." },
    query: { type: "object", description: "Query parameters." },
  };
  if (names.length > 0) {
    properties.params = {
      type: "object",
      description: `Values for the {placeholders} in ${path}.`,
      properties: Object.fromEntries(names.map((n) => [n, { type: "string" }])),
      required: names,
      additionalProperties: false,
    };
  }
  return {
    type: "object" as const,
    properties,
    ...(names.length > 0 ? { required: ["params"] } : {}),
  };
}

function buildTools(manifest: RoleManifestEntry[], readonly: boolean): ElvixTool[] {
  return manifest
    .filter((e) => e.role === "api")
    .map((e) => ({ entry: e, ...splitEndpoint(e.endpoint) }))
    .filter(({ method }) => (readonly ? SAFE_METHODS.has(method.toUpperCase()) : true))
    .map(({ entry, method, path }) => ({
      name: toolName(method, path),
      description: `${entry.summary ?? `${method} ${path}`}${entry.adminScope ? " (requires admin scope)" : ""} — calls ${method} ${path} on the configured elvix origin.`,
      inputSchema: buildInputSchema(path),
      _meta: { method, path, adminScope: entry.adminScope ?? false },
    }));
}

async function fetchManifest(origin: URL): Promise<RoleManifestEntry[]> {
  const res = await fetch(new URL("/openapi.roles.json", origin), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `elvix MCP: could not read ${origin.origin}/openapi.roles.json (${res.status})`,
    );
  }
  const manifest: unknown = await res.json();
  if (!Array.isArray(manifest)) {
    throw new Error("elvix MCP: openapi.roles.json must be a top-level array of endpoint entries.");
  }
  return manifest as RoleManifestEntry[];
}

async function callTool(
  tool: ElvixTool,
  args: ToolArgs,
  ctx: { origin: URL; apiKey: string },
): Promise<ToolResult> {
  const url = new URL(fillPath(tool._meta.path, args.params ?? {}), ctx.origin);
  // Unreachable while the path comes from the manifest — kept because the
  // bearer below is what a stray origin walks away with, and this is the
  // line that fails loudly if caller-controlled path input ever returns.
  if (url.origin !== ctx.origin.origin) {
    return textResult(`Refusing to call ${url.origin}: outside the configured elvix origin.`, true);
  }
  for (const [key, value] of Object.entries(args.query ?? {})) {
    url.searchParams.set(key, String(value));
  }
  const method = tool._meta.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers: {
      authorization: `Bearer ${ctx.apiKey}`,
      "content-type": "application/json",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
  if (args.body && !SAFE_METHODS.has(method)) {
    init.body = JSON.stringify(args.body);
  }
  const res = await fetch(url, init);
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    const target = res.headers.get("location") ?? "an undisclosed target";
    return textResult(
      `elvix answered ${url.pathname} with a redirect to ${target}. Not followed — the API key must not leave ${ctx.origin.origin}.`,
      true,
    );
  }
  return textResult(await res.text(), !res.ok);
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
  const origin = resolveOrigin(opts.baseUrl ?? DEFAULT_BASE_URL);
  const readonly = opts.readonly ?? true;
  const tools = buildTools(await fetchManifest(origin), readonly);

  const server = new Server({ name: "elvix", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) {
      return textResult(`Unknown tool: ${req.params.name}`, true);
    }
    try {
      return await callTool(tool, (req.params.arguments ?? {}) as ToolArgs, {
        origin,
        apiKey: opts.apiKey,
      });
    } catch (e) {
      // Never let a rejected argument or a network fault kill the stdio
      // server — the agent needs the reason back as a tool result.
      return textResult(e instanceof Error ? e.message : String(e), true);
    }
  });

  return {
    server,
    connectStdio: async () => {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
  };
}
