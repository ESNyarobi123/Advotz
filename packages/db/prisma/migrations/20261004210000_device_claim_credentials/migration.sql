-- Device local account for adoption.
-- Some Omada devices need the Controller to log in with the device's own
-- username/password before it can adopt them. The Reseller captures that login
-- when adding the device; the username is stored as-is and the password is
-- encrypted (SECRETS_ENCRYPTION_KEY, AES-256-GCM) until adoption runs.
ALTER TABLE "DeviceClaim" ADD COLUMN "deviceUsername" TEXT;
ALTER TABLE "DeviceClaim" ADD COLUMN "devicePasswordEnc" TEXT;
