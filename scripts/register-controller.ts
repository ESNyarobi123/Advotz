/**
 * Registers and activates the real Omada Controller (Server B) into the Advo database.
 * Run with: pnpm --filter @advo/backend exec tsx ../../scripts/register-controller.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@advo/db";
import { loadOpenApiContract } from "@advo/omada";
import { encryptSecret } from "../packages/backend/src/common/crypto.js";
import { getControllerAdapter } from "../packages/backend/src/common/providers.js";

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) {
    console.error("No admin user found in database. Run `pnpm admin:bootstrap` first.");
    process.exit(1);
  }

  const contractPath = resolve(process.cwd(), "packages/omada/contracts/omada-v6.3.json");
  const contract = loadOpenApiContract(contractPath);

  const required = [
    "OMADA_CLIENT_ID",
    "OMADA_CLIENT_SECRET",
    "OMADA_HOTSPOT_OPERATOR_USERNAME",
    "OMADA_HOTSPOT_OPERATOR_PASSWORD",
    "OMADA_ADMIN_USERNAME",
    "OMADA_ADMIN_PASSWORD",
    "OMADA_BASE_URL",
    "OMADA_OMADAC_ID",
  ] as const;
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`Missing ${key}. Set controller credentials in the environment before running.`);
      process.exit(1);
    }
  }

  const creds = {
    clientId: process.env.OMADA_CLIENT_ID!,
    clientSecret: process.env.OMADA_CLIENT_SECRET!,
    operatorUsername: process.env.OMADA_HOTSPOT_OPERATOR_USERNAME!,
    operatorPassword: process.env.OMADA_HOTSPOT_OPERATOR_PASSWORD!,
    adminUsername: process.env.OMADA_ADMIN_USERNAME!,
    adminPassword: process.env.OMADA_ADMIN_PASSWORD!,
    openApiContract: contract,
  };

  const credentialsEnc = encryptSecret(JSON.stringify(creds));

  const omadacId = process.env.OMADA_OMADAC_ID!;
  const baseUrl = process.env.OMADA_BASE_URL!;
  const controllerName = process.env.OMADA_CONTROLLER_NAME || "Omada Controller";

  // Find existing controller if already registered
  const existing = await prisma.controller.findFirst({
    where: {
      OR: [{ name: controllerName }, { omadacId }],
    },
  });

  // Make this the default controller
  await prisma.controller.updateMany({ data: { isDefault: false } });

  const controllerData = {
    name: controllerName,
    type: "software",
    mode: "LIVE" as const,
    baseUrl,
    omadacId,
    version: process.env.OMADA_VERSION || null,
    portalTimeSemantics: "duration",
    isDefault: true,
    active: true,
    healthStatus: "reachable",
    lastHealthAt: new Date(),
    credentialsEnc,
  };

  const controller = existing
    ? await prisma.controller.update({
        where: { id: existing.id },
        data: controllerData,
      })
    : await prisma.controller.create({
        data: controllerData,
      });

  console.log(`[OK] Controller registered in database with ID: ${controller.id}`);

  // Test inspection via LiveOmadaAdapter
  const { adapter } = await getControllerAdapter(controller.id);
  const inspection = await adapter.inspectController();
  console.log("[OK] Adapter inspection reachable:", inspection.reachable);

  const capabilities = await adapter.getCapabilities();
  for (const [op, cap] of Object.entries(capabilities)) {
    await prisma.controllerCapability.upsert({
      where: {
        controllerId_operation: {
          controllerId: controller.id,
          operation: op,
        },
      },
      create: {
        controllerId: controller.id,
        operation: op,
        supported: cap.supported,
        verified: cap.verified,
        reason: cap.reason ?? null,
        evidence: cap.evidence ?? null,
      },
      update: {
        supported: cap.supported,
        verified: cap.verified,
        reason: cap.reason ?? null,
        evidence: cap.evidence ?? null,
      },
    });
  }

  console.log(`[OK] Updated capabilities for Controller Server B (ID: ${controller.id})`);
}

main()
  .catch((err) => {
    console.error("Registration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
