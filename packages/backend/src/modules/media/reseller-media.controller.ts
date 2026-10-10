import { Body, Controller, Post, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@advo/contracts";
import { CurrentUser, Roles, RolesGuard, SessionAuthGuard, requireResellerId, type RequestActor } from "../../common/guards/session.guard.js";
import { badRequest } from "../../common/errors.js";
import { enforceRateLimit } from "../../common/rate-limit.js";
import { MAX_UPLOAD_BYTES, uploadResellerBackground, uploadResellerLogo } from "./media.service.js";

/**
 * Reseller image uploads.
 *
 * The body is the raw image, not multipart JSON-wrapped base64. Base64 inflates a
 * payload by a third and would push a legitimate 3 MB phone photo past the global
 * request cap, so `main.ts` registers buffer parsers for `image/*` with their own
 * larger limit and this handler receives a `Buffer` directly.
 *
 * Guarded exactly like every other reseller route; the plan gate (a `branding.*`
 * feature key) is enforced in the service so hiding the control in the dashboard
 * is never the only thing standing between a locked feature and the API.
 */
@Controller("reseller/media")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.RESELLER)
export class ResellerMediaController {
  @Post("logo")
  async uploadLogo(@CurrentUser() a: RequestActor, @Body() body: unknown, @Query("name") name?: string) {
    const resellerId = requireResellerId(a);
    // Each upload runs two image encodes, so the bucket is about bounding CPU, not
    // about how often a reseller may change their mind.
    await enforceRateLimit("media-logo", resellerId, 20, 3600);

    if (!Buffer.isBuffer(body)) {
      badRequest(`Send the image as the raw request body with an image/* Content-Type (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB)`);
    }

    return uploadResellerLogo(resellerId, a.id, { buffer: body, fileName: name ?? null });
  }

  /**
   * The full-page portal background.
   *
   * A separate route rather than a `kind` query parameter: the two surfaces have
   * different gates and different optimiser settings, and a caller that could pick
   * the kind could pick the one whose gate it does not hold.
   */
  @Post("background")
  async uploadBackground(@CurrentUser() a: RequestActor, @Body() body: unknown, @Query("name") name?: string) {
    const resellerId = requireResellerId(a);
    // Lower than the logo bucket: a 1280 px encode is a heavier request, so the
    // ceiling is about protecting the process rather than limiting intent.
    await enforceRateLimit("media-background", resellerId, 12, 3600);

    if (!Buffer.isBuffer(body)) {
      badRequest(`Send the image as the raw request body with an image/* Content-Type (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB)`);
    }

    return uploadResellerBackground(resellerId, a.id, { buffer: body, fileName: name ?? null });
  }
}
