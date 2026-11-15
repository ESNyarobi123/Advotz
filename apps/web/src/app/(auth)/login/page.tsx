"use client";

import Link from "next/link";
import { Notice } from "@advo/ui";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@advo/i18n";
import { AdvoLogo } from "@/features/marketing/AdvoLogo";
import { SocialLoginButtons } from "@/features/auth/SocialLoginButtons";
import { AuthShowcasePanel } from "@/features/auth/AuthShowcasePanel";
import {
  AuthCard,
  Field,
  OtpInput,
  PasswordInput,
  TextInput,
  TrustRow,
  linkAccent,
} from "@/features/auth/auth-ui";
import { LocaleSwitcher } from "@/features/common/LocaleSwitcher";
import { buttonClasses } from "@/features/marketing/ui";
import { dashboardHomeFor } from "@/lib/session";
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";

/**
 * What a failed Google round trip means in words.
 *
 * The API only ever hands back these short codes; the sentence a person reads
 * is chosen here, in their own language, with no error text reflected from the
 * query string.
 */
const GOOGLE_ERROR_KEYS: Record<string, MessageKey> = {
  cancelled: "auth.google.error.cancelled",
  expired: "auth.google.error.expired",
  unavailable: "auth.google.error.unavailable",
  google_failed: "auth.google.error.failed",
  not_allowed: "auth.google.error.notAllowed",
  not_verified: "auth.google.error.notVerified",
};

const HOME = { ADMIN: "/admin", AGENT: "/agent", RESELLER: "/reseller" } as const;

function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const justRegistered = params.get("registered") === "1";
  const googleError = params.get("googleError");

  // Already signed in → skip the form and land on the role home.
  useEffect(() => {
    let cancelled = false;
    void api
      .me()
      .then(({ user }) => {
        if (!cancelled) router.replace(dashboardHomeFor(user));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signIn(code?: string) {
    setPending(true);
    setError(null);
    try {
      const res = await api.login(email, password, code ?? (needsCode ? mfaCode : undefined));
      const home = HOME[res.user.role];
      const next = params.get("next");
      router.push(next && next.startsWith(home) && !next.startsWith("//") ? next : home);
    } catch (err) {
      if (err instanceof ApiError && err.code === "MFA_REQUIRED" && !needsCode) {
        setNeedsCode(true);
        setError(null);
      } else {
        setError(errorMessage(err));
        setMfaCode("");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[27rem] space-y-4">
      {/* Mobile brand bar */}
      <div className="mb-1 flex items-center justify-between lg:hidden">
        <AdvoLogo size="sm" variant="light" />
        <div className="flex items-center gap-2">
          <LocaleSwitcher compact showIcon={false} variant="light" />
          <Link
            className="inline-flex items-center gap-1 text-xs font-semibold text-advo-muted transition hover:text-advo-text"
            href="/"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {t("auth.common.home")}
          </Link>
        </div>
      </div>

      <AuthCard>
        {needsCode ? (
          /* ── Second factor ── */
          <div key="mfa" className="advo-auth-step space-y-5">
            <header className="space-y-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-advo-gold/30 bg-advo-gold-soft px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-[#b15f00] uppercase">
                <ShieldCheck className="size-3" aria-hidden="true" />
                {t("auth.login.mfaBadge")}
              </span>
              <h1 className="text-[1.35rem] font-black leading-tight tracking-tight text-advo-text">
                {t("auth.login.titleMfa")}
              </h1>
              <p className="text-xs leading-relaxed text-advo-muted">{t("auth.login.subtitleMfa")}</p>
            </header>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-advo-border bg-advo-page px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <UserRound className="size-3.5 shrink-0 text-advo-muted" aria-hidden="true" />
                <span className="truncate text-[11px] font-bold text-advo-text">{email}</span>
              </span>
              <button
                className="shrink-0 text-[10px] font-bold text-[#b15f00] underline underline-offset-2"
                onClick={() => {
                  setNeedsCode(false);
                  setMfaCode("");
                  setError(null);
                }}
                type="button"
              >
                {t("auth.login.useAnother")}
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold tracking-[0.08em] text-advo-text uppercase">
                {t("auth.login.mfaCodeLabel")}
              </p>
              <OtpInput
                autoFocus
                disabled={pending}
                invalid={Boolean(error)}
                label={t("auth.login.mfaCodeLabel")}
                onChange={setMfaCode}
                onComplete={(value) => void signIn(value)}
                value={mfaCode}
              />
              <p className="text-[11px] leading-relaxed text-advo-muted">{t("auth.login.mfaHint")}</p>
            </div>

            {error ? <Notice tone="danger">{error}</Notice> : null}

            <button
              className={buttonClasses({ variant: "gold", size: "lg", className: "w-full" })}
              disabled={pending || mfaCode.length !== 6}
              onClick={() => void signIn()}
              type="button"
            >
              <span>{pending ? t("auth.login.verifying") : t("auth.login.verifyAndLogin")}</span>
              <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
            </button>
          </div>
        ) : (
          /* ── Credentials ── */
          <div className="space-y-5">
            <header className="space-y-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-advo-gold/30 bg-advo-gold-soft px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-[#b15f00] uppercase">
                <KeyRound className="size-3" aria-hidden="true" />
                {t("auth.login.badge")}
              </span>
              <h1 className="text-[1.35rem] font-black leading-tight tracking-tight text-advo-text">
                {t("auth.login.title")}
              </h1>
              <p className="text-xs leading-relaxed text-advo-muted">{t("auth.login.subtitle")}</p>
            </header>

            {justRegistered ? <Notice tone="success">{t("auth.register.info.readyToLogin")}</Notice> : null}
            {googleError && GOOGLE_ERROR_KEYS[googleError] ? (
              <Notice tone="danger">{t(GOOGLE_ERROR_KEYS[googleError])}</Notice>
            ) : null}

            <div className="rounded-2xl bg-advo-page p-3">
              <p className="mb-2.5 text-center text-[10px] font-bold tracking-[0.1em] text-advo-muted uppercase">
                {t("auth.login.socialPrompt")}
              </p>
              <SocialLoginButtons intent="login" next={params.get("next") ?? undefined} />
            </div>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void signIn();
              }}
            >
              <Field
                icon={<Mail className="size-4" aria-hidden="true" />}
                id="email"
                label={t("email")}
              >
                <TextInput
                  autoComplete="email"
                  autoFocus
                  id="email"
                  onChange={setEmail}
                  placeholder={t("auth.field.emailPlaceholder")}
                  type="email"
                  value={email}
                  withIcon
                />
              </Field>

              <Field
                action={
                  <Link
                    className="text-[10px] font-bold text-[#b15f00] transition hover:text-advo-orange"
                    href="/forgot-password"
                  >
                    {t("auth.login.forgot")}
                  </Link>
                }
                icon={null}
                id="password"
                label={t("password")}
              >
                <PasswordInput
                  autoComplete="current-password"
                  id="password"
                  onChange={setPassword}
                  value={password}
                />
              </Field>

              <label className="flex cursor-pointer select-none items-center gap-2.5">
                <input
                  checked={rememberMe}
                  className="size-4 cursor-pointer rounded border-advo-border accent-advo-gold focus:ring-advo-gold"
                  id="rememberMe"
                  onChange={(event) => setRememberMe(event.target.checked)}
                  type="checkbox"
                />
                <span className="text-[11px] text-advo-muted">{t("auth.login.remember")}</span>
              </label>

              {error ? <Notice tone="danger">{error}</Notice> : null}

              <button
                className={buttonClasses({
                  variant: "gold",
                  size: "lg",
                  className: "w-full shadow-[0_16px_36px_-14px_rgba(251,161,2,0.75)]",
                })}
                disabled={pending}
                type="submit"
              >
                <span>{pending ? t("auth.login.verifying") : t("login")}</span>
                <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
              </button>
            </form>

            <div className="text-center text-[13px] text-advo-muted">
              <span>{t("auth.login.noAccount")} </span>
              <Link className={linkAccent} href="/register">
                {t("auth.login.registerLink")}
              </Link>
            </div>
          </div>
        )}
      </AuthCard>

      <TrustRow items={[t("auth.login.trust.secure"), t("auth.login.trust.mfa")]} />
    </div>
  );
}

export default function LoginPage() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen bg-advo-page text-advo-text selection:bg-[#FBA102] selection:text-advo-charcoal">
      <AuthShowcasePanel type="login" />

      <div className="relative flex w-full flex-col justify-between overflow-y-auto p-4 sm:p-8 lg:w-[52%] xl:w-1/2 lg:p-12">
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
            className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold text-advo-muted transition hover:border-advo-border hover:bg-white hover:text-advo-text"
            href="/"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {t("auth.common.backToMainSite")}
          </Link>
        </div>

        <div className="relative z-10 flex flex-1 items-center justify-center py-6">
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
