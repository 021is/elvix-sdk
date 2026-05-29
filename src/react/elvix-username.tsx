"use client";

/**
 * `<ElvixUsername>` — per-app username wizard, lives inside an
 * `<ElvixCard>`. Same SDK shape as `<ElvixAddressBook>` and the
 * other `<Elvix*>` forms: everything happens *inside the frame*,
 * no page navigation, no auto-redirect on success.
 *
 * Three sub-views, one frame, slide-left/right transitions:
 *
 *   "edit"    — input with live (debounced) format + per-app
 *               uniqueness check. CTA "Continue" enables only when
 *               the candidate is `available`.
 *   "confirm" — review with old → new preview and a single
 *               "Confirm change" CTA. Back arrow returns to edit.
 *   "done"    — success state. The user reads the result, then
 *               leaves the surface themselves (host page handles
 *               navigation via its own back chrome).
 *
 * Errors stay inside the frame too — a failed PATCH bounces back to
 * `edit` with the server message rendered under the input.
 */

import { ElvixInput } from "./elvix-input";
import { ElvixSaveButton } from "./elvix-save-button";
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  type UsernameReason,
  normaliseUsername,
  usernameReason,
} from "./username-rules";
import { useElvixApp, useElvixAppContext, useElvixContext } from "./elvix-provider";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  AtSign,
  Check,
  CheckCircle2,
  Loader2,
  Mail,
  ShieldOff,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 280;

const CheckStatus = {
  FORMAT_INVALID: "format_invalid",
  CURRENT: "current",
  TAKEN: "taken",
  AVAILABLE: "available",
} as const;
type CheckStatus = (typeof CheckStatus)[keyof typeof CheckStatus];
type FieldStatus = "idle" | "checking" | CheckStatus;
const Pane = {
  EDIT: "edit",
  CONFIRM: "confirm",
  DONE: "done",
} as const;
type Pane = (typeof Pane)[keyof typeof Pane];

export type ElvixUsernameResult =
  | { ok: true; username: string }
  | { ok: false; error: string; message?: string };

export function ElvixUsername(props: ElvixUsernameProps) {
  const app = useElvixApp();
  const appCtx = useElvixAppContext();
  // Hydrate from provider context. Explicit props win when set so
  // hosts that thread their own state (Console live preview, server-
  // rendered AccountStage) keep working as-is.
  const appId = props.appId ?? app?.clientId ?? "preview";
  const appName = props.appName ?? app?.appName ?? "your app";
  const current = props.current !== undefined ? props.current : appCtx?.membership?.username ?? null;
  const methodUsername = props.methodUsername ?? app?.methodUsername ?? true;
  const supportUrl = props.supportUrl ?? app?.supportUrl ?? null;
  const supportEmail = props.supportEmail ?? null;
  const { onSuccess, onFail, onResult } = props;

  return (
    <ElvixUsernameInner
      appId={appId}
      appName={appName}
      current={current}
      methodUsername={methodUsername}
      supportUrl={supportUrl}
      supportEmail={supportEmail}
      onSuccess={onSuccess}
      onFail={onFail}
      onResult={onResult}
    />
  );
}

type ElvixUsernameProps = {
  appId?: string;
  appName?: string;
  current?: string | null;
  methodUsername?: boolean;
  supportUrl?: string | null;
  supportEmail?: string | null;
  onSuccess?: (value: string) => void;
  onFail?: (error: string) => void;
  onResult?: (result: ElvixUsernameResult) => void;
};

function ElvixUsernameInner({
  appId,
  appName,
  current,
  methodUsername = true,
  supportUrl = null,
  supportEmail = null,
  onSuccess,
  onFail,
  onResult,
}: {
  appId: string;
  appName: string;
  current: string | null;
  /**
   * Whether the host app currently has username sign-in enabled.
   * When `false`, the SDK renders a disabled-state pane explaining
   * that the feature was turned off by the app owner and routes the
   * user to the app's support surface (URL or mailto:). This still
   * loads when a user previously claimed a username back when the
   * feature was on — they need a clear path to understand why the
   * row is no longer editable. Defaults to `true` so existing
   * embeds that omit the prop keep working.
   */
  methodUsername?: boolean;
  /** App's support URL — preferred contact route when set. */
  supportUrl?: string | null;
  /** App's support email — fallback contact when supportUrl is null. */
  supportEmail?: string | null;
  /**
   * Fires after a successful PATCH. Host hook — typical uses:
   * refresh data, log analytics, optionally navigate away. If the
   * callback navigates / unmounts the SDK, the in-frame done pane
   * never renders (host wins). If omitted, the SDK falls back to
   * its default in-frame done pane.
   */
  onSuccess?: (value: string) => void;
  /**
   * Fires after a failed PATCH. The SDK always renders the error
   * inline regardless — this hook is for the host to log / toast.
   */
  onFail?: (error: string) => void;
  /**
   * Fires on every terminal outcome — success AND every error path.
   * Mirrors the Spine ResponseDto shape the rest of the elvix API
   * surfaces. Safe payload: only the claimed username (already
   * public on the app). `onSuccess` / `onFail` keep firing too for
   * the legacy contract.
   */
  onResult?: (result: ElvixUsernameResult) => void;
}) {
  if (!methodUsername) {
    return (
      <DisabledPane
        appName={appName}
        current={current}
        supportUrl={supportUrl}
        supportEmail={supportEmail}
      />
    );
  }
  const ctx = useElvixContext();
  const [pane, setPane] = useState<Pane>("edit");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [value, setValue] = useState(current ?? "");
  const [status, setStatus] = useState<FieldStatus>("idle");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // The persisted "what's on the server right now" value. Starts as
  // `current`, swaps to the new value on a successful save so the
  // done pane reads the truth even if the user opened the wizard
  // multiple times in one session.
  const [persisted, setPersisted] = useState<string | null>(current);
  const checkSeq = useRef(0);

  // Debounced per-keystroke check. Sequence-number race guard so a
  // stale response can't overwrite the latest typed value.
  useEffect(() => {
    // LEGACY: spine-lint-disable-next-line spine/enum-over-string
    if (pane !== "edit") return;
    const normalised = normaliseUsername(value);
    if (!normalised) {
      setStatus("idle");
      return;
    }
    const reason = usernameReason(normalised);
    if (reason !== "ok") {
      setStatus("format_invalid");
      return;
    }
    if (normalised === persisted) {
      setStatus("current");
      return;
    }
    setStatus("checking");
    const seq = ++checkSeq.current;
    const t = setTimeout(async () => {
      try {
        const auth = authInit();
        const res = await fetch(`${ctx.baseUrl}/api/account/apps/${appId}/username/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...auth.headers },
          credentials: auth.credentials,
          body: JSON.stringify({ username: normalised }),
        });
        const body = unwrapEnvelope(await res.json()) as {
          ok: boolean;
          status?: CheckStatus;
        };
        if (seq !== checkSeq.current) return;
        if (body.ok && body.status) setStatus(body.status);
        else setStatus("format_invalid");
      } catch {
        if (seq !== checkSeq.current) return;
        setStatus("format_invalid");
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value, appId, persisted, pane, ctx.baseUrl]);

  const normalised = normaliseUsername(value);
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  const canContinue = !saving && status === "available";

  function goConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue) return;
    setDirection(1);
    setPane("confirm");
  }

  function goBackToEdit() {
    setDirection(-1);
    setPane("edit");
    setServerError(null);
  }

  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    setServerError(null);
    try {
      const auth = authInit();
      const res = await fetch(`${ctx.baseUrl}/api/account/apps/${appId}/username`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth.headers },
        credentials: auth.credentials,
        body: JSON.stringify({ username: normalised }),
      });
      const body = unwrapEnvelope(await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        const message =
          // LEGACY: spine-lint-disable-next-line spine/enum-over-string
          body.error === "taken"
            ? "That username was just taken. Pick another."
            // LEGACY: spine-lint-disable-next-line spine/enum-over-string
            : body.error === "format_invalid"
              ? "That username doesn't match the rules."
              : "Couldn't save. Try again.";
        setServerError(message);
        onFail?.(message);
        onResult?.({ ok: false, error: body.error ?? "save_failed", message });
        goBackToEdit();
        return;
      }
      setPersisted(normalised);
      // Host hook fires first. If the host navigates away or unmounts
      // the SDK, the in-frame done pane never renders. If the host
      // doesn't provide a hook (or its hook is a no-op), we fall
      // through to the SDK's default done pane.
      onResult?.({ ok: true, username: normalised });
      onSuccess?.(normalised);
      if (!onSuccess) {
        setDirection(1);
        setPane("done");
      }
    } catch {
      const message = "Network hiccup. Try again.";
      setServerError(message);
      onFail?.(message);
      onResult?.({ ok: false, error: "network_error", message });
      goBackToEdit();
    } finally {
      setSaving(false);
    }
  }

  function goEditAgain() {
    setDirection(-1);
    setValue(persisted ?? "");
    setStatus("idle");
    setPane("edit");
  }

  return (
    <div className="relative overflow-hidden">
      <AnimatePresence mode="wait" custom={direction}>
        {pane === "edit" && (
          <motion.div
            key="edit"
            custom={direction}
            variants={paneVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={paneTransition}
          >
            <EditPane
              value={value}
              setValue={setValue}
              status={status}
              persisted={persisted}
              serverError={serverError}
              canContinue={canContinue}
              onSubmit={goConfirm}
            />
          </motion.div>
        )}
        {pane === "confirm" && (
          <motion.div
            key="confirm"
            custom={direction}
            variants={paneVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={paneTransition}
          >
            <ConfirmPane
              current={persisted}
              next={normalised}
              saving={saving}
              onBack={goBackToEdit}
              onConfirm={handleConfirm}
            />
          </motion.div>
        )}
        {pane === "done" && (
          <motion.div
            key="done"
            custom={direction}
            variants={paneVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={paneTransition}
          >
            <DonePane
              username={persisted ?? normalised}
              appName={appName}
              onChangeAgain={goEditAgain}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EditPane({
  value,
  setValue,
  status,
  persisted,
  serverError,
  canContinue,
  onSubmit,
}: {
  value: string;
  setValue: (v: string) => void;
  status: FieldStatus;
  persisted: string | null;
  serverError: string | null;
  canContinue: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const hasError = status === "format_invalid" || status === "taken" || Boolean(serverError);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-[12.5px] font-medium text-fg-2 mb-1.5">Username</label>
        <div className="relative">
          <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-3 pointer-events-none" />
          <ElvixInput
            autoFocus
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="yourname"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\s+/g, ""))}
            hasError={hasError}
            className="pl-9 pr-9"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <StatusBadge status={status} />
          </span>
        </div>
        <StatusLine status={status} value={value} current={persisted} serverError={serverError} />
      </div>

      <ul className="text-[11.5px] text-fg-3 leading-[1.55] list-disc pl-4 space-y-0.5">
        <li>
          {USERNAME_MIN_LENGTH}–{USERNAME_MAX_LENGTH} characters
        </li>
        <li>lowercase letters, digits, dot, underscore</li>
        <li>start with a letter, end with a letter or digit</li>
        <li>no two specials in a row, no reserved words</li>
      </ul>

      <ElvixSaveButton state="idle" disabled={!canContinue} label="Continue" hint="Enter" />
    </form>
  );
}

function ConfirmPane({
  current,
  next,
  saving,
  onBack,
  onConfirm,
}: {
  current: string | null;
  next: string;
  saving: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        disabled={saving}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2 hover:text-fg-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ArrowLeft className="size-3.5" />
        Back
      </button>

      <div className="rounded-[12px] p-4 bg-white dark:bg-[#101013] border border-[var(--elvix-primary-12)]">
        <div className="text-[12px] uppercase tracking-[0.06em] font-medium text-fg-3">
          Confirm change
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <PreviewChip>{current ? `@${current}` : "Not set"}</PreviewChip>
          <span className="text-fg-3">→</span>
          <PreviewChip emphasis>{`@${next}`}</PreviewChip>
        </div>
        <p className="text-[12px] text-fg-3 leading-[1.55] mt-3">
          Anyone signing into this app with this username will be you. You can change it again any
          time.
        </p>
      </div>

      <ElvixSaveButton
        state={saving ? "saving" : "idle"}
        disabled={saving}
        label="Confirm change"
        savedLabel="Saved"
        hint={null}
        onClick={onConfirm}
        autoFocus
      />
    </div>
  );
}

function DonePane({
  username,
  appName,
  onChangeAgain,
}: {
  username: string;
  appName: string;
  onChangeAgain: () => void;
}) {
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
      <div className="space-y-1">
        <div className="text-[15px] font-semibold tracking-tight text-fg-1">
          You're @{username} on {appName}.
        </div>
        <div className="text-[12.5px] text-fg-3 leading-[1.55]">
          We saved it. You can keep using this surface, or head back when you're ready.
        </div>
      </div>
      <button
        type="button"
        onClick={onChangeAgain}
        className="text-[12.5px] font-medium text-fg-2 hover:text-fg-1 underline underline-offset-4 cursor-pointer"
      >
        Change it again
      </button>
    </div>
  );
}

/**
 * Rendered when the host app has `methodUsername=false`. This is the
 * "feature off" state — distinct from network errors or validation
 * failures. The user reads what happened (in plain language) and is
 * given a concrete next step: contact the app's support surface. We
 * prefer `supportUrl` (rich page) over `supportEmail` (mailto:) when
 * both are set.
 */
function DisabledPane({
  appName,
  current,
  supportUrl,
  supportEmail,
}: {
  appName: string;
  current: string | null;
  supportUrl: string | null;
  supportEmail: string | null;
}) {
  const hasSupport = Boolean(supportUrl || supportEmail);
  const supportHref = supportUrl
    ? supportUrl
    : supportEmail
      ? `mailto:${supportEmail}?subject=${encodeURIComponent(`Re-enable username sign-in on ${appName}`)}`
      : null;
  const supportLabel = supportUrl ? `Contact ${appName} support` : `Email ${appName}`;
  const SupportIcon = supportUrl ? ArrowUpRight : Mail;

  return (
    <div className="flex flex-col items-center text-center gap-4 py-2">
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.34, ease: [0.22, 0.61, 0.36, 1] }}
        className="size-12 rounded-full inline-flex items-center justify-center"
        style={{ background: "var(--elvix-primary-12)" }}
      >
        <ShieldOff
          className="size-7"
          strokeWidth={2.2}
          style={{ color: "var(--elvix-primary-strong)" }}
        />
      </motion.span>
      <div className="space-y-1 max-w-[320px]">
        <div className="text-[15px] font-semibold tracking-tight text-fg-1">
          Usernames are off on {appName}.
        </div>
        <div className="text-[12.5px] text-fg-3 leading-[1.55]">
          The app owner currently has username sign-in disabled, so we can't let you set or change
          your username here.
          {current ? (
            <>
              {" "}
              You still have <span className="font-mono text-fg-2">@{current}</span> from before. It
              stays on your membership until the app owner turns the feature back on.
            </>
          ) : null}
        </div>
      </div>
      {hasSupport && supportHref ? (
        <a
          href={supportHref}
          target={supportUrl ? "_blank" : undefined}
          rel={supportUrl ? "noopener noreferrer" : undefined}
          className="group inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[13px] font-semibold tracking-tight transition cursor-pointer ring-1 ring-black/10"
          style={{
            background: "var(--elvix-primary-strong)",
            color: "var(--elvix-on-primary)",
          }}
        >
          <SupportIcon className="size-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          {supportLabel}
        </a>
      ) : (
        <p className="text-[12px] text-fg-3 leading-[1.55] max-w-[320px]">
          The app hasn't published a support contact yet. Reach out through whatever channel you
          usually use with them.
        </p>
      )}
      <p className="text-[11px] text-fg-3 leading-[1.55] max-w-[320px]">
        Ask them to flip Username sign-in back on in Console → Sign-in methods. Once they do, you
        can come back here and pick a username.
      </p>
    </div>
  );
}

function PreviewChip({
  children,
  emphasis,
}: {
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center h-8 px-3 rounded-full text-[13px] font-semibold tracking-tight"
      style={
        emphasis
          ? {
              background: "var(--elvix-primary-12)",
              color: "var(--elvix-primary-strong)",
            }
          : {
              background: "color-mix(in srgb, currentColor 6%, transparent)",
              color: "var(--elvix-fg-2, #555)",
            }
      }
    >
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: FieldStatus }) {
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  if (status === "checking") {
    return <Loader2 className="size-4 text-fg-3 animate-spin" />;
  }
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  if (status === "available" || status === "current") {
    return <Check className="size-4" style={{ color: "var(--elvix-primary-strong)" }} />;
  }
  if (status === "taken" || status === "format_invalid") {
    return <X className="size-4 text-red-500" />;
  }
  return null;
}

function StatusLine({
  status,
  value,
  current,
  serverError,
}: {
  status: FieldStatus;
  value: string;
  current: string | null;
  serverError: string | null;
}) {
  if (serverError) {
    return <p className="text-[12px] text-red-500 leading-tight mt-1.5">{serverError}</p>;
  }
  if (status === "idle") {
    return (
      <p className="text-[12px] text-fg-3 leading-tight mt-1.5">
        {current
          ? `Currently @${current}. Type something different to change it.`
          : "Pick a name other people on this app can use to find you."}
      </p>
    );
  }
  if (status === "checking") {
    return <p className="text-[12px] text-fg-3 leading-tight mt-1.5">Checking…</p>;
  }
  if (status === "format_invalid") {
    const reason = usernameReason(normaliseUsername(value));
    const message = REASON_COPY[reason] ?? "Doesn't match the rules below.";
    return <p className="text-[12px] text-red-500 leading-tight mt-1.5">{message}</p>;
  }
  if (status === "taken") {
    return (
      <p className="text-[12px] text-red-500 leading-tight mt-1.5">
        Someone else on this app already has @{normaliseUsername(value)}.
      </p>
    );
  }
  if (status === "current") {
    return (
      <p className="text-[12px] text-fg-3 leading-tight mt-1.5">
        That's the username you already have here.
      </p>
    );
  }
  return (
    <p
      className="text-[12px] leading-tight mt-1.5"
      style={{ color: "var(--elvix-primary-strong)" }}
    >
      @{value.trim().toLowerCase()} is available.
    </p>
  );
}

const REASON_COPY: Partial<Record<UsernameReason, string>> = {
  too_short: `Username is too short (need at least ${USERNAME_MIN_LENGTH}).`,
  too_long: `Username is too long (max ${USERNAME_MAX_LENGTH}).`,
  bad_chars: "Only lowercase letters, digits, dot, and underscore.",
  must_start_letter: "Must start with a letter.",
  must_end_alnum: "Must end with a letter or digit.",
  no_double_special: "Can't have two dots or underscores in a row.",
  reserved: "That username is reserved. Pick another.",
};

const paneVariants = {
  enter: (dir: 1 | -1) => ({ x: dir * 24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: 1 | -1) => ({ x: dir * -24, opacity: 0 }),
};

const paneTransition = { duration: 0.24, ease: [0.22, 0.61, 0.36, 1] as const };
