"use client";
import { MaybeCard } from "./elvix-card";

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
import type { ReactNode } from "react";
import { useT } from "../locale/use-t";
import { useElvixApp } from "./elvix-provider";
import type { Translator } from "./sign-in-copy";
import {
  type ElvixAppPasskey,
  type ElvixAppPasskeysResult,
  useAppPasskeys,
} from "./use-app-passkeys";

export type { ElvixAppPasskey, ElvixAppPasskeysResult };

function ElvixAppPasskeysImpl({
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
  const t = useT();
  const app = useElvixApp();
  const resolvedAppId = appId ?? app?.applicationId ?? null;
  const appName = appNameProp ?? app?.appName ?? t("passkeys.thisApp");
  const { rows, busy, error, removingId, add, remove } = useAppPasskeys({
    appId: resolvedAppId,
    onResult,
    onAdded,
    onRemoved,
  });

  if (!resolvedAppId) {
    return (
      <div data-elvix-pane="error">
        <p style={{ color: "var(--elvix-danger, #dc2626)", fontSize: 13 }}>
          {t("passkeys.missingAppId")}
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
        {t("passkeys.title", { app: appName })}
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
        {t("passkeys.body", { app: appName })}
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
          {t("passkeys.empty", { app: appName })}
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
              onRemove={() => void remove(row.id)}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => void add()}
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
        {busy ? t("passkeys.adding") : t("passkeys.add", { app: appName })}
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
          {PASSKEY_ERRORS[error] ? t(PASSKEY_ERRORS[error]) : error.replace(/_/g, " ")}
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
  const t = useT();
  const label = row.nickname ?? deviceLabel(row, t);
  const subtitle = row.lastUsedAt
    ? t("passkeys.lastUsed", { date: shortDate(row.lastUsedAt) })
    : t("passkeys.added", { date: shortDate(row.createdAt) });
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
          {row.backedUp ? ` · ${t("passkeys.synced")}` : ""}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label={t("passkeys.removeAria", { label })}
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

/** A name for a passkey the user did not nickname: the authenticator's
 *  product name (not translated), else the device it was added on. */
function deviceLabel(row: ElvixAppPasskey, t: Translator): string {
  if (row.aaguid === "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4") return "iCloud Keychain";
  if (row.aaguid === "08987058-cadc-4b81-b6e1-30de50dcbe96") return "Windows Hello";
  const device = row.createdUserAgent ? shortUserAgent(row.createdUserAgent, t) : null;
  if (row.aaguid === "00000000-0000-0000-0000-000000000000") {
    const apple = t("passkeys.deviceApplePlatform");
    return device ? `${apple} · ${device}` : apple;
  }
  return device ?? t("passkeys.devicePasskey");
}

function shortUserAgent(ua: string, t: Translator): string {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  return t("passkeys.deviceGeneric");
}

function shortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

/** Error codes as catalog keys. Anything else is a ceremony's own message
 *  and is shown as is. */
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
};

/**
 * Public export. Wraps the implementation in <ElvixCard> by default;
 * pass `card={false}` to render bare (compose in your own surface).
 */
export function ElvixAppPasskeys(
  props: Parameters<typeof ElvixAppPasskeysImpl>[0] & { card?: boolean },
) {
  const { card, ...rest } = props;
  return (
    <MaybeCard card={card} className="h-full">
      <ElvixAppPasskeysImpl {...(rest as Parameters<typeof ElvixAppPasskeysImpl>[0])} />
    </MaybeCard>
  );
}
