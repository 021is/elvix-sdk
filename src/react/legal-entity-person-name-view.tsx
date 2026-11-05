"use client";

/**
 * A natural person's legal name, in its two parts (0.18): payment providers
 * ask for given and family name separately, and one free-text field could not
 * be split back reliably ("Maria de la Cruz"). The legal name is built from
 * them (`legal-entity-payload.ts`).
 */

import { useT } from "../locale/use-t";
import { FormField } from "./legal-entity-form-field";
import { Subtitle } from "./legal-entity-primitives";
import { Heading, StepAction, WizardHeader } from "./legal-entity-step-chrome";
import { STACK_3 } from "./pane-layout";

const LETTER = /\p{L}/u;

export function PersonNameView(props: {
  title: string;
  subtitle: string;
  given: string;
  family: string;
  setGiven: (v: string) => void;
  setFamily: (v: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const fieldError = (v: string) =>
    v.trim() && !LETTER.test(v) ? t("legalEntities.legalNameInvalidPerson") : null;
  const ready = LETTER.test(props.given) && LETTER.test(props.family);
  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) props.onConfirm();
      }}
    >
      <WizardHeader onBack={props.onBack} />
      <Heading>{props.title}</Heading>
      <Subtitle>{props.subtitle}</Subtitle>
      <div className={`mt-4 ${STACK_3}`}>
        <FormField
          label={t("legalEntities.givenNameLabel")}
          value={props.given}
          onChange={props.setGiven}
          maxLength={120}
          error={fieldError(props.given)}
          autoFocus
        />
        <FormField
          label={t("legalEntities.familyNameLabel")}
          value={props.family}
          onChange={props.setFamily}
          maxLength={120}
          error={fieldError(props.family)}
        />
      </div>
      <StepAction
        label={t("common.continue")}
        disabled={!ready}
        onConfirm={props.onConfirm}
        hint={t("common.enterHint")}
      />
    </form>
  );
}
