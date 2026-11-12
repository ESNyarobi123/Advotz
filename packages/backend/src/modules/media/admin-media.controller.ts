import { Body, Controller, Post, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@advo/contracts";
import {
  CurrentUser,
  Roles,
  RolesGuard,
  SessionAuthGuard,
  type RequestActor,
} from "../../common/guards/session.guard.js";
import { badRequest } from "../../common/errors.js";
import { enforceRateLimit } from "../../common/rate-limit.js";
import {
  MAX_UPLOAD_BYTES,
  uploadCampaignCreative,
  uploadListingImage,
  uploadPublicHotspotImage,
} from "./media.service.js";

/**
 * Admin image uploads.
 *
 * Same transport shape as the reseller uploads — the raw image is the request
 * body, not a multipart form — because `main.ts` already registers a larger
 * limit for `image/*` and base64 would inflate a 5 MB phone photo by a third.
 *
 * Admin-only by role, with no plan gate: a reseller's surfaces are sold, the
 * platform's own surfaces are not. The rate limits still exist, because every
 * upload runs one lossless and one lossy encode of a 1600 px image.
 */
@Controller("admin/media")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminMediaController {
  @Post("campaign")
  async uploadCampaign(
    @CurrentUser() a: RequestActor,
    @Body() body: unknown,
    @Query("name") name?: string,
  ) {
    await enforceRateLimit("media-campaign", a.id, 60, 3600);
    return uploadCampaignCreative(a.id, rawImage(body, name));
  }

  /** Cover image for a guest Explore listing. */
  @Post("listing")
  async uploadListing(
    @CurrentUser() a: RequestActor,
    @Body() body: unknown,
    @Query("name") name?: string,
  ) {
    await enforceRateLimit("media-listing", a.id, 60, 3600);
    return uploadListingImage(a.id, rawImage(body, name));
  }

  /** Cover image for a public "Our Hotspots" card. */
  @Post("hotspot")
  async uploadHotspot(
    @CurrentUser() a: RequestActor,
    @Body() body: unknown,
    @Query("name") name?: string,
  ) {
    await enforceRateLimit("media-hotspot", a.id, 60, 3600);
    return uploadPublicHotspotImage(a.id, rawImage(body, name));
  }
}

/**
 * Reads the raw image body every admin upload route expects.
 *
 * Shared so the three routes cannot drift on the error they return for a JSON
 * body, which is the mistake a client makes once — it sends `{ image: "…" }`
 * out of habit and gets an unexplained 500 without this check.
 */
function rawImage(body: unknown, name?: string) {
  if (!Buffer.isBuffer(body)) {
    badRequest(
      `Send the image as the raw request body with an image/* Content-Type (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB)`,
    );
  }
  return { buffer: body, fileName: name ?? null };
}
