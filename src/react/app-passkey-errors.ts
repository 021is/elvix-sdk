/**
 * The words for `<ElvixAppPasskeys>`' error codes (out of the component in 0.26, security
 * review 5, 2026-11-12). Only a code elvix's own table names gets its line, read by own
 * keys; any other code, a server's free text included, is the generic line: no browser,
 * extension or server words ever reach the page.
 */

const PASSKEY_ERRORS: Record<string, string> = {
  load_failed: "passkeys.errorLoad",
  not_a_member: "passkeys.errorNotMember",
  method_disabled: "passkeys.errorMethodDisabled",
  app_not_found: "passkeys.errorAppNotFound",
  passkey_unsupported: "passkeys.errorUnsupported",
  passkey_register_failed: "passkeys.errorRegisterFailed",
  invalid_input: "passkeys.errorInvalidInput",
  unauthenticated: "passkeys.errorUnauthenticated",
  remove_failed: "passkeys.errorRemoveFailed",
  network: "signin.errorNetwork",
};

/** The catalog key for `code`. */
export function appPasskeyErrorKey(code: string): string {
  return (Object.hasOwn(PASSKEY_ERRORS, code) && PASSKEY_ERRORS[code]) || "signin.errorGeneric";
}
