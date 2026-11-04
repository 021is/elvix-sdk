/**
 * The English words a React module needs, written into it by the build (0.21).
 *
 * Until 0.21 the whole English catalog shipped inside `<ElvixProvider>`, so a
 * page with only the provider and the badge carried every component's words
 * (~16 KB gzip). This esbuild plugin, on the React build only (tsup.config.ts):
 *
 *  - finds the keys each `src/react` module names (`keysNamedIn`, the same
 *    scan tests/catalog-keys.test.ts uses);
 *  - prepends `registerEnglish(<the namespaces of those keys>)`
 *    (src/locale/english.ts), importing each namespace from a virtual
 *    module `elvix-english:<namespace>`;
 *  - answers each virtual module with that namespace, cut from
 *    `src/locale/catalogs/en.json`, which stays the only copy.
 *
 * Each namespace is its own module, so a host's bundler keeps only the ones
 * of the modules it renders. The source never carries the registration, so a
 * module cannot forget one; tests/english-split.test.ts checks the build.
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EN = join(ROOT, "src/locale/catalogs/en.json");
const REGISTRY = join(ROOT, "src/locale/english.ts");
const VIRTUAL = "elvix-english";

/** Literals shaped like a key that are not one (a stream event name). */
const NOT_KEYS = new Set(["lifecycle.snapshot"]);
/** A line of a comment: a key named in prose is not a key the code reads.
 *  Checked after inline `/* … *\/` is dropped: a line that starts with one
 *  (esbuild's `/* @__PURE__ *\/`) is code. */
const COMMENT = /^\s*(\*|\/\/|\/\*)/;
const INLINE_COMMENT = /\/\*.*?\*\//g;

/** The English namespaces, by name. */
export function englishNamespaces() {
  return JSON.parse(readFileSync(EN, "utf8")).namespaces;
}

/** Every `"namespace.key"` string literal in `source`, comments left out. */
export function keysNamedIn(source, namespaces) {
  const pattern = new RegExp(`["'\`](${namespaces.join("|")})\\.([A-Za-z0-9_]+)["'\`]`, "g");
  const keys = new Set();
  for (const raw of source.split("\n")) {
    const line = raw.replace(INLINE_COMMENT, "");
    if (COMMENT.test(line)) continue;
    for (const m of line.matchAll(pattern)) {
      const key = `${m[1]}.${m[2]}`;
      if (!NOT_KEYS.has(key)) keys.add(key);
    }
  }
  return keys;
}

/** The registration the build prepends to a module naming these keys. */
function registration(keys, file) {
  const names = [...new Set([...keys].map((key) => key.split(".")[0]))].sort();
  if (names.length === 0) return "";
  let registry = relative(dirname(file), REGISTRY).replace(/\.ts$/, "");
  if (!registry.startsWith(".")) registry = `./${registry}`;
  const imports = names.map((n, i) => `import __elvixEn${i} from "${VIRTUAL}:${n}";`);
  const call = `__elvixRegisterEnglish(${names.map((_, i) => `__elvixEn${i}`).join(", ")});`;
  return `import { registerEnglish as __elvixRegisterEnglish } from "${registry}";\n${imports.join("\n")}\n${call}\n`;
}

export function englishPlugin() {
  const namespaces = englishNamespaces();
  const names = Object.keys(namespaces);
  return {
    name: "elvix-english",
    setup(build) {
      build.onResolve({ filter: new RegExp(`^${VIRTUAL}:`) }, (args) => ({
        path: args.path.slice(VIRTUAL.length + 1),
        namespace: VIRTUAL,
      }));
      build.onLoad({ filter: /.*/, namespace: VIRTUAL }, (args) => {
        if (!names.includes(args.path)) return { errors: [{ text: `no namespace ${args.path}` }] };
        return { contents: JSON.stringify({ [args.path]: namespaces[args.path] }), loader: "json" };
      });
      build.onLoad({ filter: /[\\/]src[\\/]react[\\/][^\\/]+\.tsx?$/ }, (args) => {
        const source = readFileSync(args.path, "utf8");
        const added = registration(keysNamedIn(source, names), args.path);
        // After a leading "use client", which must stay the first statement.
        const directive = /^\s*["']use client["'];?\n/.exec(source)?.[0] ?? "";
        return {
          contents: added ? `${directive}${added}${source.slice(directive.length)}` : source,
          loader: args.path.endsWith("x") ? "tsx" : "ts",
        };
      });
    },
  };
}
