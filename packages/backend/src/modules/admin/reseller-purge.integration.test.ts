import { describe, expect, it, beforeAll } from "vitest";
import { prisma } from "@advo/db";
import { resellerFactory } from "@advo/test-kit";
import { resetTestDatabase } from "../../test/db.js";
import { AuthService } from "../auth/auth.service.js";
import { deleteReseller } from "./admin.service.js";
import { postJournal, resellerAccount } from "../ledger/ledger.service.js";
/**
 * Deleting a reseller has to leave nothing behind that blocks the same person
 * from registering again: `User.email`, `User.phone`, `Reseller.slug` and
 * `Device.mac` are unique, so any surviving row rejects the second account.
 */
describe("reseller deletion erases the account", () => {
  const auth = new AuthService();
  let adminId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    const admin = await auth.bootstrapAdmin({
      email: "purge-admin@advo.test",
      password: "AdminSecurePass1",
      name: "Purge Admin",
    });
    adminId = admin.userId;
  });

  it("frees the email, phone and device MACs after deleting an untraded account", async () => {
    const input = resellerFactory({ email: "erase-me@advo.test", phone: "+255700111222" });
    const created = await auth.registerReseller(input, { requireEmailVerification: false });
    const reseller = await prisma.reseller.findUniqueOrThrow({ where: { id: created.resellerId } });

    const site = await prisma.site.create({
      data: {
        resellerId: reseller.id,
        name: "Test site",
        slug: `test-site-${Date.now()}`,
        timezone: "Africa/Dar_es_Salaam",
      },
    });
    const mac = "AA:BB:CC:DD:EE:01";
    await prisma.device.create({
      data: { resellerId: reseller.id, siteId: site.id, mac, name: "EAP", observedStatus: "offline" },
    });

    const result = await deleteReseller(adminId, reseller.id, "Test cleanup");

    expect(result.deleted).toBe("erased");
    expect(result.devicesReleased).toBe(1);
    expect(result.freedEmail).toBe("erase-me@advo.test");

    // The account rows are gone, not just marked closed.
    await expect(prisma.user.findUnique({ where: { email: "erase-me@advo.test" } })).resolves.toBeNull();
    await expect(prisma.reseller.findUnique({ where: { id: reseller.id } })).resolves.toBeNull();
    await expect(prisma.device.findUnique({ where: { mac } })).resolves.toBeNull();
    await expect(prisma.site.findFirst({ where: { resellerId: reseller.id } })).resolves.toBeNull();

    // The same person can register again.
    const again = await auth.registerReseller(
      { ...input, businessName: "Second Life Cafe" },
      { requireEmailVerification: false },
    );
    expect(again.resellerId).toBeTruthy();

    // And adopt the same hardware.
    const second = await prisma.reseller.findUniqueOrThrow({ where: { id: again.resellerId } });
    const secondSite = await prisma.site.create({
      data: {
        resellerId: second.id,
        name: "Second site",
        slug: `second-site-${Date.now()}`,
        timezone: "Africa/Dar_es_Salaam",
      },
    });
    await expect(
      prisma.device.create({
        data: { resellerId: second.id, siteId: secondSite.id, mac, name: "EAP", observedStatus: "offline" },
      }),
    ).resolves.toBeTruthy();
  });

  it("frees the email when financial history forces the anonymized path", async () => {
    const input = resellerFactory({ email: "paid-reseller@advo.test" });
    const created = await auth.registerReseller(input, { requireEmailVerification: false });
    const reseller = await prisma.reseller.findUniqueOrThrow({ where: { id: created.resellerId } });

    await prisma.$transaction(async (tx) => {
      await postJournal(tx, {
        sourceKey: `purge-test:${reseller.id}`,
        sourceType: "test.sale",
        description: "Test sale",
        lines: [
          { account: resellerAccount(reseller.id, "PROVIDER_CLEARING"), debit: 1000n },
          { account: resellerAccount(reseller.id, "RESELLER_PAYABLE"), credit: 1000n },
        ],
      });
    });

    const result = await deleteReseller(adminId, reseller.id, "Test cleanup with ledger");

    expect(result.deleted).toBe("anonymized");
    expect(result.keptFinancialHistory).toBe(true);

    const scrubbed = await prisma.user.findUnique({ where: { email: "paid-reseller@advo.test" } });
    expect(scrubbed).toBeNull();
    const placeholder = await prisma.user.findUniqueOrThrow({ where: { id: reseller.ownerUserId } });
    expect(placeholder.email).toBe(`deleted+${reseller.ownerUserId}@deleted.invalid`);
    expect(placeholder.phone).toBeNull();
    expect(placeholder.name).toBe("Deleted account");

    const ledgerLines = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n
        FROM "JournalLine" jl
        JOIN "LedgerAccount" la ON la.id = jl."accountId"
       WHERE la."ownerType" = 'RESELLER' AND la."ownerId" = ${reseller.id}
    `;
    expect(Number(ledgerLines[0]!.n)).toBe(2);

    // The email is reusable even though the ledger row stayed.
    const again = await auth.registerReseller(
      { ...input, businessName: "Re-registered Cafe" },
      { requireEmailVerification: false },
    );
    expect(again.resellerId).toBeTruthy();
  });
});
