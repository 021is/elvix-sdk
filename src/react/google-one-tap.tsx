"use client";

/**
 * Google Identity Services (GIS) integration — moved VERBATIM from the elvix
 * monorepo (`components/google-one-tap.tsx`). Loads `accounts.google.com/
 * gsi/client` on demand and initialises it with the app's `googleConfig`
 * so every Console toggle (One Tap auto-prompt · Auto-select · Popup
 * window · Use FedCM) takes effect end-to-end:
 *
 *   - `oneTap`     → calls `google.accounts.id.prompt()` on mount
 *   - `autoSelect` → passes `auto_select: true` to `initialize()` so
 *                    users with a single Google session sign in silently
 *   - `fedcm`      → `use_fedcm_for_prompt: true` (browser-native API)
 *   - `popup`      → renders the GIS button in `ux_mode: 'popup'` so
 *                    Google opens in a small window instead of the
 *                    full-page redirect
 *
 * The credential callback hits POST /api/auth/google/credential which
 * verifies the JWT and mints a session — companion to the redirect
 * flow at /api/auth/google/callback.
 *
 * When neither `oneTap` nor `popup` is enabled, this component does
 * nothing visible — the redirect-OAuth anchor in ElvixSignInForm stays in
 * charge of the click path.
 *
 * Only the host-couplings were swapped for the SDK (markup/logic verbatim):
 *   - `@/lib/spine-fetch`'s `unwrapEnvelope` → `./spine-fetch` (verbatim copy).
 *   - same-origin `fetch("/api/auth/google/credential")` → cross-origin
 *     `${baseUrl}/api/auth/google/credential` with the SDK's pre-auth
 *     credentials pattern (`isSameOrigin(baseUrl)` → cookie same-origin,
 *     `"omit"` cross-origin; the session token rides back in the body and
 *     is stored via `setElvixToken`).
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { isSameOrigin, setElvixToken } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { useStableCallback } from "./use-stable-callback";

const UxMode = {
  POPUP: "popup",
  REDIRECT: "redirect",
} as const;
type UxMode = (typeof UxMode)[keyof typeof UxMode];

const Context = {
  SIGNIN: "signin",
  SIGNUP: "signup",
  USE: "use",
} as const;
type Context = (typeof Context)[keyof typeof Context];

const Theme = {
  OUTLINE: "outline",
  FILLED_BLUE: "filled_blue",
  FILLED_BLACK: "filled_black",
} as const;
type Theme = (typeof Theme)[keyof typeof Theme];

const Size = {
  LARGE: "large",
  MEDIUM: "medium",
  SMALL: "small",
} as const;
type Size = (typeof Size)[keyof typeof Size];

const Type = {
  STANDARD: "standard",
  ICON: "icon",
} as const;
type Type = (typeof Type)[keyof typeof Type];

const Shape = {
  RECTANGULAR: "rectangular",
  PILL: "pill",
  CIRCLE: "circle",
  SQUARE: "square",
} as const;
type Shape = (typeof Shape)[keyof typeof Shape];

const Text = {
  SIGNIN_WITH: "signin_with",
  SIGNUP_WITH: "signup_with",
  CONTINUE_WITH: "continue_with",
  SIGNIN: "signin",
} as const;
type Text = (typeof Text)[keyof typeof Text];

const LogoAlignment = {
  LEFT: "left",
  CENTER: "center",
} as const;
type LogoAlignment = (typeof LogoAlignment)[keyof typeof LogoAlignment];

const Surface = {
  CONSOLE: "console",
  ACCOUNT: "account",
  APP: "app",
} as const;
type Surface = (typeof Surface)[keyof typeof Surface];

const GIS_SRC = "https://accounts.google.com/gsi/client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GisInitConfig) => void;
          prompt: (cb?: (notification: unknown) => void) => void;
          renderButton: (parent: HTMLElement, options: GisButtonOptions) => void;
          cancel: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

type GisInitConfig = {
  client_id: string;
  callback: (response: { credential: string }) => void;
  auto_select?: boolean;
  ux_mode?: UxMode;
  use_fedcm_for_prompt?: boolean;
  itp_support?: boolean;
  hosted_domain?: string;
  context?: Context;
  cancel_on_tap_outside?: boolean;
};

type GisButtonOptions = {
  theme?: Theme;
  size?: Size;
  type?: Type;
  shape?: Shape;
  text?: Text;
  logo_alignment?: LogoAlignment;
  width?: string | number;
};

export type GoogleOneTapConfig = {
  oneTap: boolean;
  autoSelect: boolean;
  popup: boolean;
  fedcm: boolean;
  hostedDomain: string;
};

let scriptPromise: Promise<void> | null = null;
function loadGisScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("gis_load_failed")), {
        once: true,
      });
      return;
    }
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gis_load_failed"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

type GisId = NonNullable<Window["google"]>["accounts"]["id"];

/** One GIS initialisation per page. Always popup `ux_mode`: redirect mode
 *  would POST the credential to a `login_uri` (the current page) that must be
 *  pre-registered in Google's Authorized redirect URIs — brittle for every
 *  /sign-in/* path. Popup mode delivers it to `callback` instead. The "Popup
 *  window" setting still shapes the UX but never falls back to redirect. */
function initGis(
  g: GisId,
  clientId: string,
  config: Pick<GoogleOneTapConfig, "autoSelect" | "fedcm" | "hostedDomain">,
  callback: GisInitConfig["callback"],
): void {
  g.initialize({
    client_id: clientId,
    callback,
    auto_select: config.autoSelect,
    use_fedcm_for_prompt: config.fedcm,
    ux_mode: "popup",
    itp_support: true,
    cancel_on_tap_outside: false,
    context: "signin",
    ...(config.hostedDomain ? { hosted_domain: config.hostedDomain } : {}),
  });
}

/** Render the GIS button into `slot`, replacing any previous render. GIS caps
 *  the width at 400px and paints nothing at 0, which some flex/grid layouts
 *  measure on first commit, so the width is clamped with a 360px fallback. */
function renderGisButton(g: GisId, slot: HTMLDivElement): void {
  slot.innerHTML = "";
  const width = Math.min(400, Math.max(240, slot.clientWidth || 360));
  g.renderButton(slot, {
    theme: "outline",
    size: "large",
    shape: "rectangular",
    text: "continue_with",
    logo_alignment: "left",
    width,
  });
}

export const GoogleOneTap = memo(function GoogleOneTap({
  baseUrl,
  clientId,
  intent,
  appClientId,
  config,
  /** When true, also render the GIS button (used for popup ux_mode). */
  renderButton = false,
  /** Visible-on-page slot for the rendered GIS button. */
  buttonContainerRef,
}: {
  /** elvix origin the SDK talks to (cross-origin aware). */
  baseUrl: string;
  /** Google OAuth client_id (from the bootstrap envelope's googleClientId). */
  clientId: string;
  intent: Surface;
  /** App's clientId when intent="app", forwarded to the credential route. */
  appClientId?: string;
  config: GoogleOneTapConfig;
  renderButton?: boolean;
  buttonContainerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [err, setErr] = useState<string | null>(null);
  const initialised = useRef(false);

  const handleCredential = useCallback(
    async (response: { credential: string }) => {
      try {
        const res = await fetch(`${baseUrl}/api/auth/google/credential`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: isSameOrigin(baseUrl) ? "include" : "omit",
          body: JSON.stringify({
            credential: response.credential,
            intent,
            clientId: appClientId,
          }),
        });
        const body = unwrapEnvelope(await res.json()) as {
          ok?: boolean;
          redirect?: string;
          token?: string;
          error?: string;
        };
        if (!res.ok || !body.ok) {
          setErr(body.error ?? "Sign-in failed");
          return;
        }
        // Cross-origin sign-in returns the session token in the body (no
        // cookie is set on a third-party origin). Store it so every
        // subsequent SDK call carries it as a bearer.
        if (body.token) setElvixToken(body.token);
        if (body.redirect) {
          window.location.assign(body.redirect);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Network error");
      }
    },
    [baseUrl, intent, appClientId],
  );
  // GIS is initialised once per page and keeps the callback it was given;
  // hand it a stable one that always runs the latest `handleCredential`.
  const onCredential = useStableCallback(handleCredential);
  // Primitives, not `config`: a parent may pass a fresh object every render,
  // and re-running the GIS setup re-prompts One Tap.
  const { oneTap, autoSelect, fedcm, hostedDomain } = config;

  useEffect(() => {
    if (!clientId) return;
    if (!oneTap && !renderButton) return;
    // Architectural rule: Google Identity Services (GIS) is only loaded
    // when the SDK is HOSTED on the elvix origin itself (e.g. the elvix
    // /sign-in/<clientId> hosted page). On a customer's origin, loading
    // GIS would force Google to check `window.location.origin` against
    // the OAuth client's Authorized JavaScript origins list — which
    // would mean every new customer requires a Google Cloud Console
    // toggle. That defeats multi-tenancy. So cross-origin embeds skip
    // GIS entirely and the host falls back to the redirect button
    // (which navigates through `${baseUrl}/api/auth/google/start`, an
    // elvix-origin endpoint that Google already trusts).
    if (typeof window !== "undefined" && window.location.origin !== baseUrl) {
      return;
    }
    let cancelled = false;
    loadGisScript()
      .then(() => {
        const g = window.google?.accounts?.id;
        if (cancelled || !g) return;
        if (!initialised.current) {
          initGis(g, clientId, { autoSelect, fedcm, hostedDomain }, onCredential);
          initialised.current = true;
        }
        const slot = buttonContainerRef?.current;
        if (renderButton && slot) renderGisButton(g, slot);
        if (oneTap) g.prompt();
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "GIS load failed"));
    return () => {
      cancelled = true;
    };
  }, [
    clientId,
    baseUrl,
    oneTap,
    autoSelect,
    fedcm,
    hostedDomain,
    renderButton,
    onCredential,
    buttonContainerRef,
  ]);

  // Cleanup: cancel any pending One Tap when the component unmounts.
  useEffect(() => {
    return () => {
      const g = window.google?.accounts?.id;
      if (g) g.cancel();
    };
  }, []);

  if (err) {
    return (
      <p className="text-[11.5px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-[8px] px-3 py-2">
        Google sign-in: {err}
      </p>
    );
  }
  return null;
});
