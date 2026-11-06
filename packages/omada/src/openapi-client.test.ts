import { describe, expect, it } from "vitest";
import { ControllerError } from "./errors.js";
import { OmadaOpenApiClient, openApiContractSchema } from "./openapi-client.js";
import type { ControllerTransport, TransportResponse } from "./transport.js";

const contract = openApiContractSchema.parse({
  controllerVersion: "6.3.0",
  documentSource: "test",
  token: {
    method: "POST",
    path: "/{omadacId}/openapi/v1/token",
    bodyTemplate: { clientId: "{{clientId}}", clientSecret: "{{clientSecret}}" },
    accessTokenPath: "result.accessToken",
    expiresInPath: "result.expiresIn",
  },
  operations: {
    createSite: {
      method: "POST",
      path: "/{omadacId}/openapi/v1/sites",
      bodyTemplate: { name: "{{name}}", timeZone: "{{timezone}}" },
      resultPath: "result.siteId",
      verified: true,
    },
  },
});

function transportReturning(reply: (path: string) => TransportResponse) {
  const calls: Array<{ path: string; timeoutMs?: number }> = [];
  const transport = {
    request: async (_method: string, path: string, opts: { timeoutMs?: number }) => {
      calls.push({ path, timeoutMs: opts.timeoutMs });
      return reply(path);
    },
  } as unknown as ControllerTransport;
  return { transport, calls };
}

const tokenReply: TransportResponse = {
  status: 200,
  headers: {},
  body: { errorCode: 0, result: { accessToken: "token", expiresIn: 3600 } },
};

describe("Omada Open API client failures", () => {
  it("keeps the Controller's own message so an operator can act on it", async () => {
    const { transport } = transportReturning((path) =>
      path.endsWith("/token")
        ? tokenReply
        : {
            status: 200,
            headers: {},
            body: {
              errorCode: -1505,
              msg: "The current user does not have permissions to access this site.",
            },
          },
    );
    const client = new OmadaOpenApiClient(transport, contract, {
      omadacId: "controller",
      clientId: "id",
      clientSecret: "secret",
    });

    const failure = await client
      .call("createSite", { name: "advo-site", timezone: "Africa/Nairobi" })
      .catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(ControllerError);
    const error = failure as ControllerError;
    expect(error.vendorErrorCode).toBe(-1505);
    expect(error.vendorMessage).toBe("The current user does not have permissions to access this site.");
    expect(error.message).toContain("The current user does not have permissions to access this site.");
  });

  it("forwards a widened timeout for operations that provision on the Controller", async () => {
    const { transport, calls } = transportReturning((path) =>
      path.endsWith("/token") ? tokenReply : { status: 200, headers: {}, body: { errorCode: 0, result: { siteId: "s1" } } },
    );
    const client = new OmadaOpenApiClient(transport, contract, {
      omadacId: "controller",
      clientId: "id",
      clientSecret: "secret",
    });

    await client.call("createSite", { name: "advo-site", timezone: "Africa/Nairobi" }, { timeoutMs: 45_000 });

    expect(calls.at(-1)).toMatchObject({ timeoutMs: 45_000 });
  });
});
