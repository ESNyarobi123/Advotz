import "./common/bigint-json.js";
import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module.js";
import { HealthModule } from "./health/health.module.js";
import { AdminController } from "./modules/admin/admin.controller.js";
import { AgentController } from "./modules/agent/agent.controller.js";
import { MarketingController } from "./modules/marketing/marketing.controller.js";
import { DevSimulationController, WebhookController } from "./modules/payments/webhook.controller.js";
import { MediaController } from "./modules/media/media.controller.js";
import { ResellerMediaController } from "./modules/media/reseller-media.controller.js";
import { PortalController } from "./modules/portal/portal.controller.js";
import { ResellerController } from "./modules/reseller/reseller.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [AdminController, ResellerController, ResellerMediaController, AgentController, PortalController, MarketingController, MediaController, WebhookController, DevSimulationController],
})
export class DomainHttpModule {}

/**
 * Shared Nest business modules. Imported by both API and worker bootstraps.
 * Workers must not reach into apps/api/src.
 */
@Module({
  imports: [AuthModule, HealthModule, DomainHttpModule],
  exports: [AuthModule, HealthModule],
})
export class BackendCoreModule {}

export { AuthModule } from "./modules/auth/auth.module.js";
export { AuthService } from "./modules/auth/auth.service.js";
export { AppExceptionFilter } from "./common/filters/app-exception.filter.js";
export {
  SessionAuthGuard,
  RolesGuard,
  Roles,
  CurrentUser,
  AuthLookup,
} from "./common/guards/session.guard.js";
export type { RequestActor } from "./common/guards/session.guard.js";
export { generateOpaqueToken, hashToken, compactIdempotencyKey, totpCode } from "./common/crypto.js";
export { FakeNotificationProvider } from "./modules/notifications/notification.provider.js";
export {
  drainOutbox,
  leaseOutboxEvents,
  runOutboxEvent,
  outboxStats,
  outboxInlineEnabled,
} from "./modules/outbox/outbox.dispatcher.js";
export { runSweepers } from "./modules/outbox/sweepers.js";
export { runListingAiTick } from "./modules/platform/listing-ai.service.js";
export { closeRateLimiter } from "./common/rate-limit.js";
export { isProduction } from "./common/providers.js";
export { seedDemo } from "./demo/seed-demo.js";
export { refreshStarterPlans, seedPlans } from "./demo/seed-plans.js";
export { MAX_UPLOAD_BYTES as MAX_MEDIA_UPLOAD_BYTES } from "./modules/media/media.service.js";
