import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  payoutDestinationInputSchema,
  supportMessageInputSchema,
  supportTicketInputSchema,
  UserRole,
  uuidSchema,
  withdrawalQuoteSchema,
  withdrawalRequestSchema,
} from "@advo/contracts";
import { z } from "zod";
import { CurrentUser, Roles, RolesGuard, SessionAuthGuard, requireAgentId, type RequestActor } from "../../common/guards/session.guard.js";
import { parse } from "../../common/http.js";
import { enforceRateLimit } from "../../common/rate-limit.js";
import { accountHistory, walletSummary } from "../ledger/ledger.service.js";
import { agentCommissions, agentLeads, agentOverview } from "../reports/reports.service.js";
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
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

function beneficiary(actor: RequestActor): Beneficiary {
  return { type: "AGENT", id: requireAgentId(actor), userId: actor.id };
}

@Controller("agent")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.AGENT)
export class AgentController {
  @Get("overview")
  overview(@CurrentUser() a: RequestActor) {
    return agentOverview(requireAgentId(a));
  }

  @Get("leads")
  leads(@CurrentUser() a: RequestActor) {
    return agentLeads(requireAgentId(a));
  }

  @Get("commissions")
  commissions(@CurrentUser() a: RequestActor) {
    return agentCommissions(requireAgentId(a));
  }

  @Get("wallet")
  async wallet(@CurrentUser() a: RequestActor) {
    const agentId = requireAgentId(a);
    const [summary, history] = await Promise.all([walletSummary("AGENT", agentId), accountHistory("AGENT", agentId, 50)]);
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
    return listWithdrawals({ ownerType: "AGENT", ownerId: requireAgentId(a) });
  }

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
