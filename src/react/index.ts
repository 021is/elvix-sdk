/**
 * Public React entry for `@elvix.is/sdk/react`.
 *
 * Wave 1 surface (this release):
 *   - <ElvixProvider clientId> — root context, fetches bootstrap
 *   - <ElvixSignIn onResult> — drop-in sign-in (email OTP + Google)
 *   - useElvixApp() — read the bootstrap envelope
 *   - useElvixContext() — full context (clientId, baseUrl, theme)
 *
 * Wave 2 (identity components: Avatar, Banner, Username, IdentityForm,
 * Region, Languages) and wave 3 (account lifecycle: Sessions, Export,
 * Deactivate, Leave, AddressBook, LegalEntities) follow in 0.3.x and
 * 0.4.x respectively.
 */
export { ElvixProvider, useElvixApp, useElvixContext } from "./elvix-provider";
export { ElvixSignIn } from "./elvix-sign-in";
export type {
  ElvixBootstrapEnvelope,
  ElvixBrand,
  ElvixSignInMethod,
  ElvixSignInResult,
  ElvixSignInResultErr,
  ElvixSignInResultOk,
  ElvixTheme,
} from "./types";
