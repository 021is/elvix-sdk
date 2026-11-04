/**
 * Tests run on the source, where no module registers its English words: the
 * build writes that registration (scripts/english-plugin.mjs, 0.21). So every
 * namespace is registered here, before any test file loads, and what the
 * build writes is checked on dist/ by tests/english-split.test.ts.
 */
import en from "../src/locale/catalogs/en.json" with { type: "json" };
import { registerEnglish } from "../src/locale/english";

registerEnglish(en.namespaces);
