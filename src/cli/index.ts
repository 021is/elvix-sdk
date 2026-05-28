#!/usr/bin/env node
/**
 * `elvix` — the SDK command-line entry point.
 *
 *   elvix mcp [--admin] [--base-url=…]   launch the MCP server on stdio
 *   elvix doctor [--client-id=…]         diagnose an integration
 *   elvix help                           usage
 *
 * Thin dispatcher: each subcommand lives in its own module. The
 * `elvix-mcp` bin (kept for back-compat) maps straight to the mcp
 * path.
 */

const HELP = `elvix — @elvix.is/sdk CLI

Usage:
  elvix mcp [--admin] [--base-url=<url>]
      Launch the elvix MCP server on stdio. Reads ELVIX_API_KEY from
      the environment. Read-only by default; --admin enables mutation
      tools (the server still enforces the admin scope on the key).

  elvix doctor [--client-id=<id>] [--base-url=<url>]
      Diagnose an integration: base URL reachability, clientId
      resolution, verify-endpoint liveness, API-key presence.
      Reads ELVIX_CLIENT_ID / ELVIX_API_KEY / ELVIX_BASE_URL.

  elvix help
      Show this message.

Docs: https://elvix.is/docs/agents`;

async function main(): Promise<void> {
  const sub = process.argv[2];

  switch (sub) {
    case "mcp": {
      const { createElvixMcpServer } = await import("../mcp/index.js");
      const apiKey = process.env.ELVIX_API_KEY;
      if (!apiKey) {
        process.stderr.write("ELVIX_API_KEY environment variable is required.\n");
        process.exit(1);
      }
      const admin = process.argv.includes("--admin");
      const baseUrl = process.argv.find((a) => a.startsWith("--base-url="))?.split("=")[1];
      const { connectStdio } = await createElvixMcpServer({ apiKey, readonly: !admin, baseUrl });
      await connectStdio();
      return;
    }
    case "doctor": {
      const { runDoctor } = await import("./doctor.js");
      process.exit(await runDoctor());
      break;
    }
    case "help":
    case "--help":
    case "-h":
    case undefined:
      process.stdout.write(`${HELP}\n`);
      return;
    default:
      process.stderr.write(`Unknown command: ${sub}\n\n${HELP}\n`);
      process.exit(1);
  }
}

main().catch((e) => {
  process.stderr.write(`elvix: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
