"use client";

/**
 * Minimal self-mounting toast — the SDK-local stand-in for `sonner`.
 *
 * The elvix monorepo's `<ElvixAvatar>` / `<ElvixBanner>` / `<ElvixIdentityForm>`
 * surface save failures with `toast.error(...)` from `sonner`, which the elvix
 * app mounts a `<Toaster/>` for at its root. A host embedding the SDK on its
 * own origin has no such root, so depending on `sonner` would make the toasts
 * silently no-op (no `<Toaster/>` → nothing renders). To keep those component
 * lines verbatim (`import { toast } from "./toast"` is the only swap) AND keep
 * the failure feedback visible with zero host setup, this provides the same
 * `toast.error` / `toast.success` / `toast` callable API, self-mounting a tiny
 * fixed-position stack into `document.body` the first time it's called.
 *
 * No host dependency, SSR-safe (no-ops without `window`).
 */

type ToastKind = "error" | "success" | "info";

let host: HTMLDivElement | null = null;

function ensureHost(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  if (host && document.body.contains(host)) return host;
  host = document.createElement("div");
  host.setAttribute("data-elvix-toaster", "");
  host.style.cssText = [
    "position:fixed",
    "z-index:2147483000",
    "bottom:20px",
    "left:50%",
    "transform:translateX(-50%)",
    "display:flex",
    "flex-direction:column",
    "gap:8px",
    "align-items:center",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(host);
  return host;
}

function show(kind: ToastKind, message: string): void {
  const root = ensureHost();
  if (!root) return;
  const el = document.createElement("div");
  const accent =
    kind === "error" ? "#ef4444" : kind === "success" ? "#16a34a" : "rgba(0,0,0,0.6)";
  el.style.cssText = [
    "pointer-events:auto",
    "max-width:360px",
    "padding:10px 14px",
    "border-radius:10px",
    "font-size:13px",
    "font-weight:500",
    "line-height:1.4",
    "color:#fafafa",
    "background:#18181b",
    `box-shadow:0 4px 16px rgba(0,0,0,0.25),inset 0 0 0 1px ${accent}`,
    "opacity:0",
    "transform:translateY(6px)",
    "transition:opacity .18s ease,transform .18s ease",
  ].join(";");
  el.textContent = message;
  root.appendChild(el);
  // animate in
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });
  // auto-dismiss
  window.setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    window.setTimeout(() => el.remove(), 220);
  }, 4000);
}

type ToastFn = ((message: string) => void) & {
  error: (message: string) => void;
  success: (message: string) => void;
  info: (message: string) => void;
};

export const toast: ToastFn = Object.assign((message: string) => show("info", message), {
  error: (message: string) => show("error", message),
  success: (message: string) => show("success", message),
  info: (message: string) => show("info", message),
});
