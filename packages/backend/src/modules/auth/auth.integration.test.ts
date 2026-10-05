import { describe, expect, it, beforeAll } from "vitest";
import { AuthService } from "./auth.service.js";
import { prisma } from "@advo/db";
import { agentFactory, resellerFactory } from "@advo/test-kit";
import { resetTestDatabase } from "../../test/db.js";
import { totpCode } from "../../common/crypto.js";

describe("auth registration flows", () => {
  const auth = new AuthService();
  let adminId: string;

  beforeAll(async () => {
    await resetTestDatabase();

    const admin = await auth.bootstrapAdmin({
      email: "admin@advo.test",
      password: "AdminSecurePass1",
      name: "Platform Admin",
    });
    adminId = admin.userId;
  });

  it("registers a reseller without referral and creates no attribution", async () => {
    const input = resellerFactory({
      email: "r1@advo.test",
      phone: "+255711111111",
    });
    const result = await auth.registerReseller(input);
    expect(result.resellerId).toBeTruthy();

    const attribution = await prisma.referralAttribution.findUnique({
      where: { resellerId: result.resellerId },
    });
    expect(attribution).toBeNull();
  });

  it("attributes exactly once for a valid referral code", async () => {
    const agentInput = agentFactory({
      email: "a1@advo.test",
      referralCode: "AGENTONE",
    });
    const agent = await auth.createAgent(adminId, agentInput);

    const input = resellerFactory({
      email: "r2@advo.test",
      phone: "+255722222222",
    });
    const result = await auth.registerReseller({
      ...input,
      referralCode: "AGENTONE",
    });

    const attribution = await prisma.referralAttribution.findUnique({
      where: { resellerId: result.resellerId },
    });
    expect(attribution?.agentId).toBe(agent.agentId);
    expect(attribution?.source).toBe("SELF_REFERRAL_CODE");
  });

  it("binds invitation attribution and prevents token reuse", async () => {
    const agentInput = agentFactory({
      email: "a2@advo.test",
      referralCode: "AGENTTWO",
    });
    await auth.createAgent(adminId, agentInput);
    const agentUser = await prisma.user.findUniqueOrThrow({
      where: { email: "a2@advo.test" },
      include: { agent: true },
    });

    const invite = await auth.createInvitation(
      {
        id: agentUser.id,
        role: "AGENT",
        email: agentUser.email,
        name: agentUser.name,
        status: "ACTIVE",
        emailVerifiedAt: new Date().toISOString(),
        resellerId: null,
        agentId: agentUser.agent!.id,
        mfaEnabled: false,
        mfaPassed: false,
        sessionId: "test",
      },
      {
        businessName: "Invited Cafe",
        contactName: "Invitee",
        email: "invited@advo.test",
        phone: "+255733333333",
        consentConfirmed: true,
      },
    );

    expect(invite.devInvitationToken).toBeTruthy();
    const accepted = await auth.acceptInvitation({
      token: invite.devInvitationToken!,
      ownerName: "Invitee Owner",
      password: "SecurePass123!",
      acceptTerms: true,
    });

    const attribution = await prisma.referralAttribution.findUnique({
      where: { resellerId: accepted.resellerId },
    });
    expect(attribution?.agentId).toBe(agentUser.agent!.id);
    expect(attribution?.source).toBe("AGENT_INVITATION");

    await expect(
      auth.acceptInvitation({
        token: invite.devInvitationToken!,
        ownerName: "Invitee Owner",
        password: "SecurePass123!",
        acceptTerms: true,
      }),
    ).rejects.toThrow();
  });

  it("ignores client-supplied role elevation on registration", async () => {
    const input = resellerFactory({
      email: "r3@advo.test",
      phone: "+255744444444",
    });
    const result = await auth.registerReseller(input);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
    });
    expect(user.role).toBe("RESELLER");
  });

  it("password reset revokes existing sessions and its token works once", async () => {
    const input = resellerFactory({ email: "r-reset@advo.test", phone: "+255755555555" });
    await auth.registerReseller(input);
    await prisma.user.update({ where: { email: input.email }, data: { status: "ACTIVE", emailVerifiedAt: new Date() } });
    const session = await auth.login({ email: input.email, password: input.password }, {}, 3600);

    const { devResetToken } = (await auth.forgotPassword(input.email)) as { devResetToken: string };
    const results = await Promise.allSettled(
      ["NewPassword-One-1", "NewPassword-Two-2"].map((password) => auth.resetPassword({ token: devResetToken, password })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const old = await prisma.authSession.findUniqueOrThrow({ where: { id: session.sessionId } });
    expect(old.revokedAt).not.toBeNull();
    await expect(auth.resetPassword({ token: devResetToken, password: "NewPassword-Three-3" })).rejects.toMatchObject({ status: 400 });
  });

  it("accepts each authenticator code once", async () => {
    const creds = { email: "admin@advo.test", password: "AdminSecurePass1" };
    const first = await auth.login(creds, {}, 3600);
    const { secret } = await auth.setupMfa(adminId);
    const enrolCode = totpCode(secret);
    await auth.enableMfa(adminId, first.sessionId, enrolCode);

    await expect(auth.login({ ...creds, mfaCode: enrolCode }, {}, 3600)).rejects.toMatchObject({ status: 401 });
    // An older code still inside the ±1 step drift window is also a replay.
    await expect(auth.login({ ...creds, mfaCode: totpCode(secret, Date.now() - 30_000) }, {}, 3600)).rejects.toMatchObject({ status: 401 });

    const nextStep = totpCode(secret, Date.now() + 30_000);
    const ok = await auth.login({ ...creds, mfaCode: nextStep }, {}, 3600);
    expect(ok.user.mfaPassed).toBe(true);
    await expect(auth.login({ ...creds, mfaCode: nextStep }, {}, 3600)).rejects.toMatchObject({ status: 401 });
  });

  it("accepts DEV_FIXED_OTP repeatedly for an admin instead of a rotating code", async () => {
    const creds = { email: "admin@advo.test", password: "AdminSecurePass1" };
    const previous = process.env.DEV_FIXED_OTP;
    process.env.DEV_FIXED_OTP = "123456";
    try {
      const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
      if (!admin.mfaEnabled) {
        const bootstrap = await auth.login(creds, {}, 3600);
        await auth.setupMfa(adminId);
        await auth.enableMfa(adminId, bootstrap.sessionId, "123456");
      }

      const first = await auth.login({ ...creds, mfaCode: "123456" }, {}, 3600);
      // Reusable by design: the fixed code is never burned like a rotating TOTP step.
      const second = await auth.login({ ...creds, mfaCode: "123456" }, {}, 3600);
      expect(first.user.mfaPassed).toBe(true);
      expect(second.user.mfaPassed).toBe(true);

      // Every other value still goes through real TOTP verification.
      await expect(auth.login({ ...creds, mfaCode: "654321" }, {}, 3600)).rejects.toMatchObject({ status: 401 });
    } finally {
      if (previous === undefined) delete process.env.DEV_FIXED_OTP;
      else process.env.DEV_FIXED_OTP = previous;
    }
  });

  it("revokes sessions that exceed the idle session timeout window", async () => {
    const input = resellerFactory({ email: "r-idle@advo.test", phone: "+255766666666" });
    await auth.registerReseller(input);
    await prisma.user.update({ where: { email: input.email }, data: { status: "ACTIVE", emailVerifiedAt: new Date() } });
    const session = await auth.login({ email: input.email, password: input.password }, {}, 86400);

    // Active session resolves cleanly
    const actor = await auth.resolveSession(session.token);
    expect(actor).not.toBeNull();
    expect(actor?.email).toBe(input.email);

    // Age the session's lastSeenAt past the idle timeout (default 43,200 s = 12 h)
    await prisma.authSession.update({
      where: { id: session.sessionId },
      data: { lastSeenAt: new Date(Date.now() - 50_000 * 1000) },
    });

    const expired = await auth.resolveSession(session.token);
    expect(expired).toBeNull();

    const stored = await prisma.authSession.findUniqueOrThrow({ where: { id: session.sessionId } });
    expect(stored.revokedAt).not.toBeNull();
  });

  it("agent role cannot access guest data or perform unauthorized role actions", async () => {
    const agentUser = await prisma.user.findFirstOrThrow({
      where: { email: "a1@advo.test" },
      include: { agent: true },
    });
    const agentActor = {
      id: agentUser.id,
      role: "AGENT" as const,
      email: agentUser.email,
      name: agentUser.name,
      status: "ACTIVE" as const,
      emailVerifiedAt: new Date().toISOString(),
      resellerId: null,
      agentId: agentUser.agent!.id,
      mfaEnabled: false,
      mfaPassed: false,
      sessionId: "test-agent-session",
    };

    // Agent endpoints expose no guest PII (phone, mac, payment refs)
    const { agentOverview, agentLeads, agentCommissions } = await import("../reports/reports.service.js");
    const overview = await agentOverview(agentActor.agentId);
    expect(overview).toHaveProperty("wallet");
    expect(overview).toHaveProperty("leads");
    expect(overview).not.toHaveProperty("guestPhone");
    expect(overview).not.toHaveProperty("clientMac");

    const leads = await agentLeads(agentActor.agentId);
    for (const lead of leads) {
      expect(lead).not.toHaveProperty("guestPhone");
      expect(lead).not.toHaveProperty("clientMac");
      expect(lead).not.toHaveProperty("paymentReference");
    }

    const comms = await agentCommissions(agentActor.agentId);
    for (const c of comms) {
      expect(c).not.toHaveProperty("guestPhone");
      expect(c).not.toHaveProperty("clientMac");
    }
  });
});
