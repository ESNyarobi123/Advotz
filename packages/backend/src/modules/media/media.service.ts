import { createHash } from "node:crypto";
import sharp, { type Metadata, type WebpOptions } from "sharp";
import { FEATURE_LOCKED_BY_PLAN } from "@advo/contracts";
import { MediaAssetKind, prisma } from "@advo/db";
import { audit } from "../../common/events.js";
import { badRequest, forbidden, notFound } from "../../common/errors.js";
import { resolvedPlanFor } from "../subscriptions/entitlements.service.js";

/* ─────────────────────────────────────────────────────────────────────────
 * Image optimisation
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * How large an uploaded file may be before we refuse it.
 *
 * A reseller exporting a logo from a phone camera or a design tool routinely
 * produces a 2–5 MB PNG, so the ceiling has to be generous — the point of this
 * module is to accept the heavy file and make it small, not to make the reseller
 * go and resize it themselves. It is bounded all the same: the bytes are held in
 * memory for the duration of the request.
 */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

/**
 * Longest edge kept, in pixels.
 *
 * The portal renders the logo inside a 40 px badge (`size-10`), so even on a 3×
 * screen the real requirement is ~120 px. 512 keeps a wide margin for a future
 * larger placement or a high-DPI marketing surface while staying far below the
 * point where a logo stops fitting in a few tens of kilobytes. It is a *box*, not
 * a target: a wide wordmark keeps its aspect ratio and lands at 512 × whatever.
 */
export const MAX_IMAGE_EDGE = 512;

/**
 * Longest edge kept for a full-page background.
 *
 * A background covers the whole phone screen, so 512 px would be visibly soft on
 * a 3× display. 1280 is the point where a portrait background still looks sharp
 * behind a scrim and a busy JPEG lands in the low hundreds of kilobytes — which
 * matters because this is downloaded by a guest who has not paid yet.
 */
export const BACKGROUND_MAX_EDGE = 1280;

/**
 * Quality used for the lossy branch of a background.
 *
 * Lower than a logo's 90 because a background sits behind a dark scrim, where
 * compression artefacts are invisible, and every kilobyte is paid for by a guest
 * on a metered mobile connection before they have bought anything.
 */
export const BACKGROUND_QUALITY = 82;

/** Guards against a small file that claims enormous dimensions (decompression bomb). */
const MAX_INPUT_PIXELS = 40_000_000;

/** Shared because both the header check and the decoder's own limit report it. */
const TOO_MANY_PIXELS_MESSAGE = "That image has too many pixels to process. Resize it and try again";

/**
 * Formats we will read. Deliberately raster-only.
 *
 * SVG is refused on purpose. The output of this module is always a raster WebP,
 * which removes any chance of shipping a live document to a guest's browser — but
 * only if the *input* is raster too, because parsing a vector document is where
 * the risk lives. A reseller with an SVG logo exports a PNG first; the error says
 * so rather than failing silently.
 */
const ACCEPTED_INPUT_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "tiff", "bmp", "heif"]);

/** A human list for the rejection message, kept next to the set it describes. */
const ACCEPTED_INPUT_LABEL = "PNG, JPEG, WebP, GIF, AVIF, TIFF or BMP";

export type OptimisedImage = {
  data: Buffer;
  contentType: "image/webp";
  width: number;
  height: number;
  byteSize: number;
  /** Which encoder won. Reported so the dashboard can explain the result honestly. */
  encoding: "lossless" | "lossy";
};

/**
 * How hard to squeeze one image.
 *
 * Defaults are the logo settings, so a caller that predates backgrounds keeps the
 * exact behaviour it had. A background passes a bigger box and a lower quality,
 * because the two surfaces have opposite requirements: a logo must stay crisp in
 * a 40 px badge, a background must stay small on a guest's unmetred link.
 */
export type OptimiseOptions = {
  /** Longest edge kept, in pixels. */
  maxEdge?: number;
  /** Quality of the lossy branch that competes with lossless. */
  quality?: number;
  /**
   * Skip the lossless encoder entirely.
   *
   * Set for large, photographic inputs whose lossless encode can only ever be
   * bigger; the comparison is skipped rather than run and discarded.
   */
  skipLossless?: boolean;
};

/**
 * What `toBuffer({ resolveWithObject: true })` gives back: the encoded bytes plus
 * the real output dimensions, which differ from the input box on a resize.
 */
type EncodedImage = { data: Buffer; info: { width: number; height: number } };

/**
 * Re-encodes any accepted image as a WebP that is as small as it can be without
 * looking worse.
 *
 * Both encoders are run and the smaller output wins, which is a stronger rule
 * than picking a quality number up front:
 *
 * - **Lossless** is pixel-perfect. For the flat colours, hard edges and text of a
 *   typical logo it is also frequently *smaller* than a lossy encode, because
 *   there is almost nothing for a lossy codec to throw away.
 * - **Lossy at quality 90** is visually near-identical and wins on photographic or
 *   gradient-heavy logos, where lossless has to store every noise pixel.
 *
 * So the outcome is "perfect when perfect is affordable, high quality otherwise",
 * decided per image instead of by a guess. Metadata is dropped either way (that
 * alone can be tens of kilobytes of EXIF), and EXIF rotation is baked in first so
 * a phone-straightened logo is not served sideways.
 */
export async function optimiseImage(input: Buffer, options: OptimiseOptions = {}): Promise<OptimisedImage> {
  const maxEdge = options.maxEdge ?? MAX_IMAGE_EDGE;
  const quality = options.quality ?? 90;
  if (input.length === 0) badRequest("The uploaded file is empty");
  if (input.length > MAX_UPLOAD_BYTES) {
    badRequest(`Choose an image smaller than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`);
  }

  // Reading the header is cheap and does not decode the image, so the format and
  // the declared dimensions are both available before a single pixel is allocated.
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch (error) {
    // libvips refuses the header itself when the declared size is past the limit,
    // so the same two outcomes are reported here as below.
    if (/pixel.*limit|too many pixels/i.test(String((error as Error)?.message ?? ""))) {
      badRequest(TOO_MANY_PIXELS_MESSAGE);
    }
    badRequest("That file is not an image we can read");
  }

  if (meta.format === "svg") {
    badRequest(`SVG logos are not accepted. Export your logo as ${ACCEPTED_INPUT_LABEL} and upload that instead`);
  }
  if (!meta.format || !ACCEPTED_INPUT_FORMATS.has(meta.format)) {
    badRequest(`Upload a ${ACCEPTED_INPUT_LABEL} image`);
  }
  // Checked from the header rather than left to the decoder, so a 400 with a clear
  // reason is returned instead of a 500 from deep inside libvips.
  if ((meta.width ?? 0) * (meta.height ?? 0) > MAX_INPUT_PIXELS) {
    badRequest(TOO_MANY_PIXELS_MESSAGE);
  }

   100
  // Two independent pipelines from the same buffer: `clone()` would be shorter but
  // couples the two encodes, and a shared failure is exactly what we do not want
  // when the fallback is the whole point.
  const pipeline = (webp: WebpOptions) =>
    sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
      .webp({ effort: 4, ...webp });

  let winner: EncodedImage;
  let encoding: OptimisedImage["encoding"];
  try {
    if (options.skipLossless) {
      // A 1280 px photograph has nothing for a lossless encode to win on, and
      // running it doubles the CPU and peak memory of the request for no result.
      winner = await pipeline({ quality, smartSubsample: true }).toBuffer({ resolveWithObject: true });
      encoding = "lossy";
    } else {
      const [lossless, lossy] = await Promise.all([
        pipeline({ lossless: true }).toBuffer({ resolveWithObject: true }),
        pipeline({ quality, smartSubsample: true }).toBuffer({ resolveWithObject: true }),
      ]);
      winner = lossless.data.length <= lossy.data.length ? lossless : lossy;
      encoding = winner === lossless ? "lossless" : "lossy";
    }
  } catch {
    // A truncated or corrupt file that got past the header check. Still the
    // reseller's input to fix, so still a 400.
    badRequest("That image could not be read, it may be damaged or incomplete");
  }

  return {
    data: winner.data,
    contentType: "image/webp",
    width: winner.info.width,
    height: winner.info.height,
    byteSize: winner.data.length,
    encoding,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Public URL
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Base the stored asset URL is built from.
 *
 * An absolute URL is stored in `branding.logo_url` because the contract types
 * that field as a URL and because the guest portal renders it directly in an
 * `<img src>`. `API_PUBLIC_URL` is the same stable public origin the Snippe
 * webhook URL is built from — never the internal one, which is unreachable from a
 * guest's phone.
 */
export function publicApiUrl(): string {
  const base = process.env.API_PUBLIC_URL;
  if (!base) throw new Error("API_PUBLIC_URL is not set, so an uploaded asset cannot be addressed");
  return base.replace(/\/$/, "");
}

/** The stable, cacheable address of a stored asset. */
export function mediaUrl(assetId: string): string {
  return `${publicApiUrl()}/api/v1/media/${assetId}`;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Reseller image uploads (logo + background)
 * ───────────────────────────────────────────────────────────────────────── */

export type UploadedMedia = {
  id: string;
  url: string;
  contentType: string;
  width: number;
  height: number;
  /** Size after optimisation. */
  byteSize: number;
  /** Size of the file the reseller chose. */
  originalBytes: number;
  /** 0–100, rounded. How much smaller the served image is. */
  savedPercent: number;
  encoding: "lossless" | "lossy";
};

/**
 * How many assets to keep per owner and kind before the oldest are pruned.
 *
 * Assets are bytea in Postgres, so a reseller who re-uploads their logo fifty
 * times would otherwise leave fifty dead images in the table forever. Keeping the
 * newest few is enough that nothing a live portal could still be pointing at is
 * ever removed, while bounding growth.
 *
 * Scoped per kind, so uploading six backgrounds never evicts the live logo.
 */
const KEEP_PER_OWNER = 5;

type ResellerImageSpec = {
  kind: (typeof MediaAssetKind)[keyof typeof MediaAssetKind];
  /** `true` when the plan offers this surface at all; read from the resolved plan. */
  allowed: boolean;
  /** What to call the surface in a refusal, e.g. "A custom logo". */
  label: string;
  /** Audit action stamped on the created asset. */
  auditAction: string;
  optimise: OptimiseOptions;
};

/**
 * Validates, optimises and stores one reseller image asset.
 *
 * The plan gate comes first: the feature key is checked *here* and not merely
 * hidden in the dashboard, because hiding a control is not enforcing it. The same
 * `FEATURE_LOCKED_BY_PLAN` code the preference writer uses is returned, so the
 * dashboard already knows how to explain it.
 *
 * The three surfaces (logo, background) differ only in their gate, their box and
 * their audit action, so they share one implementation: a second copy of this
 * transaction is where the pruning rule would quietly drift apart.
 */
async function storeResellerImage(
  resellerId: string,
  actorUserId: string,
  input: { buffer: Buffer; fileName?: string | null },
  spec: ResellerImageSpec,
): Promise<UploadedMedia> {
  if (!spec.allowed) {
    forbidden(`${spec.label} is not included in your current plan`, FEATURE_LOCKED_BY_PLAN);
  }

  const optimised = await optimiseImage(input.buffer, spec.optimise);
  const checksum = createHash("sha256").update(optimised.data).digest("hex");

  const asset = await prisma.$transaction(async (tx) => {
    const created = await tx.mediaAsset.create({
      data: {
        kind: spec.kind,
        ownerType: "RESELLER",
        ownerId: resellerId,
        contentType: optimised.contentType,
        bytes: Uint8Array.from(optimised.data),
        byteSize: optimised.byteSize,
        originalBytes: input.buffer.length,
        originalName: input.fileName?.slice(0, 200) ?? null,
        width: optimised.width,
        height: optimised.height,
        checksum,
      },
    });

    // Best-effort housekeeping inside the same transaction as the insert: a failure
    // here still leaves a working upload, which is the outcome that matters.
    const stale = await tx.mediaAsset.findMany({
      where: { kind: spec.kind, ownerType: "RESELLER", ownerId: resellerId },
      orderBy: { createdAt: "desc" },
      skip: KEEP_PER_OWNER,
      select: { id: true },
    });
    if (stale.length > 0) {
      await tx.mediaAsset.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
    }

    await audit(tx, {
      actorUserId,
      action: spec.auditAction,
      targetType: "MediaAsset",
      targetId: created.id,
      resellerId,
      metadata: {
        originalBytes: input.buffer.length,
        byteSize: optimised.byteSize,
        encoding: optimised.encoding,
        width: optimised.width,
        height: optimised.height,
      },
    });

    return created;
  });

  return {
    id: asset.id,
    url: mediaUrl(asset.id),
    contentType: asset.contentType,
    width: asset.width,
    height: asset.height,
    byteSize: asset.byteSize,
    originalBytes: asset.originalBytes,
    // Negative when the optimiser could not beat the original (an already-tiny,
    // already-optimal WebP), which the UI reports as "already optimal" rather than
    // claiming a saving that did not happen.
    savedPercent: savedPercent(asset.byteSize, asset.originalBytes),
    encoding: optimised.encoding,
  };
}

/** The plan branding features an upload gate reads; explicit so a missing key is a type error. */
async function resellerBrandingFeatures(resellerId: string, surface: string) {
  const resolved = await resolvedPlanFor(resellerId);
  if (!resolved) {
    forbidden(`An active subscription is required to upload a ${surface}`, FEATURE_LOCKED_BY_PLAN);
  }
  return resolved.features.branding;
}

/** Stores the portal logo, gated by `branding.logo_upload`. */
export async function uploadResellerLogo(
  resellerId: string,
  actorUserId: string,
  input: { buffer: Buffer; fileName?: string | null },
): Promise<UploadedMedia> {
  const branding = await resellerBrandingFeatures(resellerId, "logo");
  return storeResellerImage(resellerId, actorUserId, input, {
    kind: MediaAssetKind.PORTAL_LOGO,
    allowed: branding.logo_upload,
    label: "A custom logo",
    auditAction: "media.logo_uploaded",
    optimise: {},
  });
}

/**
 * Stores the full-page background, gated by `branding.background_upload`.
 *
 * A background is a photograph rather than a mark, so it gets the larger box and
 * the lower quality: the guest downloads this over the WiFi they have not bought
 * yet, and a background sits behind a scrim where artefacts cannot be seen.
 */
export async function uploadResellerBackground(
  resellerId: string,
  actorUserId: string,
  input: { buffer: Buffer; fileName?: string | null },
): Promise<UploadedMedia> {
  const branding = await resellerBrandingFeatures(resellerId, "background image");
  return storeResellerImage(resellerId, actorUserId, input, {
    kind: MediaAssetKind.PORTAL_BACKGROUND,
    allowed: branding.background_upload,
    label: "A background image",
    auditAction: "media.background_uploaded",
    optimise: { maxEdge: BACKGROUND_MAX_EDGE, quality: BACKGROUND_QUALITY, skipLossless: true },
  });
}

/** 0–100, rounded; negative when optimisation made the file larger. */
function savedPercent(byteSize: number, originalBytes: number): number {
  if (originalBytes <= 0) return 0;
  return Math.round((1 - byteSize / originalBytes) * 100);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Serving
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Reads an asset for the public media route.
 *
 * No entitlement check and no tenant check: the id is an unguessable UUID and the
 * URL is embedded in a page served to anonymous guests, so the id *is* the
 * capability. Nothing private is stored here — only images the reseller chose to
 * publish on their own portal.
 */
export async function readMediaAsset(assetId: string) {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: { id: true, contentType: true, bytes: true, checksum: true, byteSize: true },
  });
  if (!asset) notFound("Image not found");
  return asset;
}
