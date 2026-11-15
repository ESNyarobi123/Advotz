"use client";

import Link from "next/link";
import { Notice } from "@advo/ui";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL, api, apiFetch, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AdvoLogo } from "@/features/marketing/AdvoLogo";
import { AuthShowcasePanel } from "@/features/auth/AuthShowcasePanel";
import { AuthCard, Field, TextInput, TrustRow, linkAccent } from "@/features/auth/auth-ui";
import { LocaleSwitcher } from "@/features/common/LocaleSwitcher";
import { buttonClasses, cx } from "@/features/marketing/ui";
import { dashboardHomeFor } from "@/lib/session";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Check,
  MailCheck,
  Phone,
  Sparkles,
  UserRound,
} from "lucide-react";

type AccountType = "RESELLER" | "AGENT";

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("255")) return `+${digits.slice(0, 12)}`;
  if (digits.startsWith("0")) return `+255${digits.slice(1, 10)}`;
  if (digits.length === 9) return `+255${digits}`;
  return raw.trim();
}

/**
 * The half of a Google sign-up Google cannot answer.
 *
 * Email and name were proved by Google and travel in the signed `ticket`, so
 * this form only asks what is genuinely ours to collect: which kind of account
 * to open, the phone number, and the business name for a reseller.
 */
function GoogleCompleteForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();

  const ticket = params.get("ticket") ?? "";
  const email = params.get("email") ?? "";
  const name = params.get("name") ?? "";

  const [accountType, setAccountType] = useState<AccountType>("RESELLER");
  const [phone, setPhone] = useState("+255");
  const [businessName, setBusinessName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ phone?: string; businessName?: string }>({});
  const [pending, setPending] = useState(false);

  // A signed-in visitor has nothing to finish here.
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: typeof fieldError = {};
    if (!/^\+255\d{9}$/.test(normalizePhone(phone))) next.phone = t("auth.register.error.phone");
    if (accountType === "RESELLER" && businessName.trim().length < 2) {
      next.businessName = t("auth.register.error.businessName");
    }
    setFieldError(next);
    if (Object.keys(next).length > 0) return;
    if (!acceptTerms) {
      setError(t("auth.register.error.terms"));
      return;
    }

    setPending(true);
    setError(null);
    try {
      const res = await apiFetch<{ user: { role: string }; referralCode: string | null }>(
        "/auth/google/complete",
        {
          method: "POST",
          body: JSON.stringify({
            ticket,
            accountType,
            phone: normalizePhone(phone),
            ...(accountType === "RESELLER" ? { businessName: businessName.trim() } : {}),
            ...(referralCode.trim() ? { referralCode: referralCode.trim().toUpperCase() } : {}),
            acceptTerms: true as const,
          }),
        },
      );
      // A full navigation so the dashboard's server components read the new cookie.
      window.location.assign(dashboardHomeFor(res.user as { role: "ADMIN" | "RESELLER" | "AGENT" }));
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  if (!ticket) {
    return (
      <AuthCard>
        <div className="space-y-4 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-advo-gold-soft text-[#b15f00]">
            <MailCheck className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-lg font-black text-advo-text">{t("auth.google.missing.title")}</h1>
          <p className="text-xs leading-relaxed text-advo-muted">{t("auth.google.missing.body")}</p>
          <Link className={buttonClasses({ variant: "gold", size: "lg", className: "w-full" })} href="/register">
            {t("auth.google.missing.action")}
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="space-y-5">
        <header className="space-y-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold tracking-[0.12em] text-emerald-800 uppercase">
            <MailCheck className="size-3" aria-hidden="true" />
            {t("auth.google.badge")}
          </span>
          <h1 className="text-[1.35rem] font-black leading-tight tracking-tight text-advo-text">
            {t("auth.google.title")}
          </h1>
          <p className="text-xs leading-relaxed text-advo-muted">{t("auth.google.body")}</p>
        </header>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            <UserRound className="size-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-bold text-emerald-950">
                {name || email}
              </span>
              <span className="block truncate text-[10px] text-emerald-800">{email}</span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => window.location.assign(`${API_URL}/api/v1/auth/google/start?intent=register`)}
            className="shrink-0 text-[10px] font-bold text-emerald-800 underline underline-offset-2"
          >
            {t("auth.google.switchAccount")}
          </button>
        </div>

        <div role="group" aria-label={t("auth.google.accountType")} className="grid grid-cols-2 gap-2">
          {(
            [
              { id: "RESELLER" as const, icon: Building2, title: t("auth.register.type.resellerTitle"), body: t("auth.register.type.resellerBody") },
              { id: "AGENT" as const, icon: Sparkles, title: t("auth.register.type.agentTitle"), body: t("auth.register.type.agentBody") },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const selected = accountType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setAccountType(item.id)}
                className={cx(
                  "relative rounded-2xl border p-3 text-left transition-all",
                  selected
                    ? "border-advo-gold/60 bg-[linear-gradient(180deg,#fff9ee_0%,#ffffff_100%)] shadow-[0_10px_24px_-18px_rgba(241,99,4,0.8)]"
                    : "border-advo-border bg-advo-page hover:border-advo-gold/30 hover:bg-white",
                )}
              >
                <span
                  className={cx(
                    "flex size-8 items-center justify-center rounded-xl",
                    selected
                      ? "bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)] text-advo-charcoal"
                      : "bg-white text-advo-muted ring-1 ring-advo-border",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <p className={cx("mt-2 text-[12px] font-black leading-tight", selected ? "text-[#8a4a00]" : "text-advo-text")}>
                  {item.title}
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-advo-muted">{item.body}</p>
                {selected ? (
                  <span className="absolute right-2.5 top-2.5 flex size-4 items-center justify-center rounded-full bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)] text-advo-charcoal">
                    <Check className="size-2.5" aria-hidden="true" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <Field
            error={fieldError.phone}
            hint={t("auth.google.phoneHint")}
            icon={<Phone className="size-4" aria-hidden="true" />}
            id="google-phone"
            label={t("phone")}
          >
            <TextInput
              autoComplete="tel"
              className="font-mono"
              id="google-phone"
              inputMode="tel"
              invalid={Boolean(fieldError.phone)}
              onBlur={() => setPhone(normalizePhone(phone))}
              onChange={setPhone}
              placeholder="+255712345678"
              value={phone}
              withIcon
            />
          </Field>

          {accountType === "RESELLER" ? (
            <Field
              error={fieldError.businessName}
              hint={t("auth.register.businessNameHint")}
              icon={<Building2 className="size-4" aria-hidden="true" />}
              id="google-business"
              label={t("auth.register.businessNameLabel")}
            >
              <TextInput
                autoComplete="organization"
                id="google-business"
                invalid={Boolean(fieldError.businessName)}
                onChange={setBusinessName}
                placeholder={t("auth.register.businessNamePlaceholder")}
                value={businessName}
                withIcon
              />
            </Field>
          ) : null}

          <Field
            action={<span className="text-[10px] font-semibold text-advo-muted">{t("auth.common.optional")}</span>}
            hint={
              referralCode.trim().length >= 4 ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <BadgeCheck className="size-3" aria-hidden="true" />
                  {t("auth.register.referralValid")}
                </span>
              ) : (
                t("auth.register.referralBonusHint")
              )
            }
            id="google-referral"
            label={t("referralCodeOptional")}
          >
            <input
              autoComplete="off"
              className="w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-3 font-mono text-sm font-bold uppercase tracking-wider text-advo-text outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-advo-muted focus:border-advo-gold/60 focus:bg-white focus:ring-2 focus:ring-advo-gold/25"
              id="google-referral"
              onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
              placeholder={t("auth.register.referralCodePlaceholder")}
              value={referralCode}
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-advo-page p-3">
            <input
              checked={acceptTerms}
              className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-advo-border accent-advo-gold focus:ring-advo-gold"
              id="google-terms"
              onChange={(event) => setAcceptTerms(event.target.checked)}
              type="checkbox"
            />
            <span className="text-[11px] leading-relaxed text-advo-muted">
              {t("auth.register.termsLead")}{" "}
              <Link className={linkAccent} href="/terms">
                {t("auth.register.termsService")}
              </Link>{" "}
              {t("auth.register.termsAnd")}{" "}
              <Link className={linkAccent} href="/privacy">
                {t("auth.register.termsPrivacy")}
              </Link>{" "}
              {t("auth.register.termsTrail")}
            </span>
          </label>

          {error ? <Notice tone="danger">{error}</Notice> : null}

          <button
            className={buttonClasses({ variant: "gold", size: "lg", className: "w-full" })}
            disabled={pending || !acceptTerms}
            type="submit"
          >
            <span>{pending ? t("auth.google.submitPending") : t("auth.google.submit")}</span>
            <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          </button>

          <p className="text-center text-[11px] text-advo-muted">
            {t("auth.google.notYou")}{" "}
            <button
              type="button"
              onClick={() => window.location.assign(`${API_URL}/api/v1/auth/google/start?intent=register`)}
              className={linkAccent}
            >
              {t("auth.google.useAnother")}
            </button>
          </p>
        </form>
      </div>
    </AuthCard>
  );
}

export default function GoogleRegisterPage() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen bg-advo-page text-advo-text selection:bg-[#FBA102] selection:text-advo-charcoal">
      <AuthShowcasePanel type="register" />

      <div className="relative flex w-full flex-col justify-between overflow-y-auto p-4 sm:p-8 lg:w-[52%] xl:w-1/2 lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 right-0 size-72 rounded-full bg-[radial-gradient(circle,rgba(251,161,2,0.08),transparent_70%)] blur-3xl"
        />

        <div className="relative z-10 hidden items-center justify-between lg:flex">
          <LocaleSwitcher compact showIcon={false} variant="light" />
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold text-advo-muted transition hover:border-advo-border hover:bg-white hover:text-advo-text"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {t("auth.register.titleReseller")}
          </Link>
        </div>

        <div className="relative z-10 mb-3 flex items-center justify-between lg:hidden">
          <AdvoLogo size="sm" variant="light" />
          <Link href="/register" className="text-xs font-semibold text-advo-muted">
            {t("auth.common.home")}
          </Link>
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[30rem] flex-1 py-4">
          <Suspense>
            <GoogleCompleteForm />
          </Suspense>
          <div className="mt-5">
            <TrustRow
              items={[
                t("auth.register.trust.free"),
                t("auth.register.trust.minutes"),
                t("auth.register.trust.secure"),
              ]}
            />
          </div>
        </div>

        <footer className="relative z-10 pt-4 text-center text-xs text-advo-muted">
          &copy; {new Date().getFullYear()} Advo TZ · {t("auth.common.footerTagline")}
        </footer>
      </div>
    </div>
  );
}
