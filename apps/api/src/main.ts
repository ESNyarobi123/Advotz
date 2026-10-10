import "reflect-metadata";
import "@advo/config/load-env";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppExceptionFilter, loadServerEnvSafe } from "./bootstrap-helpers.js";
import { MAX_MEDIA_UPLOAD_BYTES } from "@advo/backend";
import { HttpAppModule } from "./http-app.module.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXEMPT_PREFIXES = ["/api/v1/webhooks/"];

/**
 * Content types accepted for a raw image upload, each given the media body limit.
 *
 * Listed explicitly rather than opened up with a `'*'` catch-all parser on
 * purpose: a catch-all would also raise the ceiling for `application/json`, and
 * the 1 MB cap on ordinary writes is worth keeping. `image/svg+xml` is absent, so
 * Fastify answers 415 before a handler runs — the media service also refuses SVG,
 * and this is the outer of the two guards.
 */
const IMAGE_UPLOAD_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/tiff",
  "image/bmp",
  "image/heic",
  "image/heif",
];

async function bootstrap() {
  const env = loadServerEnvSafe();

  const adapter = new FastifyAdapter({
    logger: env.LOG_LEVEL === "debug",
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });

  const app = await NestFactory.create<NestFastifyApplication>(HttpAppModule, adapter, { rawBody: true });

  const fastify = app.getHttpAdapter().getInstance();
  await fastify.register(cookie);
  await fastify.register(helmet, { contentSecurityPolicy: false });

  // Uploaded images arrive as the raw request body. Per-parser limits keep the
  // default 1 MB ceiling on every other route while letting a reseller send the
  // heavy logo the optimiser exists to shrink.
  for (const contentType of IMAGE_UPLOAD_CONTENT_TYPES) {
    fastify.addContentTypeParser(contentType, { bodyLimit: MAX_MEDIA_UPLOAD_BYTES, parseAs: "buffer" }, (_request, body, done) =>
      done(null, body),
    );
  }

  const trusted = new Set(env.CSRF_TRUSTED_ORIGINS.split(",").map((s) => s.trim().replace(/\/$/, "")));

  // Cookie-authenticated unsafe requests must come from a trusted browser origin.
  fastify.addHook("onRequest", async (request, reply) => {
    if (!UNSAFE_METHODS.has(request.method)) return;
    if (CSRF_EXEMPT_PREFIXES.some((p) => request.url.startsWith(p))) return;
    const origin = request.headers.origin ?? refererOrigin(request.headers.referer);
    const hasSessionCookie = typeof request.headers.cookie === "string" && request.headers.cookie.includes("advo_session=");
    if (!origin) {
      if (hasSessionCookie) {
        return reply.code(403).send({ code: "FORBIDDEN", message: "Missing Origin header" });
      }
      return;
    }
    if (!trusted.has(origin.replace(/\/$/, ""))) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "Untrusted origin" });
    }
  });

  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new AppExceptionFilter());
  // @fastify/cors defaults to GET/HEAD/POST, so every browser PUT and DELETE in the app
  // used to fail its preflight (fee settings, package edits, voucher renames, plan edits).
  // Widening the advert is safe: the trusted-origin hook above still rejects any unsafe
  // request from an untrusted origin, and the session cookie is SameSite-protected.
  app.enableCors({
    origin: [...trusted],
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
  });

  if (env.NODE_ENV !== "production") {
    const swagger = new DocumentBuilder()
      .setTitle("Advo TZ API")
      .setDescription("Advo TZ application endpoints (not Snippe/Omada vendor paths)")
      .setVersion("0.1.0")
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swagger));
  }

  app.enableShutdownHooks();
  await app.listen(env.API_PORT, "0.0.0.0");
  console.log(`Advo TZ API listening on :${env.API_PORT} (payments=${env.PAYMENT_PROVIDER}, outboxInline=${env.OUTBOX_INLINE})`);
  // Deliberately loud: a fixed OTP is a development convenience that must not go
  // unnoticed in a shared or production-like environment. Production refuses to
  // boot with DEV_FIXED_OTP set, so this only ever fires in development.
  if (env.NODE_ENV !== "production" && /^\d{6}$/.test(env.DEV_FIXED_OTP)) {
    console.warn(
      `[SECURITY] DEV_FIXED_OTP is active: Admin 2FA accepts the fixed code ${env.DEV_FIXED_OTP} and ignores the authenticator app. Unset DEV_FIXED_OTP to restore rotating TOTP.`,
    );
  }
}

function refererOrigin(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
