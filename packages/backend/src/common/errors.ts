import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import { ErrorCode } from "@advo/contracts";

export function notFound(message = "Resource not found"): never {
  throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message });
}

export function tenantDenied(message = "Resource not found"): never {
  // Same response as not-found so cross-tenant probes cannot enumerate IDs.
  throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message });
}

export function unauthorized(message = "Authentication required"): never {
  throw new HttpException({ code: ErrorCode.UNAUTHENTICATED, message }, HttpStatus.UNAUTHORIZED);
}

export function forbidden(message = "Not allowed", code: string = ErrorCode.FORBIDDEN): never {
  throw new ForbiddenException({ code, message });
}

export function conflict(message: string, code: string = ErrorCode.CONFLICT): never {
  throw new ConflictException({ code, message });
}

export function badRequest(message: string, code: string = ErrorCode.VALIDATION_ERROR, details?: unknown): never {
  throw new BadRequestException({ code, message, details });
}

export function unprocessable(message: string, code: string): never {
  throw new HttpException({ code, message }, HttpStatus.UNPROCESSABLE_ENTITY);
}

export function tooManyRequests(message = "Too many requests, try again later"): never {
  throw new HttpException({ code: ErrorCode.RATE_LIMITED, message }, HttpStatus.TOO_MANY_REQUESTS);
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
