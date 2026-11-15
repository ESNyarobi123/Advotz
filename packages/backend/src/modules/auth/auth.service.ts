import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import {
  AttributionSource,
  ErrorCode,
  UserRole,
  UserStatus,
  type AcceptInvitationInput,
  type CompleteGoogleSignupInput,
  type CreateAgentInput,
  type CreateInvitationInput,
  type CreateResellerInput,
  type Impersonation,
  type LoginInput,
  type RegisterAgentInput,
  type RegisterResellerInput,
  type RequestRegistrationOtpInput,
  type ResetPasswordInput,
  type SessionUser,
  type VerifyRegistrationOtpInput,
} from "@advo/contracts";
import { prisma, type Prisma } from "@advo/db";
import {
  constantTimeEqualHex,
  decryptSecret,
  encryptSecret,
  generateNumericOtp,
  generateOpaqueToken,
  generateTotpSecret,
  hashToken,
  isDevFixedOtp,
  matchTotpStep,
  otpCodeHash,
  readHandoff,
  signHandoff,
  slugifyBusinessName,
} from "../../common/crypto.js";
import { badRequest, tooManyRequests } from "../../common/errors.js";
import {
  adminMfaRequired,
  AuthLookup,
  type RequestActor,
} from "../../common/guards/session.guard.js";
import { isProduction } from "../../common/providers.js";
import { sendMail, sendOtpEmail } from "../notifications/mail.service.js";
import type { GoogleProfile } from "./google-oauth.js";

const SESSION_COOKIE = "advo_session";

/**
 * Self-registration must prove the email address before an account exists.
 *
 * On by default everywhere. `AUTH_REGISTRATION_OTP_REQUIRED=false` is an
 * explicit escape hatch for an environment where mail is deliberately not
 * configured (an internal test stack), never a silent production default.
 */
export function registrationOtpRequired(): boolean {
  return process.env.AUTH_REGISTRATION_OTP_REQUIRED !== "false";
}

const DEFAULT_OTP_TTL_SECONDS = 10 * 60;
const DEFAULT_OTP_RESEND_SECONDS = 60;
const DEFAULT_OTP_MAX_ATTEMPTS = 5;
const DEFAULT_OTP_MAX_PER_HOUR = 6;
const REGISTRATION_TICKET_TTL_SECONDS = 30 * 60;
const PASSWORD_RESET_TTL_SECONDS = 15 * 60;

/** Purpose string for the signed Google hand-off, and how long it stays valid. */
const GOOGLE_SIGNUP_HANDOFF = "google-signup";
export const GOOGLE_SIGNUP_TTL_SECONDS = 30 * 60;

function positiveEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function otpTtlSeconds(): number {
  return positiveEnvInt("AUTH_OTP_TTL_SECONDS", DEFAULT_OTP_TTL_SECONDS);
}
function otpResendSeconds(): number {
  return positiveEnvInt("AUTH_OTP_RESEND_SECONDS", DEFAULT_OTP_RESEND_SECONDS);
}
function otpMaxAttempts(): number {
  return positiveEnvInt("AUTH_OTP_MAX_ATTEMPTS", DEFAULT_OTP_MAX_ATTEMPTS);
}
function otpMaxPerHour(): number {
  return positiveEnvInt("AUTH_OTP_MAX_PER_HOUR", DEFAULT_OTP_MAX_PER_HOUR);
}

type OtpPurposeValue = "REGISTER_RESELLER" | "REGISTER_AGENT" | "PASSWORD_RESET";

type IssuedOtp = {
  code: string;
  challengeId: string;
  expiresAt: Date;
  expiresInSeconds: number;
  resendAfterSeconds: number;
};

function otpPurposeForRole(role: RequestRegistrationOtpInput["role"]): OtpPurposeValue {
  return role === "AGENT" ? "REGISTER_AGENT" : "REGISTER_RESELLER";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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
  /**
   * Issues a fresh six-digit code and invalidates any code still open for the
   * same address and purpose.
   *
   * Two guards run before a send: a short cooldown (a user can ask once a
   * minute) and an hourly ceiling (six codes), both enforced from the challenge
   * table rather than memory so every API replica agrees.
   */
  private async issueOtpChallenge(input: {
    purpose: OtpPurposeValue;
    subject: string;
    userId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }): Promise<IssuedOtp> {
    const subject = normalizeEmail(input.subject);
    const now = Date.now();
    const resendAfterSeconds = otpResendSeconds();
    const last = await prisma.otpChallenge.findFirst({
      where: { purpose: input.purpose, subject },
      orderBy: { createdAt: "desc" },
      select: { lastSentAt: true },
    });
    if (last) {
      const waitMs = resendAfterSeconds * 1000 - (now - last.lastSentAt.getTime());
      if (waitMs > 0) {
        tooManyRequests(`Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code.`);
      }
    }

    const hourAgo = new Date(now - 60 * 60 * 1000);
    const issuedThisHour = await prisma.otpChallenge.count({
      where: { purpose: input.purpose, subject, createdAt: { gte: hourAgo } },
    });
    if (issuedThisHour >= otpMaxPerHour()) {
      tooManyRequests("Too many codes requested for this address. Try again in an hour.");
    }

    const code = generateNumericOtp();
    const ttlSeconds = otpTtlSeconds();
    const expiresAt = new Date(now + ttlSeconds * 1000);
    const challenge = await prisma.$transaction(async (tx) => {
      // Any code still open for this address stops working the moment a new one
      // is issued, so two live codes can never both be valid.
      await tx.otpChallenge.updateMany({
        where: { purpose: input.purpose, subject, consumedAt: null },
        data: { consumedAt: new Date(now) },
      });
      return tx.otpChallenge.create({
        data: {
          purpose: input.purpose,
          subject,
          codeHash: otpCodeHash(input.purpose, subject, code),
          maxAttempts: otpMaxAttempts(),
          expiresAt,
          userId: input.userId ?? null,
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        },
      });
    });

    return {
      code,
      challengeId: challenge.id,
      expiresAt,
      expiresInSeconds: ttlSeconds,
      resendAfterSeconds,
    };
  }

  /**
   * Checks an OTP and burns it on success.
   *
   * A wrong code costs an attempt; running out of attempts locks the challenge
   * and the caller must request a new code. Nonce comparison is constant-time
   * so the response time cannot be used to narrow the code down.
   */
  private async consumeOtpChallenge(purpose: OtpPurposeValue, subjectInput: string, code: string): Promise<void> {
    const subject = normalizeEmail(subjectInput);
    const challenge = await prisma.otpChallenge.findFirst({
      where: { purpose, subject, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge) {
      badRequest("This code has expired or was already used. Request a new one.");
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      tooManyRequests("Too many incorrect attempts. Request a new code.");
    }

    const matches = constantTimeEqualHex(
      challenge.codeHash,
      otpCodeHash(purpose, subject, code),
    );
    if (!matches) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      const left = Math.max(0, challenge.maxAttempts - challenge.attempts - 1);
      badRequest(
        left > 0
          ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`
          : "Incorrect code. Request a new one.",
      );
    }

    const consumed = await prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      badRequest("This code was already used. Request a new one.");
    }
  }

  /**
   * Burns a registration ticket inside the account-creating transaction.
   *
   * The ticket is bound to the email and the role that were verified, so a
   * ticket issued for a reseller cannot be replayed to open an agent account
   * (or vice versa), and cannot be used after the account already exists.
   */
  private async consumeRegistrationTicket(
    tx: Prisma.TransactionClient,
    input: { token: string; email: string; role: "RESELLER" | "AGENT" },
  ): Promise<void> {
    const record = await tx.verificationToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
    });
    const metadata = (record?.metadata ?? {}) as { role?: string };
    const invalid =
      !record ||
      record.purpose !== "REGISTRATION_VERIFY" ||
      normalizeEmail(record.subject) !== normalizeEmail(input.email) ||
      record.usedAt !== null ||
      record.expiresAt < new Date() ||
      metadata.role !== input.role;
    if (invalid) {
      badRequest("Email verification has expired. Verify your email address again.");
    }

    const consumed = await tx.verificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) {
      badRequest("Email verification has expired. Verify your email address again.");
    }
  }

  /** Step 1 of self-registration: send the proof-of-email code. */
  async requestRegistrationOtp(input: RequestRegistrationOtpInput) {
    const email = normalizeEmail(input.email);
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: "An account with this email already exists. Sign in or reset your password instead.",
      });
    }

    const purpose = otpPurposeForRole(input.role);
    const challenge = await this.issueOtpChallenge({ purpose, subject: email });

    try {
      const sent = await sendOtpEmail({
        to: email,
        code: challenge.code,
        purpose,
        expiresInMinutes: Math.max(1, Math.round(challenge.expiresInSeconds / 60)),
        dedupKey: `otp:${purpose}:${challenge.challengeId}`,
      });
      return {
        accepted: true,
        email,
        role: input.role,
        expiresInSeconds: challenge.expiresInSeconds,
        resendAfterSeconds: challenge.resendAfterSeconds,
        delivery: sent.simulated ? ("simulated" as const) : ("email" as const),
        ...(isProduction() ? {} : { devOtp: challenge.code }),
      };
    } catch {
      // A code nobody received must not stay usable.
      await prisma.otpChallenge.updateMany({
        where: { id: challenge.challengeId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      throw new ServiceUnavailableException({
        code: ErrorCode.INTERNAL_ERROR,
        message: "We could not send the code right now. Check the mail settings and try again.",
      });
    }
  }

  /** Step 2: exchange a correct code for a short-lived registration ticket. */
  async verifyRegistrationOtp(input: VerifyRegistrationOtpInput) {
    const email = normalizeEmail(input.email);
    const purpose = otpPurposeForRole(input.role);
    await this.consumeOtpChallenge(purpose, email, input.code);

    const verificationToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + REGISTRATION_TICKET_TTL_SECONDS * 1000);
    await prisma.verificationToken.create({
      data: {
        purpose: "REGISTRATION_VERIFY",
        subject: email,
        tokenHash: hashToken(verificationToken),
        expiresAt,
        metadata: { role: input.role },
      },
    });

    return { verificationToken, expiresAt, email, role: input.role };
  }

  async registerReseller(
    input: RegisterResellerInput,
    options: { requireEmailVerification?: boolean } = {},
  ) {
    if (options.requireEmailVerification && !input.verificationToken) {
      badRequest("Verify your email address before creating your account. Request a code first.");
    }

    const email = normalizeEmail(input.email);
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email }, ...(input.phone ? [{ phone: input.phone }] : [])],
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
    const slug = slugifyBusinessName(input.businessName);

    const result = await prisma.$transaction(async (tx) => {
      // Inside the transaction on purpose: if account creation fails, the
      // ticket is not burned and the person can retry with the same proof.
      if (input.verificationToken) {
        await this.consumeRegistrationTicket(tx, {
          token: input.verificationToken,
          email,
          role: "RESELLER",
        });
      }

      const user = await tx.user.create({
        data: {
          role: "RESELLER",
          email,
          phone: input.phone,
          name: input.ownerName,
          passwordHash,
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      });

      const reseller = await tx.reseller.create({
        data: {
          ownerUserId: user.id,
          businessName: input.businessName,
          slug,
          status: "ACTIVE",
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

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: "reseller.registered",
          targetType: "Reseller",
          targetId: reseller.id,
          metadata: {
            hasReferral: Boolean(agentId),
            source: "SELF",
            emailVerifiedByOtp: Boolean(input.verificationToken),
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

    return {
      userId: result.user.id,
      resellerId: result.reseller.id,
      slug: result.reseller.slug,
      verificationRequired: false,
    };
  }

  async registerAgent(
    input: RegisterAgentInput,
    options: { requireEmailVerification?: boolean } = {},
  ) {
    if (options.requireEmailVerification && !input.verificationToken) {
      badRequest("Verify your email address before creating your account. Request a code first.");
    }

    const email = normalizeEmail(input.email);
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email }, ...(input.phone ? [{ phone: input.phone }] : [])],
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

    /**
     * With a verified OTP ticket the account is usable immediately — the email
     * was already proven before the account existed. A direct internal call
     * without a ticket keeps the older email-link flow so seeded/demo data and
     * existing service callers still work.
     */
    const verifiedByOtp = Boolean(input.verificationToken);
    const verifyToken = verifiedByOtp ? null : generateOpaqueToken();
    const verifyHash = verifyToken ? hashToken(verifyToken) : null;

    const result = await prisma.$transaction(async (tx) => {
      if (input.verificationToken) {
        await this.consumeRegistrationTicket(tx, {
          token: input.verificationToken,
          email,
          role: "AGENT",
        });
      }

      const user = await tx.user.create({
        data: {
          role: "AGENT",
          email,
          phone: input.phone,
          name: input.name,
          passwordHash,
          status: verifiedByOtp ? "ACTIVE" : "PENDING_VERIFICATION",
          ...(verifiedByOtp ? { emailVerifiedAt: new Date() } : {}),
        },
      });

      const agent = await tx.agent.create({
        data: {
          userId: user.id,
          referralCode: code,
          status: "ACTIVE",
        },
      });

      if (verifyHash) {
        await tx.verificationToken.create({
          data: {
            userId: user.id,
            purpose: "EMAIL_VERIFY",
            subject: user.email,
            tokenHash: verifyHash,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: "agent.registered",
          targetType: "Agent",
          targetId: agent.id,
          metadata: { referralCode: code, source: "SELF", emailVerifiedByOtp: verifiedByOtp },
        },
      });

      return { user, agent };
    });

    if (verifyToken) {
      await sendMail({
        to: email,
        subject: "Verify your Advo TZ Agent account",
        text: [
          "Hello,",
          "Use the verification token below to confirm your Advo TZ Agent account.",
          verifyToken,
          "If you did not create this account, ignore this message.",
        ].join("\n\n"),
        template: "agent.verify_email",
        dedupKey: `verify:${result.user.id}`,
        recipientUserId: result.user.id,
        bodyPreview: "Agent email verification token sent (token not stored).",
      });
    }

    return {
      userId: result.user.id,
      agentId: result.agent.id,
      referralCode: result.agent.referralCode,
      verificationRequired: !verifiedByOtp,
      notificationSimulated: !verifiedByOtp,
      ...(!isProduction() && verifyToken
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

    // When Admin MFA is switched off (`ADMIN_MFA_REQUIRED=false`) skip the code
    // challenge entirely, so an Admin reaches the dashboard with just email and
    // password. The default is on, in every environment.
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

    const session = await this.issueSession(user.id, meta, sessionTtlSeconds, {
      mfaPassed,
      auditMetadata: { mfaPassed, provider: "password" },
    });

    return session;
  }

  /**
   * Google's answer for an account that already exists.
   *
   * Google has proved the mailbox, which is the same proof the OTP step gives,
   * so a reseller still sitting in `PENDING_VERIFICATION` becomes active here.
   * Admins are deliberately excluded: their accounts require the password plus a
   * TOTP code, and an OAuth redirect is not a place to weaken that.
   */
  async googleSignIn(
    profile: GoogleProfile,
    meta: { userAgent?: string; ipAddress?: string },
    sessionTtlSeconds: number,
  ) {
    if (!profile.emailVerified) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHENTICATED,
        message: "Google has not verified this email address. Use the email and password form instead.",
      });
    }

    const email = normalizeEmail(profile.email);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // No row yet: carry the Google-verified identity into the sign-up form
      // that still needs a phone number and the kind of account to open.
      const ticket = signHandoff(
        GOOGLE_SIGNUP_HANDOFF,
        { email, name: profile.name, sub: profile.sub },
        GOOGLE_SIGNUP_TTL_SECONDS,
      );
      return { kind: "signup_required" as const, ticket, email, name: profile.name };
    }

    this.assertGoogleAllowed(user);

    if (!user.emailVerifiedAt) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
        await tx.reseller.updateMany({
          where: { ownerUserId: user.id, status: "PENDING_VERIFICATION" },
          data: { status: "ACTIVE" },
        });
      });
    }

    const session = await this.issueSession(user.id, meta, sessionTtlSeconds, {
      auditMetadata: { provider: "google", mfaPassed: false },
    });

    return { kind: "signed_in" as const, ...session };
  }

  /**
   * Creates the account behind a Google-verified email.
   *
   * The person chose reseller or agent, gave a phone number, and (for a reseller)
   * a business name. Everything else — email, name, and the fact that the mailbox
   * is real — came from Google moments ago inside the signed ticket.
   */
  async completeGoogleSignup(
    input: CompleteGoogleSignupInput,
    meta: { userAgent?: string; ipAddress?: string },
    sessionTtlSeconds: number,
  ) {
    const payload = readHandoff<{ email?: string; name?: string; sub?: string }>(
      GOOGLE_SIGNUP_HANDOFF,
      input.ticket,
    );
    const email = payload?.email ? normalizeEmail(payload.email) : "";
    if (!email) {
      badRequest("This Google sign-up has expired. Press \"Continue with Google\" again.");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Two tabs, or the account was created between the redirect and the submit.
      this.assertGoogleAllowed(existing);
      const session = await this.issueSession(existing.id, meta, sessionTtlSeconds, {
        auditMetadata: { provider: "google", linked: true },
      });
      return {
        kind: "signed_in" as const,
        ...session,
        resellerId: null,
        agentId: null,
        referralCode: null,
      };
    }

    const phoneOwner = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (phoneOwner) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: "That phone number is already used by another account.",
      });
    }

    const name = (payload?.name ?? "").trim().slice(0, 120) || email.split("@")[0] || "Advo user";
    const isReseller = input.accountType === UserRole.RESELLER;
    const businessName = isReseller ? (input.businessName ?? "").trim() : null;
    if (isReseller && !businessName) {
      badRequest("Tell us the name customers will see.", "VALIDATION_ERROR", [
        { path: "businessName", message: "Tell us the name customers will see." },
      ]);
    }

    let referringAgentId: string | null = null;
    if (isReseller && input.referralCode) {
      const agent = await prisma.agent.findUnique({
        where: { referralCode: input.referralCode.toUpperCase() },
      });
      if (!agent || agent.status !== "ACTIVE") {
        badRequest("Invalid or inactive referral code");
      }
      referringAgentId = agent.id;
    }

    const agentCode = isReseller ? null : await this.allocateAgentCode(input.referralCode, name);
    // No password was chosen. The hash is of a random throwaway secret, so the
    // account can only ever be entered through Google unless the person later
    // sets a password through the reset flow.
    const passwordHash = await argon2.hash(generateOpaqueToken(32), { type: argon2.argon2id });
    const slug = isReseller ? slugifyBusinessName(businessName!) : null;

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          role: isReseller ? "RESELLER" : "AGENT",
          email,
          phone: input.phone,
          name,
          passwordHash,
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      });

      if (isReseller) {
        const reseller = await tx.reseller.create({
          data: {
            ownerUserId: user.id,
            businessName: businessName!,
            slug: slug!,
            status: "ACTIVE",
            registrationSource: "SELF",
            onboardingStep: "PROFILE",
          },
        });

        if (referringAgentId) {
          await tx.referralAttribution.create({
            data: { resellerId: reseller.id, agentId: referringAgentId, source: "SELF_REFERRAL_CODE" },
          });
        }

        await tx.auditEvent.create({
          data: {
            actorUserId: user.id,
            action: "reseller.registered",
            targetType: "Reseller",
            targetId: reseller.id,
            metadata: {
              hasReferral: Boolean(referringAgentId),
              source: "SELF",
              provider: "google",
              emailVerifiedByGoogle: true,
            },
          },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: "reseller.registered",
            aggregateType: "Reseller",
            aggregateId: reseller.id,
            payload: { resellerId: reseller.id, userId: user.id, agentId: referringAgentId },
          },
        });

        return { user, resellerId: reseller.id, agentId: null };
      }

      const agent = await tx.agent.create({
        data: { userId: user.id, referralCode: agentCode!, status: "ACTIVE" },
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: "agent.registered",
          targetType: "Agent",
          targetId: agent.id,
          metadata: { referralCode: agentCode!, source: "SELF", provider: "google", emailVerifiedByGoogle: true },
        },
      });

      return { user, resellerId: null, agentId: agent.id };
    });

    const session = await this.issueSession(created.user.id, meta, sessionTtlSeconds, {
      auditMetadata: { provider: "google", registered: true },
    });

    return {
      kind: "signed_in" as const,
      ...session,
      resellerId: created.resellerId,
      agentId: created.agentId,
      referralCode: agentCode,
    };
  }

  /** Shared refusal rules for an existing account reached through Google. */
  private assertGoogleAllowed(user: { id: string; role: string; status: string }) {
    if (user.role === UserRole.ADMIN) {
      throw new UnauthorizedException({
        code: ErrorCode.FORBIDDEN,
        message: "Admin accounts sign in with their password and 2FA code, not Google.",
      });
    }
    if (user.status === "SUSPENDED" || user.status === "CLOSED") {
      throw new UnauthorizedException({
        code: ErrorCode.FORBIDDEN,
        message: "Account is not allowed to sign in",
      });
    }
  }

  /**
   * One session row and the cookie payload that points at it.
   *
   * Every entry point (password, Google, finished Google sign-up) goes through
   * here so the TTL, the audit trail and the shape returned to the controller
   * cannot drift apart.
   */
  private async issueSession(
    userId: string,
    meta: { userAgent?: string; ipAddress?: string },
    sessionTtlSeconds: number,
    options: { mfaPassed?: boolean; auditMetadata?: Record<string, unknown> } = {},
  ) {
    const mfaPassed = options.mfaPassed ?? false;
    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000);

    const session = await prisma.authSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        mfaPassed,
      },
    });

    await prisma.auditEvent.create({
      data: {
        actorUserId: userId,
        action: "auth.login",
        targetType: "User",
        targetId: userId,
        metadata: (options.auditMetadata ?? { mfaPassed }) as Prisma.InputJsonValue,
      },
    });

    const user = { ...(await this.toSessionUser(userId)), mfaPassed };
    return { token: rawToken, cookieName: SESSION_COOKIE, expiresAt, user, sessionId: session.id };
  }

  /** Agent referral code that is not already taken. */
  private async allocateAgentCode(preferred: string | undefined, name: string): Promise<string> {
    let code = (preferred || name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)).toUpperCase();
    if (code.length < 4) code = `AGENT${Math.floor(1000 + Math.random() * 9000)}`;

    const existingCode = await prisma.agent.findUnique({ where: { referralCode: code } });
    if (existingCode) {
      if (preferred) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: "This referral code is already taken. Please choose another one.",
        });
      }
      code = `${code.slice(0, 6)}${Math.floor(10 + Math.random() * 90)}`;
    }
    return code;
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

  /**
   * Step 1 of a password reset: email a code, never a link.
   *
   * The response is identical for an unknown address and a known one, so the
   * endpoint cannot be used to enumerate accounts. A cooldown hit is answered
   * with the same envelope for the same reason.
   */
  async startPasswordReset(emailInput: string) {
    const email = normalizeEmail(emailInput);
    const generic = {
      accepted: true,
      otpRequired: true,
      expiresInSeconds: otpTtlSeconds(),
      resendAfterSeconds: otpResendSeconds(),
    };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.status === "CLOSED") return generic;

    let challenge: IssuedOtp;
    try {
      challenge = await this.issueOtpChallenge({
        purpose: "PASSWORD_RESET",
        subject: email,
        userId: user.id,
      });
    } catch (error) {
      // A cooldown must not become an account-existence oracle.
      if (error instanceof HttpException && error.getStatus() === 429) return generic;
      throw error;
    }

    try {
      const sent = await sendOtpEmail({
        to: email,
        code: challenge.code,
        purpose: "PASSWORD_RESET",
        expiresInMinutes: Math.max(1, Math.round(challenge.expiresInSeconds / 60)),
        recipientName: user.name,
        userId: user.id,
        dedupKey: `otp:PASSWORD_RESET:${challenge.challengeId}`,
      });
      return {
        ...generic,
        expiresInSeconds: challenge.expiresInSeconds,
        delivery: sent.simulated ? ("simulated" as const) : ("email" as const),
        ...(isProduction() ? {} : { devOtp: challenge.code }),
      };
    } catch {
      await prisma.otpChallenge.updateMany({
        where: { id: challenge.challengeId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return generic;
    }
  }

  /**
   * Step 2: a correct code is exchanged for a single-use reset token.
   *
   * Issuing the token here (rather than in the email) is what keeps the reset
   * two-factor: possession of the mailbox alone gets a code, and only the code
   * exchange produces the credential that can change the password.
   */
  async verifyPasswordResetOtp(emailInput: string, code: string) {
    const email = normalizeEmail(emailInput);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.status === "CLOSED") {
      badRequest("Invalid or expired code. Request a new one.");
    }

    await this.consumeOtpChallenge("PASSWORD_RESET", email, code);

    const resetToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_SECONDS * 1000);

    await prisma.$transaction(async (tx) => {
      // One live reset token per account: asking again invalidates the previous.
      await tx.verificationToken.updateMany({
        where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.verificationToken.create({
        data: {
          userId: user.id,
          purpose: "PASSWORD_RESET",
          subject: email,
          tokenHash: hashToken(resetToken),
          expiresAt,
          metadata: { otpVerified: true },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: "auth.password_reset_verified",
          targetType: "User",
          targetId: user.id,
        },
      });
    });

    return { resetToken, expiresAt, email };
  }

  async resetPassword(input: ResetPasswordInput) {
    const tokenHash = hashToken(input.token);
    const record = await prisma.verificationToken.findUnique({
      where: { tokenHash },
    });
    const metadata = (record?.metadata ?? {}) as { otpVerified?: boolean };
    if (
      !record ||
      record.purpose !== "PASSWORD_RESET" ||
      metadata.otpVerified !== true ||
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
      // A password change ends every existing session, including an attacker's.
      await tx.authSession.updateMany({
        where: { userId: record.userId!, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: record.userId,
          action: "auth.password_reset",
          targetType: "User",
          targetId: record.userId,
        },
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

    let notificationSimulated = true;
    try {
      const sent = await sendMail({
        to: input.email,
        subject: "You are invited to Advo TZ",
        text: [
          `Hello ${input.contactName},`,
          `${actor.name} has invited ${input.businessName} to join Advo TZ.`,
          "Use the invitation token below to open your business account.",
          rawToken,
          "The invitation expires in 7 days. If you were not expecting it, ignore this message.",
        ].join("\n\n"),
        template: "reseller.invitation",
        dedupKey: `invite:${created.invitation.id}`,
        bodyPreview: "Reseller invitation token sent (token not stored).",
      });
      notificationSimulated = sent.simulated;
    } catch {
      // The invitation itself is valid even when the mail transport is down;
      // the failed delivery is visible on Admin → Mail.
    }

    return {
      invitationId: created.invitation.id,
      leadId: created.lead.id,
      expiresAt: created.invitation.expiresAt.toISOString(),
      notificationSimulated,
      ...(!isProduction() ? { devInvitationToken: rawToken } : {}),
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
    // When Admin MFA is switched off, an Admin session counts as MFA-passed even
    // if it was created while the challenge was still on. Without this, an
    // existing Admin session keeps dead-ending on the dashboard's MFA wall.
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
