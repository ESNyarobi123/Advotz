import { Body, Controller, ForbiddenException, Param, Post, Req, Res } from "@nestjs/common";
import { prisma } from "@advo/db";
import { computeSnippeSignature } from "@advo/payments";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashToken } from "../../common/crypto.js";
import { notFound } from "../../common/errors.js";
import { parse, type HttpReply, type HttpRequest } from "../../common/http.js";
import { getWebhookSecret, isProduction } from "../../common/providers.js";
import { kickOutbox } from "../outbox/outbox.dispatcher.js";
import { ingestSnippeWebhook } from "./inbox.service.js";

@Controller("webhooks")
export class WebhookController {
  /** Snippe → Advo. Verified against the exact raw bytes before any parsing. */
  @Post("snippe")
  async snippe(@Req() req: HttpRequest, @Res() res: HttpReply) {
    const raw = typeof req.rawBody === "string" ? Buffer.from(req.rawBody) : req.rawBody;
    const result = await ingestSnippeWebhook(raw, req.headers);
    if (result.status === 200) kickOutbox();
    res.status(result.status).send(result.body);
  }
}

const paymentSimSchema = z.object({
  outcome: z.enum(["completed", "failed", "expired"]).default("completed"),
  amountTzs: z.number().int().positive().optional(),
  feeTzs: z.number().int().nonnegative().optional(),
});
const payoutSimSchema = z.object({
  outcome: z.enum(["completed", "failed", "reversed"]).default("completed"),
  feeTzs: z.number().int().nonnegative().optional(),
});

function assertSimulationAllowed() {
  if (isProduction() || (process.env.PAYMENT_PROVIDER ?? "fake") !== "fake") {
    throw new ForbiddenException({ code: "FORBIDDEN", message: "Simulation is available only with the fake provider outside production" });
  }
}

/**
 * Development-only: builds a Snippe-shaped event, signs it with the dev webhook secret and
 * pushes it through the real ingest path. Results are labelled simulated and prove nothing
 * about Snippe itself.
 */
@Controller("dev/simulate")
export class DevSimulationController {
  @Post("orders/:token/payment")
  async payOrder(@Param("token") token: string, @Body() body: unknown) {
    assertSimulationAllowed();
    const order = await prisma.order.findUnique({
      where: { publicTokenHash: hashToken(token) },
      include: { attempts: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const attempt = order?.attempts[0];
    if (!attempt) notFound("No payment attempt for this order");
    return this.payment(attempt.id, body);
  }

  @Post("payments/:attemptId")
  async payment(@Param("attemptId") attemptId: string, @Body() body: unknown) {
    assertSimulationAllowed();
    const input = parse(paymentSimSchema, body);
    const attempt = await prisma.paymentAttempt.findUnique({ where: { id: attemptId }, include: { order: true } });
    if (!attempt?.providerReference) notFound("Attempt has no provider reference yet");
    const amount = input.amountTzs ?? Number(attempt.order.amountTzs);
    const fee = input.feeTzs ?? 0;
    return this.deliver({
      type: `payment.${input.outcome}`,
      data: {
        reference: attempt.providerReference,
        status: input.outcome,
        amount: { value: amount, currency: "TZS" },
        ...(input.outcome === "completed"
          ? { settlement: { gross: { value: amount, currency: "TZS" }, fees: { value: fee, currency: "TZS" }, net: { value: amount - fee, currency: "TZS" } } }
          : { failure_reason: "Simulated failure" }),
        metadata: { orderId: attempt.orderId, simulated: true },
      },
    });
  }

  @Post("payouts/:attemptId")
  async payout(@Param("attemptId") attemptId: string, @Body() body: unknown) {
    assertSimulationAllowed();
    const input = parse(payoutSimSchema, body);
    const attempt = await prisma.payoutAttempt.findUnique({ where: { id: attemptId }, include: { withdrawal: true } });
    if (!attempt?.providerReference) notFound("Payout attempt has no provider reference yet");
    return this.deliver({
      type: `payout.${input.outcome}`,
      data: {
        reference: attempt.providerReference,
        status: input.outcome,
        amount: { value: Number(attempt.withdrawal.amountTzs), currency: "TZS" },
        fees: { value: input.feeTzs ?? Number(attempt.feeTzs ?? attempt.withdrawal.providerFeeTzs), currency: "TZS" },
        ...(input.outcome === "failed" ? { failure_reason: "Simulated recipient rejection" } : {}),
      },
    });
  }

  private async deliver(event: { type: string; data: Record<string, unknown> }) {
    const envelope = {
      id: `evt_sim_${randomBytes(10).toString("hex")}`,
      type: event.type,
      api_version: "2026-01-25",
      created_at: new Date().toISOString(),
      data: event.data,
    };
    const raw = Buffer.from(JSON.stringify(envelope));
    const ts = Math.floor(Date.now() / 1000).toString();
    const result = await ingestSnippeWebhook(raw, {
      "x-webhook-timestamp": ts,
      "x-webhook-signature": computeSnippeSignature(raw, ts, getWebhookSecret()),
    });
    kickOutbox();
    return { simulated: true, eventId: envelope.id, ingest: result };
  }
}
