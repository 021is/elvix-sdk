"use client";

/**
 * `<ElvixDeviceApproval>` — the browser surface a CLI / headless device sends
 * the user to in order to authorize itself (OAuth 2.0 Device Authorization
 * Grant, RFC 8628).
 *
 * Host it on YOUR OWN domain (e.g. `https://yourapp.com/device`) so the user
 * approves on a page they trust, with your brand and the exact sign-in methods
 * you enabled in the elvix Console. It renders `<ElvixSignInForm>` — so the
 * methods + branding stay Console-driven and update live — then calls elvix's
 * `device/approve` with the session token from sign-in. The whole flow stays on
 * your domain; nothing redirects to elvix.is.
 *
 *   // app/device/page.tsx (your app)
 *   "use client";
 *   import { ElvixDeviceApproval } from "@elvix.is/sdk/react";
 *   export default function DevicePage() {
 *     return <ElvixDeviceApproval clientId={process.env.NEXT_PUBLIC_ELVIX_CLIENT_ID!} />;
 *   }
 *
 * The `user_code` is read from `?code=` (the CLI deep-links the user here with
 * `verification_uri_complete`), or pass it explicitly via `code`.
 */

import { Check, Loader2, MonitorSmartphone, ShieldAlert } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { approveDevice } from "./device-approve";
import { ElvixProvider, useElvixApp } from "./elvix-provider";
import { ElvixSignInForm } from "./elvix-sign-in-form";
import type { ElvixTheme } from "./types";

const DEFAULT_BASE_URL = "https://elvix.is";

const Phase = {
  SIGNIN: "signin",
  APPROVING: "approving",
  DONE: "done",
  ERROR: "error",
} as const;
type Phase = (typeof Phase)[keyof typeof Phase];

export type ElvixDeviceApprovalProps = {
  /** Your app's public elvix `client_id`. */
  clientId: string;
  /** The short `user_code` from the CLI. Defaults to `?code=` in the URL. */
  code?: string;
  /** elvix origin. Defaults to `https://elvix.is`. */
  baseUrl?: string;
  theme?: ElvixTheme;
  /** Fires after the device is approved (host can show its own confirmation). */
  onApproved?: () => void;
  /** Fires on an approval failure. */
  onError?: (error: string) => void;
};

export function ElvixDeviceApproval(props: ElvixDeviceApprovalProps) {
  return (
    <ElvixProvider
      clientId={props.clientId}
      baseUrl={props.baseUrl ?? DEFAULT_BASE_URL}
      theme={props.theme}
    >
      <DeviceApprovalInner {...props} />
    </ElvixProvider>
  );
}

function DeviceApprovalInner({
  clientId,
  code,
  baseUrl,
  onApproved,
  onError,
}: ElvixDeviceApprovalProps) {
  const app = useElvixApp();
  const appName = app?.appName ?? "your account";
  const origin = baseUrl ?? DEFAULT_BASE_URL;

  const [userCode, setUserCode] = useState<string | null>(code ?? null);
  const [codeInput, setCodeInput] = useState("");
  const [phase, setPhase] = useState<Phase>(Phase.SIGNIN);
  const [error, setError] = useState<string | null>(null);

  // The CLI deep-links the user here with ?code=, so it's usually pre-filled.
  useEffect(() => {
    if (userCode || typeof window === "undefined") return;
    const c = new URLSearchParams(window.location.search).get("code");
    if (c) setUserCode(c);
  }, [userCode]);

  async function approve(token: string) {
    if (!userCode) return;
    setPhase(Phase.APPROVING);
    setError(null);
    const result = await approveDevice({ baseUrl: origin, token, userCode });
    if (result.ok) {
      setPhase(Phase.DONE);
      onApproved?.();
      return;
    }
    setError(result.error);
    setPhase(Phase.ERROR);
    onError?.(result.error);
  }

  // No code yet → ask for it (rare: the CLI normally deep-links ?code=).
  if (!userCode) {
    return (
      <Surface>
        <Glyph tone="brand">
          <MonitorSmartphone size={19} />
        </Glyph>
        <Title>Authorize a device</Title>
        <Sub>Enter the code shown in your terminal.</Sub>
        <form
          className="elvix-otp-form"
          onSubmit={(e) => {
            e.preventDefault();
            const c = codeInput.trim();
            if (c) setUserCode(c);
          }}
        >
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="WDJB-MJHT"
            className="elvix-input"
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
          />
          <button type="submit" className="elvix-btn elvix-btn-primary">
            Continue
          </button>
        </form>
      </Surface>
    );
  }

  if (phase === Phase.DONE) {
    return (
      <Surface>
        <Glyph tone="emerald">
          <Check size={20} />
        </Glyph>
        <Title>Approved</Title>
        <Sub>Return to your terminal. It continues automatically.</Sub>
      </Surface>
    );
  }

  if (phase === Phase.APPROVING) {
    return (
      <Surface>
        <Glyph tone="brand">
          <Loader2 size={19} className="animate-spin" />
        </Glyph>
        <Title>Authorizing…</Title>
        <Sub>Linking the device to your {appName} account.</Sub>
      </Surface>
    );
  }

  if (phase === Phase.ERROR) {
    return (
      <Surface>
        <Glyph tone="rose">
          <ShieldAlert size={19} />
        </Glyph>
        <Title>Could not approve</Title>
        <Sub>{error ?? "Something went wrong. The code may have expired."}</Sub>
        <button
          type="button"
          className="elvix-btn elvix-btn-primary"
          onClick={() => setPhase(Phase.SIGNIN)}
        >
          Try again
        </button>
      </Surface>
    );
  }

  // SIGNIN: the Console-driven sign-in. On auth success we approve in place —
  // signing in IS the approval; the user verified the code matches their
  // terminal in the banner. The form keeps the methods + branding live.
  return (
    <ElvixSignInForm
      clientId={clientId}
      navigate={false}
      belowHeading={
        <p className="elvix-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>
          A device wants to sign in to your account as a CLI. Confirm the code matches your terminal:{" "}
          <code style={{ fontWeight: 600 }}>{userCode}</code>
        </p>
      }
      onAuthenticated={(r) => {
        if (r.ok && r.token) approve(r.token);
      }}
    />
  );
}

/* ── Presentational bits (state panes; the sign-in pane is ElvixSignInForm) ── */

function Surface({ children }: { children: ReactNode }) {
  return (
    <div
      className="elvix-surface-card"
      style={{
        width: "100%",
        maxWidth: 412,
        margin: "0 auto",
        textAlign: "center",
        background: "var(--elvix-card-bg, #fff)",
        border: "1px solid var(--elvix-border, #ececef)",
        borderRadius: 16,
        padding: "30px 26px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)",
        display: "grid",
        gap: 10,
        placeItems: "center",
      }}
    >
      {children}
    </div>
  );
}

function Glyph({ tone, children }: { tone: "brand" | "emerald" | "rose"; children: ReactNode }) {
  const tones: Record<"brand" | "emerald" | "rose", { bg: string; fg: string; bd: string }> = {
    brand: {
      bg: "var(--elvix-primary-12, rgba(124,108,255,0.12))",
      fg: "var(--elvix-primary, #7c6cff)",
      bd: "var(--elvix-primary-12, rgba(124,108,255,0.3))",
    },
    emerald: { bg: "rgba(16,185,129,0.12)", fg: "#10b981", bd: "rgba(16,185,129,0.35)" },
    rose: { bg: "rgba(244,63,94,0.12)", fg: "#f43f5e", bd: "rgba(244,63,94,0.35)" },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        width: 44,
        height: 44,
        borderRadius: 11,
        display: "grid",
        placeItems: "center",
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
      }}
    >
      {children}
    </span>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <h1 style={{ fontSize: 19, fontWeight: 600, margin: 0 }}>{children}</h1>;
}

function Sub({ children }: { children: ReactNode }) {
  return (
    <p className="elvix-muted" style={{ fontSize: 13.5, lineHeight: 1.5, margin: 0 }}>
      {children}
    </p>
  );
}
