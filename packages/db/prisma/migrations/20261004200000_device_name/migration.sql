-- Device naming.
-- Resellers add a device with a friendly name, so the operator sees it by name
-- instead of only by hardware model. The model stays optional here: the platform
-- can still record it from the Controller after adoption.
ALTER TABLE "Device" ADD COLUMN "name" TEXT;
ALTER TABLE "Device" ALTER COLUMN "model" DROP NOT NULL;
ALTER TABLE "DeviceClaim" ADD COLUMN "name" TEXT;
ALTER TABLE "DeviceClaim" ALTER COLUMN "model" DROP NOT NULL;
