import { defineConfig } from "tsup";
import { englishPlugin } from "./scripts/english-plugin.mjs";

/**
 * Two builds into one `dist/`.
 *
 * The server, CLI, MCP and type entries bundle as before. The React entry is
 * built module by module into `dist/react/` (every `src/react/*` file is an
 * entry, shared code goes into chunks), so a host's bundler keeps only the
 * modules it renders: a page with `<ElvixProvider>` and `<ElvixSecuredBadge>`
 * no longer downloads the sign-in form, passkeys or the account UI. Before
 * 0.20 `dist/react.js` was one 1.3 MB file that no bundler could split.
 *
 * Its own `outDir` keeps React chunks apart from the server's: every file in
 * `dist/react/` is client code and gets `"use client"` (scripts/postbuild.mjs),
 * which a server chunk must never carry.
 *
 * `dist/` is emptied by the build script, not by `clean`: the two builds run
 * in parallel and one would delete the other's output.
 */
const external = ["react", "react/jsx-runtime", "react-dom", "next"];

// Named, so a missing file fails the build: until 0.20 the CLI line listed
// `src/types.ts`, which never existed, and `@elvix.is/sdk/types` shipped empty.
const entry = {
  index: "src/index.ts",
  server: "src/server.ts",
  types: "src/types/index.ts",
  "mcp/index": "src/mcp/index.ts",
  "mcp/bin": "src/mcp/bin.ts",
  "cli/index": "src/cli/index.ts",
  "cli/doctor": "src/cli/doctor.ts",
  "cli/login": "src/cli/login.ts",
};

export default defineConfig([
  {
    entry,
    format: "esm",
    outDir: "dist",
    external,
    dts: { entry: { ...entry, react: "src/react/index.ts" } },
  },
  {
    entry: ["src/react/*.ts", "src/react/*.tsx"],
    format: "esm",
    outDir: "dist/react",
    splitting: true,
    external,
    // Each module gets the English words of the keys it names, so a host
    // carries only the words of what it renders (0.21).
    esbuildPlugins: [englishPlugin()],
  },
]);
