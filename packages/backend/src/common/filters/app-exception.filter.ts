import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ErrorCode } from "@advo/contracts";
import { ZodError } from "zod";
import { PaymentProviderError } from "@advo/payments";
import { ControllerError, UnsupportedCapabilityError } from "@advo/omada";

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => { send: (body: unknown) => void };
      header?: (key: string) => string | string[] | undefined;
    }>();
    const request = ctx.getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      id?: string;
    }>();

    const requestId =
      (typeof request.id === "string" && request.id) ||
      (typeof request.headers?.["x-request-id"] === "string"
        ? request.headers["x-request-id"]
        : undefined) ||
      cryptoRandom();

    if (exception instanceof ZodError) {
      response.status(HttpStatus.BAD_REQUEST).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Validation failed",
        requestId,
        details: exception.issues,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === "string"
          ? { code: ErrorCode.INTERNAL_ERROR, message: body }
          : (body as Record<string, unknown>);

      response.status(status).send({
        code: payload.code ?? mapStatusToCode(status),
        message: payload.message ?? exception.message,
        requestId,
        details: payload.details,
      });
      return;
    }

    if (exception instanceof PaymentProviderError) {
      const status = exception.kind === "conflict" ? 409 : exception.kind === "validation" ? 400 : 502;
      response.status(status).send({
        code: status === 409 ? ErrorCode.CONFLICT : status === 400 ? ErrorCode.VALIDATION_ERROR : "PAYMENT_PROVIDER_ERROR",
        message: exception.message,
        requestId,
      });
      return;
    }
    if (exception instanceof UnsupportedCapabilityError) {
      response.status(422).send({ code: ErrorCode.CAPABILITY_UNSUPPORTED, message: exception.message, requestId });
      return;
    }
    if (exception instanceof ControllerError) {
      response.status(502).send({ code: ErrorCode.CONTROLLER_UNAVAILABLE, message: exception.message, requestId });
      return;
    }
    if (exception instanceof Error && /not configured/i.test(exception.message)) {
      response.status(503).send({ code: "NOT_CONFIGURED", message: exception.message, requestId });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      code: ErrorCode.INTERNAL_ERROR,
      message: "Internal server error",
      requestId,
    });
  }
}

function mapStatusToCode(status: number): string {
  if (status === 401) return ErrorCode.UNAUTHENTICATED;
  if (status === 403) return ErrorCode.FORBIDDEN;
  if (status === 404) return ErrorCode.NOT_FOUND;
  if (status === 409) return ErrorCode.CONFLICT;
  if (status === 429) return ErrorCode.RATE_LIMITED;
  if (status >= 400 && status < 500) return ErrorCode.VALIDATION_ERROR;
  return ErrorCode.INTERNAL_ERROR;
}

function cryptoRandom(): string {
  return randomBytesHex(16);
}

function randomBytesHex(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
