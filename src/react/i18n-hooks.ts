"use client";

/**
 * i18n hooks. Drop-in from `@021.is/spine-i18n/react` so callers can write:
 *   const t = useT();   t("signin.googleButton")
 * `<ElvixProvider locale="de">` already mounts the LocaleProvider; consumers
 * only see these hooks and the canonical English string keys.
 *
 * Re-exported from this client module, not straight from the entry: the
 * entry carries no `"use client"` (so a host's bundler keeps only what it
 * renders), and spine-i18n's module calls `createContext` at its top, which
 * a server component must never evaluate.
 */
export { switchLocale, useFmt, useLocale } from "@021.is/spine-i18n/react";
export { useT } from "../locale/use-t";
