/**
 * Every locale catalog carries every English key, with the same
 * placeholders. A key missing from a locale silently falls back to English;
 * a placeholder missing from a translation silently drops what it named
 * (nine locales once said "you agree to the" with no app, while the English
 * named it).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Catalog = { namespaces: Record<string, Record<string, Record<string, string>>> };

const DIR = join(__dirname, "../src/locale/catalogs");
const load = (file: string) => JSON.parse(readFileSync(join(DIR, file), "utf8")) as Catalog;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const en = load("en.json");
const locales = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "en.json");

describe("locale catalogs", () => {
  it("ships fifteen locales", () => {
    expect(locales).toHaveLength(14);
  });

  for (const file of locales) {
    it(`${file} matches English key for key`, () => {
      const catalog = load(file);
      const problems: string[] = [];
      for (const [ns, keys] of Object.entries(en.namespaces)) {
        for (const [key, forms] of Object.entries(keys)) {
          const translated = catalog.namespaces[ns]?.[key];
          if (!translated) {
            problems.push(`missing ${ns}.${key}`);
            continue;
          }
          const want = placeholders(forms.other ?? "");
          for (const form of Object.values(translated)) {
            if (placeholders(form).join() !== want.join()) {
              problems.push(`placeholders ${ns}.${key}: ${form}`);
            }
          }
        }
      }
      expect(problems).toEqual([]);
    });
  }
});
