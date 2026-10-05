-- Reject reuse of an already-accepted TOTP code (or an earlier one in the drift window).
ALTER TABLE "User" ADD COLUMN "mfaLastStep" INTEGER;
