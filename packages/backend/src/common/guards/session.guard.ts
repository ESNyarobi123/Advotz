import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ErrorCode, UserRole, type Impersonation, type SessionUser } from "@advo/contracts";

export const ROLES_KEY = "roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const SESSION_COOKIE = "advo_session";
/**
 * Holds the short-lived session an Admin opened to act as a reseller.
 *
 * Kept separate from `SESSION_COOKIE` so the Admin's own session survives: leaving
 * impersonation is just clearing this cookie, with no session juggling.
 */
export const IMPERSONATION_COOKIE = "advo_impersonation";

export type RequestActor = SessionUser & {
  sessionId: string;
  /** Non-null only while an Admin is acting as this user. */
  impersonation?: Impersonation | null;
};

export abstract class AuthLookup {
  abstract resolveSession(token: string): Promise<RequestActor | null>;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestActor => {
    const request = ctx.switchToHttp().getRequest<{ actor?: RequestActor }>();
    if (!request.actor) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHENTICATED,
        message: "Authentication required",
      });
    }
    return request.actor;
  },
);

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(AuthLookup) private readonly authService: AuthLookup) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      cookies?: Record<string, string>;
      headers?: Record<string, string | string[] | undefined>;
      actor?: RequestActor;
    }>();

    const token = extractSessionToken(request);
    if (!token) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHENTICATED,
        message: "Authentication required",
      });
    }

    const actor = await this.authService.resolveSession(token);
    if (!actor) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHENTICATED,
        message: "Session expired or revoked",
      });
    }

    request.actor = actor;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ actor?: RequestActor }>();
    if (!request.actor || !roles.includes(request.actor.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: "Insufficient role",
      });
    }
    const skipMfa = this.reflector.getAllAndOverride<boolean>(SKIP_MFA_KEY, [context.getHandler(), context.getClass()]);
    if (request.actor.role === UserRole.ADMIN && !skipMfa && adminMfaRequired() && !request.actor.mfaPassed) {
      throw new ForbiddenException({
        code: ErrorCode.MFA_REQUIRED,
        message: request.actor.mfaEnabled
          ? "Sign in again with your authentication code"
          : "Enable two-factor authentication before using Admin tools",
      });
    }
    return true;
  }
}

export const SKIP_MFA_KEY = "skipMfa";
/** For MFA enrollment endpoints only. */
export const SkipMfa = () => SetMetadata(SKIP_MFA_KEY, true);

export function adminMfaRequired() {
  // Explicit `false` skips the Admin code challenge in every environment,
  // including production. Anything else keeps the challenge on.
  return process.env.ADMIN_MFA_REQUIRED !== "false";
}

/** Resolves the tenant owned by the actor; never trusts client-supplied IDs. */
export function requireResellerId(actor: RequestActor): string {
  if (actor.role !== UserRole.RESELLER || !actor.resellerId) {
    throw new ForbiddenException({
      code: ErrorCode.TENANT_ACCESS_DENIED,
      message: "Reseller account required",
    });
  }
  return actor.resellerId;
}

export function requireAgentId(actor: RequestActor): string {
  if (actor.role !== UserRole.AGENT || !actor.agentId) {
    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: "Agent account required",
    });
  }
  return actor.agentId;
}

function extractSessionToken(request: {
  cookies?: Record<string, string>;
  headers?: Record<string, string | string[] | undefined>;
}): string | null {
  // The impersonation cookie wins while it exists, so an Admin acting as a reseller
  // sees the reseller's data on every request without losing their own session.
  const impersonation = request.cookies?.[IMPERSONATION_COOKIE];
  if (impersonation) return impersonation;

  const cookieToken = request.cookies?.[SESSION_COOKIE];
  if (cookieToken) return cookieToken;

  const header = request.headers?.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }
  return null;
}
