import { describe, expect, it, beforeAll } from "vitest";
import { prisma } from "@advo/db";
import { AuthService } from "../auth/auth.service.js";
import { resetTestDatabase } from "../../test/db.js";
import { mailSettingsOverview, saveMailSettings } from "./mail.service.js";

/**
 * The transport carries an optional dedicated mailbox per purpose. These checks
 * pin the parts an Admin can break from the screen: secrets stay encrypted,
 * removing a mailbox really removes it, and a mailbox that logs in as a
 * different account cannot silently reuse someone else's password.
 */
describe("admin mail transport settings", () => {
  const auth = new AuthService();
  let adminId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    const admin = await auth.bootstrapAdmin({
      email: "mail-admin@advo.test",
      password: "AdminSecurePass1",
      name: "Mail Admin",
    });
    adminId = admin.userId;
  });

  it("stores per-purpose mailboxes and never persists their password in clear text", async () => {
    await saveMailSettings(adminId, {
      provider: "smtp",
      fromName: "Advo TZ",
      fromEmail: "support@advo.test",
      replyTo: "support@advo.test",
      smtp: {
        host: "smtp.advo.test",
        port: 465,
        secure: true,
        username: "support@advo.test",
        password: "MainMailboxPass1",
      },
      otpSender: { fromEmail: "otp@advo.test", username: "otp@advo.test", password: "OtpMailboxPass1" },
      securitySender: { fromEmail: "security@advo.test", password: "SecurityMailboxPass1" },
    });

    const { settings } = await mailSettingsOverview();
    expect(settings.provider).toBe("smtp");
    expect(settings.ready).toBe(true);
    expect(settings.otpSender).toEqual({
      fromEmail: "otp@advo.test",
      username: "otp@advo.test",
      passwordConfigured: true,
    });
    expect(settings.securitySender).toEqual({
      fromEmail: "security@advo.test",
      username: "",
      passwordConfigured: true,
    });

    const row = await prisma.systemSetting.findUniqueOrThrow({ where: { key: "mail.settings" } });
    const serialized = JSON.stringify(row.value);
    expect(serialized).not.toContain("OtpMailboxPass1");
    expect(serialized).not.toContain("MainMailboxPass1");
    expect(serialized).not.toContain("SecurityMailboxPass1");
  });

  it("falls back to the main password when a mailbox shares the SMTP login", async () => {
    const saved = await saveMailSettings(adminId, {
      provider: "smtp",
      fromName: "Advo TZ",
      fromEmail: "support@advo.test",
      replyTo: "",
      smtp: {
        host: "smtp.advo.test",
        port: 465,
        secure: true,
        username: "otp@advo.test",
        password: "SharedMailboxPass1",
      },
      otpSender: { fromEmail: "otp@advo.test", username: "otp@advo.test", clearPassword: true },
    });
    expect(saved.ready).toBe(true);
    expect(saved.otpSender?.passwordConfigured).toBe(false);
  });

  it("refuses a mailbox that logs in as another account without its own password", async () => {
    await expect(
      saveMailSettings(adminId, {
        provider: "smtp",
        fromName: "Advo TZ",
        fromEmail: "support@advo.test",
        replyTo: "",
        smtp: {
          host: "smtp.advo.test",
          port: 465,
          secure: true,
          username: "support@advo.test",
          password: "MainMailboxPass1",
        },
        securitySender: { fromEmail: "security@advo.test", username: "security@advo.test", clearPassword: true },
      }),
    ).rejects.toThrow(/Security sender password/);
  });

  it("removes a mailbox when the Admin clears its address", async () => {
    await saveMailSettings(adminId, {
      provider: "smtp",
      fromName: "Advo TZ",
      fromEmail: "support@advo.test",
      replyTo: "",
      smtp: {
        host: "smtp.advo.test",
        port: 465,
        secure: true,
        username: "support@advo.test",
        password: "MainMailboxPass1",
      },
      otpSender: { fromEmail: "otp@advo.test", username: "otp@advo.test", password: "OtpMailboxPass1" },
      securitySender: { fromEmail: "security@advo.test", username: "security@advo.test", password: "SecPass1234" },
    });

    const saved = await saveMailSettings(adminId, {
      provider: "smtp",
      fromName: "Advo TZ",
      fromEmail: "support@advo.test",
      replyTo: "",
      smtp: {
        host: "smtp.advo.test",
        port: 465,
        secure: true,
        username: "support@advo.test",
        password: "MainMailboxPass1",
      },
      otpSender: { fromEmail: "otp@advo.test", remove: true },
      securitySender: { fromEmail: "security@advo.test", remove: true },
    });

    expect(saved.otpSender).toBeNull();
    expect(saved.securitySender).toBeNull();
  });
});
