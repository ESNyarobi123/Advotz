import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import {
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
  createPortalContext,
  createPortalOrder,
  grantStatus,
  joinWithRecoveryToken,
  portalBootstrap,
  portalOrderStatus,
  redeemVoucher,
  retryPortalPayment,
  submitPromotion,
} from "./portal.service.js";

const slugSchema = z.string().regex(/^[a-z0-9-]{3,64}$/);
const tokenSchema = z.string().min(20).max(200);
const payerSchema = z.object({
  phone: tzPhoneSchema,
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
});

/** Public guest endpoints. No internal IDs are accepted or returned; only opaque tokens. */
@Controller("portal")
export class PortalController {
  @Get("sites/:slug")
  bootstrap(@Param("slug") slug: string) {
    return portalBootstrap(parse(slugSchema, slug));
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

  @Post("access/join")
  async join(@Body() body: unknown, @Req() req: HttpRequest) {
    const result = await joinWithRecoveryToken(parse(grantRecoverySchema, body), clientIp(req));
    kickOutbox();
    return result;
  }
}
