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

// Leading status glyph per kind — a filled accent circle with a white mark, so
// the toast reads at a glance (error / success / info) the way sonner's do.
const ICON: Record<ToastKind, string> = {
  error:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#ef4444"/><path d="M12 7v6M12 16.5h.01" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
  success:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#22c55e"/><path d="M8 12.5l2.5 2.5L16 9.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#71717a"/><path d="M12 11v5M12 7.5h.01" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
};

function show(kind: ToastKind, message: string): void {
  const root = ensureHost();
  if (!root) return;
  const el = document.createElement("div");
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.style.cssText = [
    "pointer-events:auto",
    "display:flex",
    "align-items:center",
    "gap:10px",
    "max-width:380px",
    "padding:12px 16px",
    "border-radius:13px",
    "font-size:13.5px",
    "font-weight:500",
    "line-height:1.45",
    "letter-spacing:-0.01em",
    "color:#fafafa",
    // Frosted near-black slab with a hairline border — sits cleanly on any host bg.
    "background:rgba(24,24,27,0.96)",
    "-webkit-backdrop-filter:blur(8px)",
    "backdrop-filter:blur(8px)",
    "border:1px solid rgba(255,255,255,0.08)",
    "box-shadow:0 1px 2px rgba(0,0,0,0.2),0 12px 32px -8px rgba(0,0,0,0.5)",
    "opacity:0",
    "transform:translateY(8px) scale(0.98)",
    "transition:opacity .2s cubic-bezier(.21,1.02,.73,1),transform .2s cubic-bezier(.21,1.02,.73,1)",
  ].join(";");

  const icon = document.createElement("span");
  icon.style.cssText = "display:flex;flex:0 0 auto;line-height:0";
  icon.innerHTML = ICON[kind];

  const text = document.createElement("span");
  text.textContent = message; // textContent — never inject the message as HTML

  el.append(icon, text);
  root.appendChild(el);
  // animate in
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0) scale(1)";
  });
  // auto-dismiss
  window.setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px) scale(0.98)";
    window.setTimeout(() => el.remove(), 240);
  }, 4500);
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
