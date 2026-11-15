"use client";

import { useEffect, useState } from "react";
import { Notice } from "@advo/ui";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cx } from "@/features/marketing/ui";
import { OtpInput } from "@/features/auth/auth-ui";
import { CheckCircle2, Mail, RefreshCw, ShieldCheck, Timer } from "lucide-react";

type Role = "RESELLER" | "AGENT";

type StartResponse = {
  accepted: boolean;
  otpRequired: boolean;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  delivery?: "simulated" | "email";
  devOtp?: string;
};

type VerifyResponse = {
  verificationToken: string;
  expiresAt: string;
  email: string;
  role: Role;
};

/**
 * The email-proof step shared by both self-registration forms.
 *
 * A code is requested for an explicit email address, and the ticket that comes
 * back is only accepted by the parent while the form still holds that same
 * address. Editing the email therefore invalidates the proof instead of
 * silently registering a different mailbox.
 */
export function EmailOtpStep({
  email,
  role,
  verified,
  onVerified,
  body,
}: {
  email: string;
  role: Role;
  verified: boolean;
  onVerified: (token: string, email: string) => void;
  body: string;
}) {
  const { t } = useI18n();
  const [stage, setStage] = useState<"idle" | "sent">(verified ? "sent" : "idle");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(10);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const normalized = email.trim().toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);

  function applyStart(result: StartResponse) {
    setMinutes(Math.max(1, Math.round(result.expiresInSeconds / 60)));
    setCooldown(Math.max(0, result.resendAfterSeconds));
    setDevCode(result.devOtp ?? null);
    setInfo(t("auth.otp.sent", { email: normalized }));
    setStage("sent");
  }

  async function send() {
    if (!valid) {
      setError(t("auth.register.error.email"));
      return;
    }
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      const result = await api.post<StartResponse>("/auth/register/otp/request", {
        email: normalized,
        role,
      });
      applyStart(result);
      setCode("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function verify(input?: string) {
    const candidate = (input ?? code).replace(/\D/g, "");
    if (candidate.length !== 6) {
      setError(t("auth.otp.error"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await api.post<VerifyResponse>("/auth/register/otp/verify", {
        email: normalized,
        role,
        code: candidate,
      });
      onVerified(result.verificationToken, result.email);
      setInfo(null);
    } catch (err) {
      setError(errorMessage(err));
      setCode("");
    } finally {
      setPending(false);
    }
  }

  if (verified) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-emerald-900">{t("auth.otp.verified")}</p>
          <p className="mt-0.5 truncate text-[11px] leading-relaxed text-emerald-800">
            {t("auth.otp.verifiedBody")}{" "}
            <span className="font-semibold">{normalized}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-advo-gold/30 bg-[linear-gradient(180deg,#fffaf1_0%,#ffffff_70%)] p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-advo-gold-soft text-[#b15f00]">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-xs font-black text-advo-text">{t("auth.otp.stepTitle")}</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-advo-muted">{body}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-advo-gold/30 bg-white px-2 py-0.5 text-[9px] font-black tracking-wider text-[#b15f00] uppercase">
          {t("auth.otp.requiredBadge")}
        </span>
      </header>

      <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-white/70 px-2 py-1 text-[11px] font-semibold text-advo-text">
        <Mail className="size-3.5 shrink-0 text-advo-muted" aria-hidden="true" />
        <span className="truncate">{normalized || "—"}</span>
      </p>

      <div className="mt-3 space-y-2.5">
        {info ? <Notice tone="success">{info}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {devCode ? <Notice tone="warning">{t("auth.otp.devCode", { code: devCode })}</Notice> : null}

        {stage === "idle" ? (
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)] px-4 py-3 text-xs font-black text-advo-charcoal shadow-md transition active:scale-[0.99] disabled:opacity-60"
            disabled={pending}
            onClick={() => void send()}
            type="button"
          >
            <Mail className="size-4" aria-hidden="true" />
            {pending ? t("auth.otp.sending") : t("auth.otp.send")}
          </button>
        ) : (
          <>
            <div>
              <p className="mb-1.5 text-[10px] font-bold tracking-[0.08em] text-advo-text uppercase">
                {t("auth.otp.codeLabel")}
              </p>
              <OtpInput
                autoFocus
                disabled={pending}
                invalid={Boolean(error)}
                label={t("auth.otp.codeLabel")}
                onChange={setCode}
                onComplete={(value) => void verify(value)}
                value={code}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-advo-muted">
              <span className="inline-flex items-center gap-1">
                <Timer className="size-3" aria-hidden="true" />
                {t("auth.otp.expires", { minutes })}
              </span>
              {cooldown > 0 ? (
                <span>{t("auth.otp.cooldown", { seconds: cooldown })}</span>
              ) : (
                <button
                  className="inline-flex items-center gap-1 font-bold text-[#b15f00] underline underline-offset-2 disabled:opacity-60"
                  disabled={pending}
                  onClick={() => void send()}
                  type="button"
                >
                  <RefreshCw className="size-3" aria-hidden="true" />
                  {t("auth.otp.resend")}
                </button>
              )}
            </div>

            <button
              className={cx(
                "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)] px-4 py-3 text-xs font-black text-advo-charcoal shadow-md transition active:scale-[0.99] disabled:opacity-60",
              )}
              disabled={pending || code.length !== 6}
              onClick={() => void verify()}
              type="button"
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              {pending ? t("auth.otp.verifying") : t("auth.otp.verify")}
            </button>
          </>
        )}
      </div>

      <p className="mt-2.5 text-[10px] leading-relaxed text-advo-muted">{t("auth.otp.securityNote")}</p>
    </section>
  );
}
