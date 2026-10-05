import { z } from "zod";

const placeholderPattern = /replace_|changeme|your_environment|generated_key/i;

function rejectPlaceholdersInProduction(
  nodeEnv: string,
  value: string,
  ctx: z.RefinementCtx,
  path: string,
) {
  if (nodeEnv === "production" && placeholderPattern.test(value)) {
    ctx.addIssue({
      code: "custom",
      message: `${path} must not contain placeholder values in production`,
      path: [path],
    });
  }
}

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_NAME: z.string().default("Advo TZ"),
    BUSINESS_TIMEZONE: z.string().default("Africa/Dar_es_Salaam"),
    DEFAULT_CURRENCY: z.literal("TZS").default("TZS"),
    WEB_PORT: z.coerce.number().int().positive().default(3000),
    PORTAL_PORT: z.coerce.number().int().positive().default(3001),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_PUBLIC_URL: z.string().url(),
    PORTAL_PUBLIC_URL: z.string().url(),
    API_PUBLIC_URL: z.string().url(),
    API_INTERNAL_URL: z.string().url(),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    AUTH_COOKIE_SECURE: z
      .string()
      .optional()
      .transform((v) => v === "true"),
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
    AUTH_SESSION_IDLE_SECONDS: z.coerce.number().int().positive().default(43200),
    CSRF_TRUSTED_ORIGINS: z.string().min(1),
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((v) => v === "true"),
    SECRETS_ENCRYPTION_KEY: z.string().min(16),
    VOUCHER_LOOKUP_HMAC_KEY: z.string().min(16),
    PAYMENT_PROVIDER: z.enum(["fake", "snippe"]).default("fake"),
    PAYMENTS_MODE: z.enum(["centralized"]).default("centralized"),
    SNIPPE_BASE_URL: z.string().url().default("https://api.snippe.sh"),
    SNIPPE_API_KEY: z.string().optional().default(""),
    SNIPPE_WEBHOOK_SECRET: z.string().optional().default(""),
    SNIPPE_WEBHOOK_URL: z.string().optional().default(""),
    SNIPPE_API_DOC_VERSION: z.string().default("2026-01-25"),
    ALLOW_LIVE_FINANCIAL_TESTS: z
      .string()
      .optional()
      .transform((v) => v === "true"),
    OMADA_MODE: z.enum(["fake", "live"]).default("fake"),
    OMADA_CONTROLLER_TYPE: z.string().default("software"),
    OMADA_BASE_URL: z.string().optional().default(""),
    OMADA_CONTROLLER_ID: z.string().optional().default(""),
    OMADA_CONTROLLER_VERSION: z.string().optional().default(""),
    OMADA_CLIENT_ID: z.string().optional().default(""),
    OMADA_CLIENT_SECRET: z.string().optional().default(""),
    OMADA_HOTSPOT_OPERATOR_USERNAME: z.string().optional().default(""),
    OMADA_HOTSPOT_OPERATOR_PASSWORD: z.string().optional().default(""),
    OMADA_CA_CERT_PATH: z.string().optional().default(""),
    NOTIFICATION_PROVIDER: z.enum(["fake", "sms", "email"]).default("fake"),
    PUBLIC_SUPPORT_CONTACT: z.string().optional().default(""),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    SNIPPE_ACCOUNT_ID: z.string().optional().default(""),
    SNIPPE_WEBHOOK_MAX_AGE_SECONDS: z.coerce.number().int().min(300).max(86400).default(3600),
    OMADA_OPENAPI_CONTRACT_PATH: z.string().optional().default(""),
    OUTBOX_INLINE: z
      .string()
      .optional()
      .transform((v) => v === "true"),
    ADMIN_MFA_REQUIRED: z.string().optional().default("true"),
    // Development-only fixed Admin TOTP code. Rejected outright in production.
    DEV_FIXED_OTP: z.string().optional().default(""),
    RATE_LIMIT_BACKEND: z.enum(["redis", "memory"]).default("redis"),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(8),
    METRICS_TOKEN: z.string().optional().default(""),
  })
  .superRefine((data, ctx) => {
    rejectPlaceholdersInProduction(data.NODE_ENV, data.DATABASE_URL, ctx, "DATABASE_URL");
    rejectPlaceholdersInProduction(data.NODE_ENV, data.SECRETS_ENCRYPTION_KEY, ctx, "SECRETS_ENCRYPTION_KEY");
    rejectPlaceholdersInProduction(data.NODE_ENV, data.VOUCHER_LOOKUP_HMAC_KEY, ctx, "VOUCHER_LOOKUP_HMAC_KEY");

    if (data.NODE_ENV === "production") {
      if (data.PAYMENT_PROVIDER === "fake") {
        ctx.addIssue({
          code: "custom",
          message: "PAYMENT_PROVIDER=fake is not allowed in production",
          path: ["PAYMENT_PROVIDER"],
        });
      }
      if (data.OMADA_MODE === "fake") {
        ctx.addIssue({
          code: "custom",
          message: "OMADA_MODE=fake is not allowed in production",
          path: ["OMADA_MODE"],
        });
      }
      if (data.PAYMENT_PROVIDER === "snippe" && (!data.SNIPPE_API_KEY || !data.SNIPPE_WEBHOOK_SECRET)) {
        ctx.addIssue({
          code: "custom",
          message: "SNIPPE_API_KEY and SNIPPE_WEBHOOK_SECRET are required in production",
          path: ["SNIPPE_API_KEY"],
        });
      }
      if (data.RATE_LIMIT_BACKEND === "memory") {
        ctx.addIssue({ code: "custom", message: "RATE_LIMIT_BACKEND=memory is per-process; use redis in production", path: ["RATE_LIMIT_BACKEND"] });
      }
      if (data.METRICS_TOKEN && (data.METRICS_TOKEN.length < 24 || placeholderPattern.test(data.METRICS_TOKEN))) {
        ctx.addIssue({ code: "custom", message: "METRICS_TOKEN must be a generated secret (24+ chars)", path: ["METRICS_TOKEN"] });
      }
      if (data.OUTBOX_INLINE) {
        ctx.addIssue({ code: "custom", message: "OUTBOX_INLINE must be off in production (run the worker)", path: ["OUTBOX_INLINE"] });
      }
      if (data.DEV_FIXED_OTP) {
        ctx.addIssue({
          code: "custom",
          message: "DEV_FIXED_OTP is a development-only Admin 2FA bypass and must not be set in production",
          path: ["DEV_FIXED_OTP"],
        });
      }
      if (!data.AUTH_COOKIE_SECURE) {
        ctx.addIssue({
          code: "custom",
          message: "AUTH_COOKIE_SECURE must be true in production",
          path: ["AUTH_COOKIE_SECURE"],
        });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function loadServerEnv(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid server environment:\n${details}`);
  }
  return parsed.data;
}

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("Advo TZ"),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  NEXT_PUBLIC_SUPPORT_CONTACT: z.string().optional().default(""),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(["en", "sw"]).default("en"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
