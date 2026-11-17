import nodemailer from "nodemailer";
import { prisma } from "@advo/db";
import type {
  AdminMailKind,
  AdminMailSendInput,
  MailProvider,
  MailPurposeSenderDraft,
  MailSettingsDraft,
} from "@advo/contracts";
import {
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
} from "../../common/crypto.js";
import { isProduction } from "../../common/providers.js";
import { badRequest } from "../../common/errors.js";
import { setSetting } from "../settings/settings.service.js";

/**
 * One `SystemSetting` row holds the whole transport. Secrets inside it are
 * AES-256-GCM encrypted (the same helper as Controller credentials), and the
 * Admin screen only ever receives `has…` booleans — never a stored key.
 */
const MAIL_SETTINGS_KEY = "mail.settings";

/**
 * The general mailbox. `info@` is a real, monitored address — unlike the
 * `no-reply@` placeholder it replaces — so a guest who replies to an invitation
 * or a security notice reaches a human instead of a dead mailbox.
 */
const DEFAULT_FROM_EMAIL = "info@advowifi.com";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type StoredMailSettings = {
  provider: MailProvider;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  resendApiKeyEnc?: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    passwordEnc?: string;
    /** Plaintext password supplied by the environment; never persisted. */
    password?: string;
  };
  otpSender?: StoredPurposeSender;
  securitySender?: StoredPurposeSender;
  /**
   * Plaintext key supplied by the environment; never persisted.
   *
   * Kept separate from `resendApiKeyEnc` (the encrypted copy the Admin screen
   * owns) so an environment secret can never be written back into the database
   * by a later save.
   */
  resendApiKey?: string;
};

/** A From address that is used only for one kind of message. */
export type StoredPurposeSender = {
  fromEmail: string;
  username?: string;
  passwordEnc?: string;
};

type PublicPurposeSender = {
  fromEmail: string;
  username: string;
  passwordConfigured: boolean;
};

type PublicMailSettings = {
  provider: MailProvider;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  resendApiKeyConfigured: boolean;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    passwordConfigured: boolean;
  };
  otpSender: PublicPurposeSender | null;
  securitySender: PublicPurposeSender | null;
  /** True when the selected transport has everything it needs to attempt a send. */
  ready: boolean;
  /** Plain-language reason when `ready` is false. */
  missing: string[];
  /** Stable identifiers matching `missing` one-for-one, for UI translation. */
  missingCodes: MailRequirementCode[];
  /** False in production, where the simulator is not allowed to be the live transport. */
  fakeAllowed: boolean;
  updatedAt: string | null;
  updatedBy: { name: string; email: string } | null;
};

const DEFAULT_SETTINGS: StoredMailSettings = {
  provider: "fake",
  fromName: "Advo TZ",
  fromEmail: DEFAULT_FROM_EMAIL,
  replyTo: "",
};

function envFirst(...names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * The transport a deployment supplies through its environment.
 *
 * This is the fallback for a host whose Admin screen has never been filled in —
 * which is how production ended up sending nothing: `mail.settings` was absent,
 * the default `fake` provider also applies in production, and every code was
 * recorded as "simulated" while no mail left the server. `.env.example` had been
 * advertising an `EMAIL_PROVIDER_API_KEY` that no code read at all.
 *
 * The database row stays authoritative when it exists, so an Admin can always
 * override this from Admin → Mail. Only *secrets* fall back per field (see
 * {@link storedSettings}), which keeps a half-filled row from disabling mail
 * that the environment could still send.
 *
 * `MAIL_PROVIDER` decides the provider explicitly. Without it, a Resend key or
 * an SMTP host is taken as the intent, because setting either means the operator
 * wanted that transport.
 */
function envMailSettings(): StoredMailSettings | null {
  const resendKey = envFirst("RESEND_API_KEY", "EMAIL_PROVIDER_API_KEY");
  const smtpHost = envFirst("SMTP_HOST");
  const explicit = envFirst("MAIL_PROVIDER") as MailProvider | undefined;
  const provider =
    explicit ?? (resendKey ? "resend" : smtpHost ? "smtp" : undefined);
  if (!provider) return null;

  const smtpPassword = envFirst("SMTP_PASSWORD");
  const smtpUsername = envFirst("SMTP_USERNAME");
  const port = Number(envFirst("SMTP_PORT") ?? 587) || 587;

  return {
    provider,
    fromName: envFirst("MAIL_FROM_NAME") ?? DEFAULT_SETTINGS.fromName,
    fromEmail: envFirst("MAIL_FROM_EMAIL") ?? DEFAULT_SETTINGS.fromEmail,
    replyTo: envFirst("MAIL_REPLY_TO") ?? "",
    ...(resendKey ? { resendApiKey: resendKey } : {}),
    ...(smtpHost
      ? {
          smtp: {
            host: smtpHost,
            port,
            // 465 is implicit TLS; 587 is STARTTLS, where `secure` must be false.
            secure: (envFirst("SMTP_SECURE") ?? "true") !== "false",
            username: smtpUsername ?? "",
            ...(smtpPassword ? { password: smtpPassword } : {}),
          },
        }
      : {}),
  };
}

async function storedSettings(): Promise<{
  stored: StoredMailSettings;
  updatedAt: Date | null;
  updatedBy: string | null;
}> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: MAIL_SETTINGS_KEY },
  });
  const raw = (row?.value ?? {}) as Partial<StoredMailSettings>;
  const env = envMailSettings();

  // A host whose Admin screen has never been saved takes the whole transport
  // from the environment, so a deployment can ship a working mail setup without
  // anyone having to open the screen first.
  if (!row && env) {
    return { stored: env, updatedAt: null, updatedBy: null };
  }

  const stored: StoredMailSettings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    smtp: raw.smtp
      ? {
          host: raw.smtp.host ?? "",
          port: Number(raw.smtp.port) || 587,
          secure: Boolean(raw.smtp.secure),
          username: raw.smtp.username ?? "",
          ...(raw.smtp.passwordEnc ? { passwordEnc: raw.smtp.passwordEnc } : {}),
        }
      : undefined,
    otpSender: raw.otpSender?.fromEmail
      ? readPurposeSender(raw.otpSender)
      : undefined,
    securitySender: raw.securitySender?.fromEmail
      ? readPurposeSender(raw.securitySender)
      : undefined,
  };

  // Secrets fall back to the deployment's, per field: a saved row keeps whatever
  // the Admin entered, and only a gap is filled. That way a row that names a
  // provider but left the key blank (or lost it) still sends.
  if (!stored.resendApiKeyEnc && env?.resendApiKey)
    stored.resendApiKey = env.resendApiKey;
  if (stored.smtp && !stored.smtp.passwordEnc && env?.smtp?.password)
    stored.smtp.password = env.smtp.password;

  return {
    stored,
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
  };
}

function readPurposeSender(raw: StoredPurposeSender): StoredPurposeSender {
  return {
    fromEmail: raw.fromEmail,
    ...(raw.username ? { username: raw.username } : {}),
    ...(raw.passwordEnc ? { passwordEnc: raw.passwordEnc } : {}),
  };
}

/**
 * One unmet requirement.
 *
 * `code` is the stable identifier the dashboard translates; `label` is the
 * plain-English version that belongs in an API error or a server log, where no
 * dictionary is available. The two never drift because both are produced here.
 */
export type MailRequirementCode =
  | "provider.real"
  | "provider.resendKey"
  | "smtp.host"
  | "smtp.port"
  | "smtp.username"
  | "smtp.password"
  | "senders.otpPassword"
  | "senders.securityPassword";

type MailRequirementGap = { code: MailRequirementCode; label: string };

function requirementGaps(settings: StoredMailSettings): MailRequirementGap[] {
  const gaps: MailRequirementGap[] = [];
  // The fake transport is a development tool. In production it would silently
  // swallow registration and reset codes, so it is treated as unconfigured.
  if (settings.provider === "fake" && isProduction()) {
    gaps.push({
      code: "provider.real",
      label: "A real provider (fake is allowed only outside production)",
    });
  }
  if (settings.provider === "resend" && !settings.resendApiKeyEnc) {
    if (!settings.resendApiKey)
      gaps.push({ code: "provider.resendKey", label: "Resend API key" });
  }
  if (settings.provider === "smtp") {
    if (!settings.smtp?.host)
      gaps.push({ code: "smtp.host", label: "SMTP host" });
    if (!settings.smtp?.port)
      gaps.push({ code: "smtp.port", label: "SMTP port" });
    if (!settings.smtp?.username)
      gaps.push({ code: "smtp.username", label: "SMTP username" });
    if (!settings.smtp?.passwordEnc && !settings.smtp?.password)
      gaps.push({ code: "smtp.password", label: "SMTP password" });
    // A purpose mailbox logging in as a different account needs a password of
    // its own; the main password belongs to another user.
    const mainPasswordAvailable = Boolean(
      settings.smtp?.passwordEnc || settings.smtp?.password,
    );
    for (const [code, label, sender] of [
      ["senders.otpPassword", "OTP sender", settings.otpSender],
      ["senders.securityPassword", "Security sender", settings.securitySender],
    ] as const) {
      if (!sender?.username) continue;
      const sharesMainLogin = sender.username === settings.smtp?.username;
      if (!sender.passwordEnc && !(sharesMainLogin && mainPasswordAvailable)) {
        gaps.push({ code, label: `${label} password` });
      }
    }
  }
  return gaps;
}

function missingFor(settings: StoredMailSettings): string[] {
  return requirementGaps(settings).map((gap) => gap.label);
}

export async function mailSettingsOverview(): Promise<{
  settings: PublicMailSettings;
  messages: NotificationView[];
  stats: MailStats;
  recipients: MailRecipient[];
}> {
  const [{ stored, updatedAt, updatedBy }, messages, stats, recipients] =
    await Promise.all([
      storedSettings(),
      listMailMessages({ take: 50 }),
      mailStats(),
      listMailRecipients(),
    ]);

  const actor = updatedBy
    ? await prisma.user.findUnique({
        where: { id: updatedBy },
        select: { name: true, email: true },
      })
    : null;

  const gaps = requirementGaps(stored);

  return {
    settings: {
      provider: stored.provider,
      fromName: stored.fromName,
      fromEmail: stored.fromEmail,
      replyTo: stored.replyTo,
      resendApiKeyConfigured: Boolean(
        stored.resendApiKeyEnc || stored.resendApiKey,
      ),
      smtp: {
        host: stored.smtp?.host ?? "",
        port: stored.smtp?.port ?? 587,
        secure: stored.smtp?.secure ?? true,
        username: stored.smtp?.username ?? "",
        passwordConfigured: Boolean(
          stored.smtp?.passwordEnc || stored.smtp?.password,
        ),
      },
      otpSender: publicSender(stored.otpSender),
      securitySender: publicSender(stored.securitySender),
      ready: gaps.length === 0,
      missing: gaps.map((gap) => gap.label),
      missingCodes: gaps.map((gap) => gap.code),
      fakeAllowed: !isProduction(),
      updatedAt: updatedAt?.toISOString() ?? null,
      updatedBy: actor,
    },
    messages,
    stats,
    recipients,
  };
}

function publicSender(
  sender: StoredPurposeSender | undefined,
): PublicPurposeSender | null {
  if (!sender?.fromEmail) return null;
  return {
    fromEmail: sender.fromEmail,
    username: sender.username ?? "",
    passwordConfigured: Boolean(sender.passwordEnc),
  };
}

function mergePurposeSender(
  input: MailPurposeSenderDraft | undefined,
  previous: StoredPurposeSender | undefined,
): StoredPurposeSender | undefined {
  if (input?.remove) return undefined;
  if (!input) return previous;
  const username = input.username?.trim() || "";
  const passwordEnc = input.clearPassword
    ? undefined
    : input.password
      ? encryptSecret(input.password)
      : previous?.passwordEnc;
  return {
    fromEmail: input.fromEmail.trim(),
    ...(username ? { username } : {}),
    ...(passwordEnc ? { passwordEnc } : {}),
  };
}

export async function saveMailSettings(
  actorUserId: string,
  input: MailSettingsDraft,
): Promise<PublicMailSettings> {
  const { stored } = await storedSettings();

  const resendApiKeyEnc = input.clearResendApiKey
    ? undefined
    : input.resendApiKey
      ? encryptSecret(input.resendApiKey)
      : stored.resendApiKeyEnc;

  const previousSmtp = stored.smtp;
  const smtp = input.smtp
    ? {
        host: input.smtp.host.trim(),
        // The schema coerces these, but a direct service call may omit them.
        port: Number(input.smtp.port) || 587,
        secure: input.smtp.secure ?? true,
        username: (input.smtp.username ?? "").trim(),
        ...(input.smtp.clearPassword
          ? {}
          : input.smtp.password
            ? { passwordEnc: encryptSecret(input.smtp.password) }
            : previousSmtp?.passwordEnc
              ? { passwordEnc: previousSmtp.passwordEnc }
              : {}),
      }
    : stored.smtp;

  const otpSender = mergePurposeSender(input.otpSender, stored.otpSender);
  const securitySender = mergePurposeSender(
    input.securitySender,
    stored.securitySender,
  );

  // Only what the Admin actually typed is persisted. A password or API key the
  // deployment supplies through its environment lives in memory, so it must not
  // ride along into the row on an unrelated save.
  const next: StoredMailSettings = {
    provider: input.provider,
    fromName: input.fromName.trim(),
    fromEmail: input.fromEmail.trim(),
    replyTo: input.replyTo?.trim() ?? "",
    ...(resendApiKeyEnc ? { resendApiKeyEnc } : {}),
    ...(smtp
      ? {
          smtp: {
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            username: smtp.username,
            ...(smtp.passwordEnc ? { passwordEnc: smtp.passwordEnc } : {}),
          },
        }
      : {}),
    ...(otpSender ? { otpSender } : {}),
    ...(securitySender ? { securitySender } : {}),
  };

  // Validation judges the transport that would actually send, so a secret the
  // deployment already supplies is not reported as a gap the Admin must fill.
  const env = envMailSettings();
  const effective: StoredMailSettings = {
    ...next,
    ...(!next.resendApiKeyEnc && env?.resendApiKey
      ? { resendApiKey: env.resendApiKey }
      : {}),
    ...(next.smtp && !next.smtp.passwordEnc && env?.smtp?.password
      ? { smtp: { ...next.smtp, password: env.smtp.password } }
      : {}),
  };
  const missing = missingFor(effective);
  if (missing.length > 0) {
    badRequest(
      `Email transport is not ready: ${missing.join(", ")} is required for ${input.provider}.`,
    );
  }

  await setSetting(
    MAIL_SETTINGS_KEY,
    next,
    actorUserId,
    "Admin updated the email transport",
  );

  const updated = await storedSettings();
  return {
    provider: next.provider,
    fromName: next.fromName,
    fromEmail: next.fromEmail,
    replyTo: next.replyTo,
      resendApiKeyConfigured: Boolean(
        next.resendApiKeyEnc || next.resendApiKey,
      ),
    smtp: {
      host: next.smtp?.host ?? "",
      port: next.smtp?.port ?? 587,
      secure: next.smtp?.secure ?? true,
      username: next.smtp?.username ?? "",
      passwordConfigured: Boolean(next.smtp?.passwordEnc),
    },
    otpSender: publicSender(next.otpSender),
    securitySender: publicSender(next.securitySender),
    ready: true,
    missing: [],
    missingCodes: [],
    fakeAllowed: !isProduction(),
    updatedAt: updated.updatedAt?.toISOString() ?? null,
    updatedBy: null,
  };
}

export type MailRecipient = {
  id: string;
  name: string;
  email: string;
  role: "RESELLER" | "AGENT";
  organization: string | null;
};

export async function listMailRecipients(): Promise<MailRecipient[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: ["RESELLER", "AGENT"] }, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      reseller: { select: { businessName: true } },
      agent: { select: { referralCode: true } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    take: 500,
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as "RESELLER" | "AGENT",
    organization:
      user.reseller?.businessName ?? user.agent?.referralCode ?? null,
  }));
}

export type NotificationView = {
  id: string;
  to: string;
  template: string;
  subject: string | null;
  state: string;
  provider: string | null;
  simulated: boolean;
  error: string | null;
  bodyPreview: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type MailStats = {
  total: number;
  sent: number;
  failed: number;
  simulated: number;
  last24h: number;
};

async function mailStats(): Promise<MailStats> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [total, sent, failed, simulated, last24h] = await Promise.all([
    prisma.notification.count(),
    prisma.notification.count({ where: { state: "sent" } }),
    prisma.notification.count({ where: { state: "failed" } }),
    prisma.notification.count({ where: { state: "simulated" } }),
    prisma.notification.count({ where: { createdAt: { gte: since } } }),
  ]);
  return { total, sent, failed, simulated, last24h };
}

export async function listMailMessages(
  filters: { state?: string; q?: string; take?: number } = {},
): Promise<NotificationView[]> {
  const rows = await prisma.notification.findMany({
    where: {
      ...(filters.state ? { state: filters.state } : {}),
      ...(filters.q
        ? {
            OR: [
              { to: { contains: filters.q, mode: "insensitive" } },
              { subject: { contains: filters.q, mode: "insensitive" } },
              { template: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(filters.take ?? 100, 250),
  });

  return rows.map((row) => ({
    id: row.id,
    to: row.to,
    template: row.template,
    subject: row.subject,
    state: row.state,
    provider: row.provider,
    simulated: row.simulated,
    error: row.error,
    bodyPreview: row.bodyPreview,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  template: string;
  dedupKey?: string;
  recipientUserId?: string | null;
  bodyPreview?: string;
};

export type MailResult = {
  delivered: boolean;
  simulated: boolean;
  provider: MailProvider;
  notificationId: string;
};

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A branded but deliberately simple wrapper; no external assets, no tracking pixel. */
function renderHtml(text: string, fromName: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(
      (block) =>
        `<p style="margin:0 0 14px">${htmlEscape(block).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f6f7fb;padding:28px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px">
    <div style="font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#b15f00;font-size:11px;margin-bottom:18px">${htmlEscape(fromName)}</div>
    ${paragraphs}
    <div style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:14px;color:#64748b;font-size:11px">This message was sent by ${htmlEscape(fromName)}. If you were not expecting it, you can ignore it.</div>
  </div>
</body></html>`;
}

async function sendWithResend(
  settings: StoredMailSettings,
  message: MailMessage,
  html: string,
  sender: SenderContext,
): Promise<void> {
  const apiKey = settings.resendApiKeyEnc
    ? decryptSecret(settings.resendApiKeyEnc)
    : settings.resendApiKey;
  if (!apiKey) throw new Error("Resend API key is not configured");
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: `${settings.fromName} <${sender.fromEmail}>`,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html,
      ...(settings.replyTo ? { reply_to: settings.replyTo } : {}),
    }),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 400);
    throw new Error(
      `Resend refused the message: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`,
    );
  }
}

async function sendWithSmtp(
  settings: StoredMailSettings,
  message: MailMessage,
  html: string,
  sender: SenderContext,
): Promise<void> {
  const smtp = settings.smtp;
  if (!smtp?.host) throw new Error("SMTP host is not configured");
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(sender.username
      ? {
          auth: {
            user: sender.username,
            pass: sender.passwordEnc
              ? decryptSecret(sender.passwordEnc)
              : (sender.password ?? ""),
          },
        }
      : {}),
  });
  await transport.sendMail({
    from: `${settings.fromName} <${sender.fromEmail}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html,
    ...(settings.replyTo ? { replyTo: settings.replyTo } : {}),
  });
}

type MailPurpose = "otp" | "security" | "default";

/** Which From address a template belongs to. */
function purposeForTemplate(template: string): MailPurpose {
  if (template.startsWith("otp.")) return "otp";
  if (template === "admin.security") return "security";
  return "default";
}

type SenderContext = {
  fromEmail: string;
  username: string;
  passwordEnc?: string;
  /** Plaintext password from the environment; never persisted. */
  password?: string;
};

/**
 * Picks the From address (and SMTP login) for a message. A purpose mailbox that
 * logs in as its own account keeps the From address aligned with the
 * authenticated user, which shared hosts require.
 */
function resolveSender(
  settings: StoredMailSettings,
  purpose: MailPurpose,
): SenderContext {
  const override =
    purpose === "otp"
      ? settings.otpSender
      : purpose === "security"
        ? settings.securitySender
        : undefined;
  if (override?.fromEmail) {
    const username = override.username || override.fromEmail;
    const sharesMainLogin = settings.smtp?.username === username;
    const passwordEnc =
      override.passwordEnc ??
      (sharesMainLogin ? settings.smtp?.passwordEnc : undefined);
    const password =
      !passwordEnc && sharesMainLogin ? settings.smtp?.password : undefined;
    return {
      fromEmail: override.fromEmail,
      username,
      ...(passwordEnc ? { passwordEnc } : {}),
      ...(password ? { password } : {}),
    };
  }
  return {
    fromEmail: settings.fromEmail,
    username: settings.smtp?.username ?? "",
    ...(settings.smtp?.passwordEnc
      ? { passwordEnc: settings.smtp.passwordEnc }
      : {}),
    ...(settings.smtp?.password ? { password: settings.smtp.password } : {}),
  };
}

/**
 * Records and sends one email.
 *
 * The notification row is written first so a transport failure is visible to an
 * Admin instead of disappearing into a logger. The body is never stored whole:
 * OTP messages would otherwise put a live code in the database and the Admin
 * screen. `bodyPreview` is a short, caller-supplied summary.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const { stored } = await storedSettings();
  const dedupKey = message.dedupKey ?? `mail:${generateOpaqueToken(12)}`;

  const notification = await prisma.notification.create({
    data: {
      recipientUserId: message.recipientUserId ?? null,
      channel: "email",
      template: message.template,
      to: message.to,
      dedupKey,
      state: "queued",
      simulated: stored.provider === "fake",
      provider: stored.provider,
      subject: message.subject,
      bodyPreview: (message.bodyPreview ?? message.text).slice(0, 280),
    },
  });

  if (stored.provider === "fake") {
    // Production must never pretend. The fake transport is a development tool:
    // it records the message and returns, which is how every verification code
    // went missing — caller could not tell a send from a no-op.
    if (isProduction()) {
      const reason =
        "The 'fake' email transport cannot deliver in production. Configure a real provider on Admin → Mail, or set MAIL_PROVIDER with RESEND_API_KEY (or SMTP_HOST) in the environment.";
      await prisma.notification.update({
        where: { id: notification.id },
        data: { state: "failed", simulated: false, error: reason },
      });
      throw new Error(reason);
    }
    await prisma.notification.update({
      where: { id: notification.id },
      data: { state: "simulated", simulated: true, sentAt: new Date() },
    });
    return {
      delivered: false,
      simulated: true,
      provider: "fake",
      notificationId: notification.id,
    };
  }

  try {
    const html = message.html ?? renderHtml(message.text, stored.fromName);
    const sender = resolveSender(stored, purposeForTemplate(message.template));
    if (stored.provider === "resend")
      await sendWithResend(stored, message, html, sender);
    else await sendWithSmtp(stored, message, html, sender);

    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        state: "sent",
        simulated: false,
        sentAt: new Date(),
        error: null,
      },
    });
    return {
      delivered: true,
      simulated: false,
      provider: stored.provider,
      notificationId: notification.id,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await prisma.notification.update({
      where: { id: notification.id },
      data: { state: "failed", simulated: false, error: reason.slice(0, 500) },
    });
    throw error;
  }
}

export type OtpMailPurpose =
  "REGISTER_RESELLER" | "REGISTER_AGENT" | "PASSWORD_RESET";

/**
 * Sends a one-time code. The code exists only in this function's argument and
 * the email body; it is never returned to the notification log.
 */
export async function sendOtpEmail(input: {
  to: string;
  code: string;
  purpose: OtpMailPurpose;
  expiresInMinutes: number;
  recipientName?: string;
  userId?: string | null;
  dedupKey: string;
}): Promise<MailResult> {
  const isReset = input.purpose === "PASSWORD_RESET";
  const subject = isReset
    ? "Your Advo TZ password reset code"
    : "Your Advo TZ verification code";
  const intro = isReset
    ? "Use this code to reset your Advo TZ password."
    : "Use this code to verify your email address and finish creating your Advo TZ account.";
  const greeting = input.recipientName
    ? `Hello ${input.recipientName},`
    : "Hello,";
  const text = [
    greeting,
    intro,
    input.code,
    `The code expires in ${input.expiresInMinutes} minutes and can be used once.`,
    isReset
      ? "If you did not ask to reset your password, ignore this message — your password has not changed."
      : "If you did not ask to create an account, ignore this message and nothing will be created.",
    "For your safety, Advo TZ will never ask you to share this code with anyone.",
  ].join("\n\n");

  return sendMail({
    to: input.to,
    subject,
    text,
    template: isReset
      ? "otp.password_reset"
      : input.purpose === "REGISTER_AGENT"
        ? "otp.register_agent"
        : "otp.register_reseller",
    dedupKey: input.dedupKey,
    recipientUserId: input.userId ?? null,
    bodyPreview: isReset
      ? "Password reset code sent (code not stored)."
      : "Registration verification code sent (code not stored).",
  });
}

export async function sendTestMail(
  actorUserId: string,
  to: string,
): Promise<MailResult> {
  const { stored } = await storedSettings();
  const result = await sendMail({
    to,
    subject: "Advo TZ email transport test",
    text: [
      "Hello,",
      "This is a test message from the Advo TZ Admin → Mail screen.",
      `It was sent through the "${stored.provider}" transport at ${new Date().toISOString()}.`,
      "If you received it, the transport settings are correct.",
    ].join("\n\n"),
    template: "admin.mail_test",
    bodyPreview: "Admin email transport test.",
  });
  await prisma.auditEvent.create({
    data: {
      actorUserId,
      action: "mail.test_sent",
      targetType: "Notification",
      targetId: result.notificationId,
      metadata: {
        to,
        provider: result.provider,
        delivered: result.delivered,
        simulated: result.simulated,
      },
    },
  });
  return result;
}

const KIND_LABEL: Record<AdminMailKind, string> = {
  SECURITY: "Security notice",
  INFO: "Information",
  ANNOUNCEMENT: "Announcement",
};

/**
 * Admin-composed mail. Each recipient gets their own notification row, so the
 * delivery log answers "did this person receive it?" rather than counting a
 * batch. Recipients are capped by the contract, and the action is audited.
 */
export async function sendAdminMail(
  actorUserId: string,
  input: AdminMailSendInput,
): Promise<{
  sent: number;
  failed: number;
  simulated: number;
  results: Array<{
    to: string;
    delivered: boolean;
    simulated: boolean;
    error?: string;
  }>;
}> {
  const recipients = [
    ...new Set(input.recipients.map((email) => email.trim().toLowerCase())),
  ];
  const results: Array<{
    to: string;
    delivered: boolean;
    simulated: boolean;
    error?: string;
  }> = [];
  let sent = 0;
  let failed = 0;
  let simulated = 0;

  for (const to of recipients) {
    try {
      const result = await sendMail({
        to,
        subject: input.subject,
        text: input.body,
        template: `admin.${input.kind.toLowerCase()}`,
        bodyPreview: `${KIND_LABEL[input.kind]}: ${input.subject}`.slice(
          0,
          280,
        ),
      });
      if (result.delivered) sent += 1;
      else simulated += 1;
      results.push({
        to,
        delivered: result.delivered,
        simulated: result.simulated,
      });
    } catch (error) {
      failed += 1;
      results.push({
        to,
        delivered: false,
        simulated: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await prisma.auditEvent.create({
    data: {
      actorUserId,
      action: "mail.admin_sent",
      targetType: "Notification",
      metadata: {
        kind: input.kind,
        subject: input.subject,
        recipients: recipients.length,
        sent,
        failed,
        simulated,
      },
    },
  });

  return { sent, failed, simulated, results };
}

/** Used by tests and by the health banner: is a real transport selected? */
export async function mailTransportReady(): Promise<boolean> {
  if (isProduction() && (await storedSettings()).stored.provider === "fake")
    return false;
  return missingFor((await storedSettings()).stored).length === 0;
}
