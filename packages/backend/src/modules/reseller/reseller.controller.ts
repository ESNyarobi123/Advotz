import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, Query, Res, UseGuards } from "@nestjs/common";
import {
  deviceClaimInputSchema,
  deviceRenameSchema,
  deviceRetrySchema,
  deviceWifiSchema,
  FEATURE_LOCKED_BY_PLAN,
  payoutDestinationInputSchema,
  renameSchema,
  siteInputSchema,
  sitePortalPreferenceInputSchema,
  startTrialSchema,
  subscriptionCheckoutSchema,
  supportMessageInputSchema,
  supportTicketInputSchema,
  UserRole,
  uuidSchema,
  voucherGroupInputSchema,
  wifiPackageInputSchema,
  withdrawalQuoteSchema,
  withdrawalRequestSchema,
} from "@advo/contracts";
import { GrantState, PromotionRequestState } from "@advo/db";
import { z } from "zod";
import { CurrentUser, Roles, RolesGuard, SessionAuthGuard, requireResellerId, type RequestActor } from "../../common/guards/session.guard.js";
import { enumQuery, parse, type HttpReply } from "../../common/http.js";
import { enforceRateLimit } from "../../common/rate-limit.js";
import { getGrantForReseller, listGrants, retryGrantDevice, revokeGrant } from "../access/grants.service.js";
import { archivePackage, createPackage, listPackages, packageRevisions, packageSiteOptions, updatePackage } from "../catalog/packages.service.js";
import {
  archiveVoucherGroup,
  createVoucherGroup,
  deleteUnusedVouchers,
  exportVoucherGroupCsv,
  listVoucherGroups,
  listVouchers,
  renameVoucherGroup,
} from "../catalog/vouchers.service.js";
import { accountHistory, walletSummary } from "../ledger/ledger.service.js";
import { archiveSite, createDeviceWifi, createSite, getSite, listDeviceClaims, listDevices, listSites, removeDevice as forgetResellerDevice, renameDevice as renameResellerDevice, requestReprovision, retryDeviceAdopt, submitDeviceClaim, updateSite } from "../network/sites.service.js";
import { kickOutbox } from "../outbox/outbox.dispatcher.js";
import { listPromotionRequests, updatePromotionRequestState } from "../platform/listings.service.js";
import { resellerCustomers, resellerOrders, resellerOverview } from "../reports/reports.service.js";
import { checkoutSubscription, getSubscriptionView, listActivePlans, startTrial } from "../subscriptions/subscriptions.service.js";
import {
  PreferenceRejected,
  resolveResellerEntitlements,
  sitePortalState,
  updateSitePortalPreferences,
} from "../subscriptions/entitlements.service.js";
import { createTicket, listOwnTickets, replyToTicket } from "../support/support.service.js";
import {
  archiveDestination,
  createDestination,
  listDestinations,
  listWithdrawals,
  quoteWithdrawal,
  requestWithdrawal,
  verifyDestination,
  type Beneficiary,
} from "../withdrawals/withdrawals.service.js";

const id = (v: string) => parse(uuidSchema, v);
const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
const promotionStateSchema = z.object({ state: z.enum(["NEW", "CONTACTED", "WON", "DECLINED"]) });

function beneficiary(actor: RequestActor): Beneficiary {
  return { type: "RESELLER", id: requireResellerId(actor), userId: actor.id };
}

/** Turns a policy rejection into the documented 403 with every violated key. */
function preferenceViolation(error: unknown): never {
  if (error instanceof PreferenceRejected) {
    throw new ForbiddenException({
      code: FEATURE_LOCKED_BY_PLAN,
      message: error.violations.map((violation) => violation.message).join("; "),
      // `details` is what the API client surfaces on ApiError.details.
      details: error.violations,
    });
  }
  throw error;
}

@Controller("reseller")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.RESELLER)
export class ResellerController {
  @Get("overview")
  overview(@CurrentUser() a: RequestActor) {
    return resellerOverview(requireResellerId(a));
  }

  // ── Subscription ──
  @Get("plans")
  plans() {
    return listActivePlans();
  }

  @Get("subscription")
  subscription(@CurrentUser() a: RequestActor) {
    return getSubscriptionView(requireResellerId(a));
  }

  @Post("subscription/trial")
  trial(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    return startTrial(requireResellerId(a), parse(startTrialSchema, body).planId, a.id);
  }

  // ── Plan entitlements & portal appearance ──
  /** Everything the dashboard needs to render controls, locks and their reasons. */
  @Get("entitlements")
  entitlements(@CurrentUser() a: RequestActor) {
    return resolveResellerEntitlements(requireResellerId(a));
  }

  /** The Captive Portal designer's read model for one site. */
  @Get("sites/:id/portal-preferences")
  portalPreferences(@CurrentUser() a: RequestActor, @Param("id") siteId: string) {
    return sitePortalState(requireResellerId(a), id(siteId));
  }

  @Patch("sites/:id/portal-preferences")
  async updatePortalPreferences(@CurrentUser() a: RequestActor, @Param("id") siteId: string, @Body() body: unknown) {
    const input = parse(sitePortalPreferenceInputSchema, body);
    try {
      return await updateSitePortalPreferences(requireResellerId(a), a.id, id(siteId), input);
    } catch (error) {
      preferenceViolation(error);
    }
  }

  @Post("subscription/checkout")
  async checkout(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    const resellerId = requireResellerId(a);
    await enforceRateLimit("sub-checkout", resellerId, 10, 600);
    const input = parse(subscriptionCheckoutSchema, body);
    const result = await checkoutSubscription(resellerId, input);
    kickOutbox();
    return result;
  }

  // ── Sites & devices ──
  @Get("sites")
  sites(@CurrentUser() a: RequestActor) {
    return listSites(requireResellerId(a));
  }

  @Post("sites")
  async createSite(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    const result = await createSite(requireResellerId(a), a.id, parse(siteInputSchema, body));
    kickOutbox();
    return result;
  }

  @Get("sites/:id")
  site(@CurrentUser() a: RequestActor, @Param("id") siteId: string) {
    return getSite(requireResellerId(a), id(siteId));
  }

  @Put("sites/:id")
  updateSite(@CurrentUser() a: RequestActor, @Param("id") siteId: string, @Body() body: unknown) {
    return updateSite(requireResellerId(a), id(siteId), parse(siteInputSchema.partial(), body));
  }

  @Delete("sites/:id")
  deleteSite(@CurrentUser() a: RequestActor, @Param("id") siteId: string) {
    return archiveSite(requireResellerId(a), a.id, id(siteId));
  }

  @Post("sites/:id/reprovision")
  async reprovision(@CurrentUser() a: RequestActor, @Param("id") siteId: string) {
    const op = await requestReprovision(requireResellerId(a), id(siteId));
    kickOutbox();
    return op;
  }

  @Get("devices")
  devices(@CurrentUser() a: RequestActor) {
    return listDevices(requireResellerId(a));
  }

  @Post("devices/:id/rename")
  renameDevice(@CurrentUser() a: RequestActor, @Param("id") deviceId: string, @Body() body: unknown) {
    return renameResellerDevice(requireResellerId(a), a.id, id(deviceId), parse(deviceRenameSchema, body));
  }

  @Post("devices/:id/retry")
  retryAdopt(@CurrentUser() a: RequestActor, @Param("id") deviceId: string, @Body() body: unknown) {
    return retryDeviceAdopt(requireResellerId(a), id(deviceId), parse(deviceRetrySchema, body));
  }

  @Delete("devices/:id")
  removeDevice(@CurrentUser() a: RequestActor, @Param("id") deviceId: string) {
    return forgetResellerDevice(requireResellerId(a), a.id, id(deviceId));
  }

  @Post("devices/:id/wifi")
  addWifi(@CurrentUser() a: RequestActor, @Param("id") deviceId: string, @Body() body: unknown) {
    return createDeviceWifi(requireResellerId(a), id(deviceId), parse(deviceWifiSchema, body));
  }

  @Get("device-claims")
  claims(@CurrentUser() a: RequestActor) {
    return listDeviceClaims({ resellerId: requireResellerId(a) });
  }

  // ── Banner promotion requests (from the guest portal) ──
  @Get("promotions")
  promotions(@CurrentUser() a: RequestActor, @Query("state") state?: string) {
    return listPromotionRequests(requireResellerId(a), enumQuery(state, PromotionRequestState));
  }

  @Post("promotions/:id/state")
  promotionState(@CurrentUser() a: RequestActor, @Param("id") promotionId: string, @Body() body: unknown) {
    return updatePromotionRequestState(requireResellerId(a), id(promotionId), parse(promotionStateSchema, body).state);
  }

  @Post("device-claims")
  claim(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    return submitDeviceClaim(requireResellerId(a), a.id, parse(deviceClaimInputSchema, body));
  }

  // ── Packages ──
  @Get("packages")
  packages(@CurrentUser() a: RequestActor) {
    return listPackages(requireResellerId(a));
  }

  @Post("packages")
  createPackage(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    return createPackage(requireResellerId(a), a.id, parse(wifiPackageInputSchema, body));
  }

  /** Which caps each site can enforce, so the form never offers an unsellable package. */
  @Get("package-options")
  packageOptions(@CurrentUser() a: RequestActor) {
    return packageSiteOptions(requireResellerId(a));
  }

  @Put("packages/:id")
  updatePackage(@CurrentUser() a: RequestActor, @Param("id") packageId: string, @Body() body: unknown) {
    return updatePackage(requireResellerId(a), a.id, id(packageId), parse(wifiPackageInputSchema, body));
  }

  @Delete("packages/:id")
  archivePackage(@CurrentUser() a: RequestActor, @Param("id") packageId: string) {
    return archivePackage(requireResellerId(a), a.id, id(packageId));
  }

  @Get("packages/:id/revisions")
  revisions(@CurrentUser() a: RequestActor, @Param("id") packageId: string) {
    return packageRevisions(requireResellerId(a), id(packageId));
  }

  // ── Vouchers ──
  @Get("voucher-groups")
  voucherGroups(@CurrentUser() a: RequestActor) {
    return listVoucherGroups(requireResellerId(a));
  }

  @Post("voucher-groups")
  async createVoucherGroup(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    const resellerId = requireResellerId(a);
    await enforceRateLimit("voucher-generate", resellerId, 20, 3600);
    return createVoucherGroup(resellerId, a.id, parse(voucherGroupInputSchema, body));
  }

  @Put("voucher-groups/:id")
  renameGroup(@CurrentUser() a: RequestActor, @Param("id") groupId: string, @Body() body: unknown) {
    return renameVoucherGroup(requireResellerId(a), id(groupId), parse(renameSchema, body).name);
  }

  @Get("voucher-groups/:id/vouchers")
  vouchers(@CurrentUser() a: RequestActor, @Param("id") groupId: string) {
    return listVouchers(requireResellerId(a), id(groupId));
  }

  @Get("voucher-groups/:id/export.csv")
  async exportCsv(@CurrentUser() a: RequestActor, @Param("id") groupId: string, @Res() res: HttpReply) {
    const { filename, csv } = await exportVoucherGroupCsv(requireResellerId(a), a.id, id(groupId));
    res
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .header("Cache-Control", "no-store")
      .send(csv);
  }

  @Post("voucher-groups/:id/delete-unused")
  deleteUnused(@CurrentUser() a: RequestActor, @Param("id") groupId: string) {
    return deleteUnusedVouchers(requireResellerId(a), a.id, id(groupId));
  }

  @Post("voucher-groups/:id/archive")
  archiveGroup(@CurrentUser() a: RequestActor, @Param("id") groupId: string) {
    return archiveVoucherGroup(requireResellerId(a), a.id, id(groupId));
  }

  // ── Access grants / sessions ──
  @Get("grants")
  grants(@CurrentUser() a: RequestActor, @Query("state") state?: string, @Query("siteId") siteId?: string) {
    return listGrants(requireResellerId(a), { state: enumQuery(state, GrantState), siteId: siteId ? id(siteId) : undefined });
  }

  @Get("grants/:id")
  grant(@CurrentUser() a: RequestActor, @Param("id") grantId: string) {
    return getGrantForReseller(requireResellerId(a), id(grantId));
  }

  @Post("grants/:id/revoke")
  async revoke(@CurrentUser() a: RequestActor, @Param("id") grantId: string, @Body() body: unknown) {
    const result = await revokeGrant(requireResellerId(a), a.id, id(grantId), parse(reasonSchema, body).reason);
    kickOutbox();
    return result;
  }

  @Post("grant-devices/:id/retry")
  async retryDevice(@CurrentUser() a: RequestActor, @Param("id") deviceId: string) {
    const result = await retryGrantDevice(requireResellerId(a), a.id, id(deviceId));
    kickOutbox();
    return result;
  }

  // ── Sales ──
  @Get("orders")
  orders(@CurrentUser() a: RequestActor) {
    return resellerOrders(requireResellerId(a));
  }

  @Get("customers")
  customers(@CurrentUser() a: RequestActor) {
    return resellerCustomers(requireResellerId(a));
  }

  // ── Wallet & withdrawals ──
  @Get("wallet")
  async wallet(@CurrentUser() a: RequestActor) {
    const resellerId = requireResellerId(a);
    const [summary, history] = await Promise.all([walletSummary("RESELLER", resellerId), accountHistory("RESELLER", resellerId, 50)]);
    return { ...summary, history };
  }

  @Get("payout-destinations")
  destinations(@CurrentUser() a: RequestActor) {
    return listDestinations(beneficiary(a));
  }

  @Post("payout-destinations")
  async addDestination(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    await enforceRateLimit("payout-dest", a.id, 5, 3600);
    return createDestination(beneficiary(a), parse(payoutDestinationInputSchema, body));
  }

  @Post("payout-destinations/:id/verify")
  async verifyDestination(@CurrentUser() a: RequestActor, @Param("id") destId: string, @Body() body: unknown) {
    await enforceRateLimit("payout-dest-verify", a.id, 10, 900);
    return verifyDestination(beneficiary(a), id(destId), parse(codeSchema, body).code);
  }

  @Delete("payout-destinations/:id")
  archiveDestination(@CurrentUser() a: RequestActor, @Param("id") destId: string) {
    return archiveDestination(beneficiary(a), id(destId));
  }

  @Post("withdrawals/quote")
  quote(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    const input = parse(withdrawalQuoteSchema, body);
    return quoteWithdrawal(beneficiary(a), input.destinationId, input.amountTzs);
  }

  @Post("withdrawals")
  async withdraw(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    await enforceRateLimit("withdraw", a.id, 10, 3600);
    return requestWithdrawal(beneficiary(a), parse(withdrawalRequestSchema, body));
  }

  @Get("withdrawals")
  withdrawals(@CurrentUser() a: RequestActor) {
    return listWithdrawals({ ownerType: "RESELLER", ownerId: requireResellerId(a) });
  }

  // ── Support ──
  @Get("support")
  tickets(@CurrentUser() a: RequestActor) {
    return listOwnTickets(a.id);
  }

  @Post("support")
  createTicket(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    return createTicket(a.id, parse(supportTicketInputSchema, body));
  }

  @Post("support/:id/messages")
  reply(@CurrentUser() a: RequestActor, @Param("id") ticketId: string, @Body() body: unknown) {
    return replyToTicket(a, id(ticketId), parse(supportMessageInputSchema, body).body);
  }
}
