import { Body, Controller, Get, HttpException, Inject, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import {
  acceptInvitationSchema,
  completeGoogleSignupSchema,
  createAgentSchema,
  createInvitationSchema,
  forgotPasswordSchema,
  loginSchema,
  mfaCodeSchema,
  registerAgentSchema,
  registerResellerSchema,
  requestRegistrationOtpSchema,
  resetPasswordSchema,
  UserRole,
  verifyContactSchema,
  verifyPasswordResetOtpSchema,
  verifyRegistrationOtpSchema,
} from "@advo/contracts";
import {
  CurrentUser,
  IMPERSONATION_COOKIE,
  Roles,
  RolesGuard,
  SessionAuthGuard,
  SESSION_COOKIE,
  SkipMfa,
  type RequestActor,
} from "../../common/guards/session.guard.js";
import { clientIp, headerString, parse, type HttpReply, type HttpRequest } from "../../common/http.js";
import { enforceRateLimit } from "../../common/rate-limit.js";
import { readHandoff, signHandoff } from "../../common/crypto.js";
import { AuthService, registrationOtpRequired } from "./auth.service.js";
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  GoogleOAuthError,
  googleOAuthConfig,
  googleOAuthEnabled,
  safeNextPath,
} from "./google-oauth.js";

const GOOGLE_STATE_PURPOSE = "google-state";
const GOOGLE_STATE_TTL_SECONDS = 10 * 60;

/** Landing page per role, mirrored from the web app's `dashboardHomeFor`. */
const ROLE_HOME: Record<string, string> = {
  ADMIN: "/admin",
  AGENT: "/agent",
  RESELLER: "/reseller",
};

function webOrigin(): string {
  return (process.env.WEB_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.AUTH_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
    ...(expires ? { expires } : {}),
  };
}

@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("auth/register")
  async register(@Body() body: unknown, @Req() req: HttpRequest) {
    await enforceRateLimit("register-ip", clientIp(req), 10, 3600);
    return this.auth.registerReseller(parse(registerResellerSchema, body), {
      requireEmailVerification: registrationOtpRequired(),
    });
  }

  @Post("auth/register-agent")
  async registerAgent(@Body() body: unknown, @Req() req: HttpRequest) {
    await enforceRateLimit("register-ip", clientIp(req), 10, 3600);
    return this.auth.registerAgent(parse(registerAgentSchema, body), {
      requireEmailVerification: registrationOtpRequired(),
    });
  }

  /** Self-registration step 1: email a 6-digit proof-of-email code. */
  @Post("auth/register/otp/request")
  async requestRegistrationOtp(@Body() body: unknown, @Req() req: HttpRequest) {
    const input = parse(requestRegistrationOtpSchema, body);
    await enforceRateLimit("register-otp-ip", clientIp(req), 20, 3600);
    return this.auth.requestRegistrationOtp(input);
  }

  /** Self-registration step 2: exchange the code for a single-use ticket. */
  @Post("auth/register/otp/verify")
  async verifyRegistrationOtp(@Body() body: unknown, @Req() req: HttpRequest) {
    const input = parse(verifyRegistrationOtpSchema, body);
    await enforceRateLimit("register-otp-verify-ip", clientIp(req), 30, 3600);
    await enforceRateLimit("register-otp-verify-email", input.email, 15, 3600);
    return this.auth.verifyRegistrationOtp(input);
  }

  @Post("auth/login")
  async login(@Body() body: unknown, @Req() req: HttpRequest, @Res({ passthrough: true }) res: HttpReply) {
    const input = parse(loginSchema, body);
    await enforceRateLimit("login-ip", clientIp(req), 30, 900);
    await enforceRateLimit("login-email", input.email, 10, 900);
    const ttl = Number(process.env.AUTH_SESSION_TTL_SECONDS ?? 86400);
    const result = await this.auth.login(input, { userAgent: headerString(req.headers["user-agent"]), ipAddress: req.ip }, ttl);
    res.setCookie(result.cookieName, result.token, cookieOptions(result.expiresAt));
    return { user: result.user };
  }

  /** Whether the browser should show a working Google button or the "soon" note. */
  @Get("auth/google/status")
  googleStatus() {
    return { enabled: googleOAuthEnabled() };
  }

  /**
   * Step 1 of Google sign-in: send the browser to Google's consent screen.
   *
   * `next` is where a returning account lands, and `intent` only changes the
   * wording on Google's screen. Both travel inside the signed `state`, so the
   * callback trusts them without a server-side session.
   */
  @Get("auth/google/start")
  async googleStart(
    @Query("next") next: string | undefined,
    @Query("intent") intent: string | undefined,
    @Res() res: HttpReply,
  ) {
    const config = googleOAuthConfig();
    if (!config) {
      return res
        .status(302)
        .header("Location", `${webOrigin()}/login?googleError=unavailable`)
        .send();
    }

    const state = signHandoff(
      GOOGLE_STATE_PURPOSE,
      {
        next: safeNextPath(next),
        intent: intent === "register" ? "register" : "login",
        nonce: Math.random().toString(36).slice(2),
      },
      GOOGLE_STATE_TTL_SECONDS,
    );

    return res.status(302).header("Location", buildGoogleAuthUrl(config, state)).send();
  }

  /**
   * Step 2: Google sends the browser back with a one-time code.
   *
   * Success sets the same session cookie a password login sets, then redirects
   * to the role dashboard. A first-time Google account has no phone number or
   * business name yet, so it is redirected to the web form that collects them,
   * carrying a signed ticket instead of a session.
   */
  @Get("auth/google/callback")
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Req() req: HttpRequest,
    @Res() res: HttpReply,
  ) {
    const fail = (reason: string) =>
      res.status(302).header("Location", `${webOrigin()}/login?googleError=${reason}`).send();

    const config = googleOAuthConfig();
    if (!config) return fail("unavailable");
    // `access_denied` means the person closed the Google window on purpose.
    if (oauthError) return fail("cancelled");
    if (!code) return fail("cancelled");

    const statePayload = state
      ? readHandoff<{ next?: string | null; intent?: string }>(GOOGLE_STATE_PURPOSE, state)
      : null;
    if (!statePayload) return fail("expired");

    const ttl = Number(process.env.AUTH_SESSION_TTL_SECONDS ?? 86400);

    try {
      const profile = await exchangeGoogleCode(config, code);
      const result = await this.auth.googleSignIn(
        profile,
        { userAgent: headerString(req.headers["user-agent"]), ipAddress: req.ip },
        ttl,
      );

      if (result.kind === "signed_in") {
        res.setCookie(result.cookieName, result.token, cookieOptions(result.expiresAt));
        const target = safeNextPath(statePayload.next) ?? ROLE_HOME[result.user.role] ?? "/";
        return res.status(302).header("Location", `${webOrigin()}${target}`).send();
      }

      const params = new URLSearchParams({
        ticket: result.ticket,
        email: result.email,
        name: result.name,
      });
      return res
        .status(302)
        .header("Location", `${webOrigin()}/register/google?${params.toString()}`)
        .send();
    } catch (err) {
      if (err instanceof GoogleOAuthError) {
        console.error(`[auth] ${err.message}`);
        return fail("google_failed");
      }
      if (err instanceof HttpException) {
        const message = typeof err.getResponse() === "object" ? JSON.stringify(err.getResponse()) : String(err.getResponse());
        if (/not verified/i.test(message)) return fail("not_verified");
        return fail("not_allowed");
      }
      console.error("[auth] Google callback failed:", err);
      return fail("google_failed");
    }
  }

  /**
   * Step 3 for a first-time Google account: finish the profile.
   *
   * Email and name come from the signed ticket, never from the body, so the
   * request cannot claim a different mailbox than the one Google proved.
   */
  @Post("auth/google/complete")
  async googleComplete(@Body() body: unknown, @Req() req: HttpRequest, @Res({ passthrough: true }) res: HttpReply) {
    await enforceRateLimit("google-complete-ip", clientIp(req), 20, 900);
    const input = parse(completeGoogleSignupSchema, body);
    const ttl = Number(process.env.AUTH_SESSION_TTL_SECONDS ?? 86400);
    const result = await this.auth.completeGoogleSignup(
      input,
      { userAgent: headerString(req.headers["user-agent"]), ipAddress: req.ip },
      ttl,
    );
    res.setCookie(result.cookieName, result.token, cookieOptions(result.expiresAt));
    return {
      user: result.user,
      resellerId: result.resellerId,
      agentId: result.agentId,
      referralCode: result.referralCode ?? null,
    };
  }

  @Post("auth/logout")
  async logout(@Req() req: HttpRequest, @Res({ passthrough: true }) res: HttpReply) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE] ?? null);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  @Post("auth/verify")
  async verify(@Body() body: unknown, @Req() req: HttpRequest) {
    await enforceRateLimit("verify-ip", clientIp(req), 30, 900);
    return this.auth.verifyContact(parse(verifyContactSchema, body).token);
  }

  /** Password reset step 1: always accepted, never reveals whether the email exists. */
  @Post("auth/forgot-password")
  async forgot(@Body() body: unknown, @Req() req: HttpRequest) {
    const input = parse(forgotPasswordSchema, body);
    await enforceRateLimit("forgot-ip", clientIp(req), 10, 900);
    await enforceRateLimit("forgot-email", input.email, 3, 900);
    return this.auth.startPasswordReset(input.email);
  }

  /** Password reset step 2: verify the 6-digit code, receive a reset ticket. */
  @Post("auth/forgot-password/verify-otp")
  async verifyResetOtp(@Body() body: unknown, @Req() req: HttpRequest) {
    const input = parse(verifyPasswordResetOtpSchema, body);
    await enforceRateLimit("forgot-otp-ip", clientIp(req), 30, 900);
    await enforceRateLimit("forgot-otp-email", input.email, 15, 900);
    return this.auth.verifyPasswordResetOtp(input.email, input.code);
  }

  /** Password reset step 3: consume the ticket and set the new password. */
  @Post("auth/reset-password")
  async reset(@Body() body: unknown, @Req() req: HttpRequest) {
    await enforceRateLimit("reset-ip", clientIp(req), 10, 900);
    return this.auth.resetPassword(parse(resetPasswordSchema, body));
  }

  @Get("auth/me")
  @UseGuards(SessionAuthGuard)
  async me(@CurrentUser() actor: RequestActor) {
    return {
      user: {
        ...(await this.auth.me(actor.id)),
        mfaPassed: actor.mfaPassed,
        impersonation: actor.impersonation ?? null,
      },
    };
  }

  /**
   * Leaves impersonation.
   *
   * Deliberately not Admin-gated: while acting as a reseller the caller's role *is*
   * RESELLER, and they still need a way out. It only ever revokes the caller's own
   * impersonated session and clears the dedicated cookie.
   */
  @Post("auth/impersonation/stop")
  @UseGuards(SessionAuthGuard)
  async stopImpersonation(@CurrentUser() actor: RequestActor, @Res({ passthrough: true }) res: HttpReply) {
    if (!actor.impersonation) return { ok: true, impersonating: false };
    await this.auth.endImpersonation(actor.sessionId, actor.impersonation.adminUserId);
    res.clearCookie(IMPERSONATION_COOKIE, { path: "/" });
    return { ok: true, impersonating: false };
  }

  @Post("auth/mfa/setup")
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @SkipMfa()
  async mfaSetup(@CurrentUser() actor: RequestActor) {
    return this.auth.setupMfa(actor.id);
  }

  @Post("auth/mfa/enable")
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @SkipMfa()
  async mfaEnable(@CurrentUser() actor: RequestActor, @Body() body: unknown) {
    await enforceRateLimit("mfa-enable", actor.id, 10, 900);
    return this.auth.enableMfa(actor.id, actor.sessionId, parse(mfaCodeSchema, body).code);
  }

  @Post("admin/agents")
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async createAgent(@CurrentUser() actor: RequestActor, @Body() body: unknown) {
    return this.auth.createAgent(actor.id, parse(createAgentSchema, body));
  }

  @Post("agent/invitations")
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.AGENT)
  async createInvitation(@CurrentUser() actor: RequestActor, @Body() body: unknown) {
    await enforceRateLimit("agent-invite", actor.id, 30, 3600);
    return this.auth.createInvitation(actor, parse(createInvitationSchema, body));
  }

  @Post("auth/invite/preview")
  async previewInvite(@Body() body: unknown, @Req() req: HttpRequest) {
    await enforceRateLimit("invite-preview", clientIp(req), 30, 900);
    const token = typeof body === "object" && body && "token" in body ? String((body as { token: unknown }).token) : "";
    return this.auth.previewInvitation(token);
  }

  @Post("auth/invite/accept")
  async acceptInvite(@Body() body: unknown, @Req() req: HttpRequest) {
    await enforceRateLimit("invite-accept", clientIp(req), 10, 900);
    return this.auth.acceptInvitation(parse(acceptInvitationSchema, body));
  }
}
