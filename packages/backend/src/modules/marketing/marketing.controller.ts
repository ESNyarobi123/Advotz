import { Controller, Get } from "@nestjs/common";
import { listPublicHotspots } from "../platform/hotspots.service.js";
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

  /** Curated WiFi locations for the public "Our Hotspots" map (active only). */
  @Get("hotspots")
  hotspots() {
    return listPublicHotspots();
  }
}
