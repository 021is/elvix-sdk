"use client";

/**
 * `<ElvixExport>` — in-frame wizard for the GDPR data export.
 * Target is locked at mount time (the chooser lives on
 * `/account/export` as elvix product chrome, not inside the SDK).
 *
 * Pane graph:
 *
 *   preview     ── label + section bullets ("what you'll receive")
 *    └─ send-to ── confirms primary inbox, sends 6-digit code
 *        └─ otp ── verify code, generate, upload, email
 *            └─ done ── "Sent. Link works once, expires in 24h."
 *
 * SDK contract: in-frame default, optional `onSuccess(downloadId)`
 * and `onFail(error)` host hooks, brand from CSS vars only.
 */

import { OtpInput } from "./otp-input";
import { ElvixSaveButton } from "./elvix-save-button";
import { useElvixAppContext, useElvixContext } from "./elvix-provider";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";

/** elvix privacy contact surfaced on the export email-failure path. In the
 *  monorepo this is `PRIVACY_EMAIL` (NEXT_PUBLIC_PRIVACY_EMAIL); here it's the
 *  canonical published value. */
const PRIVACY_EMAIL = "privacy@elvix.is";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Mail,
  RefreshCw,
  Shield,
} from "lucide-react";
import { useEffect, useState } from "react";

export type ExportTarget = { kind: "identity" } | { kind: "app"; appId: string; appName: string };

const Pane = {
  PREVIEW: "preview",
  SEND_TO: "send-to",
  OTP: "otp",
  DONE: "done",
} as const;
type Pane = (typeof Pane)[keyof typeof Pane];

const SLIDE = {
  enter: (dir: 1 | -1) => ({ x: dir * 24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: 1 | -1) => ({ x: dir * -24, opacity: 0 }),
};
const SLIDE_T = { duration: 0.24, ease: [0.22, 0.61, 0.36, 1] as const };

export type ElvixExportResult =
  | { ok: true; downloadId: string; deliveredTo: string }
  | { ok: false; error: string; message?: string };

export function ElvixExport({
  target = { kind: "identity" },
  primaryEmail,
  onSuccess,
  onFail,
  onResult,
}: {
  /** Scope: identity-level export, or per-app export. Defaults to
   *  identity — the most common surface. */
  target?: ExportTarget;
  /** Address the export zip is delivered to. Optional — when
   *  omitted, the SDK reads it from the signed-in user's session
   *  via `useElvixAppContext().user.email`. */
  primaryEmail?: string;
  onSuccess?: (downloadId: string) => void;
  onFail?: (error: string) => void;
  /** Fires on every terminal export outcome. Safe payload: the
   *  single-use downloadId (only redeemable with the OTP-verified
   *  session) + the email address the zip was sent to. */
  onResult?: (result: ElvixExportResult) => void;
}) {
  const appCtx = useElvixAppContext();
  const resolvedEmail = primaryEmail ?? appCtx?.user.email ?? "you@example.com";
  const [pane, setPane] = useState<Pane>("preview");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [doneInfo, setDoneInfo] = useState<{ deliveredTo: string } | null>(null);

  function go(next: Pane, dir: 1 | -1 = 1) {
    setDirection(dir);
    setPane(next);
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <AnimatePresence mode="wait" custom={direction}>
        {pane === "preview" && (
          <motion.div
            key="preview"
            className="flex-1 min-h-0 flex flex-col"
            custom={direction}
            variants={SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SLIDE_T}
          >
            <PreviewPane target={target} go={go} />
          </motion.div>
        )}
        {pane === "send-to" && (
          <motion.div
            key="send-to"
            className="flex-1 min-h-0 flex flex-col"
            custom={direction}
            variants={SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SLIDE_T}
          >
            <SendToPane target={target} primaryEmail={resolvedEmail} go={go} />
          </motion.div>
        )}
        {pane === "otp" && (
          <motion.div
            key="otp"
            className="flex-1 min-h-0 flex flex-col"
            custom={direction}
            variants={SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SLIDE_T}
          >
            <OtpPane
              target={target}
              go={go}
              onSuccess={(downloadId, deliveredTo) => {
                setDoneInfo({ deliveredTo });
                onSuccess?.(downloadId);
                onResult?.({ ok: true, downloadId, deliveredTo });
              }}
              onFail={(error) => {
                onFail?.(error);
                onResult?.({ ok: false, error });
              }}
            />
          </motion.div>
        )}
        {pane === "done" && (
          <motion.div
            key="done"
            className="flex-1 min-h-0 flex flex-col"
            custom={direction}
            variants={SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SLIDE_T}
          >
            <DonePane deliveredTo={doneInfo?.deliveredTo ?? resolvedEmail} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//   1. preview (what's in the archive)
// ─────────────────────────────────────────────────────────────────

function PreviewPane({
  target,
  go,
}: {
  target: ExportTarget;
  go: (p: Pane, d?: 1 | -1) => void;
}) {
  const ctx = useElvixContext();
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<string[]>([]);
  const [label, setLabel] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const qs =
        // LEGACY: spine-lint-disable-next-line spine/enum-over-string
        target.kind === "identity" ? "" : `?applicationId=${encodeURIComponent(target.appId)}`;
      try {
        const res = await fetch(`${ctx.baseUrl}/api/account/export/preview${qs}`, { ...authInit() });
        const body = unwrapEnvelope(await res.json());
        if (cancelled) return;
        if (!res.ok || !body.ok) {
          setErr("Couldn't load the preview. Try again.");
          return;
        }
        setSections(body.sections ?? []);
        setLabel(body.label ?? "");
      } catch {
        if (!cancelled) setErr("Couldn't load the preview. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, ctx.baseUrl]);

  return (
    // Flex column = scrollable body + pinned CTA. The body owns the
    // overflow; the button stays in view regardless of the section
    // count, and the parent <ElvixCard maxHeight=…/> bounds the
    // whole frame so the user never has to scroll the host page to
    // reach Continue.
    <div className="flex flex-col h-full min-h-0">
      {/* Soft fade at the top + bottom edges so scrolling text
          dissolves into the card frame instead of getting hard-
          clipped by overflow. Inner py-6 keeps first/last items
          breathing past the fade band so they're never half-faded
          at rest. 28px band matches the badge tail + bottom CTA
          gap visually so the fade reads as part of the chrome. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide py-6 space-y-4"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0, black 28px, black calc(100% - 28px), transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0, black 28px, black calc(100% - 28px), transparent 100%)",
        }}
      >
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-fg-1">
            What you'll receive
          </div>
          <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-1">
            {target.kind === "identity"
              ? "Your archive will contain a single JSON file with everything below, plus your avatar and banner images if you've uploaded any, plus a README that explains each section in plain language and includes the GDPR Art. 15(1) disclosures."
              : `Your archive will contain a single JSON file scoped to ${label || target.appName}, plus a README that explains each section and includes the GDPR Art. 15(1) disclosures.`}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-[12.5px] text-fg-3">
            <Loader2 className="size-3.5 animate-spin" /> Loading…
          </div>
        ) : err ? (
          <p className="text-[12px] text-red-500 leading-tight">{err}</p>
        ) : (
          <ul className="space-y-1.5">
            {sections.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] text-fg-2 leading-[1.55]">
                <span
                  aria-hidden
                  className="mt-1 size-1.5 rounded-full shrink-0"
                  style={{ background: "var(--elvix-primary-strong)" }}
                />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-[10px] bg-canvas dark:bg-[#101013] border border-dashed border-fg-3/25 px-4 py-3">
          <p className="text-[11.5px] text-fg-3 leading-[1.55]">
            Not included: cryptographic key material on your passkeys, OAuth tokens, OTP codes, and
            any data the apps you use hold about you outside elvix. Contact each app for the latter.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => go("send-to", 1)}
        disabled={loading || !!err}
        className="shrink-0 mt-4 w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-[10px] text-[13px] font-semibold tracking-tight cursor-pointer transition ring-1 ring-black/10 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: "var(--elvix-primary-strong)",
          color: "var(--elvix-on-primary)",
          backgroundImage:
            "linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0) 40%)",
        }}
      >
        <ChevronRight className="size-3.5" /> Continue
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//   2. send-to (confirm email + mint OTP)
// ─────────────────────────────────────────────────────────────────

function SendToPane({
  target,
  primaryEmail,
  go,
}: {
  target: ExportTarget;
  primaryEmail: string;
  go: (p: Pane, d?: 1 | -1) => void;
}) {
  const ctx = useElvixContext();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendCode() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/export/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.headers },
        credentials: auth.credentials,
        body: JSON.stringify({
          applicationId: target.kind === "identity" ? null : target.appId,
        }),
      });
      const body = unwrapEnvelope(await res.json());
      if (!res.ok || !body.ok) {
        setErr(challengeErrorCopy(body.error, body.retryAfterSeconds));
        return;
      }
      sessionStorage.setItem(
        "elvix-pending-export",
        JSON.stringify({
          challengeId: body.challengeId,
          deliveredTo: body.deliveredTo,
          label: body.label,
          applicationId: target.kind === "identity" ? null : target.appId,
        }),
      );
      go("otp", 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <BackBar label="Back" onClick={() => go("preview", -1)} />
      <div className="flex items-start gap-3">
        <span
          className="size-10 rounded-full inline-flex items-center justify-center shrink-0"
          style={{ background: "var(--elvix-primary-12)" }}
        >
          <Mail
            className="size-5"
            strokeWidth={2.2}
            style={{ color: "var(--elvix-primary-strong)" }}
          />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight text-fg-1 leading-tight">
            We'll send your data to your primary email
          </div>
          <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-1">
            Your archive will land in <span className="font-medium text-fg-1">{primaryEmail}</span>{" "}
            as a .zip attachment. Possession of this inbox is the proof of identity, so the file
            never lives at a public URL.
          </p>
        </div>
      </div>

      <div className="rounded-[10px] bg-canvas dark:bg-[#101013] border border-[var(--elvix-primary-12)] px-4 py-3 flex items-start gap-3">
        <Shield className="size-4 text-fg-3 shrink-0 mt-0.5" />
        <div className="text-[11.5px] text-fg-3 leading-[1.55]">
          We send a 6-digit code to your primary inbox first. After you enter it on the next screen,
          we generate your archive and email it to you as a .zip attachment.
        </div>
      </div>

      {err && <p className="text-[12px] text-red-500 leading-tight">{err}</p>}

      <button
        type="button"
        onClick={() => void sendCode()}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-[10px] text-[13px] font-semibold tracking-tight cursor-pointer transition ring-1 ring-black/10 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: "var(--elvix-primary-strong)",
          color: "var(--elvix-on-primary)",
          backgroundImage:
            "linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0) 40%)",
        }}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
        {busy ? "Sending code…" : "Email me a 6-digit code"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//   3. otp (verify + apply)
// ─────────────────────────────────────────────────────────────────

function OtpPane({
  target,
  go,
  onSuccess,
  onFail,
}: {
  target: ExportTarget;
  go: (p: Pane, d?: 1 | -1) => void;
  onSuccess?: (downloadId: string, deliveredTo: string) => void;
  onFail?: (error: string) => void;
}) {
  const ctx = useElvixContext();
  const stash = readStash<{
    challengeId: string;
    deliveredTo: string;
    label: string;
    applicationId: string | null;
  }>("elvix-pending-export");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(30);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  async function resend() {
    if (requesting || resendIn > 0) return;
    setRequesting(true);
    setErr(null);
    try {
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/export/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.headers },
        credentials: auth.credentials,
        body: JSON.stringify({
          applicationId: target.kind === "identity" ? null : target.appId,
        }),
      });
      const body = unwrapEnvelope(await res.json());
      if (!res.ok || !body.ok) {
        // LEGACY: spine-lint-disable-next-line spine/enum-over-string
        if (body.error === "too_recent") setResendIn(body.retryAfterSeconds ?? 30);
        setErr(challengeErrorCopy(body.error, body.retryAfterSeconds));
        return;
      }
      sessionStorage.setItem(
        "elvix-pending-export",
        JSON.stringify({
          challengeId: body.challengeId,
          deliveredTo: body.deliveredTo,
          label: body.label,
          applicationId: target.kind === "identity" ? null : target.appId,
        }),
      );
      setResendIn(30);
    } finally {
      setRequesting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !stash || code.length !== 6) return;
    setBusy(true);
    setErr(null);
    try {
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/export/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth.headers },
        credentials: auth.credentials,
        body: JSON.stringify({
          applicationId: stash.applicationId,
          challengeId: stash.challengeId,
          code,
        }),
      });
      const body = unwrapEnvelope(await res.json());
      if (!res.ok || !body.ok) {
        setErr(applyErrorCopy(body.error, body.attemptsLeft));
        // LEGACY: spine-lint-disable-next-line spine/enum-over-string
        if (body.error === "wrong_code") setCode("");
        onFail?.(body.error ?? "unknown");
        return;
      }
      sessionStorage.removeItem("elvix-pending-export");
      onSuccess?.(body.downloadId, body.deliveredTo ?? stash.deliveredTo);
      go("done", 1);
    } catch {
      setErr("Network error. Try again.");
      onFail?.("network");
    } finally {
      setBusy(false);
    }
  }

  if (!stash) {
    return (
      <div className="space-y-3">
        <BackBar label="Back" onClick={() => go("send-to", -1)} />
        <p className="text-[12px] text-fg-3">No pending code. Send a fresh one.</p>
      </div>
    );
  }
  return (
    <form className="space-y-4" onSubmit={submit}>
      <BackBar label="Back" onClick={() => go("send-to", -1)} />
      <div>
        <div className="text-[15px] font-semibold tracking-tight text-fg-1">
          Confirm with your code
        </div>
        <p className="text-[12.5px] text-fg-3 leading-[1.55] mt-1">
          We sent a 6-digit code to {stash.deliveredTo}. It expires in 10 minutes. Once you enter it
          we'll generate your archive and email it to the same inbox as a .zip attachment.
        </p>
      </div>
      <OtpInput value={code} onChange={setCode} disabled={busy} autoFocus />
      {err && <p className="text-[12px] text-red-500 leading-tight">{err}</p>}
      <ElvixSaveButton
        state={busy ? "saving" : "idle"}
        disabled={busy || code.length !== 6}
        label="Confirm and email me my data"
        savedLabel="Working…"
        hint={null}
      />
      <button
        type="button"
        onClick={() => void resend()}
        disabled={resendIn > 0 || requesting}
        className="w-full inline-flex items-center justify-center gap-1 text-[12px] font-medium text-fg-3 hover:text-fg-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {requesting ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
        {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────
//   4. done
// ─────────────────────────────────────────────────────────────────

function DonePane({ deliveredTo }: { deliveredTo: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-2">
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.34, ease: [0.22, 0.61, 0.36, 1] }}
        className="size-12 rounded-full inline-flex items-center justify-center"
        style={{ background: "var(--elvix-primary-12)" }}
      >
        <CheckCircle2
          className="size-7"
          strokeWidth={2.2}
          style={{ color: "var(--elvix-primary-strong)" }}
        />
      </motion.span>
      <div className="space-y-1 max-w-[340px]">
        <div className="text-[15px] font-semibold tracking-tight text-fg-1">Sent.</div>
        <div className="text-[12.5px] text-fg-3 leading-[1.55]">
          Check your primary inbox ({deliveredTo}) in a minute. Your archive is attached to the
          email as a .zip file. You can request another export of the same target in 24 hours.
        </div>
      </div>
      <a
        href="/account/export"
        className="text-[12.5px] font-medium text-fg-2 hover:text-fg-1 underline underline-offset-4 cursor-pointer"
      >
        Back to exports
      </a>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//   shared
// ─────────────────────────────────────────────────────────────────

function BackBar({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2 hover:text-fg-1 cursor-pointer"
    >
      <ArrowLeft className="size-3.5" />
      {label}
    </button>
  );
}

function readStash<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function challengeErrorCopy(error: string | undefined, retryAfter?: number): string {
  if (!error) return "Couldn't send a code. Try again.";
  if (error === "too_recent") return `Wait ${retryAfter ?? 30}s before requesting again.`;
  if (error === "too_many") return "Too many requests this hour. Try later.";
  if (error === "send_failed") return "Couldn't email the code. Try again.";
  if (error === "export_rate_limit") {
    const h = retryAfter ? Math.ceil(retryAfter / 3600) : 24;
    return `You already exported this in the last 24 hours. Available again in ~${h}h.`;
  }
  if (error === "not_a_member") return "You're not a member of this app any more.";
  if (error === "app_not_found") return "That app isn't available.";
  return "Couldn't send a code. Try again.";
}

function applyErrorCopy(error: string | undefined, attemptsLeft?: number): string {
  if (!error) return "Couldn't generate your export. Try again.";
  if (error === "wrong_code") {
    return `Wrong code. ${attemptsLeft ?? 0} ${(attemptsLeft ?? 0) === 1 ? "try" : "tries"} left.`;
  }
  if (error === "challenge_locked") return "Too many wrong attempts. Send a fresh code.";
  if (error === "challenge_expired") return "That code expired. Send a fresh one.";
  if (error === "generate_failed") return "We couldn't build your export. Try again.";
  if (error === "storage_failed") return "We couldn't store your export. Try again.";
  if (error === "email_delivery_failed")
    return `Your archive was generated but the email failed. Contact ${PRIVACY_EMAIL} to recover the link.`;
  return "Something went wrong. Try again.";
}
