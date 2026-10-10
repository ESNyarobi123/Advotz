"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { CheckCircle2, ImagePlus, Link2, Loader2, Trash2, TriangleAlert, UploadCloud } from "lucide-react";

/**
 * The optimised image the API hands back after an upload.
 *
 * Deliberately not a full `MediaAsset`: the backend never returns the bytes, only
 * an address for them and the numbers a reseller cares about.
 */
export type UploadedLogo = {
  id: string;
  url: string;
  contentType: string;
  width: number;
  height: number;
  byteSize: number;
  originalBytes: number;
  savedPercent: number;
  encoding: "lossless" | "lossy";
};

/**
 * Mirrors the server's ceiling, and is checked here for the same reason the server
 * checks it: a reseller should be told their file is too big instantly rather than
 * after pushing six megabytes over a phone connection. The server still enforces
 * it — this is courtesy, not the control.
 */
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

/** Accepted raster formats, matching the service's allowlist. SVG is intentionally absent. */
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/tiff", "image/bmp", "image/heic", "image/heif"];

/** KB-precision sizes: an upload is measured in tens of kilobytes, where "0 MB" says nothing. */
function formatUploadSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** True when the browser will refuse to draw the pixels — a HEIC on Chrome, for instance. */
function isRenderableInBrowser(file: File): boolean {
  return file.type !== "image/heic" && file.type !== "image/heif";
}

type Phase = "idle" | "uploading" | "done";

/**
 * Every string an uploader shows, bound to i18n keys by the caller.
 *
 * Kept as data rather than as a `kind` the component branches on, because the logo
 * and the background say genuinely different sentences ("Your logo appears in the
 * portal header" is not true of a background) and a `kind` inside the component
 * would grow a second `if` for every surface added later.
 */
type ImageUploaderCopy = {
  /** Drop-zone headline. */
  drop: string;
  uploading: string;
  replace: string;
  remove: string;
  uploadFailed: string;
  previewAlt: string;
  /** What the image is for, e.g. "Your logo appears in the portal header." */
  saved: string;
  compressNote: string;
  urlFallback: string;
  formats: (max: string) => string;
  optimised: (values: { before: string; after: string; percent: string }) => string;
  alreadyOptimal: (values: { size: string }) => string;
  dimension: (values: { width: string; height: string }) => string;
};

type ImageUploaderProps = {
  /** Reseller upload route, e.g. `/reseller/media/logo`. */
  endpoint: string;
  /** Current URL on the draft, whether it came from an upload or a pasted link. */
  value: string;
  /** Aspect box for the thumbnail: square reads as a mark, wide as a backdrop. */
  thumbClassName: string;
  /** How the thumbnail fills its box — `contain` for a wordmark, `cover` for a photo. */
  imageFit: "contain" | "cover";
  copy: ImageUploaderCopy;
  disabled?: boolean;
  onUploaded: (asset: UploadedLogo) => void;
  onChangeUrl: (url: string) => void;
  onClear: () => void;
};

/**
 * Image upload with server-side optimisation, shared by every reseller surface.
 *
 * The reseller hands us whatever their designer or phone produced and the API makes
 * it small, so the panel's job is to do three things honestly:
 *
 * 1. **Accept the heavy file.** Drag-and-drop plus a picker, no "resize it first".
 * 2. **Show something immediately.** A local object URL paints the moment the file
 *    is chosen, so the phone preview updates before the network responds.
 * 3. **Report what actually happened.** The before/after sizes and the percentage
 *    come from the server's own numbers, not from an estimate made here. When the
 *    optimiser cannot beat the original, it says so instead of inventing a saving.
 *
 * The upload itself only stores the asset. Publishing it to the portal is still the
 * page's `Save`, which keeps the write path a reseller already understands: uploading
 * an image you then discard costs nothing.
 */
function ImageUploader({
  endpoint,
  value,
  thumbClassName,
  imageFit,
  copy,
  disabled,
  onUploaded,
  onChangeUrl,
  onClear,
}: ImageUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<UploadedLogo | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A local preview so the phone updates instantly, before the server replies. */
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [showUrlField, setShowUrlField] = useState(false);

  const releaseObjectUrl = useCallback(() => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  }, []);

  // An object URL pins the file in memory until it is revoked; leaking one per
  // upload would grow the tab for the rest of the session.
  useEffect(() => releaseObjectUrl, [releaseObjectUrl]);

  const upload = useCallback(
    async (file: File) => {
      setError(null);

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(copy.formats(formatUploadSize(MAX_UPLOAD_BYTES)));
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setError(copy.formats(formatUploadSize(MAX_UPLOAD_BYTES)));
        return;
      }

      releaseObjectUrl();
      if (isRenderableInBrowser(file)) {
        objectUrl.current = URL.createObjectURL(file);
        setLocalPreview(objectUrl.current);
        onChangeUrl(objectUrl.current);
      } else {
        setLocalPreview(null);
      }

      setPhase("uploading");
      try {
        // The raw file is the request body: base64 would inflate it by a third and
        // push a legitimate phone photo past the server's limit.
        const res = await api.raw(`${endpoint}?name=${encodeURIComponent(file.name)}`, {
          method: "POST",
          headers: { "content-type": file.type },
          body: file,
        });
        const uploaded = (await res.json()) as UploadedLogo;

        // The served URL is authoritative, so the local preview is dropped in favour
        // of the optimised image the portal will actually download.
        releaseObjectUrl();
        setLocalPreview(null);
        setResult(uploaded);
        setPhase("done");
        onUploaded(uploaded);
      } catch (err) {
        setPhase("idle");
        setError(err instanceof ApiError ? errorMessage(err) : copy.uploadFailed);
      }
    },
    [copy, endpoint, onChangeUrl, onUploaded, releaseObjectUrl],
  );

  function pick(file: File | null | undefined) {
    if (file) void upload(file);
  }

  function clear() {
    releaseObjectUrl();
    setLocalPreview(null);
    setResult(null);
    setError(null);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
    onClear();
  }

  const preview = localPreview ?? value;
  const uploading = phase === "uploading";
  // A pasted URL has no measurements to report, so the savings panel is tied to a
  // real upload result only.
  const showSavings = phase === "done" && result !== null;
  const saved = result !== null && result.savedPercent > 0;

  return (
    <div className="space-y-3">
      {/* ── Current image + actions ── */}
      {preview ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--advo-border)] bg-white p-3">
          <span className={`shrink-0 overflow-hidden rounded-xl bg-advo-surface-soft ring-1 ring-advo-border ${thumbClassName}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={copy.previewAlt}
              className={imageFit === "cover" ? "size-full object-cover" : "size-full object-contain"}
              src={preview}
            />
          </span>
          <span className="min-w-0 flex-1">
            {showSavings ? (
              <>
                <span className="flex items-center gap-1.5 text-xs font-bold text-advo-text">
                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                  {saved
                    ? copy.optimised({
                        before: formatUploadSize(result.originalBytes),
                        after: formatUploadSize(result.byteSize),
                        percent: String(result.savedPercent),
                      })
                    : copy.alreadyOptimal({ size: formatUploadSize(result.byteSize) })}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] text-advo-muted">
                  {copy.dimension({ width: String(result.width), height: String(result.height) })} · {result.contentType} · {result.encoding}
                </span>
              </>
            ) : (
              // Nothing here was measured this session, so there is no before/after to
              // report. The thumbnail is the real, served image, and the address is a
              // server detail the reseller never has to read.
              <span className="block text-[11px] text-advo-muted">{copy.saved}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Button isDisabled={disabled || uploading} onPress={() => inputRef.current?.click()} size="sm" type="button" variant="outline">
              <ImagePlus className="size-3.5" />
              {copy.replace}
            </Button>
            <Button isDisabled={disabled || uploading} onPress={clear} size="sm" type="button" variant="outline">
              <Trash2 className="size-3.5" />
              {copy.remove}
            </Button>
          </span>
        </div>
      ) : null}

      {/* ── Drop zone ── */}
      {preview ? null : (
        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            dragging ? "border-advo-blue bg-advo-blue/5" : "border-advo-border bg-advo-page hover:border-advo-blue hover:bg-white"
          } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          htmlFor={inputId}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => {
            if (disabled) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (disabled) return;
            pick(event.dataTransfer.files?.[0]);
          }}
        >
          <span className="grid size-10 place-items-center rounded-xl bg-white text-advo-blue ring-1 ring-advo-border">
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <UploadCloud className="size-5" />}
          </span>
          <span className="text-xs font-bold text-advo-text">{uploading ? copy.uploading : copy.drop}</span>
          <span className="text-[11px] text-advo-muted">{copy.formats(formatUploadSize(MAX_UPLOAD_BYTES))}</span>
        </label>
      )}

      <input
        accept={ACCEPTED_TYPES.join(",")}
        className="sr-only"
        disabled={disabled || uploading}
        id={inputId}
        onChange={(event) => pick(event.target.files?.[0])}
        ref={inputRef}
        type="file"
      />

      {error ? (
        <p className="flex items-start gap-2 rounded-xl border border-[#f0c2c2] bg-[#fdf2f2] px-3.5 py-2.5 text-[11px] font-semibold text-[#9b1c1c]">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      <p className="flex items-start gap-2 rounded-xl bg-advo-surface-soft/60 px-3.5 py-2.5 text-[11px] text-advo-muted">
        <UploadCloud className="mt-0.5 size-3.5 shrink-0 text-advo-blue" />
        <span>{copy.compressNote}</span>
      </p>

      {/* ── Fallback: an image already hosted elsewhere ── */}
      <div className="border-t border-[var(--advo-border)] pt-3">
        <button
          className="flex items-center gap-1.5 text-[11px] font-bold text-advo-blue hover:underline"
          onClick={() => setShowUrlField((open) => !open)}
          type="button"
        >
          <Link2 className="size-3.5" />
          {copy.urlFallback}
        </button>
        {showUrlField ? (
          <input
            className="mt-2 w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs font-medium text-advo-text placeholder:text-advo-muted focus:border-advo-blue focus:bg-white focus:outline-none"
            disabled={disabled}
            onChange={(event) => {
              // Clearing an upload's result keeps the panel from claiming a saving
              // for an image that is no longer the one in play.
              setResult(null);
              setPhase("idle");
              onChangeUrl(event.target.value);
            }}
            placeholder="https://…"
            type="url"
            value={value.startsWith("blob:") ? "" : value}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * The portal logo upload, gated by `branding.logo_upload`.
 *
 * A wordmark is drawn in a 40 px header badge, so the thumbnail is square and the
 * image is `object-contain`: cropping a wordmark to a square would cut off exactly
 * the part that identifies the business.
 */
export function LogoUploader({
  value,
  disabled,
  onUploaded,
  onChangeUrl,
  onClear,
}: {
  value: string;
  disabled?: boolean;
  onUploaded: (logo: UploadedLogo) => void;
  onChangeUrl: (url: string) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  return (
    <ImageUploader
      copy={{
        drop: t("reseller.portal.branding.logoDrop"),
        uploading: t("reseller.portal.branding.logoUploading"),
        replace: t("reseller.portal.branding.logoReplace"),
        remove: t("reseller.portal.branding.logoRemove"),
        uploadFailed: t("reseller.portal.branding.logoUploadFailed"),
        previewAlt: t("reseller.portal.branding.logoPreviewAlt"),
        saved: t("reseller.portal.branding.logoSaved"),
        compressNote: t("reseller.portal.branding.logoCompressNote"),
        urlFallback: t("reseller.portal.branding.logoUrlFallback"),
        formats: (max) => t("reseller.portal.branding.logoFormats", { max }),
        optimised: ({ before, after, percent }) => t("reseller.portal.branding.logoOptimised", { before, after, percent }),
        alreadyOptimal: ({ size }) => t("reseller.portal.branding.logoAlreadyOptimal", { size }),
        dimension: ({ width, height }) => t("reseller.portal.branding.logoDimension", { width, height }),
      }}
      disabled={disabled}
      endpoint="/reseller/media/logo"
      imageFit="contain"
      onChangeUrl={onChangeUrl}
      onClear={onClear}
      onUploaded={onUploaded}
      thumbClassName="size-14"
      value={value}
    />
  );
}

/**
 * The full-page portal background upload, gated by `branding.background_upload`.
 *
 * A background is a photograph behind the whole portal, so the thumbnail is wide
 * and the image is `object-cover`: the reseller needs to see what the guest will
 * actually see, which is a cropped-to-screen fill rather than a letterboxed photo.
 */
export function BackgroundUploader({
  value,
  disabled,
  onUploaded,
  onChangeUrl,
  onClear,
}: {
  value: string;
  disabled?: boolean;
  onUploaded: (asset: UploadedLogo) => void;
  onChangeUrl: (url: string) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  return (
    <ImageUploader
      copy={{
        drop: t("reseller.portal.branding.backgroundDrop"),
        uploading: t("reseller.portal.branding.backgroundUploading"),
        replace: t("reseller.portal.branding.backgroundReplace"),
        remove: t("reseller.portal.branding.backgroundRemove"),
        uploadFailed: t("reseller.portal.branding.backgroundUploadFailed"),
        previewAlt: t("reseller.portal.branding.backgroundPreviewAlt"),
        saved: t("reseller.portal.branding.backgroundSaved"),
        compressNote: t("reseller.portal.branding.backgroundCompressNote"),
        urlFallback: t("reseller.portal.branding.logoUrlFallback"),
        formats: (max) => t("reseller.portal.branding.logoFormats", { max }),
        optimised: ({ before, after, percent }) => t("reseller.portal.branding.logoOptimised", { before, after, percent }),
        alreadyOptimal: ({ size }) => t("reseller.portal.branding.logoAlreadyOptimal", { size }),
        dimension: ({ width, height }) => t("reseller.portal.branding.logoDimension", { width, height }),
      }}
      disabled={disabled}
      endpoint="/reseller/media/background"
      imageFit="cover"
      onChangeUrl={onChangeUrl}
      onClear={onClear}
      onUploaded={onUploaded}
      thumbClassName="h-16 w-28"
      value={value}
    />
  );
}
