-- Admin impersonation ("sign in as reseller").
-- The session stays a normal AuthSession for the impersonated user, but carries who
-- started it and why, so the audit trail and the UI banner survive a page reload.
ALTER TABLE "AuthSession" ADD COLUMN "impersonatedByUserId" UUID;
ALTER TABLE "AuthSession" ADD COLUMN "impersonationReason" TEXT;

CREATE INDEX "AuthSession_impersonatedByUserId_idx" ON "AuthSession"("impersonatedByUserId");
