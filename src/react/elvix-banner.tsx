"use client";

/**
 * `<ElvixBanner>` — editable banner for the elvix Profile SDK.
 *
 * Sibling of the read-only `<UserBanner>` — identical render at
 * rest, plus an in-place mini-wizard whose panes live inside the
 * banner's frame (rounded 3:1 rect). No modals.
 *
 * Pane flow (all rendered inside the banner box; the upload / crop /
 * remove logic is `use-image-editor.ts`, shared with the avatar):
 *   display  → Edit opens the file picker; Remove is an in-place two-step
 *              (Trash → red Check) that never leaves this layer
 *   cropping → react-easy-crop fills the banner frame
 *   working  → spinner
 */

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Camera, Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { useT } from "../locale/use-t";
import { useElvixApp, useElvixAppContext } from "./elvix-provider";
import { EditorView, ImageKind, type ImageResult, useImageEditor } from "./use-image-editor";
import { UserBanner, type UserBannerProps } from "./user-banner";

export type ElvixBannerResult = ImageResult;

export type ElvixBannerProps = UserBannerProps & {
  applicationId: string;
  /** Corner radius for the frame. Default 14 (matches the SDK card chrome). */
  cornerRadius?: number;
  /** Fired after a successful upload / remove. */
  onChange?: (next: { sizes: number[]; updatedAt: Date | number }) => void;
  /** Fires on every terminal upload / remove outcome. Safe payload:
   *  rendered banner sizes + updatedAt only (no image bytes). */
  onResult?: (result: ElvixBannerResult) => void;
};

export function ElvixBanner(props: Partial<ElvixBannerProps>) {
  const app = useElvixApp();
  const appCtx = useElvixAppContext();
  const resolved: ElvixBannerProps = {
    applicationId: props.applicationId ?? app?.applicationId ?? "preview",
    appSlug: props.appSlug ?? app?.urlSlug ?? "preview",
    userId: props.userId ?? appCtx?.user.id ?? "preview-user",
    membership: props.membership ?? {
      bannerSizes: appCtx?.membership?.bannerSizes ?? [],
      bannerUpdatedAt: appCtx?.membership?.bannerUpdatedAt
        ? new Date(appCtx.membership.bannerUpdatedAt)
        : new Date(0),
    },
    containerPx: props.containerPx,
    className: props.className,
    emptyClassName: props.emptyClassName,
    cornerRadius: props.cornerRadius,
    onChange: props.onChange,
    onResult: props.onResult,
  };
  return <ElvixBannerInner {...resolved} />;
}

function ElvixBannerInner({
  applicationId,
  cornerRadius = 14,
  onChange,
  onResult,
  ...bannerProps
}: ElvixBannerProps) {
  const t = useT();
  const editor = useImageEditor({
    kind: ImageKind.BANNER,
    applicationId,
    userId: bannerProps.userId,
    initial: {
      sizes: bannerProps.membership.bannerSizes,
      updatedAt: bannerProps.membership.bannerUpdatedAt,
      fallbackUrl: null,
    },
    errors: { upload: "banner.errorUpload", remove: "banner.errorRemove" },
    removeFailView: EditorView.DISPLAY,
    onChange,
    onResult,
  });
  const { view, media, cropper } = editor;
  // `fallbackUrl` is only ever the docs preview's in-memory upload.
  const previewBlobUrl = media.fallbackUrl;
  const hasMedia = media.sizes.length > 0 || previewBlobUrl !== null;

  return (
    // Outer wrapper locks the 3:1 aspect so every layer (display,
    // choice, crop, …) fills exactly the same box — no height jump
    // when AnimatePresence swaps them. `mode="wait"` keeps the
    // transition single-layer too.
    <div
      className="relative w-full overflow-hidden"
      style={{ borderRadius: cornerRadius, aspectRatio: "3 / 1" }}
    >
      {/* Preview-mode in-memory overlay. Sits beneath the layer
          transitions so Edit / Remove affordances still paint on top. */}
      {previewBlobUrl && (
        <img
          src={previewBlobUrl}
          alt={t("banner.previewAlt")}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      <AnimatePresence initial={false} mode="wait">
        {view === EditorView.DISPLAY ? (
          <DisplayLayer
            key="display"
            // Render from the CENTRALIZED slug (elvix-account) — the photo lives
            // there, not under the per-app bootstrap slug. Without this the CDN
            // URL points at <app>/users/... and 404s.
            bannerProps={{ ...bannerProps, appSlug: editor.slug ?? bannerProps.appSlug }}
            sizes={media.sizes}
            updatedAt={media.updatedAt}
            hasMedia={hasMedia}
            onEdit={editor.openPicker}
            onRemove={editor.remove}
          />
        ) : view === EditorView.CROPPING ? (
          <CropLayer
            key="crop"
            source={cropper.source}
            crop={cropper.crop}
            zoom={cropper.zoom}
            onCropChange={cropper.setCrop}
            onZoomChange={cropper.setZoom}
            onCropComplete={cropper.onCropComplete}
            onCancel={editor.cancelCrop}
            onConfirm={editor.upload}
            disabled={!cropper.pixels}
            cornerRadius={cornerRadius}
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

// ─── Banner layers ──────────────────────────────────────────────────

const layerVariants = {
  enter: { opacity: 0, scale: 0.985 },
  center: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.985 },
};

/** Layer wrapper — fills the outer 3:1 frame absolutely. The outer
 *  wrapper owns the aspect ratio, so every layer just stretches to
 *  match. Always render-as a motion.div so AnimatePresence picks up
 *  the variants. */
function Layer({
  children,
  className = "",
  layoutKey,
}: {
  children: React.ReactNode;
  className?: string;
  layoutKey: string;
}) {
  return (
    <motion.div
      key={layoutKey}
      variants={layerVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
      className={`absolute inset-0 ${className}`}
    >
      {children}
    </motion.div>
  );
}

function DisplayLayer({
  bannerProps,
  sizes,
  updatedAt,
  hasMedia,
  onEdit,
  onRemove,
}: {
  bannerProps: Omit<UserBannerProps, "membership">;
  sizes: number[];
  updatedAt: Date | number;
  hasMedia: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <Layer layoutKey="display" className="group">
      {/* When a banner exists, render the real <UserBanner>. When
          it's empty, paint a sexy brand-gradient placeholder so the
          frame never reads as a flat grey block — diagonal flow with
          a soft radial accent in the upper-left + a subtle vignette
          along the bottom for depth. */}
      <div className="absolute inset-0">
        {hasMedia ? (
          <UserBanner
            {...bannerProps}
            membership={{ bannerSizes: sizes, bannerUpdatedAt: updatedAt }}
          />
        ) : (
          <BannerPlaceholder />
        )}
      </div>
      {/* Top-right corner controls. At rest: a single Edit pencil.
          Tap Edit → expands into a vertical stack of three actions
          (Back, Upload, Remove). No view switch, just local state
          inside the corner overlay so the user never loses the
          banner preview behind a confirm pane. Tapping Back
          collapses again AND disarms the Trash if it was primed.
          When there's no media uploaded yet, Remove is hidden — the
          stack is just Back + Upload. */}
      <BannerCornerControls hasMedia={hasMedia} onEdit={onEdit} onRemove={onRemove} />
    </Layer>
  );
}

function CropLayer({
  source,
  crop,
  zoom,
  onCropChange,
  onZoomChange,
  onCropComplete,
  onCancel,
  onConfirm,
  disabled,
  cornerRadius,
}: {
  source: string | null;
  crop: { x: number; y: number };
  zoom: number;
  onCropChange: (c: { x: number; y: number }) => void;
  onZoomChange: (z: number) => void;
  onCropComplete: (a: Area, b: Area) => void;
  onCancel: () => void;
  onConfirm: () => void;
  disabled: boolean;
  cornerRadius: number;
}) {
  const t = useT();
  return (
    <Layer layoutKey="crop" className="bg-black">
      {source && (
        <Cropper
          image={source}
          crop={crop}
          zoom={zoom}
          aspect={3}
          cropShape="rect"
          showGrid={true}
          objectFit="contain"
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={onCropComplete}
          minZoom={1}
          maxZoom={5}
          style={{
            containerStyle: { background: "#000", borderRadius: cornerRadius },
          }}
        />
      )}
      <div className="pointer-events-none absolute right-2 top-2 z-10 flex gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="pointer-events-auto grid size-8 place-items-center rounded-full border border-white/30 bg-black/55 text-white backdrop-blur-md transition hover:bg-black/75 cursor-pointer"
          aria-label={t("common.cancel")}
        >
          <X className="size-4" />
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--elvix-primary-strong)] px-3 text-[12px] font-semibold text-[var(--elvix-on-primary)] transition hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          aria-label={t("banner.cropUseAria")}
        >
          <Check className="size-3.5" />
          {t("banner.cropUse")}
        </button>
      </div>
    </Layer>
  );
}

/** Top-right corner controls for the banner.
 *
 *  Collapsed (default): single Edit (pencil) icon.
 *  Expanded: vertical stack — Back · Upload · Remove. Tapping Back
 *  collapses again and disarms the Trash (if it was primed for
 *  confirm). Same Discord-style two-step on Trash → red Check →
 *  fires onConfirm. Auto-disarm after 2.4s.
 *
 *  No view/pane switch — this all happens inside the DisplayLayer
 *  so the banner stays visible behind the controls the whole time. */
function BannerCornerControls({
  hasMedia,
  onEdit,
  onRemove,
}: {
  hasMedia: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [armed, setArmed] = useState(false);

  // Auto-disarm the Trash if the user walks away mid-confirm. A
  // half-pressed delete shouldn't sit primed forever.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2400);
    return () => clearTimeout(t);
  }, [armed]);

  const collapse = () => {
    setExpanded(false);
    setArmed(false);
  };
  const handleUpload = () => {
    collapse();
    onEdit();
  };
  const handleRemove = () => {
    if (armed) {
      onRemove();
      setArmed(false);
      setExpanded(false);
    } else {
      setArmed(true);
    }
  };

  return (
    <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={hasMedia ? t("banner.editAria") : t("banner.addAria")}
          title={hasMedia ? t("banner.editAria") : t("banner.addAria")}
          className="grid size-7 place-items-center rounded-full border border-white/20 bg-black/40 text-white/85 shadow-[0_1px_4px_rgba(0,0,0,0.18)] backdrop-blur-md transition hover:bg-black/60 hover:text-white cursor-pointer"
        >
          <Pencil className="size-3.5" />
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={collapse}
            aria-label={t("common.back")}
            title={t("common.back")}
            className="grid size-7 place-items-center rounded-full border border-white/20 bg-black/40 text-white/85 shadow-[0_1px_4px_rgba(0,0,0,0.18)] backdrop-blur-md transition hover:bg-black/60 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleUpload}
            aria-label={hasMedia ? t("banner.replace") : t("banner.uploadAria")}
            title={hasMedia ? t("banner.replace") : t("banner.uploadAria")}
            className="grid size-7 place-items-center rounded-full border border-white/20 bg-black/40 text-white/85 shadow-[0_1px_4px_rgba(0,0,0,0.18)] backdrop-blur-md transition hover:bg-black/60 hover:text-white cursor-pointer"
          >
            <Camera className="size-3.5" />
          </button>
          {hasMedia && (
            <button
              type="button"
              onClick={handleRemove}
              aria-label={armed ? t("banner.confirmRemoveAria") : t("banner.removeBanner")}
              aria-pressed={armed}
              title={armed ? t("banner.confirmRemoveHint") : t("banner.removeBanner")}
              className={
                "grid size-7 place-items-center rounded-full backdrop-blur-md transition shadow-[0_1px_4px_rgba(0,0,0,0.18)] cursor-pointer " +
                (armed
                  ? "border border-red-200/80 bg-red-500/90 text-white scale-105 ring-2 ring-red-200/40"
                  : "border border-white/20 bg-black/40 text-white/85 hover:bg-black/60 hover:text-red-200")
              }
            >
              {armed ? <Check className="size-3.5" /> : <Trash2 className="size-3.5" />}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Beautiful default when no banner is uploaded. Brand-coloured
 *  diagonal gradient with a soft radial accent in the upper-left
 *  + a subtle vignette along the bottom for depth. Reads as
 *  intentional placeholder, never as an empty grey state. */
function BannerPlaceholder() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(at 18% 22%, color-mix(in srgb, var(--elvix-primary) 75%, white) 0%, transparent 50%), " +
          "linear-gradient(135deg, var(--elvix-primary) 0%, var(--elvix-primary-strong) 60%, color-mix(in srgb, var(--elvix-primary-strong) 75%, black) 100%)",
      }}
    >
      {/* Subtle bottom vignette so the lower edge of the banner
          settles visually before any overlapping avatar lands on it. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/15 to-transparent"
      />
    </div>
  );
}

function WorkingLayer() {
  return (
    <Layer layoutKey="working" className="bg-canvas ring-1 ring-fg-3/15">
      <div className="absolute inset-0 grid place-items-center">
        <Loader2 className="size-5 animate-spin text-[var(--elvix-primary)]" />
      </div>
    </Layer>
  );
}
