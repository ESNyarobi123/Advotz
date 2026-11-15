-- Email OTP for self-registration and password reset, plus a real email
-- transport with an admin-visible delivery log.
--
-- The OTP itself is never stored: `codeHash` is an HMAC over purpose + subject
-- + code. `Notification` gains the fields the Admin → Mail screen reads.

ALTER TYPE "VerificationPurpose" ADD VALUE IF NOT EXISTS 'REGISTRATION_VERIFY';

CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER_RESELLER', 'REGISTER_AGENT', 'PASSWORD_RESET');

CREATE TABLE "OtpChallenge" (
    "id" UUID NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "subject" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "userId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OtpChallenge_purpose_subject_consumedAt_idx" ON "OtpChallenge" ("purpose", "subject", "consumedAt");
CREATE INDEX "OtpChallenge_expiresAt_idx" ON "OtpChallenge" ("expiresAt");

ALTER TABLE "Notification"
    ADD COLUMN "provider" TEXT,
    ADD COLUMN "subject" TEXT,
    ADD COLUMN "bodyPreview" TEXT,
    ADD COLUMN "error" TEXT,
    ADD COLUMN "sentAt" TIMESTAMP(3);

CREATE INDEX "Notification_state_createdAt_idx" ON "Notification" ("state", "createdAt");
CREATE INDEX "Notification_template_createdAt_idx" ON "Notification" ("template", "createdAt");
