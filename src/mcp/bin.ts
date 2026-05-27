#!/usr/bin/env node
/**
 * CLI entry for `bunx @elvix.is/sdk elvix-mcp`. Reads ELVIX_API_KEY
 * from the environment, picks up `--admin` to enable mutation tools,
 * `--base-url` to override the origin (testing).
 */
import { createElvixMcpServer } from "./index.js";

async function main(): Promise<void> {
  const apiKey = process.env.ELVIX_API_KEY;
  if (!apiKey) {
    process.stderr.write("ELVIX_API_KEY environment variable is required.\n");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const admin = args.includes("--admin");
  const baseUrl = args.find((a) => a.startsWith("--base-url="))?.split("=")[1];

  const { connectStdio } = await createElvixMcpServer({
    apiKey,
    readonly: !admin,
    baseUrl,
  });
  await connectStdio();
}

main().catch((e) => {
  process.stderr.write(`elvix-mcp: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
