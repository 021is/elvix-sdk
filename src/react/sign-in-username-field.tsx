"use client";

/**
 * The username step's field (out of `sign-in-steps.tsx` with the "@" fix, 0.26): the "@"
 * prefix, the live availability check and its hint under the field. The text starts after
 * the prefix's measured width (`prefix-inset.ts`), never at a fixed padding.
 */

import { Check, Loader2, X } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";
import { useT } from "../locale/use-t";
import { PREFIX_INSET_PX, usePrefixInset } from "./prefix-inset";
import { send } from "./profile-request";
import { authInit } from "./session";
import { usernameReasonLabel } from "./sign-in-copy";
import { unwrapEnvelope } from "./spine-fetch";

export const UsernameCheck = {
  IDLE: "idle",
  CHECKING: "checking",
  AVAILABLE: "available",
  REJECTED: "rejected",
  /** No answer: the network, elvix refusing the request, or not an answer at all. */
  FAILED: "failed",
} as const;
type CheckKind = (typeof UsernameCheck)[keyof typeof UsernameCheck];
export type UsernameCheck =
  | { kind: Exclude<CheckKind, typeof UsernameCheck.REJECTED> }
  | { kind: typeof UsernameCheck.REJECTED; reason: string };

const CHECK_DEBOUNCE_MS = 220;

/** What elvix's answer makes of the check, each field checked where it enters: failed (not
 *  an answer), free, or refused with its reason (a string, else the code's own). */
function checkOf(answer: unknown): UsernameCheck {
  if (typeof answer !== "object" || answer === null) return { kind: UsernameCheck.FAILED };
  const [ok, available, reason] = ["ok", "available", "reason"].map((k) => Reflect.get(answer, k));
  if (ok !== false && available === true) return { kind: UsernameCheck.AVAILABLE };
  const fallback = ok === false ? "invalid" : "taken";
  return { kind: UsernameCheck.REJECTED, reason: typeof reason === "string" ? reason : fallback };
}

/** Live availability of `value`, debounced; only the latest answer lands. */
export function useUsernameCheck(baseUrl: string, value: string): UsernameCheck {
  const [check, setCheck] = useState<UsernameCheck>({ kind: UsernameCheck.IDLE });
  useEffect(() => {
    const candidate = value.trim().toLowerCase();
    if (!candidate) {
      setCheck({ kind: UsernameCheck.IDLE });
      return;
    }
    setCheck({ kind: UsernameCheck.CHECKING });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const res = await send(
        `${baseUrl}/api/onboarding/username/check?u=${encodeURIComponent(candidate)}`,
        { signal: controller.signal, ...authInit() },
      );
      if (controller.signal.aborted) return;
      // A refused request (a 429, a 500) is no verdict on the name: never "isn't valid".
      const body = res?.ok ? await res.json().catch(() => null) : null;
      if (controller.signal.aborted) return;
      setCheck(checkOf(body === null ? null : unwrapEnvelope<unknown>(body)));
    }, CHECK_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [baseUrl, value]);
  return check;
}

function UsernameStatus({ check }: { check: UsernameCheck }) {
  const icon = "size-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none";
  switch (check.kind) {
    case UsernameCheck.CHECKING:
      return <Loader2 className={`${icon} text-fg-3 animate-spin`} />;
    case UsernameCheck.AVAILABLE:
      return <Check className={`${icon} text-emerald-500`} />;
    case UsernameCheck.REJECTED:
    case UsernameCheck.FAILED:
      return <X className={`${icon} text-red-500`} />;
    default:
      return null;
  }
}

function UsernameHint({ check }: { check: UsernameCheck }) {
  const t = useT();
  switch (check.kind) {
    case UsernameCheck.CHECKING:
      return <span className="text-fg-3">{t("username.checking")}</span>;
    case UsernameCheck.AVAILABLE:
      return <span className="text-emerald-500">{t("username.availableHint")}</span>;
    case UsernameCheck.REJECTED:
      return <span className="text-red-500">{usernameReasonLabel(t, check.reason)}</span>;
    case UsernameCheck.FAILED:
      return <span className="text-red-500">{t("username.errorNetwork")}</span>;
    default:
      return <span className="text-fg-3">{t("username.rulesHint")}</span>;
  }
}

export function UsernameField({
  field,
  value,
  onChange,
  check,
  disabled,
}: {
  field: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  check: UsernameCheck;
  disabled: boolean;
}) {
  const t = useT();
  const { prefix, paddingLeft } = usePrefixInset(field);
  return (
    <div>
      <label htmlFor="onboarding-username" className="block text-[12px] text-fg-3 mb-1.5">
        {t("username.label")}
      </label>
      <div className="relative">
        <span
          ref={prefix}
          data-elvix-prefix
          className="absolute top-1/2 -translate-y-1/2 text-[14px] text-fg-3 pointer-events-none"
          style={{ left: PREFIX_INSET_PX }}
        >
          @
        </span>
        <input
          id="onboarding-username"
          type="text"
          ref={field}
          autoComplete="username"
          enterKeyHint="go"
          value={value}
          minLength={4}
          maxLength={30}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("username.exampleHandle")}
          disabled={disabled}
          className="elvix-field w-full h-11 pr-10 text-[14px] disabled:cursor-not-allowed"
          style={{ paddingLeft }}
        />
        <UsernameStatus check={check} />
      </div>
      <p className="text-[11px] mt-1.5 leading-relaxed min-h-[14px]">
        <UsernameHint check={check} />
      </p>
    </div>
  );
}
