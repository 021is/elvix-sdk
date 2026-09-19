"use client";

/** The passkeys scoped to one app: list, add (a WebAuthn ceremony), remove. */

import { useCallback, useEffect, useState } from "react";
import { useElvixContext } from "./elvix-provider";
import { runPasskeyRegister } from "./passkey";
import { send } from "./profile-request";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { useStableCallback } from "./use-stable-callback";

export type ElvixAppPasskey = {
  id: string;
  nickname: string | null;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
  aaguid: string | null;
  createdUserAgent: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export type ElvixAppPasskeysResult =
  | { ok: true; kind: "added" }
  | { ok: true; kind: "removed"; passkeyId: string }
  | { ok: false; error: string; message?: string };

type Options = {
  appId: string | null;
  onResult?: (r: ElvixAppPasskeysResult) => void;
  onAdded?: () => void;
  onRemoved?: (passkeyId: string) => void;
};

type Reply = { ok?: boolean; passkeys?: ElvixAppPasskey[]; error?: string };

async function call(url: string, init: RequestInit): Promise<{ ok: boolean; reply: Reply } | null> {
  const auth = authInit();
  const res = await send(url, {
    ...init,
    headers: { accept: "application/json", ...auth.headers },
    credentials: auth.credentials,
  });
  if (!res) return null;
  const reply = (unwrapEnvelope(await res.json().catch(() => ({}))) ?? {}) as Reply;
  return { ok: res.ok && reply.ok === true, reply };
}

export function useAppPasskeys({ appId, onResult, onAdded, onRemoved }: Options) {
  const { baseUrl } = useElvixContext();
  const emitResult = useStableCallback(onResult);
  const [rows, setRows] = useState<ElvixAppPasskey[] | null>(null);
  const [busy, setBusy] = useState(false);
  /** An error code (`friendlyError` words it) or a ceremony's own message. */
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const url = appId ? `${baseUrl}/api/account/apps/${encodeURIComponent(appId)}/passkeys` : null;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!url) return;
      const out = await call(url, { signal });
      if (signal?.aborted) return;
      setError(out?.ok ? null : (out?.reply.error ?? "load_failed"));
      setRows(out?.ok ? (out.reply.passkeys ?? []) : []);
    },
    [url],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const add = async () => {
    if (!appId || busy) return;
    setBusy(true);
    setError(null);
    const result = await runPasskeyRegister(baseUrl, "account", appId);
    setBusy(false);
    if (!result.ok) {
      // Cancelling the browser prompt is not an error worth showing.
      if (result.error !== "passkey_cancelled") setError(result.message ?? result.error);
      emitResult({ ok: false, error: result.error, message: result.message });
      return;
    }
    emitResult({ ok: true, kind: "added" });
    onAdded?.();
    await load();
  };

  const remove = async (passkeyId: string) => {
    if (!url || removingId) return;
    setRemovingId(passkeyId);
    setError(null);
    const out = await call(`${url}?passkeyId=${encodeURIComponent(passkeyId)}`, {
      method: "DELETE",
    });
    setRemovingId(null);
    if (!out?.ok) {
      const code = out?.reply.error ?? "remove_failed";
      setError(code);
      emitResult({ ok: false, error: code });
      return;
    }
    emitResult({ ok: true, kind: "removed", passkeyId });
    onRemoved?.(passkeyId);
    await load();
  };

  return { rows, busy, error, removingId, add, remove };
}
