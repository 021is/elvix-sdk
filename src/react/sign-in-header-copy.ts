import type { AuthFormProps } from "./elvix-sign-in-form";
import type { Translator } from "./sign-in-copy";
import { Step } from "./use-sign-in-flow";

/**
 * The words of a sign-in step's head: its title and the one fact under it. Every `Step` is
 * named, so a new step fails the type check until it has words (no `default`).
 */

/** A step's title, in the card's header and above a compact block's onboarding step. */
export function headerTitle(
  step: Step,
  p: AuthFormProps,
  recoverApp: string | undefined,
  t: Translator,
): string {
  switch (step) {
    case Step.CODE:
      return t("export.doneTitle");
    case Step.USERNAME:
      return t("username.title");
    case Step.PASSKEY:
      return t(
        p.signInVerb === "login"
          ? "signin.passkeyOnboardingTitleLogin"
          : "signin.passkeyOnboardingTitleSignin",
      );
    case Step.RECOVER:
      return t("signin.recoverTitle", {
        app: recoverApp ?? p.appName ?? t("signin.appNameFallback"),
      });
    case Step.IDENTIFIER:
    case Step.AUTHENTICATING:
      return t(p.signInVerb === "login" ? "signin.titleLogin" : "signin.title", {
        app: p.appName || t("signin.appNameFallback"),
      });
  }
}

/** A step's one fact under its title; none on the entry step: the logo plus one line (0.25). */
export function headerSubtitle(
  step: Step,
  p: AuthFormProps,
  identifier: string,
  t: Translator,
): string | null {
  switch (step) {
    case Step.CODE:
      return t("signin.codeSentSubtitle", { email: identifier });
    case Step.USERNAME:
      return p.appName ? t("username.subtitle", { app: p.appName }) : t("username.subtitleNoApp");
    case Step.PASSKEY:
      return t("signin.passkeyOnboardingSubtitle");
    case Step.RECOVER:
      return t("signin.recoverSubtitle");
    case Step.IDENTIFIER:
    case Step.AUTHENTICATING:
      return null;
  }
}
