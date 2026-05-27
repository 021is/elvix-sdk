"use client";

import { type FormEvent, useState } from "react";
import { ElvixCard } from "./elvix-card";
import { useElvixContext } from "./elvix-provider";
import { appPost } from "./lib";
import type { ElvixActionResult } from "../types/index";

/**
 * `<ElvixLeave>` — hard-leave the Application. Soft-deletes the
 * ApplicationUser row (kept for audit + GDPR), end-user can rejoin
 * via fresh sign-in. Same two-step OTP flow as Deactivate, separate
 * server-side action so audit logs can distinguish intent.
 */
type Pane = "warn" | "otp" | "done";

export function ElvixLeave({
  onResult,
}: {
  onResult?: (r: ElvixActionResult) => void;
}) {
  const ctx = useElvixContext();
  const [pane, setPane] = useState<Pane>("warn");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startChallenge() {
    if (!ctx.app) return;
    setBusy(true);
    setError(null);
    const result = await appPost<{ challengeId: string }>(
      { baseUrl: ctx.baseUrl, applicationId: ctx.app.applicationId },
      "/membership/challenge",
      { action: "leave" },
    );
    setBusy(false);
    if (!result.ok || !result.data?.challengeId) {
      setError(result.ok ? "no_challenge" : result.error);
      return;
    }
    setChallengeId(result.data.challengeId);
    setPane("otp");
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!ctx.app || !challengeId) return;
    setBusy(true);
    setError(null);
    const result = await appPost(
      { baseUrl: ctx.baseUrl, applicationId: ctx.app.applicationId },
      "/membership/leave",
      { challengeId, code: code.trim() },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      onResult?.(result);
      return;
    }
    setPane("done");
    onResult?.(result);
  }

  if (pane === "done") {
    return (
      <ElvixCard title="You've left">
        <p>You've left this app. Your data is archived; sign in again to rejoin.</p>
      </ElvixCard>
    );
  }

  return (
    <ElvixCard title="Leave this app">
      {pane === "warn" && (
        <>
          <p style={{ fontSize: 13, color: "rgba(0,0,0,0.6)" }}>
            Remove yourself from this app. Audit trail is preserved; you can sign back in any time to rejoin.
          </p>
          <button type="button" onClick={startChallenge} disabled={busy} className="elvix-btn elvix-btn-danger">
            {busy ? "Sending…" : "Send code"}
          </button>
        </>
      )}
      {pane === "otp" && (
        <form onSubmit={confirm} className="elvix-form">
          <p className="elvix-muted">We sent a 6-digit code to your email.</p>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
            disabled={busy}
            className="elvix-input"
          />
          <button type="submit" disabled={busy || code.length !== 6} className="elvix-btn elvix-btn-danger">
            {busy ? "Leaving…" : "Confirm leave"}
          </button>
        </form>
      )}
      {error && <p role="alert" className="elvix-error">{error}</p>}
    </ElvixCard>
  );
}
