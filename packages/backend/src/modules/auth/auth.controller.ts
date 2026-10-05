import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import {
  acceptInvitationSchema,
  createAgentSchema,
  createInvitationSchema,
  forgotPasswordSchema,
  loginSchema,
  mfaCodeSchema,
  registerAgentSchema,
  registerResellerSchema,
  resetPasswordSchema,
  UserRole,
  verifyContactSchema,
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
import { AuthService } from "./auth.service.js";

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
    return this.auth.registerReseller(parse(registerResellerSchema, body));
  }

  @Post("auth/register-agent")
  async registerAgent(@Body() body: unknown, @Req() req: HttpRequest) {
    await enforceRateLimit("register-ip", clientIp(req), 10, 3600);
    return this.auth.registerAgent(parse(registerAgentSchema, body));
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

  @Post("auth/forgot-password")
  async forgot(@Body() body: unknown, @Req() req: HttpRequest) {
    const input = parse(forgotPasswordSchema, body);
    await enforceRateLimit("forgot-ip", clientIp(req), 10, 900);
    await enforceRateLimit("forgot-email", input.email, 3, 900);
    return this.auth.forgotPassword(input.email);
  }

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
