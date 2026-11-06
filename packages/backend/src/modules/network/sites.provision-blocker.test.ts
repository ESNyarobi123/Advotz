import { describe, expect, it } from "vitest";
import { ControllerError, SITE_ACCESS_REMEDY, UnsupportedCapabilityError } from "@advo/omada";
import { provisionBlocker } from "./sites.service.js";

describe("site provisioning stops on Controller refusals a retry cannot fix", () => {
  it("turns the Omada permission error into operator guidance", () => {
    const blocker = provisionBlocker(
      new ControllerError(
        "Open API createSite failed (HTTP 200, errorCode -1505)",
        "rejected",
        false,
        -1505,
        "The current user does not have permissions to access this site.",
      ),
    );
    expect(blocker).not.toBeNull();
    expect(blocker!.code).toBe("CONTROLLER_FORBIDDEN");
    expect(blocker!.message).toContain("The current user does not have permissions to access this site.");
    expect(blocker!.message).toContain(SITE_ACCESS_REMEDY);
  });

  it("explains a duplicate site name as a visibility problem, not a bad name", () => {
    const blocker = provisionBlocker(
      new ControllerError(
        "Open API createSite failed (HTTP 200, errorCode -33101)",
        "rejected",
        false,
        -33101,
        "This name already exists. Please enter another name for this site.",
      ),
    );
    expect(blocker).not.toBeNull();
    expect(blocker!.code).toBe("SITE_NAME_CONFLICT");
    expect(blocker!.message).toContain("already exists");
    expect(blocker!.message).toContain(SITE_ACCESS_REMEDY);
  });

  it("leaves transient failures on the retry path", () => {
    expect(provisionBlocker(new ControllerError("Controller request timed out after 45000ms", "timeout", true))).toBeNull();
    expect(provisionBlocker(new ControllerError("Controller network error: ECONNRESET", "network", true))).toBeNull();
    expect(provisionBlocker(new UnsupportedCapabilityError("configureExternalPortal"))).toBeNull();
  });
});
