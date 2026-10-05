import { prisma, type Prisma } from "@advo/db";
import { openApiContractSchema, type ControllerCapabilities } from "@advo/omada";
import { encryptSecret } from "../../common/crypto.js";
import { badRequest, notFound } from "../../common/errors.js";
import { audit } from "../../common/events.js";
import { getControllerAdapter, isProduction, readControllerCredentials } from "../../common/providers.js";

type ControllerInput = {
  name: string;
  mode: "FAKE" | "LIVE";
  baseUrl?: string;
  omadacId?: string;
  version?: string;
  portalTimeSemantics?: "absolute_epoch" | "duration";
  isDefault: boolean;
  credentials?: {
    clientId?: string;
    clientSecret?: string;
    operatorUsername?: string;
    operatorPassword?: string;
    openApiContract?: unknown;
  };
};

export function publicController(c: Awaited<ReturnType<typeof prisma.controller.findFirstOrThrow>>) {
  const { credentialsEnc, ...rest } = c;
  return { ...rest, hasCredentials: Boolean(credentialsEnc) };
}

export async function listControllers() {
  const rows = await prisma.controller.findMany({
    include: {
      capabilities: true,
      // Site mappings decide whether a Controller is safe to retire, and their state
      // is what the admin screen flags as "needs attention" — roll both up here so the
      // screen never has to fan out one request per Controller.
      mappings: { select: { state: true } },
      _count: { select: { devices: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(({ mappings, _count, ...controller }) => ({
    ...publicController(controller),
    capabilities: controller.capabilities,
    counts: {
      sites: mappings.length,
      sitesFailing: mappings.filter((m) => m.state === "FAILED" || m.state === "NEEDS_REVIEW").length,
      devices: _count.devices,
    },
  }));
}

export async function saveController(adminUserId: string, input: ControllerInput, id?: string) {
  if (input.mode === "FAKE" && isProduction()) badRequest("FAKE controllers are not allowed in production");
  if (input.mode === "LIVE") {
    if (!input.baseUrl || !input.omadacId || !input.version) {
      badRequest("LIVE controllers need baseUrl, omadacId and version");
    }
    if (isProduction() && !input.baseUrl.startsWith("https://")) badRequest("Controller URL must be HTTPS");
  }
  if (input.credentials?.openApiContract !== undefined) {
    const parsed = openApiContractSchema.safeParse(input.credentials.openApiContract);
    if (!parsed.success) badRequest("Open API contract is invalid", "VALIDATION_ERROR", parsed.error.issues);
  }

  return prisma.$transaction(async (tx) => {
    let credentialsEnc: string | undefined;
    if (input.credentials) {
      const previous = id ? await tx.controller.findUnique({ where: { id } }) : null;
      const merged = { ...(previous ? readControllerCredentials(previous) : {}), ...stripEmpty(input.credentials) };
      credentialsEnc = encryptSecret(JSON.stringify(merged));
    }
    if (input.isDefault) await tx.controller.updateMany({ data: { isDefault: false } });
    const data = {
      name: input.name,
      mode: input.mode,
      baseUrl: input.baseUrl ?? null,
      omadacId: input.omadacId ?? null,
      version: input.version ?? null,
      portalTimeSemantics: input.portalTimeSemantics ?? null,
      isDefault: input.isDefault,
      ...(credentialsEnc ? { credentialsEnc } : {}),
    };
    const saved = id
      ? await tx.controller.update({ where: { id }, data })
      : await tx.controller.create({ data });
    await audit(tx, {
      actorUserId: adminUserId,
      action: id ? "controller.updated" : "controller.created",
      targetType: "Controller",
      targetId: saved.id,
      metadata: { mode: saved.mode, credentialsChanged: Boolean(credentialsEnc) },
    });
    return publicController(saved);
  });
}

function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== "")) as Partial<T>;
}

/** Health + capability readback. A reachable Controller is not proof any feature works. */
export async function inspectController(controllerId: string) {
  const { adapter } = await getControllerAdapter(controllerId);
  const inspection = await adapter.inspectController();
  const capabilities: ControllerCapabilities = await adapter.getCapabilities();
  await prisma.controller.update({
    where: { id: controllerId },
    data: {
      healthStatus: inspection.reachable ? "reachable" : "unreachable",
      lastHealthAt: new Date(),
      lastHealthError: inspection.reachable ? null : (inspection.detail ?? null),
    },
  });
  return { inspection, capabilities, simulated: adapter.simulated };
}

export async function recordCapabilityEvidence(
  adminUserId: string,
  controllerId: string,
  input: { operation: string; supported: boolean; verified: boolean; reason?: string; evidence?: string },
) {
  const controller = await prisma.controller.findUnique({ where: { id: controllerId } });
  if (!controller) notFound();
  if (input.verified && !input.evidence) badRequest("Verified capabilities require a lab evidence note");
  return prisma.$transaction(async (tx) => {
    const row = await tx.controllerCapability.upsert({
      where: { controllerId_operation: { controllerId, operation: input.operation } },
      create: { controllerId, ...input },
      update: { ...input },
    });
    await audit(tx, {
      actorUserId: adminUserId,
      action: "controller.capability_recorded",
      targetType: "Controller",
      targetId: controllerId,
      metadata: input as unknown as Prisma.InputJsonValue as Record<string, unknown>,
    });
    return row;
  });
}

export async function defaultController() {
  return prisma.controller.findFirst({ where: { active: true, isDefault: true } })
    ?? prisma.controller.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
}

/**
 * Promotes, retires or restores a Controller without resending its configuration.
 *
 * Kept separate from `saveController` so the operator never has to retype a base URL
 * to flip a flag, and so the flip lands in the audit log with its own written reason.
 */
export async function updateControllerFlags(
  adminUserId: string,
  controllerId: string,
  input: { isDefault?: boolean; active?: boolean; reason: string },
) {
  const controller = await prisma.controller.findUnique({ where: { id: controllerId } });
  if (!controller) notFound("Controller not found");

  // Retirement must not leave the platform without something to provision through.
  if (input.active === false && controller.active) {
    const remaining = await prisma.controller.count({ where: { active: true, id: { not: controllerId } } });
    if (remaining === 0) badRequest("The platform needs at least one active Controller");
  }

  // A retired Controller must not stay the default, or the platform would keep
  // advertising a provisioning target that refuses new work.
  const retiringDefault = input.active === false && controller.active && controller.isDefault;
  let successor: { id: string; name: string } | null = null;

  return prisma.$transaction(async (tx) => {
    // Exactly one Controller can be the default, so promoting one demotes the rest.
    if (input.isDefault) {
      await tx.controller.updateMany({ where: { id: { not: controllerId } }, data: { isDefault: false } });
    }
    if (retiringDefault) {
      successor = await tx.controller.findFirst({
        where: { active: true, id: { not: controllerId } },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      });
      if (successor) {
        await tx.controller.updateMany({ where: { id: { not: successor.id } }, data: { isDefault: false } });
        await tx.controller.update({ where: { id: successor.id }, data: { isDefault: true } });
      }
    }
    const saved = await tx.controller.update({
      where: { id: controllerId },
      data: {
        ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
        ...(input.active === undefined ? {} : { active: input.active }),
        ...(retiringDefault ? { isDefault: false } : {}),
      },
    });
    await audit(tx, {
      actorUserId: adminUserId,
      action: "controller.flags_changed",
      targetType: "Controller",
      targetId: controllerId,
      reason: input.reason,
      metadata: {
        isDefault: input.isDefault ?? null,
        active: input.active ?? null,
        defaultHandedTo: retiringDefault ? successor?.name ?? null : null,
      },
    });
    return publicController(saved);
  });
}

/**
 * Removes a Controller that never carried anything.
 *
 * Site mappings and adopted devices reference a Controller with `onDelete: Restrict`,
 * so they are checked up front and refused with a readable message instead of letting
 * the database throw a foreign-key error at the operator.
 */
export async function deleteController(adminUserId: string, controllerId: string, reason: string) {
  const controller = await prisma.controller.findUnique({
    where: { id: controllerId },
    include: { _count: { select: { mappings: true, devices: true } } },
  });
  if (!controller) notFound("Controller not found");
  const { mappings, devices } = controller._count;
  if (mappings > 0 || devices > 0) {
    badRequest(
      `"${controller.name}" still carries ${mappings} site(s) and ${devices} device(s). Deactivate it instead, or move them first.`,
    );
  }
  const remaining = await prisma.controller.count({ where: { active: true, id: { not: controllerId } } });
  if (remaining === 0) badRequest("The platform needs at least one active Controller");

  await prisma.$transaction(async (tx) => {
    // Evidence describes this Controller's firmware, so it has no meaning once it is gone.
    await tx.controllerCapability.deleteMany({ where: { controllerId } });
    await tx.controller.delete({ where: { id: controllerId } });
    await audit(tx, {
      actorUserId: adminUserId,
      action: "controller.deleted",
      targetType: "Controller",
      targetId: controllerId,
      reason,
      metadata: { name: controller.name, mode: controller.mode, baseUrl: controller.baseUrl },
    });
  });
  return { deleted: true };
}
