import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import {
  AttributionSource,
  ErrorCode,
  UserRole,
  UserStatus,
  type AcceptInvitationInput,
  type CreateAgentInput,
  type CreateInvitationInput,
  type CreateResellerInput,
  type Impersonation,
  type LoginInput,
  type RegisterAgentInput,
  type RegisterResellerInput,
  type ResetPasswordInput,
  type SessionUser,
} from "@advo/contracts";
import { prisma, type Prisma } from "@advo/db";
import {
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
  generateTotpSecret,
  hashToken,
  isDevFixedOtp,
  matchTotpStep,
  slugifyBusinessName,
} from "../../common/crypto.js";
import {
  adminMfaRequired,
  AuthLookup,
  type RequestActor,
} from "../../common/guards/session.guard.js";
import {
  FakeNotificationProvider,
  type NotificationProvider,
} from "../notifications/notification.provider.js";

const SESSION_COOKIE = "advo_session";

/**
 * Accepts a TOTP code at most once: the matched step must be newer than the last accepted one.
 *
 * Admin accounts bypass the rotation and single-use rules in development when
 * `DEV_FIXED_OTP` is configured (see `isDevFixedOtp`). The check runs before the step
 * bookkeeping, so the same code keeps working instead of being burned on first use.
 */
async function consumeTotp(
  userId: string,
  secretEnc: string,
  code: string,
  role: string,
): Promise<boolean> {
  if (role === UserRole.ADMIN && isDevFixedOtp(code)) return true;
  const step = matchTotpStep(decryptSecret(secretEnc), code);
  if (step === null) return false;
  const advanced = await prisma.user.updateMany({
    where: { id: userId, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
    data: { mfaLastStep: step },
  });
  return advanced.count === 1;
}

@Injectable()
export class AuthService extends AuthLookup {
  private readonly notifications: NotificationProvider =
    new FakeNotificationProvider();

  getNotificationProvider(): NotificationProvider {
    return this.notifications;
  }

  async registerReseller(input: RegisterResellerInput) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])],
      },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: "An account with this email or phone already exists",
      });
    }

    let agentId: string | null = null;
    if (input.referralCode) {
      const agent = await prisma.agent.findUnique({
        where: { referralCode: input.referralCode.toUpperCase() },
      });
      if (!agent || agent.status !== "ACTIVE") {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: "Invalid or inactive referral code",
        });
      }
      agentId = agent.id;
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    const verifyToken = generateOpaqueToken();
    const verifyHash = hashToken(verifyToken);
    const slug = slugifyBusinessName(input.businessName);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          role: "RESELLER",
          email: input.email,
          phone: input.phone,
          name: input.ownerName,
          passwordHash,
          status: "PENDING_VERIFICATION",
        },
      });

      const reseller = await tx.reseller.create({
        data: {
          ownerUserId: user.id,
          businessName: input.businessName,
          slug,
          status: "PENDING_VERIFICATION",
          registrationSource: "SELF",
          onboardingStep: "PROFILE",
        },
      });

      if (agentId) {
        await tx.referralAttribution.create({
          data: {
            resellerId: reseller.id,
            agentId,
            source: "SELF_REFERRAL_CODE",
          },
        });
      }

      await tx.verificationToken.create({
        data: {
          userId: user.id,
          purpose: "EMAIL_VERIFY",
          subject: user.email,
          tokenHash: verifyHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: "reseller.registered",
          targetType: "Reseller",
          targetId: reseller.id,
          metadata: {
            hasReferral: Boolean(agentId),
            source: "SELF",
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: "reseller.registered",
          aggregateType: "Reseller",
          aggregateId: reseller.id,
          payload: {
            resellerId: reseller.id,
            userId: user.id,
            agentId,
          },
        },
      });

      return { user, reseller };
    });

    await this.notifications.send({
      channel: "email",
      to: input.email,
      subject: "Verify your Advo TZ account",
      body: `Verification token (dev/fake transport): ${verifyToken}`,
      dedupKey: `verify:${result.user.id}`,
    });

    return {
      userId: result.user.id,
      resellerId: result.reseller.id,
      slug: result.reseller.slug,
      verificationRequired: true,
      notificationSimulated: true,
      // Dev-only exposure when fake notification provider is used
      ...(process.env.NODE_ENV !== "production"
        ? { devVerificationToken: verifyToken }
        : {}),
    };
  }

  async registerAgent(input: RegisterAgentInput) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])],
      },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: "An account with this email or phone already exists",
      });
    }

    let code = (input.referralCode || input.name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)).toUpperCase();
    if (code.length < 4) code = `AGENT${Math.floor(1000 + Math.random() * 9000)}`;

    const existingCode = await prisma.agent.findUnique({ where: { referralCode: code } });
    if (existingCode) {
      if (input.referralCode) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: "This referral code is already taken. Please choose another one.",
        });
      }
      code = `${code.slice(0, 6)}${Math.floor(10 + Math.random() * 90)}`;
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    const verifyToken = generateOpaqueToken();
    const verifyHash = hashToken(verifyToken);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          role: "AGENT",
          email: input.email,
          phone: input.phone,
          name: input.name,
          passwordHash,
          status: "PENDING_VERIFICATION",
        },
      });

      const agent = await tx.agent.create({
        data: {
          userId: user.id,
          referralCode: code,
          status: "ACTIVE",
        },
      });

      await tx.verificationToken.create({
        data: {
          userId: user.id,
          purpose: "EMAIL_VERIFY",
          subject: user.email,
          tokenHash: verifyHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: "agent.registered",
          targetType: "Agent",
          targetId: agent.id,
          metadata: { referralCode: code, source: "SELF" },
        },
      });

      return { user, agent };
    });

    await this.notifications.send({
      channel: "email",
      to: input.email,
      subject: "Verify your Advo TZ Agent account",
      body: `Verification token (dev/fake transport): ${verifyToken}`,
      dedupKey: `verify:${result.user.id}`,
    });

    return {
      userId: result.user.id,
      agentId: result.agent.id,
      referralCode: result.agent.referralCode,
      verificationRequired: true,
      notificationSimulated: true,
      ...(process.env.NODE_ENV !== "production"
        ? { devVerificationToken: verifyToken }
        : {}),
    };
  }

  async login(
    input: LoginInput,
    meta: { userAgent?: string; ipAddress?: string },
    sessionTtlSeconds: number,
  ) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHENTICATED,
        message: "Invalid email or password",
      });
    }

    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHENTICATED,
        message: "Invalid email or password",
      });
    }

    if (user.status === "SUSPENDED" || user.status === "CLOSED") {
      throw new UnauthorizedException({
        code: ErrorCode.FORBIDDEN,
        message: "Account is not allowed to sign in",
      });
    }

    // Local development convenience: when Admin MFA is switched off
    // (`ADMIN_MFA_REQUIRED=false` outside production) skip the code challenge
    // entirely, so an Admin reaches the dashboard with just email and password.
    // `adminMfaRequired()` is hard-wired to `true` in production, so this branch
    // can never open a production session.
    let mfaPassed = false;
    if (user.role === UserRole.ADMIN && !adminMfaRequired()) {
      mfaPassed = true;
    } else if (user.mfaEnabled && user.mfaSecretEnc) {
      if (!input.mfaCode) {
        throw new UnauthorizedException({ code: ErrorCode.MFA_REQUIRED, message: "Enter the 6-digit code from your authenticator app" });
      }
      if (!(await consumeTotp(user.id, user.mfaSecretEnc, input.mfaCode, user.role))) {
        throw new UnauthorizedException({ code: ErrorCode.UNAUTHENTICATED, message: "Invalid authentication code" });
      }
      mfaPassed = true;
    }

    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000);

    const session = await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        mfaPassed,
      },
    });
    await prisma.auditEvent.create({
      data: { actorUserId: user.id, action: "auth.login", targetType: "User", targetId: user.id, metadata: { mfaPassed } },
    });

    const sessionUser = { ...(await this.toSessionUser(user.id)), mfaPassed };

    return {
      token: rawToken,
      cookieName: SESSION_COOKIE,
      expiresAt,
      user: sessionUser,
      sessionId: session.id,
    };
  }

  async logout(token: string | null) {
    if (!token) return { ok: true };
    const tokenHash = hashToken(token);
    await prisma.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async verifyContact(token: string) {
    const tokenHash = hashToken(token);
    const record = await prisma.verificationToken.findUnique({
      where: { tokenHash },
    });
    if (
      !record ||
      record.purpose !== "EMAIL_VERIFY" ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Invalid or expired verification token",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      if (record.userId) {
        await tx.user.update({
          where: { id: record.userId },
          data: {
            emailVerifiedAt: new Date(),
            status: "ACTIVE",
          },
        });
        await tx.reseller.updateMany({
          where: { ownerUserId: record.userId },
          data: { status: "ACTIVE" },
        });
      }
    });

    return { verified: true };
  }

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    // Always return success to avoid account enumeration
    if (!user) {
      return { accepted: true, notificationSimulated: true };
    }

    const raw = generateOpaqueToken();
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        purpose: "PASSWORD_RESET",
        subject: user.email,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await this.notifications.send({
      channel: "email",
      to: email,
      subject: "Reset your Advo TZ password",
      body: `Password reset token (dev/fake transport): ${raw}`,
      dedupKey: `reset:${user.id}:${Date.now()}`,
    });

    return {
      accepted: true,
      notificationSimulated: true,
      ...(process.env.NODE_ENV !== "production"
        ? { devResetToken: raw }
        : {}),
    };
  }

  async resetPassword(input: ResetPasswordInput) {
    const tokenHash = hashToken(input.token);
    const record = await prisma.verificationToken.findUnique({
      where: { tokenHash },
    });
    if (
      !record ||
      record.purpose !== "PASSWORD_RESET" ||
      record.usedAt ||
      record.expiresAt < new Date() ||
      !record.userId
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Invalid or expired reset token",
      });
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });

    await prisma.$transaction(async (tx) => {
      const consumed = await tx.verificationToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: "Invalid or expired reset token",
        });
      }
      await tx.user.update({
        where: { id: record.userId! },
        data: { passwordHash },
      });
      await tx.authSession.updateMany({
        where: { userId: record.userId!, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return { reset: true };
  }

  async createAgent(adminUserId: string, input: CreateAgentInput) {
    const code = input.referralCode.toUpperCase();
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { phone: input.phone }],
      },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: "User with this email or phone already exists",
      });
    }

    const codeTaken = await prisma.agent.findUnique({
      where: { referralCode: code },
    });
    if (codeTaken) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: "Referral code already in use",
      });
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          role: "AGENT",
          email: input.email,
          phone: input.phone,
          name: input.name,
          passwordHash,
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      });
      const agent = await tx.agent.create({
        data: {
          userId: user.id,
          referralCode: code,
          status: "ACTIVE",
        },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: adminUserId,
          action: "agent.created",
          targetType: "Agent",
          targetId: agent.id,
          reason: "Admin-created Agent account",
        },
      });
      return { user, agent };
    });

    return {
      agentId: created.agent.id,
      userId: created.user.id,
      referralCode: created.agent.referralCode,
    };
  }

  async createInvitation(actor: RequestActor, input: CreateInvitationInput) {
    if (actor.role !== UserRole.AGENT || !actor.agentId) {
      throw new UnauthorizedException({
        code: ErrorCode.FORBIDDEN,
        message: "Only Agents can create invitations",
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { phone: input.phone }] },
    });
    if (existingUser) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: "A user with this contact already exists",
      });
    }

    const rawToken = generateOpaqueToken();
    const created = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          agentId: actor.agentId!,
          businessName: input.businessName,
          contactName: input.contactName,
          email: input.email,
          phone: input.phone,
          consentAt: new Date(),
          status: "INVITED",
        },
      });
      const invitation = await tx.resellerInvitation.create({
        data: {
          leadId: lead.id,
          agentId: actor.agentId!,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      return { lead, invitation };
    });

    await this.notifications.send({
      channel: "email",
      to: input.email,
      subject: "You are invited to Advo TZ",
      body: `Invitation token (dev/fake transport): ${rawToken}`,
      dedupKey: `invite:${created.invitation.id}`,
    });

    return {
      invitationId: created.invitation.id,
      leadId: created.lead.id,
      expiresAt: created.invitation.expiresAt.toISOString(),
      notificationSimulated: true,
      ...(process.env.NODE_ENV !== "production"
        ? { devInvitationToken: rawToken }
        : {}),
    };
  }

  async previewInvitation(token: string) {
    const invitation = await this.findValidInvitation(token);
    return {
      businessName: invitation.lead.businessName,
      contactName: invitation.lead.contactName,
      email: invitation.lead.email,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async acceptInvitation(input: AcceptInvitationInput) {
    const invitation = await this.findValidInvitation(input.token);
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    const slug = slugifyBusinessName(invitation.lead.businessName);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: {
          OR: [
            { email: invitation.lead.email },
            { phone: invitation.lead.phone },
          ],
        },
      });
      if (existing) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: "Account already exists for this invitation contact",
        });
      }

      const user = await tx.user.create({
        data: {
          role: "RESELLER",
          email: invitation.lead.email,
          phone: invitation.lead.phone,
          name: input.ownerName,
          passwordHash,
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      });

      const reseller = await tx.reseller.create({
        data: {
          ownerUserId: user.id,
          businessName: invitation.lead.businessName,
          slug,
          status: "ACTIVE",
          registrationSource: "AGENT_INVITE",
          onboardingStep: "PROFILE",
        },
      });

      await tx.referralAttribution.create({
        data: {
          resellerId: reseller.id,
          agentId: invitation.agentId,
          source: AttributionSource.AGENT_INVITATION,
        },
      });

      await tx.resellerInvitation.update({
        where: { id: invitation.id },
        data: {
          acceptedAt: new Date(),
          acceptedResellerId: reseller.id,
        },
      });

      await tx.lead.update({
        where: { id: invitation.leadId },
        data: { status: "ACCEPTED" },
      });

      // Mark invitation token used via VerificationToken table isn't needed —
      // acceptedAt prevents reuse.
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: "invitation.accepted",
          targetType: "Reseller",
          targetId: reseller.id,
          metadata: { agentId: invitation.agentId, leadId: invitation.leadId },
        },
      });

      return { user, reseller };
    });

    return {
      userId: result.user.id,
      resellerId: result.reseller.id,
      attributedAgentId: invitation.agentId,
    };
  }

  async me(userId: string): Promise<SessionUser> {
    return this.toSessionUser(userId);
  }

  /**
   * Revokes the caller's impersonated session. Safe to call more than once.
   *
   * The audit entry is written against the Admin who started it, so the record
   * survives even after the reseller changes their own password.
   */
  async endImpersonation(sessionId: string, adminUserId: string) {
    const session = await prisma.authSession.findUnique({
      where: { id: sessionId },
      include: { user: { select: { reseller: { select: { id: true } }, agent: { select: { id: true } } } } },
    });
    if (!session || !session.impersonatedByUserId || session.revokedAt) return { ok: true };

    const resellerId = session.user.reseller?.id ?? null;
    const agentId = session.user.agent?.id ?? null;
    // Name the audit row after whoever the Admin was actually acting as.
    const target = agentId && !resellerId ? { type: "Agent", id: agentId } : { type: "Reseller", id: resellerId };
    const action = target.type === "Agent" ? "agent.impersonation_ended" : "reseller.impersonation_ended";

    await prisma.$transaction(async (tx) => {
      await tx.authSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({
        data: {
          actorUserId: adminUserId,
          action,
          targetType: target.type,
          targetId: target.id,
          resellerId,
          metadata: { sessionId },
        },
      });
    });
    return { ok: true };
  }

  override async resolveSession(token: string): Promise<RequestActor | null> {
    const tokenHash = hashToken(token);
    const session = await prisma.authSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return null;
    }
    if (
      session.user.status === "SUSPENDED" ||
      session.user.status === "CLOSED"
    ) {
      return null;
    }

    const idleSeconds = Number(process.env.AUTH_SESSION_IDLE_SECONDS ?? 43200);
    if (idleSeconds > 0 && session.lastSeenAt) {
      const idleMs = idleSeconds * 1000;
      if (Date.now() - session.lastSeenAt.getTime() > idleMs) {
        await prisma.authSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        return null;
      }
    }

    await prisma.authSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    const user = await this.toSessionUser(session.userId);
    // Local development convenience: when Admin MFA is switched off, an Admin
    // session counts as MFA-passed even if it was created while the challenge
    // was still on. Without this, an existing Admin session keeps dead-ending
    // on the dashboard's MFA wall until the browser cookie is cleared.
    // `adminMfaRequired()` is hard-wired to `true` in production, so this can
    // never open a production Admin session.
    const mfaPassed =
      session.mfaPassed || (user.role === UserRole.ADMIN && !adminMfaRequired());
    return {
      ...user,
      mfaPassed,
      sessionId: session.id,
      impersonation: await this.impersonationOf(session.impersonatedByUserId, session.impersonationReason, session.createdAt),
    };
  }

  /**
   * Resolves who started an impersonated session.
   *
   * Returns `null` for ordinary sessions. A missing Admin row still reports the id,
   * so the banner can warn rather than silently pretending the session is normal.
   */
  private async impersonationOf(
    adminUserId: string | null,
    reason: string | null,
    startedAt: Date,
  ): Promise<Impersonation | null> {
    if (!adminUserId) return null;
    const admin = await prisma.user.findUnique({ where: { id: adminUserId }, select: { email: true } });
    return {
      adminUserId,
      adminEmail: admin?.email ?? null,
      reason,
      startedAt: startedAt.toISOString(),
    };
  }

  /** Step 1 of TOTP enrollment: store a pending secret (not enabled until a code verifies). */
  async setupMfa(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabled) {
      throw new ConflictException({ code: ErrorCode.CONFLICT, message: "MFA is already enabled" });
    }
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: userId }, data: { mfaSecretEnc: encryptSecret(secret) } });
    const label = encodeURIComponent(`Advo TZ:${user.email}`);
    return { secret, otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=Advo%20TZ&digits=6&period=30` };
  }

  async enableMfa(userId: string, sessionId: string, code: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecretEnc) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: "Start MFA setup first" });
    }
    if (!(await consumeTotp(user.id, user.mfaSecretEnc, code, user.role))) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: "Invalid authentication code" });
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } }),
      prisma.authSession.update({ where: { id: sessionId }, data: { mfaPassed: true } }),
      prisma.authSession.updateMany({ where: { userId, id: { not: sessionId }, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.auditEvent.create({ data: { actorUserId: userId, action: "auth.mfa_enabled", targetType: "User", targetId: userId } }),
    ]);
    return { mfaEnabled: true };
  }

  async bootstrapAdmin(input: {
    email: string;
    password: string;
    name: string;
  }) {
    const existingAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
    });
    if (existingAdmin) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: "An Admin already exists. Bootstrap refused.",
      });
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });

    const user = await prisma.user.create({
      data: {
        role: "ADMIN",
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        action: "admin.bootstrapped",
        targetType: "User",
        targetId: user.id,
        reason: "Explicit bootstrap script",
      },
    });

    return { userId: user.id, email: user.email };
  }

  private async findValidInvitation(token: string) {
    const invitation = await prisma.resellerInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { lead: true },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt < new Date()
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Invalid or expired invitation",
      });
    }
    return invitation;
  }

  private async toSessionUser(userId: string): Promise<SessionUser> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { reseller: true, agent: true },
    });

    return {
      id: user.id,
      role: user.role as SessionUser["role"],
      email: user.email,
      name: user.name,
      status: user.status as SessionUser["status"],
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      resellerId: user.reseller?.id ?? null,
      agentId: user.agent?.id ?? null,
      mfaEnabled: user.mfaEnabled,
      mfaPassed: false,
    };
  }
}

export type { Prisma };
