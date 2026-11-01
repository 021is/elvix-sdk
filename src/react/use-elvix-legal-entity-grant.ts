"use client";

/**
 * `useElvixLegalEntityGrant()` (0.18): the host's own Continue grants the
 * entity the picker pre-selected. `<ElvixLegalEntityPicker>` shows the
 * default picked without sharing it (`onPick(entity, { granted: false })`);
 * a host that moves on calls this first, so its backend can read the id it
 * sends:
 *
 *   const grant = useElvixLegalEntityGrant();
 *   const onContinue = async () => {
 *     if (!pick.granted) {
 *       const r = await grant(entity.id);
 *       if (!r.ok) return showError(r.error);
 *     }
 *     next(entity.id);
 *   };
 *
 * Never rejects: a refusal is `{ ok: false, error }`, a provider without a
 * clientId is `missing_client_id`.
 */

import { useCallback } from "react";
import { useElvixContext } from "./elvix-provider";
import type { LegalEntityPurpose } from "./legal-entity-schema";
import {
  type ElvixLegalEntityPickerResult,
  grantLegalEntity,
  PICKER_MISSING_CLIENT_ID,
} from "./use-legal-entity-picks";

export type ElvixLegalEntityGrant = (
  entityId: string,
  purpose?: LegalEntityPurpose,
) => Promise<ElvixLegalEntityPickerResult>;

/** Stable while the provider's origin and clientId stay the same. */
export function useElvixLegalEntityGrant(): ElvixLegalEntityGrant {
  const { baseUrl, clientId } = useElvixContext();
  return useCallback<ElvixLegalEntityGrant>(
    async (entityId, purpose) => {
      if (!clientId) return { ok: false, error: PICKER_MISSING_CLIENT_ID };
      const refused = await grantLegalEntity({ baseUrl, clientId, entityId, purpose });
      return refused
        ? { ok: false, error: "grant_failed", message: refused }
        : { ok: true, entityId };
    },
    [baseUrl, clientId],
  );
}
