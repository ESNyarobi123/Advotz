import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import {
  capabilityEvidenceSchema,
  commissionPolicyDeleteSchema,
  commissionPolicyEndSchema,
  commissionPolicyInputSchema,
  controllerDeleteSchema,
  controllerFlagsSchema,
  controllerInputSchema,
  createResellerSchema,
  impersonateInputSchema,
  planActiveSchema,
  planDeleteSchema,
  planMigrationInputSchema,
  platformListingInputSchema,
  platformPlanInputSchema,
  platformPlanUpdateSchema,
  reviewDecisionSchema,
  saleFeeSettingSchema,
  supportMessageInputSchema,
  tzsAmountSchema,
  UserRole,
  uuidSchema,
  withdrawalFeeSettingSchema,
} from "@advo/contracts";
import {
  BeneficiaryType,
  CommissionState,
  DeviceClaimState,
  FulfillmentState,
  InboxState,
  LedgerAccountType,
  LedgerOwnerType,
  ListingKind,
  NormalBalance,
  OperationState,
  OrderPaymentState,
  PaymentAttemptState,
  prisma,
  WithdrawalState,
} from "@advo/db";
import { z } from "zod";
import { adCampaignInputSchema, adCampaignStatusSchema } from "@advo/contracts";
import { badRequest, notFound } from "../../common/errors.js";
import { CurrentUser, Roles, RolesGuard, SessionAuthGuard, type RequestActor } from "../../common/guards/session.guard.js";
import { IMPERSONATION_COOKIE } from "../../common/guards/session.guard.js";
import { enumQuery, headerString, parse, type HttpReply, type HttpRequest } from "../../common/http.js";
import {
  commissionSummary,
  createPolicy,
  deletePolicy,
  endPolicy,
  listPolicies,
  reverseAccrual,
} from "../commissions/commissions.service.js";
import {
  ACCOUNT_FAMILY_VALUES,
  journalDetail,
  ledgerSummary,
  listJournals,
  listLedgerAccounts,
  trialBalance,
} from "../ledger/ledger.service.js";
import { deleteController, inspectController, listControllers, recordCapabilityEvidence, saveController, updateControllerFlags } from "../network/controllers.service.js";
import { listDeviceClaims, networkSummary, reviewDeviceClaim } from "../network/sites.service.js";
import { drainOutbox, kickOutbox } from "../outbox/outbox.dispatcher.js";
import { runSweepers } from "../outbox/sweepers.js";
import { paymentsSummary, reconcilePaymentAttempt, settlePendingSale } from "../payments/payments.service.js";
import {
  createPlatformListing,
  deletePlatformListing,
  listPlatformListings,
  updatePlatformListing,
} from "../platform/listings.service.js";
import { adminAgents, adminAgentDetail, adminOverview, adminResellerDetail, adminResellers, auditLog } from "../reports/reports.service.js";
import { getSetting, setSetting, settingsOverview, SettingKey } from "../settings/settings.service.js";
import { archivePlan, deletePlan, listPlans, previewPlan, publishPlan, setPlanActive, updatePlan, upsertPlan } from "../subscriptions/subscriptions.service.js";
import {
  applyPlanMigration as applyPlanMigrationNow,
  cancelPlanMigration as cancelPlanMigrationRow,
  listPlanMigrations,
  migrationView as planMigrationView,
  previewPlanMigration as previewPlanMigrationRows,
  schedulePlanMigration as schedulePlanMigrationRow,
} from "../subscriptions/plan-migrations.service.js";
import {
  createCampaign,
  deleteCampaign,
  listCampaigns,
  setCampaignStatus,
  updateCampaign,
} from "../subscriptions/campaigns.service.js";
import { listAllTickets, replyToTicket, setTicketState } from "../support/support.service.js";
import { listWithdrawalsForAdmin, reviewWithdrawal as reviewWithdrawalRequest, withdrawalDetail, withdrawalsSummary as summaryWithdrawals } from "../withdrawals/withdrawals.service.js";
import { reconcileWithdrawal as reconcilePayout } from "../withdrawals/payouts.service.js";
import { createReseller, setAgentStatus, setResellerStatus, startAgentImpersonation, startImpersonation } from "./admin.service.js";
import { correctAttribution } from "./admin.service.js";

const id = (v: string) => parse(uuidSchema, v);
const statusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]), reason: z.string().trim().min(3).max(300) });
const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });
const attributionSchema = z.object({ agentId: uuidSchema.nullable(), reason: z.string().trim().min(3).max(300) });
const settleSchema = z.object({
  feeTzs: z.union([z.literal(0), tzsAmountSchema]).transform((v) => BigInt(v)),
  reason: z.string().trim().min(3).max(300),
});
const ticketStateSchema = z.object({ state: z.enum(["open", "pending", "resolved", "closed"]) });
/** A page size from the query string, clamped so a hand-written URL cannot ask for everything. */
const pageSize = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 200) : undefined;
};

@Controller("admin")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  @Get("overview")
  overview() {
    return adminOverview();
  }

  // ── Accounts ──
  @Get("resellers")
  resellers() {
    return adminResellers();
  }

  @Post("resellers")
  createReseller(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    return createReseller(a.id, parse(createResellerSchema, body));
  }

  @Get("resellers/:id")
  async resellerDetail(@Param("id") resellerId: string) {
    const detail = await adminResellerDetail(id(resellerId));
    if (!detail) notFound("Reseller not found");
    return detail;
  }

  /**
   * Opens a short-lived session as the reseller's owner.
   *
   * The token lands on `IMPERSONATION_COOKIE`, not the primary session cookie, so the
   * Admin's own session remains valid and "leave" is a single cookie clear.
   */
  @Post("resellers/:id/impersonate")
  async impersonate(
    @CurrentUser() a: RequestActor,
    @Param("id") resellerId: string,
    @Body() body: unknown,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: HttpReply,
  ) {
    const input = parse(impersonateInputSchema, body);
    const result = await startImpersonation(a.id, id(resellerId), input.reason, {
      userAgent: headerString(req.headers["user-agent"]),
      ipAddress: req.ip,
    });
    res.setCookie(IMPERSONATION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.AUTH_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
      expires: result.expiresAt,
    });
    return { reseller: result.reseller, expiresAt: result.expiresAt };
  }

  @Post("resellers/:id/status")
  resellerStatus(@CurrentUser() a: RequestActor, @Param("id") resellerId: string, @Body() body: unknown) {
    const input = parse(statusSchema, body);
    return setResellerStatus(a.id, id(resellerId), input.status, input.reason);
  }

  @Post("resellers/:id/attribution")
  attribution(@CurrentUser() a: RequestActor, @Param("id") resellerId: string, @Body() body: unknown) {
    const input = parse(attributionSchema, body);
    return correctAttribution(a.id, id(resellerId), input.agentId, input.reason);
  }

  @Get("agents")
  agents() {
    return adminAgents();
  }

  @Get("agents/:id")
  async agentDetail(@Param("id") agentId: string) {
    const detail = await adminAgentDetail(id(agentId));
    if (!detail) notFound("Agent not found");
    return detail;
  }

  /**
   * Opens a short-lived session as the agent, on the same dedicated cookie the
   * reseller flow uses, so the Admin's own session survives and leave is one click.
   */
  @Post("agents/:id/impersonate")
  async impersonateAgent(
    @CurrentUser() a: RequestActor,
    @Param("id") agentId: string,
    @Body() body: unknown,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: HttpReply,
  ) {
    const input = parse(impersonateInputSchema, body);
    const result = await startAgentImpersonation(a.id, id(agentId), input.reason, {
      userAgent: headerString(req.headers["user-agent"]),
      ipAddress: req.ip,
    });
    res.setCookie(IMPERSONATION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.AUTH_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
      expires: result.expiresAt,
    });
    return { agent: result.agent, expiresAt: result.expiresAt };
  }

  @Post("agents/:id/status")
  agentStatus(@CurrentUser() a: RequestActor, @Param("id") agentId: string, @Body() body: unknown) {
    const input = parse(statusSchema, body);
    return setAgentStatus(a.id, id(agentId), input.status, input.reason);
  }

  // ── Plans ──
  @Get("plans")
  plans() {
    return listPlans();
  }

  /** Creating a code that already exists publishes the next version, exactly like before. */
  @Post("plans")
  savePlan(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    return upsertPlan(a.id, parse(platformPlanInputSchema, body));
  }

  /** Full replacement of one row; the service decides in-place edit vs. new version. */
  @Put("plans/:id")
  updatePlan(@CurrentUser() a: RequestActor, @Param("id") planId: string, @Body() body: unknown) {
    return updatePlan(a.id, id(planId), parse(platformPlanUpdateSchema, body));
  }

  @Delete("plans/:id")
  deletePlan(@CurrentUser() a: RequestActor, @Param("id") planId: string, @Body() body: unknown) {
    return deletePlan(a.id, id(planId), parse(planDeleteSchema, body).reason);
  }

  @Post("plans/:id/active")
  setPlanActive(@CurrentUser() a: RequestActor, @Param("id") planId: string, @Body() body: unknown) {
    const input = parse(planActiveSchema, body);
    return setPlanActive(a.id, id(planId), input.active, input.reason);
  }

  /** Publishes the plan's current draft as an immutable version. */
  @Post("plans/:id/publish")
  publish(@CurrentUser() a: RequestActor, @Param("id") planId: string) {
    return publishPlan(a.id, id(planId));
  }

  /** Read-only preview of a plan (including its draft) for the editor. */
  @Get("plans/:id/preview")
  preview(@Param("id") planId: string) {
    return previewPlan(id(planId));
  }

  /** Kept for the old client and smoke tests; equivalent to deactivating. */
  @Post("plans/:id/archive")
  archivePlan(@CurrentUser() a: RequestActor, @Param("id") planId: string) {
    return archivePlan(a.id, id(planId));
  }

  // ── Plan version migrations (publish never moves a live subscriber on its own) ──
  @Get("plans/migrations")
  planMigrations(@Query("planId") planId?: string) {
    return listPlanMigrations(planId ? id(planId) : undefined);
  }

  /** Old → new preview for a scope and date, before anything is recorded. */
  @Post("plans/migrations/preview")
  previewPlanMigration(@Body() body: unknown) {
    return previewPlanMigrationRows(parse(planMigrationInputSchema, body));
  }

  @Post("plans/migrations")
  schedulePlanMigration(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    return schedulePlanMigrationRow(a.id, parse(planMigrationInputSchema, body));
  }

  /** Applies a due migration now, without waiting for the sweeper. */
  @Post("plans/migrations/:id/apply")
  applyPlanMigration(@CurrentUser() a: RequestActor, @Param("id") migrationId: string) {
    return applyPlanMigrationNow(id(migrationId), new Date(), a.id).then(() => planMigrationView(id(migrationId)));
  }

  @Post("plans/migrations/:id/cancel")
  cancelPlanMigration(@CurrentUser() a: RequestActor, @Param("id") migrationId: string, @Body() body: unknown) {
    const input = parse(z.object({ reason: z.string().trim().min(3).max(300) }), body);
    return cancelPlanMigrationRow(a.id, id(migrationId), input.reason);
  }

  // ── Ad campaigns (policy-aware portal ads) ──
  @Get("campaigns")
  campaigns() {
    return listCampaigns();
  }

  @Post("campaigns")
  createCampaign(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    return createCampaign(a.id, parse(adCampaignInputSchema, body));
  }

  @Put("campaigns/:id")
  updateCampaign(@CurrentUser() a: RequestActor, @Param("id") campaignId: string, @Body() body: unknown) {
    return updateCampaign(a.id, id(campaignId), parse(adCampaignInputSchema, body));
  }

  @Post("campaigns/:id/status")
  campaignStatus(@CurrentUser() a: RequestActor, @Param("id") campaignId: string, @Body() body: unknown) {
    const input = parse(z.object({ status: adCampaignStatusSchema, reason: z.string().trim().min(3).max(300) }), body);
    return setCampaignStatus(a.id, id(campaignId), input.status, input.reason);
  }

  /** Ending a campaign keeps its delivery history; the row is never hard-deleted. */
  @Delete("campaigns/:id")
  endCampaign(@CurrentUser() a: RequestActor, @Param("id") campaignId: string, @Body() body: unknown) {
    return deleteCampaign(a.id, id(campaignId), parse(reasonSchema, body).reason);
  }

  // ── Controllers & network ──
  @Get("controllers")
  controllers() {
    return listControllers();
  }

  @Post("controllers")
  createController(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    return saveController(a.id, parse(controllerInputSchema, body));
  }

  @Put("controllers/:id")
  updateController(@CurrentUser() a: RequestActor, @Param("id") controllerId: string, @Body() body: unknown) {
    return saveController(a.id, parse(controllerInputSchema, body), id(controllerId));
  }

  @Post("controllers/:id/inspect")
  inspect(@Param("id") controllerId: string) {
    return inspectController(id(controllerId));
  }

  @Post("controllers/:id/capabilities")
  capability(@CurrentUser() a: RequestActor, @Param("id") controllerId: string, @Body() body: unknown) {
    return recordCapabilityEvidence(a.id, id(controllerId), parse(capabilityEvidenceSchema, body));
  }

  /** Promote to default, retire, or restore — each flip is audited against a reason. */
  @Post("controllers/:id/flags")
  controllerFlags(@CurrentUser() a: RequestActor, @Param("id") controllerId: string, @Body() body: unknown) {
    return updateControllerFlags(a.id, id(controllerId), parse(controllerFlagsSchema, body));
  }

  /** Only for a Controller with no site mapping and no adopted device. */
  @Delete("controllers/:id")
  removeController(@CurrentUser() a: RequestActor, @Param("id") controllerId: string, @Body() body: unknown) {
    return deleteController(a.id, id(controllerId), parse(controllerDeleteSchema, body).reason);
  }

  @Get("sites")
  sites() {
    return prisma.site.findMany({
      include: { reseller: { select: { businessName: true } }, mapping: true, _count: { select: { devices: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  }

  /** Counts for the network overview: sites, mappings, claims, devices and operations. */
  @Get("network-summary")
  networkOverview() {
    return networkSummary();
  }

  @Get("network-operations")
  operations(@Query("state") state?: string) {
    return prisma.networkOperation.findMany({
      where: { state: enumQuery(state, OperationState) },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
  }

  @Get("device-claims")
  claims(@Query("state") state?: string) {
    return listDeviceClaims({ state: enumQuery(state, DeviceClaimState) });
  }

  @Post("device-claims/:id/review")
  reviewClaim(@CurrentUser() a: RequestActor, @Param("id") claimId: string, @Body() body: unknown) {
    const input = parse(reviewDecisionSchema, body);
    return reviewDeviceClaim(a.id, id(claimId), input.decision, input.reason);
  }

  // ── Payments & webhooks ──
  /**
   * The payment board's counts and money, kept on one route so the tiles, the
   * distribution cards and the tables can never disagree about the same instant.
   */
  @Get("payments-summary")
  paymentsSummary() {
    return paymentsSummary();
  }

  @Get("payments")
  payments(@Query("state") state?: string, @Query("provider") provider?: string) {
    return prisma.paymentAttempt.findMany({
      where: { state: enumQuery(state, PaymentAttemptState), ...(provider ? { provider } : {}) },
      include: {
        order: {
          select: {
            id: true,
            purpose: true,
            resellerId: true,
            amountTzs: true,
            paymentState: true,
            fulfillmentState: true,
            paidAt: true,
            reseller: { select: { businessName: true } },
            site: { select: { name: true } },
            customer: { select: { phone: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  @Post("payments/:id/reconcile")
  async reconcile(@Param("id") attemptId: string) {
    const result = await reconcilePaymentAttempt(id(attemptId));
    kickOutbox();
    return { result };
  }

  @Post("payments/:id/settle")
  async settle(@CurrentUser() a: RequestActor, @Param("id") attemptId: string, @Body() body: unknown) {
    try {
      const input = parse(settleSchema, body);
      return await settlePendingSale(id(attemptId), input.feeTzs, a.id, input.reason);
    } catch (err) {
      badRequest(err instanceof Error ? err.message : String(err));
    }
  }

  @Get("webhooks")
  webhooks(@Query("state") state?: string, @Query("provider") provider?: string) {
    return prisma.webhookInboxEvent.findMany({
      where: { state: enumQuery(state, InboxState), ...(provider ? { provider } : {}) },
      select: { id: true, provider: true, providerAccountId: true, eventId: true, eventType: true, state: true, reason: true, attempts: true, receivedAt: true, processedAt: true },
      orderBy: { receivedAt: "desc" },
      take: 200,
    });
  }

  @Get("orders")
  orders(@Query("state") state?: string) {
    const filter = enumQuery(state, { ...OrderPaymentState, ...FulfillmentState });
    return prisma.order.findMany({
      where: filter
        ? { OR: [{ paymentState: filter as OrderPaymentState }, { fulfillmentState: filter as FulfillmentState }] }
        : undefined,
      include: { reseller: { select: { businessName: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  // ── Commission ──
  @Get("commission-policies")
  policies() {
    return listPolicies();
  }

  @Post("commission-policies")
  createPolicy(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    return createPolicy(a.id, parse(commissionPolicyInputSchema, body));
  }

  /** Stops a running policy from now on; past accruals keep their rate snapshot. */
  @Post("commission-policies/:id/end")
  endPolicy(@CurrentUser() a: RequestActor, @Param("id") policyId: string, @Body() body: unknown) {
    return endPolicy(a.id, id(policyId), parse(commissionPolicyEndSchema, body).reason);
  }

  /** Only for policies that never produced an accrual. */
  @Delete("commission-policies/:id")
  deletePolicy(@CurrentUser() a: RequestActor, @Param("id") policyId: string, @Body() body: unknown) {
    return deletePolicy(a.id, id(policyId), parse(commissionPolicyDeleteSchema, body).reason);
  }

  @Get("commissions/summary")
  commissionSummary() {
    return commissionSummary();
  }

  @Get("commissions")
  accruals(@Query("state") state?: string) {
    return prisma.commissionAccrual.findMany({
      where: { state: enumQuery(state, CommissionState) },
      // Ids are selected so a row can link straight to the agent or reseller it belongs to.
      include: {
        agent: { select: { id: true, referralCode: true } },
        reseller: { select: { id: true, businessName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  @Post("commissions/:id/reverse")
  reverse(@CurrentUser() a: RequestActor, @Param("id") accrualId: string, @Body() body: unknown) {
    return reverseAccrual(id(accrualId), a.id, parse(reasonSchema, body).reason);
  }

  // ── Withdrawals ──
  @Get("withdrawals")
  withdrawals(@Query("state") state?: string, @Query("ownerType") ownerType?: string, @Query("ownerId") ownerId?: string) {
    return listWithdrawalsForAdmin({
      state: enumQuery(state, WithdrawalState),
      ownerType: enumQuery(ownerType, BeneficiaryType),
      ownerId: ownerId ? id(ownerId) : undefined,
    });
  }

  @Get("withdrawals-summary")
  withdrawalsSummary() {
    return summaryWithdrawals();
  }

  @Get("withdrawals/:id")
  withdrawal(@Param("id") withdrawalId: string) {
    return withdrawalDetail(id(withdrawalId));
  }

  @Post("withdrawals/:id/reconcile")
  async reconcileWithdrawal(@Param("id") withdrawalId: string) {
    const result = await reconcilePayout(id(withdrawalId));
    kickOutbox();
    return { result };
  }

  @Post("withdrawals/:id/review")
  async reviewWithdrawal(@CurrentUser() a: RequestActor, @Param("id") withdrawalId: string, @Body() body: unknown) {
    const input = parse(reviewDecisionSchema, body);
    const result = await reviewWithdrawalRequest(a.id, id(withdrawalId), input.decision, input.reason);
    kickOutbox();
    return result;
  }

  // ── Settings & ledger ──
  @Get("settings")
  async settings() {
    const [saleFee, withdrawalFee] = await Promise.all([getSetting(SettingKey.SALE_FEE_BPS), getSetting(SettingKey.WITHDRAWAL_FEE_TZS)]);
    return { saleFee, withdrawalFee };
  }

  @Get("settings/overview")
  settingsOverview() {
    return settingsOverview();
  }

  @Put("settings/sale-fee")
  saleFee(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    const input = parse(saleFeeSettingSchema.extend({ reason: z.string().trim().min(3).max(300) }), body);
    return setSetting(SettingKey.SALE_FEE_BPS, { basisPoints: input.basisPoints }, a.id, input.reason);
  }

  @Put("settings/withdrawal-fee")
  withdrawalFee(@CurrentUser() a: RequestActor, @Body() body: unknown) {
    const input = parse(withdrawalFeeSettingSchema.extend({ reason: z.string().trim().min(3).max(300) }), body);
    return setSetting(SettingKey.WITHDRAWAL_FEE_TZS, { fixedTzs: input.fixedTzs }, a.id, input.reason);
  }

  @Get("ledger/trial-balance")
  trialBalance() {
    return trialBalance();
  }

  @Get("ledger/summary")
  ledgerSummary() {
    return ledgerSummary();
  }

  @Get("ledger/accounts")
  ledgerAccounts(
    @Query("ownerType") ownerType?: string,
    @Query("type") type?: string,
    @Query("family") family?: string,
    @Query("normalBalance") normalBalance?: string,
    @Query("q") q?: string,
  ) {
    return listLedgerAccounts({
      ownerType: enumQuery(ownerType, LedgerOwnerType, "ownerType"),
      type: enumQuery(type, LedgerAccountType, "type"),
      family: enumQuery(family, ACCOUNT_FAMILY_VALUES, "family"),
      normalBalance: enumQuery(normalBalance, NormalBalance, "normalBalance"),
      q,
    });
  }

  @Get("ledger/journals")
  ledgerJournals(
    @Query("event") event?: string,
    @Query("q") q?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    return listJournals({ event, q, take: pageSize(take), skip: pageSize(skip) });
  }

  @Get("ledger/journals/:id")
  async ledgerJournal(@Param("id") journalId: string) {
    const row = await journalDetail(id(journalId));
    if (!row) notFound();
    return row;
  }

  @Get("audit")
  audit(@Query("resellerId") resellerId?: string, @Query("action") action?: string) {
    return auditLog({ resellerId: resellerId ? id(resellerId) : undefined, action });
  }

  // ── Support ──
  @Get("support")
  tickets(@Query("state") state?: string) {
    return listAllTickets(state);
  }

  @Post("support/:id/messages")
  reply(@CurrentUser() a: RequestActor, @Param("id") ticketId: string, @Body() body: unknown) {
    return replyToTicket(a, id(ticketId), parse(supportMessageInputSchema, body).body);
  }

  @Post("support/:id/state")
  ticketState(@CurrentUser() a: RequestActor, @Param("id") ticketId: string, @Body() body: unknown) {
    return setTicketState(a.id, id(ticketId), parse(ticketStateSchema, body).state);
  }

  // ── Jobs & opportunities (guest portal feed) ──
  @Get("listings")
  listings(@Query("kind") kind?: string) {
    return listPlatformListings(enumQuery(kind, ListingKind));
  }

  @Post("listings")
  createListing(@Body() body: unknown) {
    return createPlatformListing(parse(platformListingInputSchema, body));
  }

  @Put("listings/:id")
  updateListing(@Param("id") listingId: string, @Body() body: unknown) {
    return updatePlatformListing(id(listingId), parse(platformListingInputSchema, body));
  }

  @Delete("listings/:id")
  deleteListing(@Param("id") listingId: string) {
    return deletePlatformListing(id(listingId));
  }

  // ── Operations ──
  @Get("outbox")
  outbox() {
    return prisma.outboxEvent.findMany({ where: { dispatchedAt: null }, orderBy: { nextAttemptAt: "asc" }, take: 200 });
  }

  @Post("operations/drain-outbox")
  drain() {
    return drainOutbox();
  }

  @Post("operations/run-sweepers")
  sweep() {
    return runSweepers();
  }
}
