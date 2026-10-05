"use client";

import Link from "next/link";
import { Card, Button } from "@heroui/react";
import { Notice } from "@advo/ui";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AdvoLogo } from "@/features/marketing/AdvoLogo";
import { SocialLoginButtons } from "@/features/auth/SocialLoginButtons";
import { AuthShowcasePanel } from "@/features/auth/AuthShowcasePanel";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  CheckCircle,
} from "lucide-react";

const HOME = { ADMIN: "/admin", AGENT: "/agent", RESELLER: "/reseller" } as const;

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
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Mobile-only logo */}
      <div className="lg:hidden flex items-center justify-between mb-4">
        <AdvoLogo size="sm" variant="light" />
        <Link
          href="/"
          className="text-xs font-semibold text-[#526174] hover:text-[#18212F] flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t("auth.common.home")}</span>
        </Link>
      </div>

      {/* Main Form Container Card */}
      <Card className="p-7 sm:p-9 shadow-xl relative overflow-hidden">
        {/* Top Brand Gradient Accent Bar */}
        <div
          className="absolute top-0 left-0 right-0 h-1.5"
          style={{
            background: "linear-gradient(90deg, #1B5EA4 0%, #FBA102 50%, #F16304 100%)",
          }}
        />

        {/* Header */}
        <div className="mb-6 space-y-1.5">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#1B5EA4]/10 text-[#1B5EA4] mb-1">
            <KeyRound className="w-3 h-3" />
            {t("auth.login.badge")}
          </div>
          <h1 className="text-2xl font-black text-[#18212F] tracking-tight">
            {needsCode ? t("auth.login.titleMfa") : t("auth.login.title")}
          </h1>
          <p className="text-xs text-[#526174] leading-relaxed">
            {needsCode
              ? t("auth.login.subtitleMfa")
              : t("auth.login.subtitle")}
          </p>
        </div>

        {/* Social Login Options on Top */}
        {!needsCode && (
          <div className="mb-6">
            <SocialLoginButtons />
          </div>
        )}

        {/* Main Email & Password Form */}
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Email Input */}
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-bold text-[#18212F] uppercase tracking-wide mb-1.5"
            >
              {t("email")}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#526174]">
                <Mail className="w-4 h-4" />
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
                className="w-full rounded-field border border-[#DFE5EC] bg-[#F7F9FC] pl-10 pr-3.5 py-3 text-xs text-[#18212F] outline-none transition focus:bg-white focus:border-[#1B5EA4] focus:ring-2 focus:ring-[#1B5EA4]/20 disabled:opacity-60"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-bold text-[#18212F] uppercase tracking-wide"
              >
                {t("password")}
              </label>
              {!needsCode && (
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-[#1B5EA4] hover:text-[#2176C2] transition"
                >
                  {t("auth.login.forgot")}
                </Link>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#526174]">
                <Lock className="w-4 h-4" />
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
                className="w-full rounded-field border border-[#DFE5EC] bg-[#F7F9FC] pl-10 pr-10 py-3 text-xs text-[#18212F] outline-none transition focus:bg-white focus:border-[#1B5EA4] focus:ring-2 focus:ring-[#1B5EA4]/20 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#526174] hover:text-[#18212F]"
                tabIndex={-1}
                aria-label={showPassword ? t("auth.password.hide") : t("auth.password.show")}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* MFA / Two-Factor Code Field */}
          {needsCode && (
            <div className="rounded-2xl bg-blue-50/80 border border-blue-200 p-4 space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1B5EA4]">
                <ShieldCheck className="w-4 h-4" />
                <span>{t("auth.login.mfaBadge")}</span>
              </div>
              <label
                htmlFor="mfa"
                className="block text-xs font-semibold text-[#18212F]"
              >
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
                className="w-full rounded-field border border-[#DFE5EC] bg-white px-3.5 py-3 text-center text-xl font-mono font-black tracking-widest text-[#18212F] outline-none focus:border-[#1B5EA4] focus:ring-2 focus:ring-[#1B5EA4]/20"
              />
              <p className="text-[11px] text-[#526174]">
                {t("auth.login.mfaHint")}
              </p>
            </div>
          )}

          {/* Remember me option */}
          {!needsCode && (
            <div className="flex items-center gap-2 pt-1">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-[#DFE5EC] text-[#1B5EA4] focus:ring-[#1B5EA4] accent-[#1B5EA4] w-4 h-4 cursor-pointer"
              />
              <label htmlFor="rememberMe" className="text-xs text-[#526174] cursor-pointer select-none">
                {t("auth.login.remember")}
              </label>
            </div>
          )}

          {/* Error alert with role="alert" */}
          {error && <Notice tone="danger">{error}</Notice>}

          {/* Submit button */}
          <Button
            type="submit"
            isDisabled={pending}
            variant="primary"
            className="w-full py-3.5 text-xs font-bold shadow-lg"
          >
            <span>
              {pending
                ? t("auth.login.verifying")
                : needsCode
                ? t("auth.login.verifyAndLogin")
                : t("login")}
            </span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>

        {/* Footer Register Link */}
        <div className="mt-8 pt-6 border-t border-[#DFE5EC] text-center text-xs text-[#526174]">
          <span>{t("auth.login.noAccount")} </span>
          <Link
            href="/register"
            className="font-bold text-[#1B5EA4] hover:text-[#2176C2] transition underline underline-offset-2"
          >
            {t("auth.login.registerLink")}
          </Link>
        </div>
      </Card>

      {/* Trust & Guarantee Indicator */}
      <div className="text-center text-[11px] text-[#526174] flex items-center justify-center gap-2">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>{t("auth.login.sslNote")}</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex bg-[#F7F9FC] text-[#18212F]">
      {/* Left side: Premium Brand Showcase Panel */}
      <AuthShowcasePanel type="login" />

      {/* Right side: Modern Auth Container */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-16 relative overflow-y-auto">
        {/* Desktop Top Nav */}
        <div className="hidden lg:flex items-center justify-end">
          <Link
            href="/"
            className="text-xs font-semibold text-[#526174] hover:text-[#18212F] transition flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-white border border-transparent hover:border-[#DFE5EC]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t("auth.common.backToMainSite")}</span>
          </Link>
        </div>

        {/* Form Container */}
        <div className="flex-1 flex items-center justify-center py-6">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        {/* Simple Footer */}
        <footer className="text-center text-xs text-[#526174] pt-4">
          &copy; {new Date().getFullYear()} Advo TZ · {t("auth.common.footerTagline")}
        </footer>
      </div>
    </div>
  );
}
