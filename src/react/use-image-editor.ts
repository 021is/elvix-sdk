"use client";

/**
 * The upload / crop / remove flow `<ElvixAvatar>` and `<ElvixBanner>` share.
 *
 * The image is CENTRALIZED (elvix-account), not per-app, and DERIVED every
 * render from the shared `useUserMedia` cache keyed by the user id, so a
 * session that resolves after mount re-derives, and an upload in another tab
 * or on another device lands through the same cache. This instance's own last
 * write is shown until the cache moves past the value it was made against (a
 * publish patches it; a stream event replaces it); pinning it to that value
 * drops it without an effect.
 *
 * `applicationId="preview"` (the docs catalog) never touches the network: an
 * upload becomes an in-memory blob URL in `fallbackUrl`.
 */

import { type ChangeEvent, useCallback, useRef, useState } from "react";
import type { Area } from "react-easy-crop";
import { useT } from "../locale/use-t";
import { useElvixContext, useElvixRefresh } from "./elvix-provider";
import { cropToBlob } from "./image-crop";
import { publishMedia } from "./live-media";
import { send } from "./profile-request";
import { authInit } from "./session";
import { unwrapEnvelope } from "./spine-fetch";
import { toast } from "./toast";
import { type UserMedia, useUserMedia } from "./user-media";

export const ImageKind = {
  AVATAR: "avatar",
  BANNER: "banner",
} as const;
export type ImageKind = (typeof ImageKind)[keyof typeof ImageKind];

export const EditorView = {
  DISPLAY: "display",
  CHOICE: "choice",
  CROPPING: "cropping",
  WORKING: "working",
} as const;
export type EditorView = (typeof EditorView)[keyof typeof EditorView];

export type ImageResult =
  | { ok: true; sizes: number[]; updatedAt: string }
  | { ok: false; error: string; message?: string };

type Media = { sizes: number[]; updatedAt: Date | number; fallbackUrl: string | null };

type Options = {
  kind: ImageKind;
  applicationId: string;
  userId: string;
  /** What the host or the provider envelope knows before the cache loads. */
  initial: Media;
  /** i18n keys of the toast for each failure. */
  errors: { upload: string; remove: string };
  /** Where a failed remove returns to. */
  removeFailView: EditorView;
  onChange?: (next: { sizes: number[]; updatedAt: Date | number }) => void;
  onResult?: (result: ImageResult) => void;
};

const MAX_EDGE_PX = 2400;
const JPEG_QUALITY = 0.92;
const PREVIEW_APP = "preview";

const revokeBlob = (url: string | null) => {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
};

/** The crop pane's state: the picked file and the chosen area. */
function useCropSource() {
  const [source, setSource] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<Area | null>(null);
  const onCropComplete = useCallback((_: Area, p: Area) => setPixels(p), []);

  const load = (file: File) => {
    revokeBlob(source);
    setSource(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setPixels(null);
  };
  const clear = () => {
    revokeBlob(source);
    setSource(null);
    setPixels(null);
  };
  return { source, crop, zoom, pixels, setCrop, setZoom, onCropComplete, load, clear };
}

export function useImageEditor(o: Options) {
  const t = useT();
  const { baseUrl } = useElvixContext();
  const refresh = useElvixRefresh();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<EditorView>(EditorView.DISPLAY);
  const cropper = useCropSource();

  const preview = o.applicationId === PREVIEW_APP;
  const known = !preview && o.userId !== "preview-user";
  const centralized = useUserMedia(known ? o.userId : null, baseUrl);
  const [own, setOwn] = useState<(Media & { base: UserMedia | null }) | null>(null);
  const override = own?.base === centralized.data ? own : null;
  const cached = centralized.data;
  // The OAuth photo is tracked too: after a DELETE clears it, the editor
  // must stop offering to remove a Google photo. Banners have none.
  const cachedFallback = o.kind === ImageKind.AVATAR ? (cached?.avatar.googleUrl ?? null) : null;
  const media: Media = override ?? {
    sizes: cached?.[o.kind].sizes ?? o.initial.sizes,
    updatedAt: cached?.[o.kind].updatedAt ?? o.initial.updatedAt,
    fallbackUrl: cached ? cachedFallback : o.initial.fallbackUrl,
  };

  /** Shows a finished write here, everywhere else, and to the host. */
  const commit = (next: Media) => {
    setOwn({ ...next, base: centralized.data });
    if (!preview) {
      publishMedia(o.kind, o.userId, {
        sizes: next.sizes,
        updatedAt: next.updatedAt instanceof Date ? next.updatedAt.getTime() : next.updatedAt,
        fallbackUrl: next.fallbackUrl,
      });
      void refresh();
    }
    o.onChange?.({ sizes: next.sizes, updatedAt: next.updatedAt });
    const updatedAt = new Date(next.updatedAt).toISOString();
    o.onResult?.({ ok: true, sizes: next.sizes, updatedAt });
    setView(EditorView.DISPLAY);
  };

  const fail = (error: string, key: string, back: EditorView) => {
    const message = t(key);
    toast.error(message);
    o.onResult?.({ ok: false, error, message });
    setView(back);
  };

  const url = `${baseUrl}/api/account/self/images/${o.kind}`;
  type Reply = Record<string, unknown> & { userAvatarUrl?: string | null };
  const replied = (reply: Reply, fallbackUrl: string | null, sizes: number[]): Media => ({
    sizes: (reply[`${o.kind}Sizes`] as number[] | undefined) ?? sizes,
    updatedAt: reply[`${o.kind}UpdatedAt`]
      ? new Date(reply[`${o.kind}UpdatedAt`] as string)
      : Date.now(),
    fallbackUrl,
  });

  const upload = async () => {
    const { source, pixels } = cropper;
    if (!source || !pixels) return;
    setView(EditorView.WORKING);
    const blob = await cropToBlob(source, pixels, MAX_EDGE_PX, JPEG_QUALITY).catch(() => null);
    if (blob && preview) {
      revokeBlob(media.fallbackUrl);
      cropper.clear();
      commit({ sizes: [], updatedAt: Date.now(), fallbackUrl: URL.createObjectURL(blob) });
      return;
    }
    const body = new FormData();
    if (blob) body.append("file", blob, `${o.kind}.jpg`);
    const res = blob ? await send(url, { method: "PUT", body, ...authInit() }) : null;
    if (!res?.ok) {
      // The picked image stays loaded, so the user can retry the same crop.
      fail("upload_failed", o.errors.upload, EditorView.CROPPING);
      return;
    }
    const reply = (unwrapEnvelope(await res.json().catch(() => ({}))) ?? {}) as Reply;
    cropper.clear();
    commit(replied(reply, media.fallbackUrl, media.sizes));
  };

  const remove = async () => {
    setView(EditorView.WORKING);
    if (preview) {
      revokeBlob(media.fallbackUrl);
      commit({ sizes: [], updatedAt: Date.now(), fallbackUrl: null });
      return;
    }
    const res = await send(url, { method: "DELETE", ...authInit() });
    if (!res?.ok) {
      fail("delete_failed", o.errors.remove, o.removeFailView);
      return;
    }
    const reply = (unwrapEnvelope(await res.json().catch(() => ({}))) ?? {}) as Reply;
    // The avatar's remove is progressive: the first clears the upload and
    // the server answers with the OAuth photo still set; the second clears
    // that too (`userAvatarUrl: null`). Absent means untouched.
    const fallbackUrl = reply.userAvatarUrl !== undefined ? reply.userAvatarUrl : media.fallbackUrl;
    commit(replied(reply, fallbackUrl, []));
  };

  return {
    view,
    setView,
    media,
    /** The CDN slug the image lives under (elvix-account), once known. */
    slug: centralized.data?.slug,
    cropper,
    fileInputRef,
    openPicker: () => fileInputRef.current?.click(),
    onFile: (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      cropper.load(file);
      setView(EditorView.CROPPING);
    },
    cancelCrop: () => {
      cropper.clear();
      setView(EditorView.DISPLAY);
    },
    upload,
    remove,
  };
}
