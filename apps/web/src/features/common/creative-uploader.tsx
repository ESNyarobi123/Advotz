"use client";

import {
  ImageUploader,
  type UploadedImage,
} from "@/features/common/image-uploader";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@advo/i18n";

/**
 * The admin-side image field: a label, a drop zone, and the shared uploader.
 *
 * Every platform surface that carries a picture — an ad creative, an Explore
 * listing, a public hotspot — wants exactly the same thing: accept whatever the
 * sponsor sent, let the API shrink it, report the saving, and still allow a URL
 * that is already hosted elsewhere. The copy differs per surface, so the keys are
 * passed as a prefix (`admin.listings.image`) and every string underneath it is
 * reused rather than restated.
 *
 * The savings/dimension lines are shared with the reseller branding uploader:
 * they describe what the optimiser measured, not which surface the image is for.
 */
export type CreativeUploaderProps = {
  /** i18n key prefix holding `drop`, `uploading`, `replace`, … for this surface. */
  copyKey: string;
  /** Route that accepts `POST` with the raw image body, e.g. `/admin/media/listing`. */
  endpoint: string;
  label: string;
  value: string;
  /** Where the image lands on the guest page, e.g. `object-cover` for a full-bleed tile. */
  imageFit: "contain" | "cover";
  thumbClassName: string;
  disabled?: boolean;
  onUploaded: (asset: UploadedImage) => void;
  onChangeUrl: (url: string) => void;
  onClear: () => void;
};

export function CreativeUploader({
  copyKey,
  endpoint,
  label,
  value,
  imageFit,
  thumbClassName,
  disabled,
  onUploaded,
  onChangeUrl,
  onClear,
}: CreativeUploaderProps) {
  const { t } = useI18n();
  // `t` is typed to the exact key union, so a prefix that is composed at runtime
  // has to be widened once here instead of at all eleven call sites below.
  const key = (suffix: string) => `${copyKey}.${suffix}` as MessageKey;

  return (
    <div className="space-y-2">
      <span className="text-xs font-bold text-advo-text">{label}</span>
      <ImageUploader
        copy={{
          drop: t(key("drop")),
          uploading: t(key("uploading")),
          replace: t(key("replace")),
          remove: t(key("remove")),
          uploadFailed: t(key("uploadFailed")),
          previewAlt: t(key("previewAlt")),
          saved: t(key("saved")),
          compressNote: t(key("compressNote")),
          urlFallback: t(key("urlFallback")),
          formats: (max) => t("reseller.portal.branding.logoFormats", { max }),
          optimised: ({ before, after, percent }) =>
            t("reseller.portal.branding.logoOptimised", {
              before,
              after,
              percent,
            }),
          alreadyOptimal: ({ size }) =>
            t("reseller.portal.branding.logoAlreadyOptimal", { size }),
          dimension: ({ width, height }) =>
            t("reseller.portal.branding.logoDimension", { width, height }),
        }}
        disabled={disabled}
        endpoint={endpoint}
        imageFit={imageFit}
        onChangeUrl={onChangeUrl}
        onClear={onClear}
        onUploaded={onUploaded}
        thumbClassName={thumbClassName}
        value={value}
      />
    </div>
  );
}
