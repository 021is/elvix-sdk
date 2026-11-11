/**
 * The React build is split, and a host keeps only what it renders (0.20).
 *
 * Until 0.20 `dist/react.js` was one 1.3 MB `"use client"` file: a DanceClub
 * page showing only `<ElvixProvider>` and `<ElvixSecuredBadge>` downloaded
 * the whole SDK, 249 KB gzip under Next 16 / Turbopack. Three things make the
 * split work, and each is pinned here against the built `dist/` (CI builds
 * before it tests; run `bun run build` first locally):
 *
 *  - `sideEffects` names only the stylesheet, so unused modules are dropped;
 *  - every module in `dist/react/` is its own `"use client"` file;
 *  - the entry, `dist/react/index.js`, has NO directive and only re-exports
 *    from those files. A `"use client"` entry is one client reference that
 *    Turbopack ships whole; the same build without it cost 22 KB.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const REACT_DIR = join(ROOT, "dist/react");
const ENTRY = join(REACT_DIR, "index.js");
const DIRECTIVE = '"use client";';
/** Provider + badge, gzipped: 21.8 KB in 0.20, when it carried every
 *  component's English words; 9.2 KB since 0.21 (tests/english-split.test.ts). */
const BUDGET_BYTES = 10 * 1024;
/** Modules a page with only the provider and the badge must never load. */
const UI_THEY_DO_NOT_RENDER =
  /sign-in|passkey|legal-entit|address-book|use-otp|sessions|onboarding/;

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

function reactFiles(): string[] {
  return readdirSync(REACT_DIR).filter((name) => name.endsWith(".js"));
}

describe("the React build is split", () => {
  beforeAll(() => {
    if (!existsSync(ENTRY))
      throw new Error("dist/react/index.js is missing: run `bun run build` first");
  });

  it("declares only the stylesheet as a side effect", () => {
    expect(pkg.sideEffects).toEqual(["*.css"]);
    expect(pkg.exports["./react"].import).toBe("./dist/react/index.js");
  });

  it("puts every module behind its own client directive", () => {
    const missing = reactFiles().filter(
      (name) =>
        name !== "index.js" && !readFileSync(join(REACT_DIR, name), "utf8").startsWith(DIRECTIVE),
    );
    expect(missing).toEqual([]);
  });

  it("keeps the entry free of the directive, re-exporting client files only", () => {
    const entry = readFileSync(ENTRY, "utf8");
    expect(entry).not.toContain("use client");
    const sources = [...entry.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.filter((s) => !/^\.\/[\w-]+\.js$/.test(s))).toEqual([]);
    // Nothing but imports and the export list: code inlined here would run
    // on a server unflagged.
    const code = entry
      .replace(/import\s*\{[^}]*\}\s*from\s*"[^"]+";/g, "")
      .replace(/import\s*"[^"]+";/g, "")
      .replace(/export\s*\{[^}]*\};/g, "");
    expect(code.trim()).toBe("");
  });

  it("ships the provider and the badge without the UI they do not render", async () => {
    const { pulled, gzipped } = await bundleOf("ElvixProvider, ElvixSecuredBadge");
    expect(pulled).toContain("elvix-secured-badge.tsx");
    expect(pulled.filter((file) => UI_THEY_DO_NOT_RENDER.test(file))).toEqual([]);
    expect(gzipped).toBeLessThan(BUDGET_BYTES);
  });

  it("ships the sign-in card without the form's overlays and their drawer (0.25)", async () => {
    const { pulled, packages } = await bundleOf("ElvixProvider, ElvixSignInCard");
    expect(pulled).toContain("elvix-sign-in-card.tsx");
    expect(pulled).not.toContain("elvix-sign-in-form.tsx");
    expect(packages).not.toContain("vaul");
    // The control: the form, with its drawer, does ship vaul, so the check above can fail.
    expect((await bundleOf("ElvixSignInForm")).packages).toContain("vaul");
  });
});

/** A host page importing `names` from the entry, bundled as a browser build would. */
async function bundleOf(names: string) {
  const result = await build({
    stdin: {
      contents: `export { ${names} } from ${JSON.stringify(ENTRY)};`,
      resolveDir: ROOT,
      loader: "js",
    },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    write: false,
    metafile: true,
    logLevel: "silent",
    external: ["react", "react/jsx-runtime", "react-dom", "next"],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  // Visited is not shipped: only a module with bytes in the output counts.
  const [output] = Object.values(result.metafile.outputs);
  const inputs = Object.entries(output.inputs).filter(([, { bytesInOutput }]) => bytesInOutput > 0);
  const pulled = inputs
    .filter(([p]) => p.includes("dist/react/"))
    .flatMap(([p]) => {
      const code = readFileSync(resolve(ROOT, p), "utf8");
      return [...code.matchAll(/^\/\/ src\/react\/(\S+)$/gm)].map((m) => m[1]);
    });
  const packages = inputs.flatMap(
    ([p]) => p.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1] ?? [],
  );
  const gzipped = gzipSync(result.outputFiles[0].contents, { level: 9 }).length;
  return { pulled, packages, gzipped };
}
