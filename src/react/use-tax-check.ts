"use client";

import { useEffect, useRef, useState } from "react";
import { elvixFetch } from "./elvix-fetch";
import { useElvixContext } from "./elvix-provider";
import type { TaxIdValidationState } from "./elvix-tax-id-input";
import { Phase } from "./legal-entity-primitives";
import { isSameOrigin } from "./session";
import { unwrapEnvelope } from "./spine-fetch";

/** Long enough that the check reads as a step, even when elvix answers at once. */
const MIN_DISPLAY_MS = 900;

type CheckAnswer = {
  ok: boolean;
  result: {
    level: TaxIdValidationState["level"];
    name: string | null;
    authority: string | null;
    normalisedId: string;
    address?: string | null;
  };
};

/** Asks elvix's proxy what the authority says of `vatId`; throws on any failure. */
async function askAuthority(
  baseUrl: string,
  country: string,
  vatId: string,
  signal: AbortSignal,
): Promise<TaxIdValidationState> {
  const query = new URLSearchParams({ country, vatId });
  const res = await elvixFetch(`${baseUrl}/public/api/tax/validate?${query}`, {
    signal,
    credentials: isSameOrigin(baseUrl) ? "include" : "omit",
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const { result } = unwrapEnvelope(await res.json()) as CheckAnswer;
  return { ...result, address: result.address ?? null };
}

/**
 * The live VAT check behind the verifying pane: always a fresh authority
 * call, never the cached verdict, held for at least `MIN_DISPLAY_MS`. When
 * elvix cannot be reached the verdict is `format`, which the pane shows as
 * "authority unreachable" with a way on; elvix re-checks on save either way.
 */
export function useTaxCheck(country: string, vatId: string, initial: TaxIdValidationState) {
  const { baseUrl } = useElvixContext();
  const [phase, setPhase] = useState<Phase>(Phase.CHECKING);
  const [result, setResult] = useState<TaxIdValidationState>(initial);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const trimmed = vatId.trim();
    const settle = (next: TaxIdValidationState) => {
      const wait = Math.max(0, MIN_DISPLAY_MS - (Date.now() - startedAt.current));
      timer = setTimeout(() => {
        setResult(next);
        setPhase(Phase.SETTLED);
      }, wait);
    };
    askAuthority(baseUrl, country, trimmed, ctrl.signal).then(settle, () => {
      if (ctrl.signal.aborted) return;
      // Shown, not swallowed: `format` is the pane's "authority unreachable".
      settle({
        level: "format",
        name: null,
        authority: null,
        normalisedId: trimmed,
        address: null,
      });
    });
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [country, vatId, baseUrl]);

  return { phase, result };
}
