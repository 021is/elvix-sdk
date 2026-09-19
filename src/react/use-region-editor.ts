"use client";

/**
 * State and requests behind `<ElvixRegion>`: the regional-preferences
 * singleton, the pane showing, and the two writes (PUT a country with its
 * cascade of defaults, PATCH one field).
 */

import { useCallback, useEffect, useState } from "react";
import { useT } from "../locale/use-t";
import { useElvixContext } from "./elvix-provider";
import { jsonInit, send } from "./profile-request";
import type { RegionPatchInput, RegionRecord } from "./region-schema";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { useStableCallback } from "./use-stable-callback";

export type ElvixRegionResult =
  | { ok: true; country: string; locale: string }
  | { ok: false; error: string; message?: string };

export const View = {
  LOADING: "loading",
  EMPTY: "empty",
  COUNTRY_PICK: "country-pick",
  COUNTRY_PICK_CASCADE_CONFIRM: "country-pick-cascade-confirm",
  DETAIL: "detail",
  EDIT_UI_LOCALE: "edit-ui-locale",
  EDIT_TIME_ZONE: "edit-time-zone",
  EDIT_TIME_FORMAT: "edit-time-format",
  EDIT_DATE_FORMAT: "edit-date-format",
  EDIT_NUMBER_FORMAT: "edit-number-format",
  EDIT_CURRENCY: "edit-currency",
  EDIT_MEASUREMENT: "edit-measurement",
  EDIT_FIRST_DAY: "edit-first-day",
  SAVING: "saving",
} as const;
export type View = (typeof View)[keyof typeof View];

type Options = {
  onChange?: (region: RegionRecord | null) => void;
  onResult?: (result: ElvixRegionResult) => void;
};

/** The singleton, loaded once per origin. `reload` resolves to the fresh
 *  record (`null` = none yet), or `undefined` when it could not be read. */
function useRegionRecord(baseUrl: string, onLoaded: (region: RegionRecord | null) => void) {
  const [region, setRegion] = useState<RegionRecord | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const res = await send(`${baseUrl}/api/account/profile/region`, {
        cache: "no-store",
        signal,
        ...authInit(),
      });
      const body = res?.ok
        ? (unwrapEnvelope(await res.json().catch(() => null)) as { region?: RegionRecord | null })
        : null;
      if (signal?.aborted) return undefined;
      setLoaded(true);
      if (!body || body.region === undefined) return undefined;
      setRegion(body.region);
      onLoaded(body.region);
      return body.region;
    },
    [baseUrl, onLoaded],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  return { region, loaded, reload };
}

export function useRegionEditor({ onChange, onResult }: Options) {
  const t = useT();
  const { baseUrl } = useElvixContext();
  // Stable, so a host's inline `onChange` cannot re-run the load effect.
  const emitChange = useStableCallback(onChange);
  const emitResult = useStableCallback(onResult);
  const { region, loaded, reload } = useRegionRecord(baseUrl, emitChange);
  // `null` = no pane chosen yet; the first load picks empty or detail.
  const [chosen, setChosen] = useState<View | null>(null);
  const [pendingCountry, setPendingCountry] = useState<string | null>(null);
  const view = chosen ?? (loaded ? (region ? View.DETAIL : View.EMPTY) : View.LOADING);

  /** Runs one write, reloads, and reports the country and locale the user
   *  now has, which after a country change are the cascaded ones. */
  const write = async (init: RequestInit, failView: View) => {
    setChosen(View.SAVING);
    const res = await send(`${baseUrl}/api/account/profile/region`, init);
    if (!res?.ok) {
      emitResult({ ok: false, error: "save_failed", message: t("region.errorSaveFailed") });
      setChosen(failView);
      return;
    }
    const fresh = await reload();
    emitResult({ ok: true, country: fresh?.country ?? "", locale: fresh?.uiLocale ?? "" });
    setChosen(View.DETAIL);
  };

  const pickCountry = (country: string) => {
    if (!region) {
      void write(jsonInit("PUT", { country }), View.COUNTRY_PICK);
      return;
    }
    // A new country resets every field to its defaults, so it asks first.
    setPendingCountry(country);
    setChosen(View.COUNTRY_PICK_CASCADE_CONFIRM);
  };

  const confirmCascade = async () => {
    if (!pendingCountry) return;
    await write(jsonInit("PUT", { country: pendingCountry }), View.DETAIL);
    setPendingCountry(null);
  };

  return {
    view,
    region,
    pendingCountry,
    show: setChosen,
    pickCountry,
    confirmCascade,
    cancelCascade: () => {
      setPendingCountry(null);
      setChosen(View.DETAIL);
    },
    patch: (partial: RegionPatchInput) => void write(jsonInit("PATCH", partial), View.DETAIL),
  };
}
