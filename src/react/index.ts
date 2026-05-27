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
export { ElvixProvider, useElvixApp, useElvixContext } from "./elvix-provider";
export { ElvixSignIn } from "./elvix-sign-in";

// Identity
export { ElvixUsername } from "./elvix-username";
export { ElvixAvatar } from "./elvix-avatar";
export { ElvixBanner } from "./elvix-banner";
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
