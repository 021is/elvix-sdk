"use client";

/**
 * `<ElvixAvatar>` — editable avatar for the elvix Profile SDK.
 *
 * Sibling of the read-only `<UserAvatar>` — same display API, plus
 * an in-place mini-wizard that lives entirely inside the avatar's
 * circle. No modals. No size changes between states.
 *
 * Pane flow (all rendered inside the circle, icons only; the upload /
 * crop / remove logic is `use-image-editor.ts`, shared with the banner):
 *   display  → tap the bottom half-circle hint
 *   choice   → ◯ Replace | ◯ Remove (tap twice to confirm)
 *   cropping → react-easy-crop fills the circle
 *   working  → spinner
 *
 * All panes use a top-left ArrowLeft back affordance matching the
 * other elvix wizards. Buttons are icon-only because the circle is
 * compact — text wouldn't fit cleanly.
 */

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Camera, Check, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { useT } from "../locale/use-t";
import { useElvixApp, useElvixAppContext } from "./elvix-provider";
import { ElvixUserAvatar } from "./elvix-user-avatar";
import { EditorView, ImageKind, type ImageResult, useImageEditor } from "./use-image-editor";
import { UserAvatar, type UserAvatarProps } from "./user-avatar";

const Variant = {
  BRAND: "brand",
  DANGER: "danger",
  NEUTRAL: "neutral",
} as const;
type Variant = (typeof Variant)[keyof typeof Variant];

export type ElvixAvatarResult = ImageResult;

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
  // View mode = the read-only display sibling, which reads the centralized
  // photo and updates the instant an "edit" instance changes it. Only what the
  // HOST passed is forwarded: the per-app fallbacks above would pin it to the
  // empty per-app meta instead.
  if (resolved.mode === "view") {
    return (
      <ElvixUserAvatar
        appSlug={props.appSlug}
        userId={props.userId}
        size={resolved.size ?? 40}
        shape={resolved.shape}
        className={resolved.className}
        membership={props.membership}
        user={props.user}
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
  const editor = useImageEditor({
    kind: ImageKind.AVATAR,
    applicationId,
    userId: avatarProps.userId,
    initial: {
      sizes: avatarProps.membership.avatarSizes,
      updatedAt: avatarProps.membership.avatarUpdatedAt,
      fallbackUrl: avatarProps.user?.avatarUrl ?? null,
    },
    errors: { upload: "avatar.uploadFailed", remove: "avatar.removeFailed" },
    removeFailView: EditorView.CHOICE,
    onChange,
    onResult,
  });
  const { view, setView, media, cropper } = editor;
  const hasMedia = media.sizes.length > 0;
  // Rendered from the centralized slug (elvix-account): the photo lives
  // there, not under the per-app bootstrap slug.
  const shown = {
    ...avatarProps,
    user: { ...avatarProps.user, avatarUrl: media.fallbackUrl },
    appSlug: editor.slug ?? avatarProps.appSlug,
  };
  const photo = { size, sizes: media.sizes, updatedAt: media.updatedAt, hasMedia };

  return (
    <div className="relative shrink-0 rounded-full" style={{ width: size, height: size }}>
      <AnimatePresence initial={false}>
        {view === EditorView.DISPLAY ? (
          <DisplayLayer
            key="display"
            avatarProps={shown}
            {...photo}
            onTap={() => setView(EditorView.CHOICE)}
          />
        ) : view === EditorView.CHOICE ? (
          <ChoiceLayer
            key="choice"
            avatarProps={shown}
            {...photo}
            hasRemovable={hasMedia || Boolean(media.fallbackUrl)}
            onReplace={() => {
              setView(EditorView.DISPLAY);
              requestAnimationFrame(editor.openPicker);
            }}
            onRemove={editor.remove}
            onBack={() => setView(EditorView.DISPLAY)}
          />
        ) : view === EditorView.CROPPING ? (
          <CropLayer
            key="crop"
            size={size}
            source={cropper.source}
            crop={cropper.crop}
            zoom={cropper.zoom}
            onCropChange={cropper.setCrop}
            onZoomChange={cropper.setZoom}
            onCropComplete={cropper.onCropComplete}
            onBack={editor.cancelCrop}
            onConfirm={editor.upload}
            disabled={!cropper.pixels}
          />
        ) : (
          <WorkingLayer key="working" />
        )}
      </AnimatePresence>

      <input
        ref={editor.fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={editor.onFile}
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

/** Blurred backdrop behind the choice pane's buttons: the current photo
 *  (or the initials fallback) via `<UserAvatar>`, scaled, blurred and
 *  tinted so the buttons on top stay legible on any source. */
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
        <IconButton
          onClick={onBack}
          ariaLabel={t("common.back")}
          variant="neutral"
          size={actionSize}
        >
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
