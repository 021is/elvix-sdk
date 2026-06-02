/**
 * Public React entry for `@elvix.is/sdk/react`.
 *
 * Complete surface (0.3.0):
 *
 * Primitives:
 *   - <ElvixProvider clientId> — root context, fetches bootstrap
 *   - <ElvixCard> — chrome wrapper used by every mutation component
 *
 * Sign-in:
 *   - <ElvixSignIn onResult> — drop-in sign-in (email OTP + Google)
 *
 * Identity:
 *   - <ElvixUsername onResult>
 *   - <ElvixAvatar onResult>
 *   - <ElvixBanner onResult>
 *   - <ElvixIdentityForm initialName initialBio onResult>
 *   - <ElvixRegion initialCountry initialTimezone onResult>
 *   - <ElvixLanguages initial onResult>
 *
 * Account lifecycle:
 *   - <ElvixSessions onResult>
 *   - <ElvixExport onResult>
 *   - <ElvixDeactivate onResult>
 *   - <ElvixLeave onResult>
 *   - <ElvixAddressBook onResult>
 *   - <ElvixLegalEntities onResult>
 *
 * Hooks: useElvixApp(), useElvixContext()
 */
export { ElvixCard } from "./elvix-card";
// Shared sizing surface — every <Elvix*> widget accepts these props.
export type { ElvixSizeProps } from "./size";
export {
  ElvixProvider,
  useElvixApp,
  useElvixAppContext,
  useElvixContext,
  useResolvedBaseUrl,
} from "./elvix-provider";
export type { ElvixAppContext } from "./elvix-provider";
export { ElvixSignIn } from "./elvix-sign-in";
export { ElvixSignInForm } from "./elvix-sign-in-form";
export { ElvixSignInButton } from "./elvix-sign-in-button";
export {
  ElvixSignOutButton,
  ElvixSignOutPreset,
  ElvixSignOutTone,
  ElvixSignOutVariant,
  ElvixSignOutShape,
  ElvixSignOutType,
  type ElvixSignOutResult,
  type ElvixSignOutButtonProps,
} from "./elvix-sign-out-button";
export { useSignOut } from "./use-sign-out";
export { signOut, type SignOutOptions, type SignOutResult } from "./sign-out";
export { ElvixSecuredBadge } from "./elvix-secured-badge";

// Editable sign-in copy. Primary source is the elvix Console (served live in
// the bootstrap `strings`); the `copy` prop on ElvixSignIn is a thin per-embed
// override. ElvixCopy types both.
export { DEFAULT_COPY } from "./copy";
export type { ElvixCopy } from "./copy";

/**
 * i18n hooks. Drop-in from `@021.is/spine-i18n/react` so callers can write:
 *   const t = useT();   t("signin.googleButton")
 * `<ElvixProvider locale="de">` already mounts the LocaleProvider; consumers
 * only see these hooks and the canonical English string keys.
 */
export { useT } from "../locale/use-t";
export { useLocale, useFmt, switchLocale } from "@021.is/spine-i18n/react";

// Cross-origin session token (stored by ElvixSignIn, sent as a bearer by every
// SDK call when the app is embedded on its own origin).
// `consumeElvixReturnToken` picks up the token elvix's Google redirect-callback
// hands back in the URL fragment; <ElvixProvider> calls it automatically, but
// hosts that don't mount the provider at the redirect target can call it.
export { consumeElvixReturnToken, getElvixToken, setElvixToken } from "./session";

// Live gate — poll-based so it works cross-origin (EventSource can't carry the
// bearer). Roles/scopes/memberships update within ~7s; the watcher signs the
// user out within ~7s of a ban/pause/delete.
export { useUserRoles, useUserScopes, useUserMemberships } from "./hooks";
export type { UseUserListResult } from "./hooks";
export { ElvixLifecycleWatcher } from "./lifecycle-watcher";

// Identity
export { ElvixUsername } from "./elvix-username";
export { ElvixAvatar } from "./elvix-avatar";
export { ElvixUserAvatar, type ElvixUserAvatarProps } from "./elvix-user-avatar";
export { ElvixBanner } from "./elvix-banner";
export { ElvixUserBanner, type ElvixUserBannerProps } from "./elvix-user-banner";
export { ElvixIdentityForm } from "./elvix-identity-form";
export { ElvixRegion } from "./elvix-region";
export { ElvixLanguages } from "./elvix-languages";

// Account lifecycle
export { ElvixSessions } from "./elvix-sessions";
export { ElvixExport } from "./elvix-export";
export { ElvixDeactivate } from "./elvix-deactivate";
export { ElvixLeave } from "./elvix-leave";
export { ElvixAddressBook } from "./elvix-address-book";
export { ElvixLegalEntities } from "./elvix-legal-entities";

export type {
  ElvixBootstrapEnvelope,
  ElvixBrand,
  ElvixSignInMethod,
  ElvixSignInResult,
  ElvixSignInResultErr,
  ElvixSignInResultOk,
  ElvixTheme,
} from "./types";
export type { ElvixActionResult, ElvixUser, ElvixVerifyResult } from "../types/index";
