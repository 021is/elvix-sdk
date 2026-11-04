import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { keysNamedIn } from "../scripts/english-plugin.mjs";
import { PRESET_LABEL } from "../src/react/elvix-sign-in-button";

/**
 * Every catalog key the SDK READS must exist in English and in every other
 * locale. `catalogs.test.ts` proves the locales match English; this proves
 * English has what the code asks for, so a typo'd or renamed key cannot ship
 * as a raw `buttons.signIn` string. (The CDN holding the same keys is checked
 * by `scripts/sync-catalogs.mjs --check` at publish time.)
 */
type Catalog = { namespaces: Record<string, Record<string, unknown>> };

const ROOT = join(__dirname, "..");
const CATALOGS = join(ROOT, "src/locale/catalogs");
const load = (file: string) => JSON.parse(readFileSync(join(CATALOGS, file), "utf8")) as Catalog;

const catalogs = readdirSync(CATALOGS)
  .filter((f) => f.endsWith(".json"))
  .map((file) => ({ file, catalog: load(file) }));
const en = load("en.json");
const namespaces = Object.keys(en.namespaces);

/** Every `"namespace.key"` string literal in the SDK's React sources, found
 *  by the scan the build registers English words from (0.21). */
function referencedKeys(): Map<string, string> {
  const dir = join(ROOT, "src/react");
  const found = new Map<string, string>();
  for (const file of readdirSync(dir).filter((f) => /\.tsx?$/.test(f))) {
    for (const key of keysNamedIn(readFileSync(join(dir, file), "utf8"), namespaces)) {
      found.set(key, file);
    }
  }
  return found;
}

const has = (catalog: Catalog, key: string) => {
  const [ns, name] = key.split(/\.(.+)/);
  return Boolean(ns && name && catalog.namespaces[ns]?.[name]);
};

describe("catalog keys the SDK reads", () => {
  it("finds the keys (guards the scan itself)", () => {
    expect(referencedKeys().size).toBeGreaterThan(100);
  });

  it("every referenced key exists in English", () => {
    const missing = [...referencedKeys()].filter(([key]) => !has(en, key));
    expect(missing).toEqual([]);
  });

  it.each(catalogs)("$file has every referenced key", ({ catalog }) => {
    const missing = [...referencedKeys().keys()].filter((key) => !has(catalog, key));
    expect(missing).toEqual([]);
  });

  it("every sign-in button preset label resolves in every locale", () => {
    for (const key of Object.values(PRESET_LABEL)) {
      for (const { file, catalog } of catalogs) {
        expect(has(catalog, key), `${file} lacks ${key}`).toBe(true);
      }
    }
  });
});
