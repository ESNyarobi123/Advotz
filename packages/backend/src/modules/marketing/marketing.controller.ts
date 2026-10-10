import { Controller, Get } from "@nestjs/common";
import { listPublicPlans } from "./marketing.service.js";

/**
 * Public marketing endpoints.
 *
 * No guard is attached on purpose: this is the pre-signup pricing catalog, and
 * the only thing it exposes is what the site already advertises. It returns
 * published public plans with their capacity and capability flags — never
 * subscription counts, revenue, reseller identities or the raw feature JSON.
 */
@Controller("marketing")
export class MarketingController {
  @Get("plans")
  plans() {
    return listPublicPlans();
  }
}
