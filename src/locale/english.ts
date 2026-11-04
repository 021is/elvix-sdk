/**
 * The bundled English words, one namespace at a time (0.21).
 *
 * Until 0.21 the whole English catalog shipped inside `<ElvixProvider>`, so a
 * page with only the provider and the badge carried every component's words.
 * Now every module that names a key registers that key's namespace, from the
 * generated `./en/<namespace>.json` (scripts/gen-english.mjs). The BUILD
 * writes that registration, not the source: `scripts/english-plugin.mjs`
 * prepends it to each `src/react` module from the keys it finds there, so no
 * module can forget one. A module the host renders is in its bundle, so its
 * words are too; one it does not render brings none. Registering runs at
 * module load, before any render, so a key never shows raw and the server
 * HTML has the words. Tests run on the source and register every namespace
 * (tests/setup-english.ts); `tests/english-split.test.ts` checks the build.
 *
 * `ENGLISH` is one object, mutated in place and never copied: every runtime
 * (the provider's, the fallback under another locale, `useT` outside a
 * provider) reads it by reference at the moment it translates, so a namespace
 * registered after the runtime was built is still found.
 */
import type { Catalog, PluralForms } from "@021.is/spine-i18n";
import { makeLocale } from "@021.is/spine-i18n";

type Namespaces = Record<string, Record<string, PluralForms>>;

const ENGLISH: Catalog = { locale: makeLocale("en"), namespaces: {} };

/** Add namespaces to the English words. Idempotent; the first copy stays. */
export function registerEnglish(...parts: Namespaces[]): void {
  for (const part of parts) {
    for (const [name, messages] of Object.entries(part)) {
      ENGLISH.namespaces[name] ??= messages;
    }
  }
}

/** The English words registered so far, live: read it, never copy it. */
export function englishCatalog(): Catalog {
  return ENGLISH;
}
