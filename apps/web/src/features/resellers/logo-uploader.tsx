"use client";

import { ImageUploader, type UploadedImage } from "@/features/common/image-uploader";
import { useI18n } from "@/lib/i18n";

/** Kept for callers that name the type directly. */
export type UploadedLogo = UploadedImage;

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
  onUploaded: (logo: UploadedImage) => void;
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
  onUploaded: (asset: UploadedImage) => void;
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
