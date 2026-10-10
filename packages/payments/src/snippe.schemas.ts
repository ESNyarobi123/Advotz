import { z } from "zod";

const money = z.object({
  value: z.number().int().nonnegative().safe(),
  currency: z.string(),
});

/** Webhook envelope for API version 2026-01-25. Unknown extra fields are preserved. */
export const snippeWebhookEnvelopeSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  api_version: z.string().optional(),
  created_at: z.string().optional(),
  data: z
    .object({
      reference: z.string().min(1).max(200),
      external_reference: z.string().optional(),
      status: z.string(),
      amount: money,
      settlement: z
        .object({ gross: money, fees: money, net: money })
        .optional(),
      fees: money.optional(),
      /**
       * The paying account holder, as the mobile-money provider reports them.
       *
       * Deliberately `unknown`: the portal collects no name, so this is the only
       * real name we ever learn for a guest, but it is a nicety. A stricter shape
       * here could fail validation and quarantine a genuine payment event.
       */
      customer: z.unknown().optional(),
      failure_reason: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      completed_at: z.string().optional(),
      failed_at: z.string().optional(),
    })
    .passthrough(),
});

export type SnippeWebhookEnvelope = z.infer<typeof snippeWebhookEnvelopeSchema>;

export const PAYMENT_EVENT_TYPES = [
  "payment.completed",
  "payment.failed",
  "payment.voided",
  "payment.expired",
] as const;

export const PAYOUT_EVENT_TYPES = ["payout.completed", "payout.failed", "payout.reversed"] as const;
