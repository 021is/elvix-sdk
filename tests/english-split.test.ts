/**
 * Every export of the built SDK carries the English words of the keys it
 * ships, and no more (0.21).
 *
 * The build writes each module's registration (scripts/english-plugin.mjs);
 * the tests run on the source with every namespace registered
 * (tests/setup-english.ts), so a module the plugin missed would pass them all
 * and show raw keys to a host. Here each export is bundled ALONE from dist/,
 * as a host's bundler would, and every key in the code that ships must have
 * its namespace shipped with it. Run `bun run build` first; CI builds before
 * it tests.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { beforeAll, describe, expect, it } from "vitest";
import { englishNamespaces, keysNamedIn } from "../scripts/english-plugin.mjs";

const ROOT = resolve(__dirname, "..");
const ENTRY = join(ROOT, "dist/react/index.js");
const NAMES = Object.keys(englishNamespaces());

/** The value exports of the entry (types leave no trace in the JS). */
function exportsOfEntry(): string[] {
  const block = /export\s*\{([^}]*)\};/.exec(readFileSync(ENTRY, "utf8"))?.[1] ?? "";
  return block
    .split(",")
    .map((spec) => /(\w+)\s*$/.exec(spec)?.[1] ?? "") // `a as b` exports `b`
    .filter(Boolean);
}

async function bundleAlone(name: string) {
  const result = await build({
    stdin: { contents: `export { ${name} } from ${JSON.stringify(ENTRY)};`, resolveDir: ROOT },
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    metafile: true,
    logLevel: "silent",
    external: ["react", "react/jsx-runtime", "react-dom", "next"],
  });
  const [output] = Object.values(result.metafile.outputs);
  const shipped = Object.entries(output?.inputs ?? {})
    .filter(([p, { bytesInOutput }]) => p.includes("dist/react/") && bytesInOutput > 0)
    .map(([p]) => readFileSync(resolve(ROOT, p), "utf8"));
  const namespaces = new Set(
    shipped.flatMap((code) => [...code.matchAll(/^\/\/ elvix-english:(\w+)$/gm)].map((m) => m[1])),
  );
  const keys = keysNamedIn(result.outputFiles[0]?.text ?? "", NAMES);
  return { keys, namespaces };
}

describe("the English words in the build", () => {
  beforeAll(() => {
    if (!existsSync(ENTRY))
      throw new Error("dist/react/index.js is missing: run `bun run build` first");
  });

  it("finds the exports and their keys (guards the scan itself)", async () => {
    expect(exportsOfEntry().length).toBeGreaterThan(60);
    // A scan that saw no keys would pass every case below: esbuild starts
    // lines with `/* @__PURE__ */`, which once read as a comment.
    expect((await bundleAlone("ElvixSignInForm")).keys.size).toBeGreaterThan(50);
  });

  it.each(exportsOfEntry())("%s ships the words of every key it ships", async (name) => {
    const { keys, namespaces } = await bundleAlone(name);
    const bare = [...keys].filter((key) => !namespaces.has(key.split(".")[0] ?? ""));
    expect(bare).toEqual([]);
  });

  it("the provider and the badge ship only the badge's words", async () => {
    const provider = await bundleAlone("ElvixProvider");
    const badge = await bundleAlone("ElvixSecuredBadge");
    expect([...provider.namespaces]).toEqual([]);
    expect([...badge.namespaces]).toEqual(["signin"]);
  });
});
