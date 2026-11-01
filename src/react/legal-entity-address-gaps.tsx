"use client";

/**
 * The parts of an address Google Places left empty, asked for in place.
 *
 * An invoice to a business carries its full address (EU VAT Directive art.
 * 226(5)), so the schema refuses a sole proprietorship or company without
 * street, postal code and city (0.18). Places often answers a business
 * address without a postal code; before this, the save would have failed on
 * it after the user had already moved on. The review pane asks for each
 * missing part right there, and only those, before Continue is enabled.
 */

import { useT } from "../locale/use-t";
import { ElvixInput } from "./elvix-input";
import type { PlaceDetails } from "./legal-entity-types";

export const GapPart = {
  LINE1: "line1",
  POSTAL_CODE: "postalCode",
  CITY: "city",
} as const;
export type GapPart = (typeof GapPart)[keyof typeof GapPart];

const LABEL: Record<GapPart, string> = {
  [GapPart.LINE1]: "legalEntities.addressFieldStreet",
  [GapPart.POSTAL_CODE]: "legalEntities.addressFieldPostalCode",
  [GapPart.CITY]: "legalEntities.addressFieldCity",
};

/** The typeable parts `details` lacks. The postal code counts only for a business. */
export function addressGaps(details: PlaceDetails, needsPostalCode: boolean): GapPart[] {
  const gaps: GapPart[] = [];
  if (!details.line1?.trim()) gaps.push(GapPart.LINE1);
  if (needsPostalCode && !details.postalCode?.trim()) gaps.push(GapPart.POSTAL_CODE);
  if (!details.city?.trim()) gaps.push(GapPart.CITY);
  return gaps;
}

/** One field per part that was missing when the pane opened. */
export function AddressGapFields({
  details,
  parts,
  onFill,
}: {
  details: PlaceDetails;
  parts: readonly GapPart[];
  onFill: (details: PlaceDetails) => void;
}) {
  const t = useT();
  if (parts.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-[12.5px] text-fg-2">{t("legalEntities.addressGapsHint")}</p>
      {parts.map((part) => (
        <label key={part} className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{t(LABEL[part])}</span>
          <ElvixInput
            type="text"
            value={details[part] ?? ""}
            onChange={(e) => onFill({ ...details, [part]: e.target.value })}
            maxLength={part === GapPart.POSTAL_CODE ? 40 : 240}
            autoComplete={part === GapPart.POSTAL_CODE ? "postal-code" : "off"}
            autoFocus={part === parts[0]}
          />
        </label>
      ))}
    </div>
  );
}
