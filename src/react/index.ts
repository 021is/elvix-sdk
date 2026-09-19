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
 * Hooks: useElvixApp(), useElvixContext(), useElvixAppContext(),
 *        useElvixRefresh(), useElvixUserMedia(userId?)
 */

export { switchLocale, useFmt, useLocale } from "@021.is/spine-i18n/react";
/**
 * i18n hooks. Drop-in from `@021.is/spine-i18n/react` so callers can write:
 *   const t = useT();   t("signin.googleButton")
 * `<ElvixProvider locale="de">` already mounts the LocaleProvider; consumers
 * only see these hooks and the canonical English string keys.
 */
export { useT } from "../locale/use-t";
export type { ElvixActionResult, ElvixUser, ElvixVerifyResult } from "../types/index";
export type { ElvixCopy } from "./copy";
// Editable sign-in copy. Primary source is the elvix Console (served live in
// the bootstrap `strings`); the `copy` prop on ElvixSignIn is a thin per-embed
// override. ElvixCopy types both.
export { DEFAULT_COPY } from "./copy";
export {
  ElvixAddressBook,
  ElvixBillingAddressBook,
  ElvixShippingAddressBook,
} from "./elvix-address-book";
export {
  type ElvixAppPasskey,
  ElvixAppPasskeys,
  type ElvixAppPasskeysResult,
} from "./elvix-app-passkeys";
export { ElvixAvatar } from "./elvix-avatar";
export { ElvixBanner } from "./elvix-banner";
export { ElvixCard } from "./elvix-card";
export { ElvixDeactivate } from "./elvix-deactivate";
export { ElvixDeviceApproval, type ElvixDeviceApprovalProps } from "./elvix-device-approval";
export { ElvixExport } from "./elvix-export";
export { ElvixIdentityForm, type Gender, type Pronouns } from "./elvix-identity-form";
export { ElvixLanguages } from "./elvix-languages";
export { ElvixLeave } from "./elvix-leave";
export { ElvixLegalEntities } from "./elvix-legal-entities";
export { ElvixPresence } from "./elvix-presence";
export type { ElvixAppContext } from "./elvix-provider";
export {
  ElvixProvider,
  ElvixSessionStatus,
  useElvixAnimated,
  useElvixApp,
  useElvixAppContext,
  useElvixContext,
  useElvixRefresh,
  useElvixSession,
  useResolvedBaseUrl,
} from "./elvix-provider";
export { ElvixRegion } from "./elvix-region";
export { ElvixSecuredBadge } from "./elvix-secured-badge";
// Account lifecycle
export { ElvixSessions } from "./elvix-sessions";
export { ElvixSignInButton } from "./elvix-sign-in-button";
// `ElvixSignIn` is now an ALIAS of `ElvixSignInForm` — the bare low-level
// variant was removed (it was never the recommended surface). Both names
// resolve to the same branded form so existing imports keep working without
// any app changes.
export { ElvixSignInForm, ElvixSignInForm as ElvixSignIn } from "./elvix-sign-in-form";
export {
  ElvixSignOutAs,
  ElvixSignOutButton,
  type ElvixSignOutButtonProps,
  ElvixSignOutLink,
  ElvixSignOutMenuItem,
  ElvixSignOutPreset,
  type ElvixSignOutResult,
  ElvixSignOutShape,
  ElvixSignOutTone,
  ElvixSignOutType,
  ElvixSignOutVariant,
} from "./elvix-sign-out-button";
export { ElvixUserAvatar, type ElvixUserAvatarProps } from "./elvix-user-avatar";
export { ElvixUserBanner, type ElvixUserBannerProps } from "./elvix-user-banner";
// Identity
export { ElvixUsername } from "./elvix-username";
// Live, read-only access: what the app's admins granted the signed-in user.
// Pushed over one shared stream per user (works cross-origin with the bearer);
// the watcher signs the user out on a ban / pause / delete as it happens.
export type {
  ElvixAccessItem,
  ElvixMembershipsState,
  ElvixRolesState,
  ElvixScopesState,
  UseUserListResult,
} from "./hooks";
export {
  useElvixMemberships,
  useElvixRoles,
  useElvixScopes,
  useUserMemberships,
  useUserRoles,
  useUserScopes,
} from "./hooks";
export { ElvixLifecycleWatcher } from "./lifecycle-watcher";
// Read-only profile: who is signed in, and labels for rendering them.
export {
  type ElvixLanguageName,
  type ElvixSignedInUser,
  ElvixUserStatus,
  useElvixLanguageNames,
  useElvixPronounsLabel,
  useElvixUser,
} from "./profile-hooks";
// Cross-origin session token (stored by ElvixSignIn, sent as a bearer by every
// SDK call when the app is embedded on its own origin).
// `consumeElvixReturnToken` picks up the token elvix's Google redirect-callback
// hands back in the URL fragment; <ElvixProvider> calls it automatically, but
// hosts that don't mount the provider at the redirect target can call it.
export {
  consumeElvixReturnToken,
  type ElvixLandingPayload,
  getElvixToken,
  setElvixToken,
  takeJustReturnedLanding,
} from "./session";
export { type SignOutOptions, type SignOutResult, signOut } from "./sign-out";
// Shared sizing surface — every <Elvix*> widget accepts these props.
export type { ElvixSizeProps } from "./size";
export type {
  ElvixBootstrapEnvelope,
  ElvixBrand,
  ElvixSignInMethod,
  ElvixSignInResult,
  ElvixSignInResultErr,
  ElvixSignInResultOk,
  ElvixTheme,
} from "./types";
export { useSignOut } from "./use-sign-out";
export { type ElvixUserMedia, useElvixUserMedia } from "./user-media";
export { ELVIX_SDK_VERSION } from "./version";
