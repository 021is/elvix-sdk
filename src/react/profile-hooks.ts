"use client";

/**
 * Read-only hooks for rendering the signed-in user's profile in a host app.
 *
 *   const { status, user } = useElvixUser();
 *   if (status === "signed-out") return <SignInButton />;
 *   const pronouns = useElvixPronounsLabel(user?.pronouns);
 *   const languages = useElvixLanguageNames();
 *
 * elvix is the system of record for identity, so a host renders these rather
 * than a copy in its own database, which lags a rename by a webhook. They
 * update after any SDK editor saves (the editors refresh the provider's
 * envelope), with no reload.
 */

import { useMemo } from "react";
import { useT } from "../locale/use-t";
import { ElvixSessionStatus, useElvixContext } from "./elvix-provider";
import type { Pronouns } from "./identity-schema";
import type { LanguageLevel } from "./languages";

export const ElvixUserStatus = {
  LOADING: "loading",
  SIGNED_IN: "signed-in",
  SIGNED_OUT: "signed-out",
} as const;
export type ElvixUserStatus = (typeof ElvixUserStatus)[keyof typeof ElvixUserStatus];

export type ElvixSignedInUser = {
  /** elvix user id (a cuid). */
  id: string;
  /** This app's username; drives profile URLs. `null` before onboarding sets one. */
  username: string | null;
  /** The name elvix holds, with no fallback. */
  name: string | null;
  /** Something to show in a heading: the name, else the username, else the
   *  email's local part. A user who skipped onboarding may have no name. */
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
  avatarUrl: string | null;
  pronouns: Pronouns | null;
  /** In the order the user's languages editor lists them. */
  languages: { code: string; level: LanguageLevel }[];
};

/**
 * The signed-in user, and whether anyone is. Three states, not a boolean:
 * collapsing "loading" into "signed out" makes a sign-in button flash on
 * first paint for users who are already signed in.
 */
export function useElvixUser(): {
  status: ElvixUserStatus;
  user: ElvixSignedInUser | null;
  /** Re-reads the envelope now, after the host changed the user itself. */
  refresh: () => Promise<void>;
} {
  const { appContext, sessionStatus, refresh } = useElvixContext();
  const user = useMemo((): ElvixSignedInUser | null => {
    if (!appContext) return null;
    const { user: u, membership } = appContext;
    const username = membership?.username ?? null;
    return {
      id: u.id,
      username,
      name: u.name,
      displayName: u.name ?? username ?? u.email?.split("@")[0] ?? null,
      givenName: u.givenName ?? null,
      familyName: u.familyName ?? null,
      email: u.email,
      avatarUrl: u.avatarUrl,
      pronouns: u.pronouns ?? null,
      languages: u.languages ?? [],
    };
  }, [appContext]);
  const status =
    sessionStatus === ElvixSessionStatus.LOADING
      ? ElvixUserStatus.LOADING
      : user
        ? ElvixUserStatus.SIGNED_IN
        : ElvixUserStatus.SIGNED_OUT;
  return { status, user, refresh };
}

/** Pronouns worth showing, with the SDK's translated label. "Other" and
 *  "prefer not to say" tell a reader nothing, so they have none. */
const PRONOUN_LABEL_KEYS: Partial<Record<Pronouns, string>> = {
  she_her: "identity.pronounSheHer",
  he_him: "identity.pronounHeHim",
  they_them: "identity.pronounTheyThem",
};

/** "She / her" in the SDK's locale, or `null` when there is nothing to show. */
export function useElvixPronounsLabel(pronouns: Pronouns | null | undefined): string | null {
  const t = useT();
  const key = pronouns ? PRONOUN_LABEL_KEYS[pronouns] : undefined;
  return key ? t(key) : null;
}

export type ElvixLanguageName = { code: string; level: LanguageLevel; name: string };

/**
 * The signed-in user's languages with their names in `locale` (default: the
 * SDK's locale), in the user's order. Empty when signed out.
 */
export function useElvixLanguageNames(locale?: string): ElvixLanguageName[] {
  const { appContext, locale: sdkLocale } = useElvixContext();
  const languages = appContext?.user.languages;
  const lang = locale ?? sdkLocale;
  return useMemo(() => {
    if (!languages?.length) return [];
    const names = new Intl.DisplayNames([lang], { type: "language" });
    return languages.map((l) => ({ ...l, name: names.of(l.code) ?? l.code }));
  }, [languages, lang]);
}
