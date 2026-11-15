"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Notice } from "@advo/ui";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AdvoLogo } from "@/features/marketing/AdvoLogo";
import { AuthShowcasePanel } from "@/features/auth/AuthShowcasePanel";
import { LocaleSwitcher } from "@/features/common/LocaleSwitcher";
import { buttonClasses, cx } from "@/features/marketing/ui";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Timer,
} from "lucide-react";

const fieldBase =
  "w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-3 text-sm text-advo-text outline-none transition placeholder:text-advo-muted focus:border-advo-gold/60 focus:bg-white focus:ring-2 focus:ring-advo-gold/25 disabled:opacity-60";
const fieldWithIcon = cx(fieldBase, "pl-11");
const labelClass = "mb-1.5 block text-xs font-bold tracking-wide text-advo-text uppercase";
const linkAccent =
  "font-bold text-[#b15f00] underline underline-offset-2 transition hover:text-advo-orange";

type Step = 1 | 2 | 3;

type StartResponse = {
  accepted: boolean;
  otpRequired: boolean;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  delivery?: "simulated" | "email";
  devOtp?: string;
};

type VerifyResponse = { resetToken: string; expiresAt: string; email: string };

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [expiresInMinutes, setExpiresInMinutes] = useState(10);
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  // One shared countdown for both "resend" buttons.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  function applyStart(result: StartResponse) {
    setExpiresInMinutes(Math.max(1, Math.round(result.expiresInSeconds / 60)));
    setCooldown(Math.max(0, result.resendAfterSeconds));
    setDevCode(result.devOtp ?? null);
    setInfo(t("auth.forgot.sent", { email }));
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      const result = await api.post<StartResponse>("/auth/forgot-password", { email });
      applyStart(result);
      setStep(2);
    } catch (err) {
      // The API is deliberately non-enumerating; a transport failure is still
      // worth surfacing because no code can arrive.
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    if (cooldown > 0 || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.post<StartResponse>("/auth/forgot-password", { email });
      applyStart(result);
      setCode("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError(t("auth.otp.error"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await api.post<VerifyResponse>("/auth/forgot-password/verify-otp", { email, code });
      setResetToken(result.resetToken);
      setInfo(t("auth.forgot.verifiedNote"));
      setStep(3);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) {
      setError(t("auth.forgot.tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.forgot.mismatch"));
      return;
    }
    if (!resetToken) {
      setError(t("auth.forgot.invalidCode"));
      setStep(2);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token: resetToken, password });
      setDone(true);
      setPassword("");
      setConfirm("");
      setResetToken(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const stepMeta: Array<{ n: Step; label: string }> = [
    { n: 1, label: t("auth.forgot.stepEmail") },
    { n: 2, label: t("auth.forgot.stepCode") },
    { n: 3, label: t("auth.forgot.stepPassword") },
  ];

  return (
    <div className="flex min-h-screen bg-advo-page text-advo-text selection:bg-[#FBA102] selection:text-advo-charcoal">
      <AuthShowcasePanel type="login" />

      <div className="relative flex w-full flex-col justify-between overflow-y-auto p-6 sm:p-10 lg:w-[52%] xl:w-1/2 lg:p-12 xl:p-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 right-0 size-72 rounded-full bg-[radial-gradient(circle,rgba(251,161,2,0.08),transparent_70%)] blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-1/4 size-64 rounded-full bg-[radial-gradient(circle,rgba(241,99,4,0.05),transparent_70%)] blur-3xl"
        />

        <div className="relative z-10 hidden items-center justify-between lg:flex">
          <LocaleSwitcher compact showIcon={false} variant="light" />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold text-advo-muted transition hover:border-advo-border hover:bg-white hover:text-advo-text"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {t("auth.common.backToMainSite")}
          </Link>
        </div>

        <div className="relative z-10 mb-2 flex items-center justify-between lg:hidden">
          <AdvoLogo size="sm" variant="light" />
          <div className="flex items-center gap-2">
            <LocaleSwitcher compact showIcon={false} variant="light" />
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-xs font-semibold text-advo-muted transition hover:text-advo-text"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              {t("auth.forgot.backToLogin")}
            </Link>
          </div>
        </div>

        <div className="relative z-10 flex flex-1 items-center justify-center py-8">
          <div className="mx-auto w-full max-w-[26rem] space-y-6">
            <div className="relative overflow-hidden rounded-card border border-advo-border bg-white p-7 shadow-advo-card sm:p-9">
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#fba102_0%,#f16304_100%)]"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-20 size-44 rounded-full bg-[radial-gradient(circle,rgba(251,161,2,0.12),transparent_70%)] blur-2xl"
              />

              <header className="relative mb-6 space-y-2.5">
                <span className="inline-flex items-center gap-2 rounded-full border border-advo-gold/30 bg-advo-gold-soft px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-[#b15f00] uppercase">
                  <KeyRound className="size-3" aria-hidden="true" />
                  {t("auth.forgot.badge")}
                </span>
                <h1 className="text-2xl font-black tracking-tight text-advo-text sm:text-[1.7rem]">
                  {done
                    ? t("auth.forgot.success")
                    : step === 1
                      ? t("auth.forgot.title")
                      : step === 2
                        ? t("auth.forgot.codeTitle")
                        : t("auth.forgot.passwordTitle")}
                </h1>
                <p className="text-sm leading-relaxed text-advo-muted">
                  {done
                    ? t("auth.forgot.success")
                    : step === 1
                      ? t("auth.forgot.subtitle")
                      : step === 2
                        ? t("auth.forgot.codeBody", { email })
                        : t("auth.forgot.passwordBody")}
                </p>
              </header>

              {!done ? (
                <div className="relative mb-6">
                  <div className="absolute top-3.5 right-5 left-5 h-0.5 bg-advo-border" />
                  <div
                    className="absolute top-3.5 left-5 h-0.5 bg-[linear-gradient(90deg,#fba102,#f16304)] transition-all duration-300"
                    style={{ width: step === 1 ? "0%" : step === 2 ? "calc(50% - 1.25rem)" : "calc(100% - 2.5rem)" }}
                  />
                  <ol className="relative z-10 flex items-start justify-between">
                    {stepMeta.map((s) => {
                      const active = step === s.n;
                      const complete = step > s.n;
                      return (
                        <li className="flex flex-col items-center" key={s.n}>
                          <span
                            className={cx(
                              "flex size-7 items-center justify-center rounded-full text-[11px] font-bold transition-all",
                              active || complete
                                ? "bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)] text-advo-charcoal shadow-md ring-4 ring-advo-gold-soft"
                                : "bg-white text-advo-muted ring-1 ring-advo-border",
                            )}
                          >
                            {complete ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : s.n}
                          </span>
                          <span
                            className={cx(
                              "mt-1.5 text-[10px] font-bold",
                              active ? "text-[#b15f00]" : "text-advo-muted",
                            )}
                          >
                            {s.label}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : null}

              {info && !done ? (
                <div className="relative mb-4">
                  <Notice tone="success">{info}</Notice>
                </div>
              ) : null}
              {error ? (
                <div className="relative mb-4">
                  <Notice tone="danger">{error}</Notice>
                </div>
              ) : null}
              {devCode && step === 2 ? (
                <div className="relative mb-4">
                  <Notice tone="warning">{t("auth.forgot.devCode", { code: devCode })}</Notice>
                </div>
              ) : null}

              {done ? (
                <div className="relative space-y-4">
                  <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <p className="text-xs leading-relaxed text-emerald-900">{t("auth.forgot.success")}</p>
                  </div>
                  <Link
                    className={buttonClasses({ variant: "gold", size: "lg", className: "w-full" })}
                    href="/login"
                  >
                    {t("auth.forgot.backToLogin")}
                    <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                  </Link>
                </div>
              ) : step === 1 ? (
                <form className="relative space-y-4" onSubmit={requestCode}>
                  <div>
                    <label className={labelClass} htmlFor="reset-email">
                      {t("auth.forgot.emailLabel")}
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                        <Mail className="size-4" aria-hidden="true" />
                      </div>
                      <input
                        autoComplete="email"
                        autoFocus
                        className={fieldWithIcon}
                        id="reset-email"
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t("auth.field.emailPlaceholder")}
                        required
                        type="email"
                        value={email}
                      />
                    </div>
                  </div>

                  <button
                    className={buttonClasses({
                      variant: "gold",
                      size: "lg",
                      className: "w-full shadow-[0_16px_36px_-14px_rgba(251,161,2,0.75)]",
                    })}
                    disabled={pending}
                    type="submit"
                  >
                    <span>{pending ? t("auth.forgot.sending") : t("auth.forgot.sendCode")}</span>
                    <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                  </button>
                </form>
              ) : step === 2 ? (
                <form className="relative space-y-4" onSubmit={verify}>
                  <div>
                    <label className={labelClass} htmlFor="reset-code">
                      {t("auth.forgot.codeLabel")}
                    </label>
                    <input
                      autoComplete="one-time-code"
                      autoFocus
                      className="w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-3.5 text-center font-mono text-2xl font-black tracking-[0.35em] text-advo-text outline-none transition focus:border-advo-gold/60 focus:bg-white focus:ring-2 focus:ring-advo-gold/25"
                      id="reset-code"
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      pattern="\d{6}"
                      placeholder="000000"
                      required
                      value={code}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 text-[11px] text-advo-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Timer className="size-3.5" aria-hidden="true" />
                      {t("auth.otp.expires", { minutes: expiresInMinutes })}
                    </span>
                    {cooldown > 0 ? (
                      <span>{t("auth.forgot.cooldown", { seconds: cooldown })}</span>
                    ) : (
                      <button
                        className="font-bold text-[#b15f00] underline underline-offset-2"
                        disabled={pending}
                        onClick={() => void resend()}
                        type="button"
                      >
                        {t("auth.forgot.resend")}
                      </button>
                    )}
                  </div>

                  <button
                    className={buttonClasses({
                      variant: "gold",
                      size: "lg",
                      className: "w-full shadow-[0_16px_36px_-14px_rgba(251,161,2,0.75)]",
                    })}
                    disabled={pending}
                    type="submit"
                  >
                    <span>{pending ? t("auth.forgot.verifying") : t("auth.forgot.verify")}</span>
                    <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
                  </button>

                  <button
                    className="mx-auto block text-[11px] font-semibold text-advo-muted underline underline-offset-2 transition hover:text-advo-text"
                    onClick={() => {
                      setStep(1);
                      setCode("");
                      setInfo(null);
                      setError(null);
                      setDevCode(null);
                    }}
                    type="button"
                  >
                    {t("auth.forgot.changeEmail")}
                  </button>
                </form>
              ) : (
                <form className="relative space-y-4" onSubmit={reset}>
                  <div>
                    <label className={labelClass} htmlFor="reset-password">
                      {t("auth.forgot.newPassword")}
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                        <Lock className="size-4" aria-hidden="true" />
                      </div>
                      <input
                        autoComplete="new-password"
                        autoFocus
                        className={cx(fieldWithIcon, "pr-11")}
                        id="reset-password"
                        minLength={10}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        required
                        type={showPassword ? "text" : "password"}
                        value={password}
                      />
                      <button
                        aria-label={showPassword ? t("auth.password.hide") : t("auth.password.show")}
                        className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-advo-muted transition hover:text-advo-text"
                        onClick={() => setShowPassword((v) => !v)}
                        tabIndex={-1}
                        type="button"
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" aria-hidden="true" />
                        ) : (
                          <Eye className="size-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass} htmlFor="reset-confirm">
                      {t("auth.forgot.confirmPassword")}
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                        <Lock className="size-4" aria-hidden="true" />
                      </div>
                      <input
                        autoComplete="new-password"
                        className={fieldWithIcon}
                        id="reset-confirm"
                        minLength={10}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="••••••••••••"
                        required
                        type={showPassword ? "text" : "password"}
                        value={confirm}
                      />
                    </div>
                  </div>

                  <p className="flex items-start gap-2 rounded-xl bg-advo-page p-3 text-[11px] leading-relaxed text-advo-muted">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    {t("auth.forgot.passwordBody")}
                  </p>

                  <button
                    className={buttonClasses({
                      variant: "gold",
                      size: "lg",
                      className: "w-full shadow-[0_16px_36px_-14px_rgba(251,161,2,0.75)]",
                    })}
                    disabled={pending}
                    type="submit"
                  >
                    <span>{pending ? t("auth.forgot.resetting") : t("auth.forgot.reset")}</span>
                    <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                  </button>
                </form>
              )}

              <div className="relative mt-8 border-t border-advo-border pt-6 text-center text-sm text-advo-muted">
                <Link className={linkAccent} href="/login">
                  {t("auth.forgot.backToLogin")}
                </Link>
              </div>
            </div>

            <p className="flex items-center justify-center gap-2 text-center text-[11px] text-advo-muted">
              <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden="true" />
              <span>{t("auth.forgot.expireHint")}</span>
            </p>
          </div>
        </div>

        <footer className="relative z-10 pt-4 text-center text-xs text-advo-muted">
          &copy; {new Date().getFullYear()} Advo TZ · {t("auth.common.footerTagline")}
        </footer>
      </div>
    </div>
  );
}
