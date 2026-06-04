"use client";

/**
 * `<ElvixAppPasskeys>` — per-app passkey manager. Designed to be
 * dropped INSIDE an `<ElvixCard>` provided by the host page (mirrors
 * how `<ElvixDeactivate>` / `<ElvixLeave>` / `<ElvixUsername>` are
 * mounted on `/account/apps/<id>/<surface>`). The component renders
 * the inner content only — heading, subtitle, list, add button — and
 * relies on the surrounding `<ElvixCard>` for border, padding, and
 * the Secured-by-elvix footer badge.
 *
 * Lists + adds + removes passkeys scoped to ONE app. Account-level
 * passkeys (from `/account/security`) are not shown here.
 *
 * Brand-aware: the add button paints with `var(--elvix-primary-strong)`
 * installed by `<ElvixProvider brand>`. Row icons + accents follow the
 * brand chord too.
 *
 * SDK contract:
 *   - Inner content only (no card chrome — host provides via ElvixCard).
 *   - Optional `onResult` for hosts that want to observe terminal events.
 *   - Never navigates the host. Hosts wire their own router.refresh
 *     when they cache app state outside this component.
 */

import { Fingerprint, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useElvixApp, useElvixContext } from "./elvix-provider";
import { runPasskeyRegister } from "./passkey";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";

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

export function ElvixAppPasskeys({
  appId,
  appName: appNameProp,
  onResult,
  onAdded,
  onRemoved,
}: {
  /** Defaults to the appId surfaced by `<ElvixProvider>` bootstrap. */
  appId?: string;
  /** Overrides bootstrap-derived app name. */
  appName?: string;
  onResult?: (r: ElvixAppPasskeysResult) => void;
  onAdded?: () => void;
  onRemoved?: (passkeyId: string) => void;
}) {
  const ctx = useElvixContext();
  const app = useElvixApp();

  const resolvedAppId = appId ?? app?.applicationId ?? null;
  const appName = appNameProp ?? app?.appName ?? "this app";

  const [rows, setRows] = useState<ElvixAppPasskey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    if (!resolvedAppId) return;
    setError(null);
    try {
      const init = authInit();
      const res = await fetch(
        `${ctx.baseUrl}/api/account/apps/${encodeURIComponent(resolvedAppId)}/passkeys`,
        {
          headers: { accept: "application/json", ...init.headers },
          credentials: init.credentials,
        },
      );
      const body = unwrapEnvelope(await res.json().catch(() => ({}))) as {
        ok?: boolean;
        passkeys?: ElvixAppPasskey[];
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Couldn't load passkeys.");
        setRows([]);
        return;
      }
      setRows(body.passkeys ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
      setRows([]);
    }
  }, [ctx.baseUrl, resolvedAppId]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const onAdd = useCallback(async () => {
    if (!resolvedAppId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await runPasskeyRegister(ctx.baseUrl, "account", resolvedAppId);
      if (!result.ok) {
        if (result.error !== "passkey_cancelled") {
          setError(result.message ?? friendlyError(result.error));
        }
        onResult?.({ ok: false, error: result.error, message: result.message });
        return;
      }
      onResult?.({ ok: true, kind: "added" });
      onAdded?.();
      await fetchList();
    } finally {
      setBusy(false);
    }
  }, [busy, ctx.baseUrl, fetchList, onAdded, onResult, resolvedAppId]);

  const onRemove = useCallback(
    async (passkeyId: string) => {
      if (!resolvedAppId || removingId) return;
      setRemovingId(passkeyId);
      setError(null);
      try {
        const init = authInit();
        const res = await fetch(
          `${ctx.baseUrl}/api/account/apps/${encodeURIComponent(resolvedAppId)}/passkeys?passkeyId=${encodeURIComponent(passkeyId)}`,
          {
            method: "DELETE",
            headers: { accept: "application/json", ...init.headers },
            credentials: init.credentials,
          },
        );
        const body = unwrapEnvelope(await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !body.ok) {
          const err = body.error ?? "remove_failed";
          setError(friendlyError(err));
          onResult?.({ ok: false, error: err });
          return;
        }
        onResult?.({ ok: true, kind: "removed", passkeyId });
        onRemoved?.(passkeyId);
        await fetchList();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Network error.";
        setError(msg);
        onResult?.({ ok: false, error: "remove_failed", message: msg });
      } finally {
        setRemovingId(null);
      }
    },
    [ctx.baseUrl, fetchList, onRemoved, onResult, removingId, resolvedAppId],
  );

  if (!resolvedAppId) {
    return (
      <div data-elvix-pane="error">
        <p style={{ color: "var(--elvix-danger, #dc2626)", fontSize: 13 }}>
          Missing app id.
        </p>
      </div>
    );
  }

  return (
    <div data-elvix-pane="list">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 16,
          fontWeight: 600,
          color: "var(--elvix-fg-1, #111)",
          marginBottom: 4,
        }}
      >
        <KeyRound size={18} style={{ color: "var(--elvix-primary-strong, #5d4dff)" }} />
        Passkeys for {appName}
      </div>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--elvix-fg-3, #6b7280)",
          marginTop: 0,
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        Phishing-proof. These passkeys can only sign you in to {appName}.
        Account-level passkeys you added on /account/security work here too
        and are managed there.
      </p>

      {rows === null ? (
        <div style={{ padding: "20px 0", textAlign: "center" }}>
          <Loader2
            className="animate-spin"
            size={20}
            style={{ color: "var(--elvix-primary-strong, #5d4dff)" }}
            aria-hidden
          />
        </div>
      ) : rows.length === 0 ? (
        <div
          style={{
            padding: "14px 16px",
            border: "1px dashed var(--elvix-primary-12, rgba(93,77,255,0.16))",
            borderRadius: 12,
            fontSize: 12.5,
            color: "var(--elvix-fg-3, #6b7280)",
            background: "var(--elvix-primary-8, rgba(93,77,255,0.04))",
          }}
        >
          No passkeys for {appName} yet. Tap below to add one.
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {rows.map((row) => (
            <PasskeyRow
              key={row.id}
              row={row}
              removing={removingId === row.id}
              onRemove={() => onRemove(row.id)}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onAdd}
        disabled={busy}
        data-elvix-action="add-app-passkey"
        style={{
          marginTop: 14,
          width: "100%",
          height: 40,
          borderRadius: 10,
          border: "none",
          background: "var(--elvix-primary-strong, #5d4dff)",
          color: "var(--elvix-on-primary, white)",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          cursor: busy ? "wait" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          boxShadow: "0 1px 0 rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
          opacity: busy ? 0.7 : 1,
          transition: "opacity 150ms ease",
        }}
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <Plus size={14} aria-hidden />
        )}
        {busy ? "Adding…" : `Add a passkey for ${appName}`}
      </button>

      {error && (
        <p
          role="alert"
          style={{
            marginTop: 10,
            fontSize: 12.5,
            color: "var(--elvix-danger, #dc2626)",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

function PasskeyRow({
  row,
  removing,
  onRemove,
}: {
  row: ElvixAppPasskey;
  removing: boolean;
  onRemove: () => void;
}): ReactNode {
  const label = row.nickname ?? friendlyDeviceLabel(row);
  const subtitle = row.lastUsedAt
    ? `Last used ${shortDate(row.lastUsedAt)}`
    : `Added ${shortDate(row.createdAt)}`;
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 12,
        background: "var(--elvix-surface, white)",
        border: "1px solid var(--elvix-primary-12, rgba(93,77,255,0.12))",
      }}
    >
      <Fingerprint
        size={18}
        style={{
          color: "var(--elvix-primary-strong, #5d4dff)",
          flexShrink: 0,
        }}
        aria-hidden
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--elvix-fg-1, #111)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--elvix-fg-3, #6b7280)",
          }}
        >
          {subtitle}
          {row.backedUp ? " · synced" : ""}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label={`Remove ${label}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "transparent",
          border: "1px solid var(--elvix-primary-12, rgba(93,77,255,0.12))",
          cursor: removing ? "wait" : "pointer",
          color: removing ? "var(--elvix-fg-3, #6b7280)" : "var(--elvix-fg-2, #444)",
        }}
      >
        {removing ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <Trash2 size={14} aria-hidden />
        )}
      </button>
    </li>
  );
}

function friendlyDeviceLabel(row: ElvixAppPasskey): string {
  if (row.aaguid === "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4") return "iCloud Keychain";
  if (row.aaguid === "08987058-cadc-4b81-b6e1-30de50dcbe96") return "Windows Hello";
  if (row.aaguid === "00000000-0000-0000-0000-000000000000") {
    return row.createdUserAgent
      ? `Apple platform passkey · ${shortUserAgent(row.createdUserAgent)}`
      : "Apple platform passkey";
  }
  return row.createdUserAgent ? shortUserAgent(row.createdUserAgent) : "Passkey";
}

function shortUserAgent(ua: string): string {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  return "device";
}

function shortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function friendlyError(code: string): string {
  if (code === "not_a_member") return "You're not a member of this app.";
  if (code === "method_disabled") return "Passkeys are disabled for this app.";
  if (code === "app_not_found") return "App not found.";
  if (code === "passkey_unsupported") return "This browser doesn't support passkeys.";
  if (code === "passkey_register_failed") return "Couldn't register the passkey. Try again.";
  if (code === "invalid_input") return "Couldn't start passkey setup. Try again.";
  if (code === "unauthenticated") return "Sign in first, then add a passkey.";
  if (code === "remove_failed") return "Couldn't remove the passkey. Try again.";
  return code.replace(/_/g, " ");
}
