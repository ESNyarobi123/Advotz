"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Switch } from "@heroui/react";
import { formatDateTime } from "@advo/api-client";
import { AdvoKpi, AdvoTable, Notice, StatusChip, SoftIcon } from "@advo/ui";
import type { AdminMailKind, MailProvider } from "@advo/contracts";
import {
  Check,
  CheckCircle2,
  Circle,
  CircleAlert,
  Clock3,
  Eye,
  EyeOff,
  Inbox,
  Mail,
  RefreshCw,
  Search,
  Send,
  ServerCog,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  PageHero,
  ResourceView,
  SectionHeader,
} from "@/features/common/components";
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@advo/i18n";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

type PurposeSenderView = {
  fromEmail: string;
  username: string;
  passwordConfigured: boolean;
};

/**
 * The stable identifiers the API sends alongside its plain-English readiness
 * notes. Translating the note itself would mean matching on English prose, so
 * the API names each gap and the dashboard owns how it reads.
 */
type MailRequirementCode =
  | "provider.real"
  | "provider.resendKey"
  | "smtp.host"
  | "smtp.port"
  | "smtp.username"
  | "smtp.password"
  | "senders.otpPassword"
  | "senders.securityPassword";

const REQUIREMENT_KEYS: Record<MailRequirementCode, MessageKey> = {
  "provider.real": "admin.mail.requirement.provider.real",
  "provider.resendKey": "admin.mail.requirement.provider.resendKey",
  "smtp.host": "admin.mail.requirement.smtp.host",
  "smtp.port": "admin.mail.requirement.smtp.port",
  "smtp.username": "admin.mail.requirement.smtp.username",
  "smtp.password": "admin.mail.requirement.smtp.password",
  "senders.otpPassword": "admin.mail.requirement.senders.otpPassword",
  "senders.securityPassword": "admin.mail.requirement.senders.securityPassword",
};

type MailSettingsView = {
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
  otpSender: PurposeSenderView | null;
  securitySender: PurposeSenderView | null;
  ready: boolean;
  missing: string[];
  missingCodes?: string[];
  /** False when the server runs in production, where the simulator may not send. */
  fakeAllowed?: boolean;
  updatedAt: string | null;
  updatedBy: { name: string; email: string } | null;
};

type MailMessageView = {
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

type MailRecipient = {
  id: string;
  name: string;
  email: string;
  role: "RESELLER" | "AGENT";
  organization: string | null;
};

type MailOverview = {
  settings: MailSettingsView;
  messages: MailMessageView[];
  stats: {
    total: number;
    sent: number;
    failed: number;
    simulated: number;
    last24h: number;
  };
  recipients: MailRecipient[];
};

type Tab = "settings" | "compose" | "activity";

const PROVIDERS: Array<{
  id: MailProvider;
  labelKey: MessageKey;
  hintKey: MessageKey;
  icon: typeof Mail;
  recommended?: boolean;
}> = [
  {
    id: "fake",
    icon: Sparkles,
    labelKey: "admin.mail.settings.provider.fake",
    hintKey: "admin.mail.settings.provider.fakeHint",
  },
  {
    id: "resend",
    icon: Send,
    labelKey: "admin.mail.settings.provider.resend",
    hintKey: "admin.mail.settings.provider.resendHint",
    recommended: true,
  },
  {
    id: "smtp",
    icon: ServerCog,
    labelKey: "admin.mail.settings.provider.smtp",
    hintKey: "admin.mail.settings.provider.smtpHint",
  },
];

const KINDS: Array<{ id: AdminMailKind; labelKey: MessageKey }> = [
  { id: "SECURITY", labelKey: "admin.mail.compose.kind.security" },
  { id: "INFO", labelKey: "admin.mail.compose.kind.info" },
  { id: "ANNOUNCEMENT", labelKey: "admin.mail.compose.kind.announcement" },
];

const STATUS_TONE: Record<
  string,
  "success" | "danger" | "warning" | "default"
> = {
  sent: "success",
  failed: "danger",
  simulated: "warning",
  queued: "default",
};

/**
 * Readiness of the draft, not of what was last saved.
 *
 * Switching provider is the moment the operator most needs feedback, so the
 * banner and the checklist follow the form the moment it changes instead of
 * waiting for a save round-trip.
 */
function draftGaps(input: {
  provider: MailProvider;
  resendKey: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  settings: MailSettingsView;
}): MailRequirementCode[] {
  const {
    provider,
    resendKey,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword,
    settings,
  } = input;
  const gaps: MailRequirementCode[] = [];

  // `fakeAllowed` is the server telling us whether the simulator may be used in
  // this environment. An older API omits it; assume it is allowed so the banner
  // never invents a blocker.
  if (provider === "fake" && settings.fakeAllowed === false)
    gaps.push("provider.real");
  if (
    provider === "resend" &&
    !settings.resendApiKeyConfigured &&
    !resendKey.trim()
  ) {
    gaps.push("provider.resendKey");
  }
  if (provider === "smtp") {
    if (!smtpHost.trim()) gaps.push("smtp.host");
    if (!smtpPort.trim()) gaps.push("smtp.port");
    if (!smtpUser.trim()) gaps.push("smtp.username");
    if (!settings.smtp.passwordConfigured && !smtpPassword)
      gaps.push("smtp.password");
  }
  return gaps;
}

export function AdminMailScreen() {
  const { t } = useI18n();
  const resource = useResource<MailOverview>("/admin/mail");
  const [tab, setTab] = useState<Tab>("settings");

  const stats = resource.data?.stats;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      <PageHero
        description={t("admin.mail.description")}
        eyebrow={t("admin.mail.eyebrow")}
        icon={<Mail />}
        iconTone="accent"
        title={t("admin.mail.title")}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdvoKpi
          hint={t("admin.mail.kpi.totalHint")}
          icon={<Mail />}
          iconTone="accent"
          label={t("admin.mail.kpi.total")}
          value={stats?.total ?? "—"}
        />
        <AdvoKpi
          hint={t("admin.mail.kpi.sentHint")}
          icon={<Check />}
          iconTone="success"
          label={t("admin.mail.kpi.sent")}
          value={stats?.sent ?? "—"}
        />
        <AdvoKpi
          hint={t("admin.mail.kpi.failedHint")}
          icon={<CircleAlert />}
          iconTone="danger"
          label={t("admin.mail.kpi.failed")}
          value={stats?.failed ?? "—"}
        />
        <AdvoKpi
          hint={t("admin.mail.kpi.last24hHint")}
          icon={<Inbox />}
          iconTone="accent"
          label={t("admin.mail.kpi.last24h")}
          value={stats?.last24h ?? "—"}
        />
      </div>

      <div className="flex flex-wrap gap-1 rounded-2xl border border-advo-border bg-white p-1">
        {(
          [
            {
              id: "settings" as const,
              label: t("admin.mail.tabs.settings"),
              icon: ServerCog,
            },
            {
              id: "compose" as const,
              label: t("admin.mail.tabs.compose"),
              icon: Send,
            },
            {
              id: "activity" as const,
              label: t("admin.mail.tabs.activity"),
              icon: Inbox,
            },
          ] satisfies Array<{ id: Tab; label: string; icon: typeof Mail }>
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              className={
                active
                  ? "flex flex-1 items-center justify-center gap-2 rounded-xl bg-advo-gold-soft px-4 py-2.5 text-xs font-bold text-[#b15f00] shadow-xs ring-1 ring-advo-gold/30"
                  : "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-advo-muted transition hover:bg-advo-page hover:text-advo-text"
              }
              key={item.id}
              onClick={() => setTab(item.id)}
              type="button"
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </div>

      <ResourceView resource={resource}>
        {(data) =>
          tab === "settings" ? (
            <SettingsTab data={data} onSaved={resource.reload} t={t} />
          ) : tab === "compose" ? (
            <ComposeTab data={data} onSent={resource.reload} t={t} />
          ) : (
            <ActivityTab data={data} onRefresh={resource.reload} t={t} />
          )
        }
      </ResourceView>
    </div>
  );
}

function SettingsTab({
  data,
  onSaved,
  t,
}: {
  data: MailOverview;
  onSaved: () => Promise<void>;
  t: T;
}) {
  const settings = data.settings;
  const [provider, setProvider] = useState<MailProvider>(settings.provider);
  const [fromName, setFromName] = useState(settings.fromName);
  const [fromEmail, setFromEmail] = useState(settings.fromEmail);
  const [replyTo, setReplyTo] = useState(settings.replyTo);
  const [resendKey, setResendKey] = useState("");
  const [smtpHost, setSmtpHost] = useState(settings.smtp.host);
  const [smtpPort, setSmtpPort] = useState(String(settings.smtp.port));
  const [smtpSecure, setSmtpSecure] = useState(settings.smtp.secure);
  const [smtpUser, setSmtpUser] = useState(settings.smtp.username);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [otpEmail, setOtpEmail] = useState(settings.otpSender?.fromEmail ?? "");
  const [otpPassword, setOtpPassword] = useState("");
  const [securityEmail, setSecurityEmail] = useState(
    settings.securitySender?.fromEmail ?? "",
  );
  const [securityPassword, setSecurityPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gaps = useMemo(
    () =>
      draftGaps({
        provider,
        resendKey,
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPassword,
        settings,
      }),
    [provider, resendKey, smtpHost, smtpPort, smtpUser, smtpPassword, settings],
  );
  const ready = gaps.length === 0;
  const credentialReady =
    provider === "resend"
      ? Boolean(settings.resendApiKeyConfigured || resendKey.trim())
      : provider === "smtp"
        ? Boolean(
            smtpHost.trim() &&
            smtpUser.trim() &&
            (settings.smtp.passwordConfigured || smtpPassword),
          )
        : true;

  /**
   * Bring the control that resolves a requirement into view.
   *
   * The warning used to be a sentence naming missing fields; a reseller of the
   * transport should not have to hunt for them, so pressing the call to action
   * lands the caret in the first field that is actually wrong.
   */
  function focusGap(code: MailRequirementCode | null) {
    const targets: Record<MailRequirementCode, string> = {
      "provider.real": "provider-resend",
      "provider.resendKey": "mail-resend-key",
      "smtp.host": "mail-smtp-host",
      "smtp.port": "mail-smtp-port",
      "smtp.username": "mail-smtp-user",
      "smtp.password": "mail-smtp-password",
      "senders.otpPassword": "mail-otp-password",
      "senders.securityPassword": "mail-security-password",
    };
    const element = document.getElementById(
      code ? targets[code] : "mail-from-email",
    );
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.focus({ preventScroll: true });
  }

  // Reload after a save replaces the object; mirror the server's canonical values.
  useEffect(() => {
    setProvider(settings.provider);
    setFromName(settings.fromName);
    setFromEmail(settings.fromEmail);
    setReplyTo(settings.replyTo);
    setSmtpHost(settings.smtp.host);
    setSmtpPort(String(settings.smtp.port));
    setSmtpSecure(settings.smtp.secure);
    setSmtpUser(settings.smtp.username);
    setResendKey("");
    setSmtpPassword("");
    setOtpEmail(settings.otpSender?.fromEmail ?? "");
    setSecurityEmail(settings.securitySender?.fromEmail ?? "");
    setOtpPassword("");
    setSecurityPassword("");
  }, [settings]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFlash(null);
    try {
      const otpSender = otpEmail.trim()
        ? {
            fromEmail: otpEmail.trim(),
            ...(otpPassword ? { password: otpPassword } : {}),
          }
        : settings.otpSender
          ? { fromEmail: settings.otpSender.fromEmail, remove: true }
          : undefined;
      const securitySender = securityEmail.trim()
        ? {
            fromEmail: securityEmail.trim(),
            ...(securityPassword ? { password: securityPassword } : {}),
          }
        : settings.securitySender
          ? { fromEmail: settings.securitySender.fromEmail, remove: true }
          : undefined;

      await api.put("/admin/mail/settings", {
        provider,
        fromName,
        fromEmail,
        replyTo,
        ...(resendKey.trim() ? { resendApiKey: resendKey.trim() } : {}),
        ...(otpSender ? { otpSender } : {}),
        ...(securitySender ? { securitySender } : {}),
        ...(provider === "smtp"
          ? {
              smtp: {
                host: smtpHost,
                port: Number(smtpPort) || 587,
                secure: smtpSecure,
                username: smtpUser,
                ...(smtpPassword ? { password: smtpPassword } : {}),
              },
            }
          : {}),
      });
      await onSaved();
      setFlash(t("admin.mail.settings.saved"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <TransportHealth
        fake={provider === "fake"}
        gaps={gaps}
        onFix={() => focusGap(gaps[0] ?? null)}
        onTest={() => document.getElementById("mail-test-to")?.focus()}
        provider={provider}
        ready={ready}
        t={t}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_366px]">
        <Card className="p-0 shadow-advo-card ring-1 ring-advo-border/70">
          <div className="border-b border-advo-border/70 px-5 py-4">
            <SectionHeader
              description={t("admin.mail.settings.description")}
              icon={<ServerCog />}
              iconTone="accent"
              title={t("admin.mail.settings.title")}
            />
          </div>

          <form className="space-y-6 px-5 py-5" onSubmit={save}>
            {flash ? <Notice tone="success">{flash}</Notice> : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}

            <fieldset className="space-y-3">
              <FormLegend
                hint={t("admin.mail.settings.group.providerHint")}
                index={1}
                title={t("admin.mail.settings.group.provider")}
              />
              <div className="grid gap-2.5 sm:grid-cols-3">
                {PROVIDERS.map((item) => {
                  const active = provider === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      aria-pressed={active}
                      className={
                        active
                          ? "group relative rounded-2xl border border-advo-gold/60 bg-advo-gold-soft p-3.5 text-left shadow-xs ring-1 ring-advo-gold/30 transition"
                          : "group relative rounded-2xl border border-advo-border bg-advo-page p-3.5 text-left transition hover:border-advo-gold/40 hover:bg-advo-surface-soft"
                      }
                      id={`provider-${item.id}`}
                      key={item.id}
                      onClick={() => setProvider(item.id)}
                      type="button"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span
                          className={
                            active
                              ? "grid size-9 place-items-center rounded-xl bg-advo-gold/20 text-[#f0b45a]"
                              : "grid size-9 place-items-center rounded-xl bg-advo-surface-soft text-advo-muted"
                          }
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span
                          className={
                            active
                              ? "grid size-5 place-items-center rounded-full bg-advo-gold text-[var(--advo-charcoal)]"
                              : "size-5 rounded-full border border-advo-border"
                          }
                        >
                          {active ? (
                            <Check className="size-3" aria-hidden="true" />
                          ) : null}
                        </span>
                      </span>
                      <span className="mt-2.5 flex items-center gap-1.5">
                        <span className="text-xs font-bold text-advo-text">
                          {t(item.labelKey)}
                        </span>
                        {item.recommended ? (
                          <span className="rounded-full border border-advo-gold/40 px-1.5 py-px text-[9px] font-black tracking-wide text-[#f0b45a] uppercase">
                            {t("admin.mail.settings.recommended")}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-advo-muted">
                        {t(item.hintKey)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <FormLegend
                hint={t("admin.mail.settings.group.identityHint")}
                index={2}
                title={t("admin.mail.settings.group.identity")}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <MailField
                  id="mail-from-name"
                  label={t("admin.mail.settings.fromName")}
                  onChange={setFromName}
                  required
                  value={fromName}
                />
                <MailField
                  autoComplete="email"
                  hint={t("admin.mail.settings.fromEmailHint")}
                  id="mail-from-email"
                  label={t("admin.mail.settings.fromEmail")}
                  onChange={setFromEmail}
                  required
                  type="email"
                  value={fromEmail}
                />
              </div>
              <MailField
                autoComplete="email"
                hint={t("admin.mail.settings.replyToHint")}
                id="mail-reply-to"
                label={t("admin.mail.settings.replyTo")}
                onChange={setReplyTo}
                type="email"
                value={replyTo}
              />
            </fieldset>

            {provider === "resend" ? (
              <fieldset className="space-y-3">
                <FormLegend
                  hint={t("admin.mail.settings.group.credentialsHint")}
                  index={3}
                  title={t("admin.mail.settings.group.credentials")}
                />
                <div className="rounded-2xl border border-advo-border bg-advo-page p-4">
                  <MailField
                    autoComplete="off"
                    badge={
                      settings.resendApiKeyConfigured
                        ? t("admin.mail.settings.resendKeyConfigured")
                        : undefined
                    }
                    hint={t("admin.mail.settings.resendKeyHint")}
                    id="mail-resend-key"
                    label={t("admin.mail.settings.resendKey")}
                    onChange={setResendKey}
                    placeholder="re_..."
                    secret
                    value={resendKey}
                  />
                </div>
              </fieldset>
            ) : null}

            {provider === "smtp" ? (
              <fieldset className="space-y-3">
                <FormLegend
                  hint={t("admin.mail.settings.group.credentialsHint")}
                  index={3}
                  title={t("admin.mail.settings.group.credentials")}
                />
                <div className="space-y-4 rounded-2xl border border-advo-border bg-advo-page p-4">
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
                    <MailField
                      id="mail-smtp-host"
                      label={t("admin.mail.settings.smtpHost")}
                      onChange={setSmtpHost}
                      placeholder="smtp.gmail.com"
                      required
                      value={smtpHost}
                    />
                    <MailField
                      id="mail-smtp-port"
                      inputMode="numeric"
                      label={t("admin.mail.settings.smtpPort")}
                      onChange={setSmtpPort}
                      required
                      value={smtpPort}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <MailField
                      autoComplete="off"
                      id="mail-smtp-user"
                      label={t("admin.mail.settings.smtpUser")}
                      onChange={setSmtpUser}
                      value={smtpUser}
                    />
                    <MailField
                      autoComplete="new-password"
                      badge={
                        settings.smtp.passwordConfigured
                          ? t("admin.mail.settings.passwordConfigured")
                          : undefined
                      }
                      hint={t("admin.mail.settings.smtpPasswordHint")}
                      id="mail-smtp-password"
                      label={t("admin.mail.settings.smtpPassword")}
                      onChange={setSmtpPassword}
                      secret
                      value={smtpPassword}
                    />
                  </div>
                  <ToggleRow
                    checked={smtpSecure}
                    hint={t("admin.mail.settings.smtpSecureHint")}
                    label={t("admin.mail.settings.smtpSecure")}
                    onChange={setSmtpSecure}
                  />
                </div>
              </fieldset>
            ) : null}

            <fieldset className="space-y-3">
              <FormLegend
                badge={t("admin.mail.settings.optional")}
                hint={t("admin.mail.settings.senders.description")}
                index={provider === "fake" ? 3 : 4}
                title={t("admin.mail.settings.group.mailboxes")}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2.5 rounded-2xl border border-advo-border bg-advo-page p-4">
                  <MailField
                    autoComplete="email"
                    badge={
                      settings.otpSender?.passwordConfigured
                        ? t("admin.mail.settings.passwordConfigured")
                        : undefined
                    }
                    id="mail-otp-email"
                    label={t("admin.mail.settings.senders.otp")}
                    onChange={setOtpEmail}
                    placeholder="otp@advowifi.com"
                    type="email"
                    value={otpEmail}
                  />
                  {provider === "smtp" ? (
                    <MailField
                      autoComplete="new-password"
                      id="mail-otp-password"
                      label={t("admin.mail.settings.smtpPassword")}
                      onChange={setOtpPassword}
                      placeholder={t(
                        "admin.mail.settings.senders.passwordPlaceholder",
                      )}
                      secret
                      value={otpPassword}
                    />
                  ) : null}
                </div>
                <div className="space-y-2.5 rounded-2xl border border-advo-border bg-advo-page p-4">
                  <MailField
                    autoComplete="email"
                    badge={
                      settings.securitySender?.passwordConfigured
                        ? t("admin.mail.settings.passwordConfigured")
                        : undefined
                    }
                    id="mail-security-email"
                    label={t("admin.mail.settings.senders.security")}
                    onChange={setSecurityEmail}
                    placeholder="security@advowifi.com"
                    type="email"
                    value={securityEmail}
                  />
                  {provider === "smtp" ? (
                    <MailField
                      autoComplete="new-password"
                      id="mail-security-password"
                      label={t("admin.mail.settings.smtpPassword")}
                      onChange={setSecurityPassword}
                      placeholder={t(
                        "admin.mail.settings.senders.passwordPlaceholder",
                      )}
                      secret
                      value={securityPassword}
                    />
                  ) : null}
                </div>
              </div>
              <p className="text-[11px] leading-snug text-advo-muted">
                {t("admin.mail.settings.senders.hint")}
              </p>
            </fieldset>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-advo-border pt-4">
              <div className="flex items-center gap-1.5 text-[11px] text-advo-muted">
                <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
                {settings.updatedAt
                  ? t("admin.mail.settings.updatedBy", {
                      name: settings.updatedBy?.name ?? "—",
                      when: formatDateTime(settings.updatedAt),
                    })
                  : t("admin.mail.settings.neverSaved")}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip
                  tone={provider === "fake" || !ready ? "warning" : "success"}
                >
                  {provider === "fake"
                    ? t("admin.mail.settings.readiness.simulated")
                    : ready
                      ? t("admin.mail.settings.readiness.ready")
                      : t("admin.mail.settings.readiness.notReady")}
                </StatusChip>
                <Button
                  className="h-11"
                  isDisabled={pending}
                  type="submit"
                  variant="primary"
                >
                  {pending
                    ? t("admin.mail.settings.saving")
                    : t("admin.mail.settings.save")}
                </Button>
              </div>
            </div>
          </form>
        </Card>

        <aside className="space-y-5">
          <SetupChecklist
            credentialReady={credentialReady}
            provider={provider}
            ready={ready}
            settings={settings}
            t={t}
          />

          <Card className="gap-3 p-5 shadow-advo-card ring-1 ring-advo-border/70">
            <SectionHeader
              icon={<ShieldCheck />}
              iconTone="success"
              title={t("admin.mail.test.title")}
            />
            <p className="text-xs leading-relaxed text-advo-muted">
              {t("admin.mail.test.description")}
            </p>
            <TestMailForm t={t} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function TestMailForm({ t }: { t: T }) {
  const [to, setTo] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.post<{ delivered: boolean; simulated: boolean }>(
        "/admin/mail/test",
        { to },
      );
      setMessage(
        result.simulated
          ? t("admin.mail.test.simulated", { to })
          : t("admin.mail.test.success", { to }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-1 space-y-3" onSubmit={send}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-advo-muted" />
          <input
            aria-label={t("admin.mail.test.to")}
            autoComplete="email"
            className={`${FIELD_CLASS} pl-9`}
            id="mail-test-to"
            onChange={(e) => setTo(e.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={to}
          />
        </div>
        <Button
          className="h-11 shrink-0"
          isDisabled={pending}
          type="submit"
          variant="primary"
        >
          <Send className="size-3.5" aria-hidden="true" />
          {pending ? t("admin.mail.test.sending") : t("admin.mail.test.send")}
        </Button>
      </div>
      <p className="text-[11px] leading-snug text-advo-muted">
        {t("admin.mail.test.hint")}
      </p>
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </form>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Transport settings building blocks
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * One field in the transport form.
 *
 * The dashboard's shared `Input` is 36px tall with a 16px radius, which reads
 * as a chip next to 12px body copy. These fields are the only place an operator
 * types a secret, so they get a full 44px hit area, a label above the control
 * and a focus ring that is visible on the charcoal canvas.
 */
const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-advo-border bg-advo-page px-3.5 text-sm font-medium text-advo-text outline-none transition placeholder:text-advo-muted/60 focus:border-advo-gold/60 focus:ring-2 focus:ring-advo-gold/15";

function MailField({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  hint,
  badge,
  secret,
  inputMode,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "url";
  placeholder?: string;
  required?: boolean;
  hint?: string;
  /** A small pill beside the label, e.g. "A key is already stored". */
  badge?: string;
  /** Renders a reveal toggle and starts masked. */
  secret?: boolean;
  inputMode?: "text" | "numeric" | "email";
  autoComplete?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const inputType = secret && !revealed ? "password" : type;

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label
          className="text-[11px] font-bold tracking-wide text-advo-muted uppercase"
          htmlFor={id}
        >
          {label}
        </label>
        {badge ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
            <CheckCircle2 className="size-2.5" aria-hidden="true" />
            {badge}
          </span>
        ) : null}
      </div>
      <div className="relative">
        <input
          autoComplete={autoComplete}
          className={secret ? `${FIELD_CLASS} pr-11` : FIELD_CLASS}
          id={id}
          inputMode={inputMode}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          type={inputType}
          value={value}
        />
        {secret ? (
          <button
            aria-label={revealed ? "Hide" : "Show"}
            className="absolute inset-y-0 right-1.5 my-auto grid size-8 place-items-center rounded-lg text-advo-muted transition hover:bg-advo-surface-soft hover:text-advo-text"
            onClick={() => setRevealed((open) => !open)}
            type="button"
          >
            {revealed ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-1.5 text-[11px] leading-snug text-advo-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A labelled group inside the form, drawn as a numbered step. */
function FormLegend({
  index,
  title,
  hint,
  badge,
}: {
  index: number;
  title: string;
  hint?: string;
  badge?: string;
}) {
  return (
    <legend className="w-full">
      <span className="flex items-start gap-2.5">
        <span className="mt-px grid size-5 shrink-0 place-items-center rounded-md bg-advo-blue/20 text-[10px] font-black text-[#8cbef0]">
          {index}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-advo-text">{title}</span>
            {badge ? (
              <span className="rounded-full border border-advo-border bg-advo-surface-soft px-2 py-0.5 text-[10px] font-bold text-advo-muted">
                {badge}
              </span>
            ) : null}
          </span>
          {hint ? (
            <span className="mt-0.5 block text-[11px] leading-snug text-advo-muted">
              {hint}
            </span>
          ) : null}
        </span>
      </span>
    </legend>
  );
}

/** A boolean option next to its explanation, for values that are not a text box. */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-advo-border bg-advo-surface-soft/40 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-xs font-bold text-advo-text">{label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-advo-muted">
          {hint}
        </p>
      </div>
      <Switch
        aria-label={label}
        isSelected={checked}
        onChange={onChange}
        size="sm"
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <span className="sr-only">{label}</span>
        </Switch.Content>
      </Switch>
    </div>
  );
}

/**
 * What still stands between this transport and a delivered email.
 *
 * The headline answers the question an operator actually has ("can members sign
 * up right now?"), the chips name the exact fields, and the button jumps to the
 * first one instead of leaving them to scan the form.
 */
function TransportHealth({
  ready,
  fake,
  provider,
  gaps,
  onFix,
  onTest,
  t,
}: {
  ready: boolean;
  fake: boolean;
  provider: MailProvider;
  gaps: MailRequirementCode[];
  onFix: () => void;
  onTest: () => void;
  t: T;
}) {
  const palette = ready
    ? "border-emerald-500/25 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(28,30,34,0)_65%)]"
    : "border-amber-500/30 bg-[linear-gradient(135deg,rgba(251,161,2,0.14),rgba(28,30,34,0)_65%)]";

  return (
    <section
      className={`rounded-card border p-5 shadow-advo-card ${palette}`}
      role="status"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span
          className={`grid size-12 shrink-0 place-items-center rounded-2xl ring-4 ${
            ready
              ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/10"
              : "bg-amber-500/15 text-amber-300 ring-amber-500/10"
          }`}
        >
          {ready ? (
            <ShieldCheck className="size-6" />
          ) : (
            <TriangleAlert className="size-6" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-black tracking-tight text-advo-text">
              {fake
                ? t("admin.mail.health.simulatedTitle")
                : ready
                  ? t("admin.mail.health.readyTitle")
                  : t("admin.mail.health.blockedTitle")}
            </h2>
            <StatusChip tone={fake || !ready ? "warning" : "success"}>
              {t(`admin.mail.settings.provider.${provider}` as MessageKey)}
            </StatusChip>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-advo-muted">
            {fake
              ? t("admin.mail.health.simulatedBody")
              : ready
                ? t("admin.mail.health.readyBody")
                : t("admin.mail.health.blockedBody")}
          </p>
          {gaps.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {gaps.map((code) => (
                <li
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-200"
                  key={code}
                >
                  <CircleAlert className="size-3" aria-hidden="true" />
                  {t(REQUIREMENT_KEYS[code])}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {ready ? (
            <Button
              onPress={onTest}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Send className="size-3.5" aria-hidden="true" />
              {t("admin.mail.health.test")}
            </Button>
          ) : gaps.length ? (
            <Button onPress={onFix} size="sm" type="button" variant="primary">
              {t("admin.mail.health.fix")}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** The four things a working transport needs, marked from what the API reported. */
function SetupChecklist({
  settings,
  provider,
  credentialReady,
  ready,
  t,
}: {
  settings: MailSettingsView;
  provider: MailProvider;
  credentialReady: boolean;
  ready: boolean;
  t: T;
}) {
  const providerBlocked = provider === "fake" && settings.fakeAllowed === false;
  const mailboxes = Boolean(settings.otpSender || settings.securitySender);

  const items = [
    {
      id: "provider",
      label: t("admin.mail.checklist.provider"),
      detail: t(`admin.mail.settings.provider.${provider}` as MessageKey),
      state: providerBlocked ? "todo" : "done",
    },
    {
      id: "from",
      label: t("admin.mail.checklist.fromAddress"),
      detail: settings.fromEmail || "—",
      state: settings.fromEmail.trim().length ? "done" : "todo",
    },
    {
      id: "credentials",
      label: t("admin.mail.checklist.credentials"),
      detail:
        provider === "fake"
          ? t("admin.mail.checklist.notNeeded")
          : credentialReady
            ? t("admin.mail.checklist.stored")
            : t("admin.mail.checklist.notStored"),
      state: credentialReady ? "done" : "todo",
    },
    {
      id: "mailboxes",
      label: t("admin.mail.checklist.mailboxes"),
      detail: mailboxes
        ? t("admin.mail.checklist.stored")
        : t("admin.mail.checklist.optional"),
      state: mailboxes ? "done" : "optional",
    },
  ] as const;

  return (
    <Card className="gap-3 p-5 shadow-advo-card ring-1 ring-advo-border/70">
      <SectionHeader
        description={t("admin.mail.checklist.description")}
        icon={<CheckCircle2 />}
        iconTone={ready ? "success" : "warning"}
        title={t("admin.mail.checklist.title")}
      />
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li
            className="flex items-start gap-2.5 rounded-xl px-1 py-2"
            key={item.id}
          >
            {item.state === "done" ? (
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-emerald-400"
                aria-hidden="true"
              />
            ) : item.state === "optional" ? (
              <Circle
                className="mt-0.5 size-4 shrink-0 text-advo-muted/60"
                aria-hidden="true"
              />
            ) : (
              <CircleAlert
                className="mt-0.5 size-4 shrink-0 text-amber-400"
                aria-hidden="true"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-advo-text">
                {item.label}
              </span>
              <span
                className="mt-0.5 block truncate text-[11px] text-advo-muted"
                title={item.detail}
              >
                {item.detail}
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                item.state === "done"
                  ? "bg-emerald-500/10 text-emerald-300"
                  : item.state === "optional"
                    ? "bg-advo-surface-soft text-advo-muted"
                    : "bg-amber-500/10 text-amber-300"
              }`}
            >
              {item.state === "done"
                ? t("admin.mail.checklist.done")
                : item.state === "optional"
                  ? t("admin.mail.checklist.optional")
                  : t("admin.mail.checklist.todo")}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ComposeTab({
  data,
  onSent,
  t,
}: {
  data: MailOverview;
  onSent: () => Promise<void>;
  t: T;
}) {
  const [kind, setKind] = useState<AdminMailKind>("INFO");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const recipients = data.recipients;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return recipients;
    return recipients.filter((r) =>
      [r.name, r.email, r.organization ?? "", r.role]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [recipients, query]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggle(email: string) {
    if (!selected.includes(email) && selected.length >= 50) {
      setError(t("admin.mail.compose.limit"));
      return;
    }
    setError(null);
    setSelected((prev) =>
      prev.includes(email) ? prev.filter((x) => x !== email) : [...prev, email],
    );
  }

  function addRole(role: "RESELLER" | "AGENT") {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of recipients) if (r.role === role) next.add(r.email);
      return Array.from(next).slice(0, 50);
    });
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) {
      setError(t("admin.mail.compose.error"));
      return;
    }
    setPending(true);
    setError(null);
    setFlash(null);
    try {
      const result = await api.post<{
        sent: number;
        failed: number;
        simulated: number;
      }>("/admin/mail/send", {
        recipients: selected,
        kind,
        subject,
        body,
      });
      const parts = [t("admin.mail.compose.success", { sent: result.sent })];
      if (result.simulated)
        parts.push(
          t("admin.mail.compose.simulated", { count: result.simulated }),
        );
      if (result.failed)
        parts.push(t("admin.mail.compose.partial", { failed: result.failed }));
      setFlash(parts.join(" "));
      setSubject("");
      setBody("");
      setSelected([]);
      await onSent();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]"
      onSubmit={send}
    >
      <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
        <SectionHeader
          description={t("admin.mail.compose.description")}
          icon={<Send />}
          iconTone="violet"
          title={t("admin.mail.compose.title")}
        />

        {flash ? <Notice tone="success">{flash}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}

        <div>
          <p className="mb-2 text-[11px] font-bold tracking-wider text-advo-muted uppercase">
            {t("admin.mail.compose.kind")}
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {KINDS.map((item) => (
              <button
                className={
                  kind === item.id
                    ? "rounded-xl border border-advo-gold/50 bg-advo-gold-soft px-3 py-2 text-xs font-bold text-[#b15f00]"
                    : "rounded-xl border border-advo-border bg-advo-page px-3 py-2 text-xs font-bold text-advo-muted transition hover:bg-white"
                }
                key={item.id}
                onClick={() => setKind(item.id)}
                type="button"
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <MailField
          id="mail-subject"
          label={t("admin.mail.compose.subject")}
          onChange={setSubject}
          placeholder={t("admin.mail.compose.subjectPlaceholder")}
          required
          value={subject}
        />

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              className="text-[11px] font-bold tracking-wide text-advo-muted uppercase"
              htmlFor="mail-body"
            >
              {t("admin.mail.compose.body")}
            </label>
            <span className="text-[10px] font-semibold text-advo-muted tabular-nums">
              {body.length.toLocaleString()} / 4,000
            </span>
          </div>
          <textarea
            className={`${FIELD_CLASS} h-auto min-h-[220px] resize-y py-3 leading-relaxed`}
            id="mail-body"
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("admin.mail.compose.bodyPlaceholder")}
            required
            rows={9}
            value={body}
          />
          <p className="mt-1.5 text-[11px] text-advo-muted">
            {t("admin.mail.compose.bodyHint")}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-advo-border pt-4">
          <span className="text-xs font-semibold text-advo-muted">
            {t("admin.mail.compose.selected", { count: selected.length })}
          </span>
          <Button
            className="h-11"
            isDisabled={pending || selected.length === 0}
            type="submit"
            variant="primary"
          >
            {pending
              ? t("admin.mail.compose.sending")
              : t("admin.mail.compose.send")}
          </Button>
        </div>
      </Card>

      <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
        <SectionHeader
          description={t("admin.mail.compose.recipientsHint")}
          icon={<Users />}
          iconTone="accent"
          title={t("admin.mail.compose.recipients")}
        />

        <div className="flex flex-wrap gap-1.5">
          <Button
            onPress={() => addRole("RESELLER")}
            size="sm"
            type="button"
            variant="secondary"
          >
            {t("admin.mail.compose.selectResellers")}
          </Button>
          <Button
            onPress={() => addRole("AGENT")}
            size="sm"
            type="button"
            variant="secondary"
          >
            {t("admin.mail.compose.selectAgents")}
          </Button>
          <Button
            onPress={() => setSelected([])}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("admin.mail.compose.clearSelection")}
          </Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-advo-muted" />
          <input
            aria-label={t("admin.mail.compose.searchRecipients")}
            className={`${FIELD_CLASS} pl-9`}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("admin.mail.compose.searchRecipients")}
            type="search"
            value={query}
          />
        </div>

        <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
          {visible.length === 0 ? (
            <p className="py-6 text-center text-xs text-advo-muted">
              {t("admin.mail.compose.noRecipients")}
            </p>
          ) : (
            visible.map((recipient) => {
              const checked = selectedSet.has(recipient.email);
              return (
                <label
                  className={
                    checked
                      ? "flex cursor-pointer items-start gap-2.5 rounded-xl border border-advo-gold/40 bg-advo-gold-soft p-2.5"
                      : "flex cursor-pointer items-start gap-2.5 rounded-xl border border-transparent p-2.5 transition hover:border-advo-border hover:bg-advo-page"
                  }
                  key={recipient.id}
                >
                  <input
                    checked={checked}
                    className="mt-0.5 size-4 cursor-pointer rounded border-advo-border accent-advo-gold"
                    onChange={() => toggle(recipient.email)}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-advo-text">
                      {recipient.name}
                    </span>
                    <span className="block truncate text-[11px] text-advo-muted">
                      {recipient.email}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-advo-muted">
                      {recipient.role === "RESELLER" ? "Reseller" : "Agent"}
                      {recipient.organization
                        ? ` · ${recipient.organization}`
                        : ""}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>
      </Card>
    </form>
  );
}

function ActivityTab({
  data,
  onRefresh,
  t,
}: {
  data: MailOverview;
  onRefresh: () => Promise<void>;
  t: T;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.messages.filter((row) => {
      if (state !== "all" && row.state !== state) return false;
      if (!needle) return true;
      return [row.to, row.subject ?? "", row.template, row.bodyPreview ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data.messages, query, state]);

  const columns = [
    {
      key: "to",
      header: t("admin.mail.activity.col.recipient"),
      isRowHeader: true,
      render: (row: MailMessageView) => (
        <span className="block">
          <span className="block truncate text-xs font-semibold text-advo-text">
            {row.to}
          </span>
          <span className="block truncate text-[10px] text-advo-muted">
            {row.template}
          </span>
        </span>
      ),
    },
    {
      key: "subject",
      header: t("admin.mail.activity.col.subject"),
      render: (row: MailMessageView) => (
        <span className="block max-w-[320px]">
          <span className="block truncate text-xs text-advo-text">
            {row.subject ?? t("admin.mail.activity.noSubject")}
          </span>
          {row.bodyPreview ? (
            <span
              className="mt-0.5 block truncate text-[10px] text-advo-muted"
              title={row.bodyPreview}
            >
              {row.bodyPreview}
            </span>
          ) : null}
          {row.error ? (
            <span
              className="mt-0.5 block truncate text-[10px] text-red-600"
              title={row.error}
            >
              {row.error}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "state",
      header: t("admin.mail.activity.col.status"),
      render: (row: MailMessageView) => (
        <StatusChip tone={STATUS_TONE[row.state] ?? "default"}>
          {t(`admin.mail.activity.status.${row.state}` as MessageKey)}
        </StatusChip>
      ),
    },
    {
      key: "provider",
      header: t("admin.mail.activity.col.provider"),
      render: (row: MailMessageView) => (
        <span className="text-xs text-advo-muted">{row.provider ?? "—"}</span>
      ),
    },
    {
      key: "time",
      header: t("admin.mail.activity.col.time"),
      render: (row: MailMessageView) => (
        <span className="whitespace-nowrap text-[11px] text-advo-muted">
          {formatDateTime(row.sentAt ?? row.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
      <SectionHeader
        action={
          <Button
            isDisabled={refreshing}
            onPress={async () => {
              setRefreshing(true);
              try {
                await onRefresh();
              } finally {
                setRefreshing(false);
              }
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            <RefreshCw
              className={refreshing ? "size-3.5 animate-spin" : "size-3.5"}
              aria-hidden="true"
            />
            {t("admin.mail.activity.refresh")}
          </Button>
        }
        description={t("admin.mail.activity.description")}
        icon={<Inbox />}
        iconTone="accent"
        title={t("admin.mail.activity.title")}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-advo-muted" />
          <input
            aria-label={t("admin.mail.activity.searchPlaceholder")}
            className={`${FIELD_CLASS} pl-9`}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("admin.mail.activity.searchPlaceholder")}
            type="search"
            value={query}
          />
        </div>
        <select
          aria-label={t("admin.mail.activity.col.status")}
          className={`${FIELD_CLASS} w-auto pr-8`}
          onChange={(e) => setState(e.target.value)}
          value={state}
        >
          <option value="all">{t("admin.mail.activity.filter.all")}</option>
          <option value="sent">{t("admin.mail.activity.status.sent")}</option>
          <option value="failed">
            {t("admin.mail.activity.status.failed")}
          </option>
          <option value="simulated">
            {t("admin.mail.activity.status.simulated")}
          </option>
          <option value="queued">
            {t("admin.mail.activity.status.queued")}
          </option>
        </select>
      </div>

      <AdvoTable
        columns={columns}
        empty={
          <span className="flex flex-col items-center gap-1">
            <SoftIcon size="lg" tone="accent">
              <Inbox />
            </SoftIcon>
            <span className="mt-1 text-sm font-bold">
              {t("admin.mail.activity.empty")}
            </span>
            <span className="max-w-sm text-xs text-advo-muted">
              {t("admin.mail.activity.emptyHint")}
            </span>
          </span>
        }
        label={t("admin.mail.activity.title")}
        rowKey={(row) => row.id}
        rows={rows}
      />
    </Card>
  );
}
