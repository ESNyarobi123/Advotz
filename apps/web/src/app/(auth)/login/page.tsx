"use client";

import Link from "next/link";
import { Notice } from "@advo/ui";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AdvoLogo } from "@/features/marketing/AdvoLogo";
import { SocialLoginButtons } from "@/features/auth/SocialLoginButtons";
import { AuthShowcasePanel } from "@/features/auth/AuthShowcasePanel";
import { LocaleSwitcher } from "@/features/common/LocaleSwitcher";
import { buttonClasses, cx } from "@/features/marketing/ui";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  KeyRound,
} from "lucide-react";

const HOME = { ADMIN: "/admin", AGENT: "/agent", RESELLER: "/reseller" } as const;

const fieldClass =
  "w-full rounded-field border border-advo-border bg-advo-page pl-11 pr-3.5 py-3 text-sm text-advo-text outline-none transition placeholder:text-advo-muted focus:border-advo-gold/60 focus:bg-white focus:ring-2 focus:ring-advo-gold/25 disabled:opacity-60";

function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const justRegistered = params.get("registered") === "1";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await api.login(email, password, needsCode ? mfaCode : undefined);
      const home = HOME[res.user.role];
      const next = params.get("next");
      router.push(next && next.startsWith(home) && !next.startsWith("//") ? next : home);
    } catch (err) {
      if (err instanceof ApiError && err.code === "MFA_REQUIRED" && !needsCode) {
        setNeedsCode(true);
        setError(null);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[26rem] space-y-6">
      {/* Mobile brand bar */}
      <div className="mb-2 flex items-center justify-between lg:hidden">
        <AdvoLogo size="sm" variant="light" />
        <div className="flex items-center gap-2">
          <LocaleSwitcher compact showIcon={false} variant="light" />
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs font-semibold text-advo-muted transition hover:text-advo-text"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {t("auth.common.home")}
          </Link>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-card border border-advo-border bg-white p-7 shadow-advo-card sm:p-9">
        {/* Gold accent — matches landing CTA energy */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#fba102_0%,#f16304_100%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-20 size-44 rounded-full bg-[radial-gradient(circle,rgba(251,161,2,0.12),transparent_70%)] blur-2xl"
        />

        <header className="relative mb-7 space-y-2.5">
          <span className="inline-flex items-center gap-2 rounded-full border border-advo-gold/30 bg-advo-gold-soft px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-[#b15f00] uppercase">
            <KeyRound className="size-3" aria-hidden="true" />
            {t("auth.login.badge")}
          </span>
          <h1 className="text-2xl font-black tracking-tight text-advo-text sm:text-[1.7rem]">
            {needsCode ? t("auth.login.titleMfa") : t("auth.login.title")}
          </h1>
          <p className="text-sm leading-relaxed text-advo-muted">
            {needsCode ? t("auth.login.subtitleMfa") : t("auth.login.subtitle")}
          </p>
        </header>

        {!needsCode && justRegistered ? (
          <div className="relative mb-4">
            <Notice tone="success">{t("auth.register.info.readyToLogin")}</Notice>
          </div>
        ) : null}

        {!needsCode && (
          <div className="relative mb-6">
            <SocialLoginButtons />
          </div>
        )}

        <form onSubmit={onSubmit} className="relative space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-bold tracking-wide text-advo-text uppercase"
            >
              {t("email")}
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                <Mail className="size-4" aria-hidden="true" />
              </div>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={t("auth.field.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={needsCode}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label
                htmlFor="password"
                className="block text-xs font-bold tracking-wide text-advo-text uppercase"
              >
                {t("password")}
              </label>
              {!needsCode && (
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-[#b15f00] transition hover:text-advo-orange"
                >
                  {t("auth.login.forgot")}
                </Link>
              )}
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                <Lock className="size-4" aria-hidden="true" />
              </div>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={needsCode}
                className={cx(fieldClass, "pr-11")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-advo-muted transition hover:text-advo-text"
                tabIndex={-1}
                aria-label={showPassword ? t("auth.password.hide") : t("auth.password.show")}
              >
                {showPassword ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {needsCode && (
            <div className="animate-in fade-in space-y-2.5 rounded-2xl border border-advo-gold/25 bg-advo-gold-soft/60 p-4 duration-200">
              <div className="flex items-center gap-2 text-xs font-bold text-[#b15f00]">
                <ShieldCheck className="size-4" aria-hidden="true" />
                <span>{t("auth.login.mfaBadge")}</span>
              </div>
              <label htmlFor="mfa" className="block text-xs font-semibold text-advo-text">
                {t("auth.login.mfaCodeLabel")}
              </label>
              <input
                id="mfa"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder="000000"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                required
                autoFocus
                className="w-full rounded-field border border-advo-border bg-white px-3.5 py-3 text-center font-mono text-xl font-black tracking-[0.35em] text-advo-text outline-none focus:border-advo-gold/60 focus:ring-2 focus:ring-advo-gold/25"
              />
              <p className="text-[11px] text-advo-muted">{t("auth.login.mfaHint")}</p>
            </div>
          )}

          {!needsCode && (
            <div className="flex items-center gap-2.5 pt-0.5">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="size-4 cursor-pointer rounded border-advo-border accent-advo-gold focus:ring-advo-gold"
              />
              <label
                htmlFor="rememberMe"
                className="cursor-pointer select-none text-xs text-advo-muted"
              >
                {t("auth.login.remember")}
              </label>
            </div>
          )}

          {error && <Notice tone="danger">{error}</Notice>}

          <button
            type="submit"
            disabled={pending}
            className={buttonClasses({
              variant: "gold",
              size: "lg",
              className: "w-full shadow-[0_16px_36px_-14px_rgba(251,161,2,0.75)]",
            })}
          >
            <span>
              {pending
                ? t("auth.login.verifying")
                : needsCode
                  ? t("auth.login.verifyAndLogin")
                  : t("login")}
            </span>
            <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
          </button>
        </form>

        <div className="relative mt-8 border-t border-advo-border pt-6 text-center text-sm text-advo-muted">
          <span>{t("auth.login.noAccount")} </span>
          <Link
            href="/register"
            className="font-bold text-[#b15f00] underline underline-offset-2 transition hover:text-advo-orange"
          >
            {t("auth.login.registerLink")}
          </Link>
        </div>
      </div>

      <p className="flex items-center justify-center gap-2 text-center text-[11px] text-advo-muted">
        <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden="true" />
        <span>{t("auth.login.sslNote")}</span>
      </p>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen bg-advo-page text-advo-text selection:bg-[#FBA102] selection:text-advo-charcoal">
      <AuthShowcasePanel type="login" />

      <div className="relative flex w-full flex-col justify-between overflow-y-auto p-6 sm:p-10 lg:w-[52%] xl:w-1/2 lg:p-12 xl:p-16">
        {/* Soft gold atmosphere on the form side */}
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

        <div className="relative z-10 flex flex-1 items-center justify-center py-8">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        <footer className="relative z-10 pt-4 text-center text-xs text-advo-muted">
          &copy; {new Date().getFullYear()} Advo TZ · {t("auth.common.footerTagline")}
        </footer>
      </div>
    </div>
  );
}
