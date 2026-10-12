"use client";

/**
 * elvix SDK i18n runtime. Wraps `@021.is/spine-i18n` with:
 *
 *   - A bundled `en` catalog (so the SDK has zero-config baseline).
 *   - Lazy fetch of any other locale from the elvix translation
 *     CDN (`https://elvix.is/api/v1/i18n/elvix/<locale>.json` by
 *     default). Override via `<ElvixProvider i18nBase>`.
 *   - In-memory cache + a `loadCatalog(locale)` async helper used
 *     internally by `<ElvixProvider>` when its `locale` prop changes.
 *
 * Bundle size cost: only `en.json` (~5KB gzipped) ships inside the
 * SDK. The other 14 locales arrive on-demand on first request and
 * are cached for the page lifetime.
 */

import type { Catalog, Locale } from "@021.is/spine-i18n";
import { buildRuntime, makeLocale } from "@021.is/spine-i18n";
import enCatalog from "./catalogs/en.json" with { type: "json" };

const DEFAULT_I18N_BASE = "https://elvix.is/api/v1/i18n/elvix";
const CACHE = new Map<string, Catalog>();

/** Local copy of `en` so `useT()` works synchronously before any fetch lands. */
export function bundledEnglishCatalog(): Catalog {
  return jsonToCatalog(enCatalog as unknown as RawCatalog, "en");
}

/** Build a runtime against the bundled English catalog. Sync, no network. */
export function buildEnglishRuntime() {
  const en = bundledEnglishCatalog();
  return buildRuntime(en, null);
}

/**
 * Fetch a locale catalog from the elvix translation CDN (or whatever
 * `i18nBase` the consumer pointed at). Resolves to a parsed Catalog.
 * Returns `null` on network failure so the caller can fall back to
 * English silently — never throws on a missing locale.
 */
export async function fetchCatalog(
  locale: string,
  i18nBase: string = DEFAULT_I18N_BASE,
): Promise<Catalog | null> {
  const tag = normaliseTag(locale);
  if (tag === "en") return bundledEnglishCatalog();
  const cached = CACHE.get(tag);
  if (cached) return cached;
  try {
    const res = await fetch(`${i18nBase}/${tag}.json`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as RawCatalog;
    const cat = jsonToCatalog(raw, tag);
    CACHE.set(tag, cat);
    return cat;
  } catch {
    return null;
  }
}

/**
 * The catalog with the host's own strings laid over it. `messages` is flat,
 * `"namespace.key": "text"`, so a host can reword one button or supply a whole
 * language elvix does not ship. Anything it leaves out keeps the catalog's
 * text. Returns the same catalog when there is nothing to apply.
 */
export function applyMessages(
  catalog: Catalog,
  messages: Readonly<Record<string, string>> | undefined,
): Catalog {
  const entries = Object.entries(messages ?? {});
  if (entries.length === 0) return catalog;
  const namespaces = { ...catalog.namespaces };
  for (const [fullKey, text] of entries) {
    const dot = fullKey.indexOf(".");
    if (dot < 1 || typeof text !== "string") continue;
    const ns = fullKey.slice(0, dot);
    namespaces[ns] = { ...namespaces[ns], [fullKey.slice(dot + 1)]: { other: text } };
  }
  return { ...catalog, namespaces };
}

/** Best-effort lookup of a catalog. English fallback is synchronous. */
export function lookupCatalogSync(locale: string): Catalog | null {
  const tag = normaliseTag(locale);
  if (tag === "en") return bundledEnglishCatalog();
  return CACHE.get(tag) ?? null;
}

// ── helpers ───────────────────────────────────────────────────────────

type RawCatalog = {
  locale: string;
  namespaces: Record<string, Record<string, { other: string } & Record<string, string>>>;
};

function jsonToCatalog(raw: RawCatalog, tag: string): Catalog {
  return {
    locale: makeLocale(tag) as Locale,
    namespaces: raw.namespaces,
  };
}

function normaliseTag(tag: string): string {
  // Allow `en-GB` to fall back to `en` if we don't have a region-specific
  // catalog yet. The supported.json list determines which tags ship; the
  // public CDN returns 404 for the rest and we fall back to English.
  return tag;
}
