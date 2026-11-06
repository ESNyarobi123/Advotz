import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";import {
  grantRecoverySchema,
  portalContextInputSchema,
  portalOrderInputSchema,
  promotionRequestInputSchema,
  tzPhoneSchema,
  voucherRedeemSchema,
} from "@advo/contracts";
import { z } from "zod";
import { clientIp, parse, type HttpRequest } from "../../common/http.js";
import { kickOutbox } from "../outbox/outbox.dispatcher.js";
import {
  activateGrant,
  createPortalContext,
  createPortalOrder,
  grantStatus,
  joinWithRecoveryToken,
  portalAds,
  portalBootstrap,
  portalConfig,
  portalExplore,
  portalOrderStatus,
  redeemVoucher,
  resolvePortalSlug,
  retryPortalPayment,
  submitPromotion,
} from "./portal.service.js";

const slugSchema = z.string().regex(/^[a-z0-9-]{3,64}$/);
const tokenSchema = z.string().min(20).max(200);
/** The retry form asks for the phone only; a guest is a phone number, not an account. */
const payerSchema = z.object({
  phone: tzPhoneSchema,
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().email().optional(),
});

/** Public guest endpoints. No internal IDs are accepted or returned; only opaque tokens. */
@Controller("portal")
export class PortalController {
  /**
   * Omada's captive-portal entry only carries the AP MAC and the SSID, so this
   * is how a client that never saw our slug finds its WiFi location.
   */
  @Get("resolve")
  resolve(@Query("ap") ap?: string, @Query("ssid") ssid?: string) {
    return resolvePortalSlug({ apMac: ap ?? null, ssid: ssid ?? null });
  }

  @Get("sites/:slug")
  bootstrap(@Param("slug") slug: string) {
    return portalBootstrap(parse(slugSchema, slug));
  }

  /** Effective portal config, safe to cache on `configRevision`. */
  @Get("sites/:slug/config")
  config(@Param("slug") slug: string) {
    return portalConfig(parse(slugSchema, slug));
  }

  /** Policy-aware ad delivery for one placement; empty when the placement is hidden. */
  @Get("sites/:slug/ads/:placement")
  ads(@Param("slug") slug: string, @Param("placement") placement: string) {
    return portalAds(parse(slugSchema, slug), placement);
  }

  /**
   * The connected page's Explore feed. A guest who has just been authorized
   * opens a menu and gets the current listings, not the ones cached at page load.
   */
  @Get("sites/:slug/explore")
  explore(@Param("slug") slug: string) {
    return portalExplore(parse(slugSchema, slug));
  }

  @Post("sites/:slug/context")
  context(@Param("slug") slug: string, @Body() body: unknown, @Req() req: HttpRequest) {
    return createPortalContext(parse(slugSchema, slug), parse(portalContextInputSchema, body), clientIp(req));
  }

  @Post("orders")
  async order(@Body() body: unknown, @Req() req: HttpRequest) {
    const result = await createPortalOrder(parse(portalOrderInputSchema, body), clientIp(req));
    kickOutbox();
    return result;
  }

  @Get("orders/:token")
  status(@Param("token") token: string) {
    return portalOrderStatus(parse(tokenSchema, token));
  }

  @Post("orders/:token/retry")
  async retry(@Param("token") token: string, @Body() body: unknown) {
    const result = await retryPortalPayment(parse(tokenSchema, token), parse(payerSchema, body));
    kickOutbox();
    return result;
  }

  @Post("vouchers/redeem")
  async redeem(@Body() body: unknown, @Req() req: HttpRequest) {
    const result = await redeemVoucher(parse(voucherRedeemSchema, body), clientIp(req));
    kickOutbox();
    return result;
  }

  /** A local business requesting a banner promotion; no payment is taken here. */
  @Post("sites/:slug/promotions")
  promotion(@Param("slug") slug: string, @Body() body: unknown, @Req() req: HttpRequest) {
    return submitPromotion(parse(slugSchema, slug), parse(promotionRequestInputSchema, body), clientIp(req));
  }

  @Get("access/:token")
  access(@Param("token") token: string) {
    return grantStatus(parse(tokenSchema, token));
  }

  /** The guest tapped "Connect" — call the Controller now instead of waiting out the hold. */
  @Post("access/:token/activate")
  async activate(@Param("token") token: string) {
    const result = await activateGrant(parse(tokenSchema, token));
    kickOutbox();
    return result;
  }

  @Post("access/join")
  async join(@Body() body: unknown, @Req() req: HttpRequest) {
    const result = await joinWithRecoveryToken(parse(grantRecoverySchema, body), clientIp(req));
    kickOutbox();
    return result;
  }
}
