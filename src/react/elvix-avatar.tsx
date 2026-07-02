"use client";

/**
 * `<ElvixAvatar>` — editable avatar for the elvix Profile SDK.
 *
 * Sibling of the read-only `<UserAvatar>` — same display API, plus
 * an in-place mini-wizard that lives entirely inside the avatar's
 * circle. No modals. No size changes between states.
 *
 * Pane flow (all rendered inside the circle, icons only):
 *   display        → tap the bottom half-circle hint
 *   choice         → ◯ Replace | ◯ Remove (icon-only)
 *   cropping       → react-easy-crop fills the circle
 *   remove-confirm → X | ✓
 *   working        → spinner
 *
 * All panes use a top-left ArrowLeft back affordance matching the
 * other elvix wizards. Buttons are icon-only because the circle is
 * compact — text wouldn't fit cleanly.
 */

import { UserAvatar, type UserAvatarProps } from "./user-avatar";
import { ElvixUserAvatar } from "./elvix-user-avatar";
import { mediaKey, publishMedia } from "./live-media";
import { cropToBlob } from "./image-crop";
import { useElvixApp, useElvixAppContext, useElvixContext } from "./elvix-provider";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { useT } from "../locale/use-t";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Camera, Check, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "./toast";

const Variant = {
  BRAND: "brand",
  DANGER: "danger",
  NEUTRAL: "neutral",
} as const;
type Variant = (typeof Variant)[keyof typeof Variant];


export type ElvixAvatarResult =
  | { ok: true; sizes: number[]; updatedAt: string }
  | { ok: false; error: string; message?: string };

/**
 * Two modes, one component:
 *   "edit" (default) — the in-place upload/crop/remove wizard.
 *   "view"           — read-only display (delegates to <ElvixUserAvatar>),
 *                      and it live-updates the instant an "edit" instance
 *                      changes the photo (same tab or another tab).
 */
export const ElvixAvatarMode = {
  VIEW: "view",
  EDIT: "edit",
} as const;
export type ElvixAvatarMode = (typeof ElvixAvatarMode)[keyof typeof ElvixAvatarMode];

export type ElvixAvatarProps = Omit<UserAvatarProps, "size"> & {
  applicationId: string;
  /** "edit" (default) = the wizard; "view" = read-only, live-updating display. */
  mode?: ElvixAvatarMode;
  /** Diameter (px). Default 128. The widget stays at this size in
   *  every state — no expand-on-edit. */
  size?: number;
  /** Fired after a successful upload / remove. */
  onChange?: (next: { sizes: number[]; updatedAt: Date | number }) => void;
  /** Fires on every terminal upload / remove outcome. Safe payload:
   *  rendered avatar sizes + updatedAt only (no image bytes). */
  onResult?: (result: ElvixAvatarResult) => void;
};

// Remove-confirm pane retired — Trash inside the choice ring fires
// the delete directly, no double-confirm.
const View = {
  DISPLAY: "display",
  CHOICE: "choice",
  CROPPING: "cropping",
  WORKING: "working",
} as const;
type View = (typeof View)[keyof typeof View];

export function ElvixAvatar(props: Partial<ElvixAvatarProps>) {
  const app = useElvixApp();
  const appCtx = useElvixAppContext();
  const resolved: ElvixAvatarProps = {
    applicationId: props.applicationId ?? app?.applicationId ?? "preview",
    appSlug: props.appSlug ?? app?.urlSlug ?? "preview",
    userId: props.userId ?? appCtx?.user.id ?? "preview-user",
    membership: props.membership ?? {
      avatarSizes: appCtx?.membership?.avatarSizes ?? [],
      avatarUpdatedAt: appCtx?.membership?.avatarUpdatedAt
        ? new Date(appCtx.membership.avatarUpdatedAt)
        : new Date(0),
    },
    user: props.user ?? {
      name: appCtx?.user.name ?? null,
      email: appCtx?.user.email ?? null,
      avatarUrl: appCtx?.user.avatarUrl ?? null,
    },
    size: props.size,
    shape: props.shape,
    className: props.className,
    onChange: props.onChange,
    onResult: props.onResult,
    mode: props.mode ?? "edit",
  };
  // View mode = the read-only display sibling, which subscribes to the live
  // avatar store and updates the instant an "edit" instance changes the photo.
  if (resolved.mode === "view") {
    return (
      <ElvixUserAvatar
        appSlug={resolved.appSlug}
        userId={resolved.userId}
        size={resolved.size ?? 40}
        shape={resolved.shape}
        className={resolved.className}
        membership={resolved.membership}
        user={resolved.user}
      />
    );
  }
  return <ElvixAvatarInner {...resolved} />;
}

function ElvixAvatarInner({
  applicationId,
  size = 128,
  onChange,
  onResult,
  ...avatarProps
}: ElvixAvatarProps) {
  const ctx = useElvixContext();
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>("display");

  const [sizes, setSizes] = useState<number[]>(avatarProps.membership.avatarSizes);
  const [updatedAt, setUpdatedAt] = useState<Date | number>(avatarProps.membership.avatarUpdatedAt);
  // Track the OAuth-derived fallback URL locally too. Server-rendered
  // props don't react to client-side removal, so without this the
  // wizard would still think a Google photo is present even after
  // the backend cleared `User.avatarUrl` on self-flow DELETE.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(avatarProps.user?.avatarUrl ?? null);
  const liveUser = { ...avatarProps.user, avatarUrl };
  const hasMedia = sizes.length > 0;
  const hasRemovable = hasMedia || Boolean(avatarUrl);

  const [source, setSource] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, p: Area) => setPixels(p), []);

  const openPicker = () => fileInputRef.current?.click();

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (source) URL.revokeObjectURL(source);
    setSource(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setPixels(null);
    setView("cropping");
  };

  const cancelEdit = () => {
    if (source) URL.revokeObjectURL(source);
    setSource(null);
    setPixels(null);
    setView("display");
  };

  const handleUpload = async () => {
    if (!source || !pixels) return;
    setView("working");
    try {
      const blob = await cropToBlob(source, pixels, 2400, 0.92);

      // Preview mode: keep the upload entirely in-memory. The docs
      // catalog mounts every demo with `applicationId="preview"` (set
      // by `<PreviewShell>`) — short-circuit the network call, stash
      // a blob URL as the OAuth-fallback avatarUrl, and let the
      // existing display layer render it.
      if (applicationId === "preview") {
        const blobUrl = URL.createObjectURL(blob);
        setAvatarUrl(blobUrl);
        setSizes([]);
        const now = Date.now();
        setUpdatedAt(now);
        onChange?.({ sizes: [], updatedAt: now });
        onResult?.({ ok: true, sizes: [], updatedAt: new Date(now).toISOString() });
        setView("display");
        if (source) URL.revokeObjectURL(source);
        setSource(null);
        return;
      }

      const fd = new FormData();
      fd.append("file", blob, "avatar.jpg");
      const auth = authInit();
      const res = await fetch(
        `${ctx.baseUrl}/api/applications/${applicationId}/users/${avatarProps.userId}/images/avatar`,
        { method: "PUT", body: fd, headers: auth.headers, credentials: auth.credentials },
      );
      if (!res.ok) throw new Error("upload_failed");
      const body = unwrapEnvelope(await res.json().catch(() => ({}))) as {
        avatarSizes?: number[];
        avatarUpdatedAt?: string;
      };
      const nextSizes = body.avatarSizes ?? sizes;
      const nextTs = body.avatarUpdatedAt ? new Date(body.avatarUpdatedAt) : Date.now();
      setSizes(nextSizes);
      setUpdatedAt(nextTs);
      // Broadcast so every read-only avatar (this tab + other tabs) updates now.
      publishMedia(mediaKey("avatar", avatarProps.userId), {
        sizes: nextSizes,
        updatedAt: nextTs instanceof Date ? nextTs.getTime() : nextTs,
        fallbackUrl: avatarUrl,
      });
      onChange?.({ sizes: nextSizes, updatedAt: nextTs });
      onResult?.({
        ok: true,
        sizes: nextSizes,
        updatedAt: new Date(nextTs).toISOString(),
      });
      setView("display");
    } catch {
      const msg = t("avatar.uploadFailed");
      toast.error(msg);
      onResult?.({
        ok: false,
        error: "upload_failed",
        message: msg,
      });
      setView("cropping");
    } finally {
      if (source) URL.revokeObjectURL(source);
      setSource(null);
    }
  };

  const handleRemove = async () => {
    setView("working");
    try {
      // Preview mode: clear the in-memory blob URL — no network call.
      if (applicationId === "preview") {
        if (avatarUrl?.startsWith("blob:")) URL.revokeObjectURL(avatarUrl);
        setAvatarUrl(null);
        setSizes([]);
        const now = Date.now();
        setUpdatedAt(now);
        onChange?.({ sizes: [], updatedAt: now });
        onResult?.({ ok: true, sizes: [], updatedAt: new Date(now).toISOString() });
        setView("display");
        return;
      }

      const auth = authInit();
      const res = await fetch(
        `${ctx.baseUrl}/api/applications/${applicationId}/users/${avatarProps.userId}/images/avatar`,
        { method: "DELETE", headers: auth.headers, credentials: auth.credentials },
      );
      if (!res.ok) throw new Error("delete_failed");
      const body = unwrapEnvelope(await res.json().catch(() => ({}))) as {
        avatarSizes?: number[];
        avatarUpdatedAt?: string;
        userAvatarUrl?: string | null;
      };
      const nextSizes = body.avatarSizes ?? [];
      const nextTs = body.avatarUpdatedAt ? new Date(body.avatarUpdatedAt) : Date.now();
      setSizes(nextSizes);
      setUpdatedAt(nextTs);
      // Server returns the post-delete `User.avatarUrl` so we mirror
      // exactly what it has. Two-step progressive remove:
      //   step 1 (CDN cleared): server still has the OAuth photo →
      //     userAvatarUrl arrives populated → preview falls back to it.
      //   step 2 (OAuth cleared after CDN was already empty):
      //     userAvatarUrl arrives null → preview drops to initials.
      // `userAvatarUrl === undefined` would mean the server didn't
      // touch it (admin flow); we keep the existing local value.
      const nextAvatarUrl = body.userAvatarUrl !== undefined ? body.userAvatarUrl : avatarUrl;
      if (body.userAvatarUrl !== undefined) {
        setAvatarUrl(body.userAvatarUrl);
      }
      // Broadcast the post-remove state so read-only avatars drop to the
      // fallback / initials immediately.
      publishMedia(mediaKey("avatar", avatarProps.userId), {
        sizes: nextSizes,
        updatedAt: nextTs instanceof Date ? nextTs.getTime() : nextTs,
        fallbackUrl: nextAvatarUrl,
      });
      onChange?.({ sizes: nextSizes, updatedAt: nextTs });
      onResult?.({
        ok: true,
        sizes: nextSizes,
        updatedAt: new Date(nextTs).toISOString(),
      });
      setView("display");
    } catch {
      const msg = t("avatar.removeFailed");
      toast.error(msg);
      onResult?.({
        ok: false,
        error: "delete_failed",
        message: msg,
      });
      setView("choice");
    }
  };

  return (
    <div className="relative shrink-0 rounded-full" style={{ width: size, height: size }}>
      <AnimatePresence initial={false}>
        {view === "display" ? (
          <DisplayLayer
            key="display"
            avatarProps={{ ...avatarProps, user: liveUser }}
            size={size}
            sizes={sizes}
            updatedAt={updatedAt}
            hasMedia={hasMedia}
            onTap={() => setView("choice")}
          />
        ) : view === "choice" ? (
          <ChoiceLayer
            key="choice"
            size={size}
            avatarProps={{ ...avatarProps, user: liveUser }}
            sizes={sizes}
            updatedAt={updatedAt}
            hasMedia={hasMedia}
            hasRemovable={hasRemovable}
            onReplace={() => {
              setView("display");
              requestAnimationFrame(openPicker);
            }}
            onRemove={handleRemove}
            onBack={() => setView("display")}
          />
        ) : view === "cropping" ? (
          <CropLayer
            key="crop"
            size={size}
            source={source}
            crop={crop}
            zoom={zoom}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            onBack={cancelEdit}
            onConfirm={handleUpload}
            disabled={!pixels}
          />
        ) : view === "working" ? (
          <WorkingLayer key="working" />
        ) : null}
      </AnimatePresence>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={onFile}
        className="sr-only"
      />
    </div>
  );
}

// ─── Layers (all fill the circle absolutely, size-locked) ───────────

const layerVariants = {
  enter: { opacity: 0, scale: 0.94 },
  center: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.94 },
};

function DisplayLayer({
  avatarProps,
  size,
  sizes,
  updatedAt,
  hasMedia,
  onTap,
}: {
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  avatarProps: Omit<UserAvatarProps, "size" | "membership">;
  size: number;
  sizes: number[];
  updatedAt: Date | number;
  hasMedia: boolean;
  onTap: () => void;
}) {
  const t = useT();
  return (
    <motion.div
      variants={layerVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
      className="group absolute inset-0"
    >
      <UserAvatar
        {...avatarProps}
        size={size}
        membership={{ avatarSizes: sizes, avatarUpdatedAt: updatedAt }}
      />
      <button
        type="button"
        onClick={onTap}
        aria-label={hasMedia ? t("avatar.editPhotoAria") : t("avatar.addPhotoAria")}
        className="absolute inset-0 cursor-pointer rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--elvix-primary)] focus:ring-offset-2 focus:ring-offset-canvas"
      >
        {/* Always-visible edit hint — a full-circle overlay that's
            transparent up top and darkens toward the bottom. Using
            the full circle (instead of a `rounded-b-full` half-pill)
            keeps the dark edge following the avatar's circular bottom
            arc exactly, so we don't get a visible mismatch strip
            where the half-pill corners deviate from the true curve. */}
        <span
          aria-hidden
          className="absolute inset-0 flex items-end justify-center rounded-full bg-gradient-to-t from-black/75 via-black/35 via-25% to-transparent text-white"
          style={{
            paddingBottom: Math.max(6, Math.round(size * 0.08)),
          }}
        >
          <Camera
            style={{
              width: Math.max(14, Math.round(size * 0.16)),
              height: Math.max(14, Math.round(size * 0.16)),
            }}
          />
        </span>
      </button>
    </motion.div>
  );
}

/** Shared icon-only round button — used by every non-display pane.
 *  Auto-scales with the avatar size so the same component reads
 *  proportionally at 96px or 160px. Styles tuned to sit on top of
 *  a blurred-image backdrop: opaque fills + drop shadow so each
 *  button reads cleanly regardless of what's behind it. */
function IconButton({
  onClick,
  ariaLabel,
  variant,
  size,
  disabled = false,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  variant: Variant;
  size: number;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls =
    variant === "brand"
      ? "bg-[var(--elvix-primary-strong)] text-[var(--elvix-on-primary)] hover:brightness-95 shadow-[0_4px_14px_rgba(0,0,0,0.28)]"
      : variant === "danger"
        ? "border border-red-300/70 bg-red-500/95 text-white hover:bg-red-500 shadow-[0_4px_14px_rgba(0,0,0,0.28)]"
        : "border border-white/40 bg-white/85 text-fg-1 backdrop-blur hover:bg-white shadow-[0_4px_14px_rgba(0,0,0,0.22)] dark:bg-canvas/80 dark:text-fg-1";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={
        "grid place-items-center rounded-full transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 " +
        cls
      }
      style={{ width: size, height: size }}
    >
      {children}
    </button>
  );
}

/** Blurred backdrop layer — sits behind the action buttons in the
 *  choice + remove-confirm panes. Uses the existing `<UserAvatar>`
 *  render so the bg shows the current photo (or the user's initials
 *  fallback) without re-implementing avatar resolution. Scaled +
 *  blurred + tinted so the buttons on top stay legible regardless
 *  of source contrast. */
/** Two-step in-place confirm: first click arms (Trash → red Check),
 *  second click commits. Auto-disarms after 2.4s of inactivity so a
 *  half-pressed delete doesn't sit dangerously primed forever. */
export function ArmableRemoveButton({
  onConfirm,
  size,
  iconPx,
  ariaLabel,
}: {
  onConfirm: () => void;
  size: number;
  iconPx: number;
  ariaLabel?: string;
}) {
  const t = useT();
  const restingLabel = ariaLabel ?? t("common.remove");
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2400);
    return () => clearTimeout(t);
  }, [armed]);

  const handleClick = () => {
    if (armed) {
      onConfirm();
      setArmed(false);
    } else {
      setArmed(true);
    }
  };

  // Armed variant uses solid red + Check; resting variant is the
  // standard danger pill (red bg, white glyph). The morph between
  // them is just the icon swap — bg is red in both states so the
  // user reads "this is destructive" the whole time.
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={armed ? t("avatar.confirmRemoveAria") : restingLabel}
      aria-pressed={armed}
      className={
        "grid place-items-center rounded-full transition shadow-[0_4px_14px_rgba(0,0,0,0.28)] cursor-pointer " +
        (armed
          ? "bg-red-600 text-white scale-105 ring-2 ring-red-200/70"
          : "border border-red-300/70 bg-red-500/95 text-white hover:bg-red-500")
      }
      style={{ width: size, height: size }}
    >
      {armed ? (
        <Check style={{ width: iconPx, height: iconPx }} />
      ) : (
        <Trash2 style={{ width: iconPx, height: iconPx }} />
      )}
    </button>
  );
}

function BlurredBackdrop({
  avatarProps,
  size,
  sizes,
  updatedAt,
  hasMedia,
}: {
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  avatarProps: Omit<UserAvatarProps, "size" | "membership">;
  size: number;
  sizes: number[];
  updatedAt: Date | number;
  hasMedia: boolean;
}) {
  return (
    <>
      {/* Beautiful placeholder when no photo: brand gradient with a
          soft radial accent in the upper-left. */}
      {!hasMedia && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(at 22% 18%, color-mix(in srgb, var(--elvix-primary) 70%, white) 0%, var(--elvix-primary-strong) 55%, color-mix(in srgb, var(--elvix-primary-strong) 80%, black) 100%)",
          }}
        />
      )}
      {/* Live avatar, blown up + blurred so the edge fades into the
          dark tint. `scale-110` hides the blur-soft edges that
          otherwise leak outside the circle. */}
      {hasMedia && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
        >
          <div className="absolute inset-0 scale-110 blur-[10px]">
            <UserAvatar
              {...avatarProps}
              size={size}
              membership={{ avatarSizes: sizes, avatarUpdatedAt: updatedAt }}
            />
          </div>
        </div>
      )}
      {/* Darkening tint so the action buttons keep legibility on top
          of any photo — pointer-events-none so a transform-induced
          stacking context can't accidentally hijack click hits on
          the buttons in front. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-black/45 via-black/35 to-black/55"
      />
    </>
  );
}

/** Triangle layout via polar coords around the circle's centre.
 *  Each vertex sits at a fixed angle on a small radius, so the three
 *  buttons cluster tightly without ever overlapping the avatar edge.
 *
 *    0°   = top         → Back
 *    120° = lower-right → Camera (primary)
 *    240° = lower-left  → Trash (destructive)
 *
 *  Radius is a percentage of the circle's diameter (½ that of the
 *  circle's radius in CSS terms). 18% keeps the cluster snug — bump
 *  it to spread them out, shrink to bunch tighter. */
const RING_RADIUS_PCT = 24;
function vertexAt(angleDeg: number, radiusPct = RING_RADIUS_PCT) {
  // 0° = up, 90° = right, etc. — sin/cos with -cos for y so positive
  // angles rotate clockwise (matching the on-screen reading order).
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad) * radiusPct;
  const dy = -Math.cos(rad) * radiusPct;
  return {
    top: `${50 + dy}%`,
    left: `${50 + dx}%`,
  };
}

const TRIANGLE_POS = {
  back: { ...vertexAt(0), floatDelay: 0 },
  left: { ...vertexAt(120), floatDelay: 0.6 },
  right: { ...vertexAt(240), floatDelay: 1.2 },
} as const;

/** Gentle in-place bob — each vertex floats on its own phase so the
 *  cluster feels alive without being distracting. Translation deltas
 *  stay small (~3px) so the layout never appears unstable.
 *  Outer div handles centering via CSS translate, inner motion.div
 *  applies the floating transform — keeps them off the same
 *  transform property so they don't conflict. */
function VertexSlot({
  pos,
  children,
}: {
  pos: { top: string; left: string; floatDelay: number };
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ top: pos.top, left: pos.left }}
    >
      <motion.div
        animate={{ y: [0, -3, 0, 2, 0], x: [0, 1.5, 0, -1.5, 0] }}
        transition={{
          duration: 5.6,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
          delay: pos.floatDelay,
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

function ChoiceLayer({
  size,
  avatarProps,
  sizes,
  updatedAt,
  hasMedia,
  hasRemovable,
  onReplace,
  onRemove,
  onBack,
}: {
  size: number;
  // LEGACY: spine-lint-disable-next-line spine/enum-over-string
  avatarProps: Omit<UserAvatarProps, "size" | "membership">;
  sizes: number[];
  updatedAt: Date | number;
  hasMedia: boolean;
  /** Either CDN-uploaded OR fell back to OAuth photo. If false the
   *  user is on the initials fallback — nothing real to remove, so
   *  the Trash button stays hidden to match. */
  hasRemovable: boolean;
  onReplace: () => void;
  onRemove: () => void;
  onBack: () => void;
}) {
  const t = useT();
  // All three triangle buttons share a single size — visual weight
  // stays even, the cluster reads as a balanced trio rather than
  // "primary + sidekick".
  const actionSize = Math.max(30, Math.round(size * 0.28));
  const iconPx = Math.max(12, Math.round(actionSize * 0.48));
  return (
    <motion.div
      variants={layerVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
      className="absolute inset-0 overflow-hidden rounded-full"
    >
      <BlurredBackdrop
        avatarProps={avatarProps}
        size={size}
        sizes={sizes}
        updatedAt={updatedAt}
        hasMedia={hasMedia}
      />
      <VertexSlot pos={TRIANGLE_POS.back}>
        <IconButton onClick={onBack} ariaLabel={t("common.back")} variant="neutral" size={actionSize}>
          <ArrowLeft style={{ width: iconPx, height: iconPx }} />
        </IconButton>
      </VertexSlot>
      <VertexSlot pos={TRIANGLE_POS.left}>
        <IconButton
          onClick={onReplace}
          ariaLabel={hasMedia ? t("avatar.replacePhotoAria") : t("avatar.uploadPhotoAria")}
          variant="brand"
          size={actionSize}
        >
          <Camera style={{ width: iconPx, height: iconPx }} />
        </IconButton>
      </VertexSlot>
      {/* Trash only when there's a real photo to remove — CDN
          upload or OAuth (Google) fallback. Hidden when the user
          is on the initials fallback: nothing to remove there. */}
      {hasRemovable && (
        <VertexSlot pos={TRIANGLE_POS.right}>
          <ArmableRemoveButton onConfirm={onRemove} size={actionSize} iconPx={iconPx} />
        </VertexSlot>
      )}
    </motion.div>
  );
}

function CropLayer({
  size,
  source,
  crop,
  zoom,
  onCropChange,
  onZoomChange,
  onCropComplete,
  onBack,
  onConfirm,
  disabled,
}: {
  size: number;
  source: string | null;
  crop: { x: number; y: number };
  zoom: number;
  onCropChange: (c: { x: number; y: number }) => void;
  onZoomChange: (z: number) => void;
  onCropComplete: (a: Area, b: Area) => void;
  onBack: () => void;
  onConfirm: () => void;
  disabled: boolean;
}) {
  const t = useT();
  const btnSize = Math.max(24, Math.round(size * 0.22));
  const iconPx = Math.max(12, Math.round(btnSize * 0.5));
  return (
    <motion.div
      variants={layerVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
      className="absolute inset-0 overflow-hidden rounded-full bg-black"
    >
      {source && (
        <Cropper
          image={source}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          objectFit="contain"
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={onCropComplete}
          minZoom={1}
          maxZoom={5}
          style={{
            containerStyle: { background: "#000", borderRadius: "9999px" },
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-1 flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("common.back")}
          className="pointer-events-auto grid place-items-center rounded-full border border-white/30 bg-black/55 text-white backdrop-blur transition hover:bg-black/75 cursor-pointer"
          style={{ width: btnSize, height: btnSize }}
        >
          <ArrowLeft style={{ width: iconPx, height: iconPx }} />
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          aria-label={t("avatar.useThisCropAria")}
          className="pointer-events-auto grid place-items-center rounded-full bg-[var(--elvix-primary-strong)] text-[var(--elvix-on-primary)] transition hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          style={{ width: btnSize, height: btnSize }}
        >
          <Check style={{ width: iconPx, height: iconPx }} />
        </button>
      </div>
    </motion.div>
  );
}

function WorkingLayer() {
  return (
    <motion.div
      variants={layerVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
      className="absolute inset-0 grid place-items-center rounded-full bg-canvas ring-1 ring-fg-3/15"
    >
      <Loader2 className="size-5 animate-spin text-[var(--elvix-primary)]" />
    </motion.div>
  );
}
