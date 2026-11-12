import { describe, expect, it } from "vitest";
import { ControllerError, isClientGone } from "./errors.js";

/**
 * A MAC that is not on the site has no session to end, so the Controller answers with a
 * "client does not exist" code instead of acknowledging the request. Treating those codes
 * as failures is what parked manual revokes in `REVOKE_PENDING` forever, so the mapping is
 * pinned here: each client handler uses its own code.
 */
describe("client-scoped Controller answers", () => {
  it.each([-41002, -41004, -41011])("treats %i as a client that is not connected", (code) => {
    const err = new ControllerError(`Open API failed (errorCode ${code})`, "rejected", false, code, "This client does not exist.");
    expect(isClientGone(err)).toBe(true);
  });

  it("does not swallow a real refusal", () => {
    const denied = new ControllerError("no permission", "rejected", false, -1505, "The current user does not have permissions to access this site.");
    expect(isClientGone(denied)).toBe(false);
    expect(isClientGone(new Error("socket hang up"))).toBe(false);
  });
});
