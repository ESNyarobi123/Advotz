import "dotenv/config";
import * as argon2 from "argon2";
import { prisma } from "../packages/db/src/index.js";

async function main() {
  const commonPassword = "TestPassword123!";
  const hash = await argon2.hash(commonPassword, { type: argon2.argon2id });

  // 1. Admin
  const adminEmail = "admin@test.advo";
  let adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Test Administrator",
        role: "ADMIN",
        status: "ACTIVE",
        phone: "+255700000001",
        passwordHash: hash,
        emailVerifiedAt: new Date(),
        mfaEnabled: false,
      },
    });
    console.log("Created Admin:", adminEmail);
  } else {
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { passwordHash: hash, status: "ACTIVE", emailVerifiedAt: new Date(), mfaEnabled: false },
    });
    console.log("Updated Admin:", adminEmail);
  }

  // 2. Agent
  const agentEmail = "agent@test.advo";
  let agentUser = await prisma.user.findUnique({ where: { email: agentEmail } });
  if (!agentUser) {
    agentUser = await prisma.user.create({
      data: {
        email: agentEmail,
        name: "Test Agent Baraka",
        role: "AGENT",
        status: "ACTIVE",
        phone: "+255700000002",
        passwordHash: hash,
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.agent.create({
      data: {
        userId: agentUser.id,
        referralCode: "AGENTTEST1",
        status: "ACTIVE",
      },
    });
    console.log("Created Agent:", agentEmail, "Code: AGENTTEST1");
  } else {
    await prisma.user.update({
      where: { id: agentUser.id },
      data: { passwordHash: hash, status: "ACTIVE", emailVerifiedAt: new Date() },
    });
    console.log("Updated Agent:", agentEmail);
  }

  // 3. Reseller
  const resellerEmail = "reseller@test.advo";
  let resellerUser = await prisma.user.findUnique({ where: { email: resellerEmail } });
  if (!resellerUser) {
    resellerUser = await prisma.user.create({
      data: {
        email: resellerEmail,
        name: "Test Reseller Juma",
        role: "RESELLER",
        status: "ACTIVE",
        phone: "+255700000003",
        passwordHash: hash,
        emailVerifiedAt: new Date(),
      },
    });
    const reseller = await prisma.reseller.create({
      data: {
        ownerUserId: resellerUser.id,
        businessName: "Juma HighSpeed WiFi",
        slug: "juma-highspeed-wifi",
        status: "ACTIVE",
        registrationSource: "SELF",
        onboardingStep: "COMPLETE",
      },
    });
    console.log("Created Reseller:", resellerEmail, "Reseller ID:", reseller.id);
  } else {
    await prisma.user.update({
      where: { id: resellerUser.id },
      data: { passwordHash: hash, status: "ACTIVE", emailVerifiedAt: new Date() },
    });
    console.log("Updated Reseller:", resellerEmail);
  }

  console.log("\n=================================");
  console.log("Test accounts are ready!");
  console.log("Common password for all:", commonPassword);
  console.log("Admin:    ", adminEmail);
  console.log("Agent:    ", agentEmail, "(Referral Code: AGENTTEST1)");
  console.log("Reseller: ", resellerEmail);
  console.log("=================================\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error setting up test accounts:", err);
  process.exit(1);
});
