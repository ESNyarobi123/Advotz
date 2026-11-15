"use client";

import Link from "next/link";
import { Notice } from "@advo/ui";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AdvoLogo } from "@/features/marketing/AdvoLogo";
import { SocialLoginButtons } from "@/features/auth/SocialLoginButtons";
import { AuthShowcasePanel } from "@/features/auth/AuthShowcasePanel";
import { EmailOtpStep } from "@/features/auth/EmailOtpStep";
import {
  AuthCard,
  Field,
  PasswordInput,
  PasswordStrength,
  StepRail,
  TextInput,
  TrustRow,
  linkAccent,
  useSlugPreview,
} from "@/features/auth/auth-ui";
import { LocaleSwitcher } from "@/features/common/LocaleSwitcher";
import { buttonClasses, cx } from "@/features/marketing/ui";
import { dashboardHomeFor } from "@/lib/session";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  Coins,
  Globe,
  LayoutDashboard,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
  Wifi,
} from "lucide-react";

type AccountType = "reseller" | "agent";
type Step = 1 | 2 | 3;
type FieldErrors = Partial<Record<"ownerName" | "email" | "phone" | "password" | "businessName" | "referralCode", string>>;
type AgentErrors = Partial<Record<"name" | "email" | "phone" | "password" | "referralCode", string>>;

/** Accepts the ways a Tanzanian number is actually written and returns E.164. */
function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("255")) return `+${digits.slice(0, 12)}`;
  if (digits.startsWith("0")) return `+255${digits.slice(1, 10)}`;
  if (digits.length === 9) return `+255${digits}`;
  return raw.trim();
}

export default function RegisterPage() {
  const { t } = useI18n();
  const router = useRouter();

  const [accountType, setAccountType] = useState<AccountType>("reseller");
  const [step, setStep] = useState<Step>(1);

  const [resellerOtp, setResellerOtp] = useState<{ email: string; token: string } | null>(null);
  const [agentOtp, setAgentOtp] = useState<{ email: string; token: string } | null>(null);

  const [form, setForm] = useState({
    ownerName: "",
    email: "",
    phone: "+255",
    password: "",
    businessName: "",
    referralCode: "",
    acceptTerms: false,
  });

  const [agentForm, setAgentForm] = useState({
    name: "",
    email: "",
    phone: "+255",
    password: "",
    referralCode: "",
    acceptTerms: false,
  });

  const [errors, setErrors] = useState<FieldErrors>({});
  const [agentErrors, setAgentErrors] = useState<AgentErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const slug = useSlugPreview(form.businessName);
  const emailVerified = resellerOtp?.email === form.email.trim().toLowerCase();
  const agentVerified = agentOtp?.email === agentForm.email.trim().toLowerCase();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) setForm((prev) => ({ ...prev, referralCode: ref.slice(0, 32) }));
    if (params.get("role") === "agent") setAccountType("agent");
  }, []);

  // A signed-in visitor has no business opening a second account here.
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

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setError(null);
  }

  function updateAgent<K extends keyof typeof agentForm>(key: K, value: (typeof agentForm)[K]) {
    setAgentForm((prev) => ({ ...prev, [key]: value }));
    setAgentErrors((prev) => ({ ...prev, [key]: undefined }));
    setError(null);
  }

  function validateAccount() {
    const next: FieldErrors = {};
    if (form.ownerName.trim().length < 2) next.ownerName = t("auth.register.error.fullName");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = t("auth.register.error.email");
    if (!/^\+255\d{9}$/.test(normalizePhone(form.phone))) next.phone = t("auth.register.error.phone");
    if (form.password.length < 10) next.password = t("auth.register.error.password");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateBusiness() {
    const next: FieldErrors = {};
    if (form.businessName.trim().length < 2) next.businessName = t("auth.register.error.businessName");
    if (form.referralCode.trim() && form.referralCode.trim().length < 4) {
      next.referralCode = t("auth.register.error.referral");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    setError(null);
    if (step === 1 && validateAccount()) setStep(2);
    else if (step === 2 && validateBusiness()) setStep(3);
  }

  function goBack() {
    setError(null);
    setStep((current) => (current > 1 ? ((current - 1) as Step) : current));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (step < 3) {
      goNext();
      return;
    }
    if (!form.acceptTerms) {
      setError(t("auth.register.error.terms"));
      return;
    }
    if (!resellerOtp || !emailVerified) {
      setError(t("auth.otp.required"));
      return;
    }

    setPending(true);
    setError(null);
    try {
      await apiFetch<{ verificationRequired: boolean; resellerId: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          businessName: form.businessName.trim(),
          ownerName: form.ownerName.trim(),
          email: form.email.trim(),
          phone: normalizePhone(form.phone),
          password: form.password,
          acceptTerms: true as const,
          verificationToken: resellerOtp.token,
          ...(form.referralCode.trim() ? { referralCode: form.referralCode.trim() } : {}),
        }),
      });
      router.push("/login?registered=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.register.error.registrationFailed"));
    } finally {
      setPending(false);
    }
  }

  async function onAgentSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next: AgentErrors = {};
    if (agentForm.name.trim().length < 2) next.name = t("auth.register.error.fullName");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(agentForm.email.trim())) next.email = t("auth.register.error.email");
    if (!/^\+255\d{9}$/.test(normalizePhone(agentForm.phone))) next.phone = t("auth.register.error.phone");
    if (agentForm.password.length < 10) next.password = t("auth.register.error.password");
    if (agentForm.referralCode.trim() && !/^[A-Z0-9_-]{4,24}$/.test(agentForm.referralCode.trim())) {
      next.referralCode = t("auth.register.error.referral");
    }
    setAgentErrors(next);
    if (Object.keys(next).length > 0) return;
    if (!agentForm.acceptTerms) {
      setError(t("auth.register.error.agentTerms"));
      return;
    }
    if (!agentOtp || !agentVerified) {
      setError(t("auth.otp.required"));
      return;
    }

    setPending(true);
    setError(null);
    setInfo(null);
    try {
      const res = await apiFetch<{
        verificationRequired: boolean;
        notificationSimulated?: boolean;
        devVerificationToken?: string;
        referralCode?: string;
      }>("/auth/register-agent", {
        method: "POST",
        body: JSON.stringify({
          name: agentForm.name.trim(),
          email: agentForm.email.trim(),
          phone: normalizePhone(agentForm.phone),
          password: agentForm.password,
          verificationToken: agentOtp.token,
          referralCode: agentForm.referralCode.trim() ? agentForm.referralCode.trim().toUpperCase() : undefined,
          acceptTerms: true as const,
        }),
      });

      if (res.devVerificationToken) {
        setInfo(t("auth.register.info.devToken", { token: res.devVerificationToken }));
        router.push(`/verify?token=${encodeURIComponent(res.devVerificationToken)}`);
        return;
      }

      setInfo(t("auth.register.info.agentEmail"));
      router.push("/verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.register.error.agentFailed"));
    } finally {
      setPending(false);
    }
  }

  const stepCopy = {
    1: { title: t("auth.register.step1.title"), body: t("auth.register.step1.body") },
    2: { title: t("auth.register.step2.title"), body: t("auth.register.step2.body") },
    3: { title: t("auth.register.step3.title"), body: t("auth.register.step3.body") },
  }[step];

  return (
    <div className="flex min-h-screen bg-advo-page text-advo-text selection:bg-[#FBA102] selection:text-advo-charcoal">
      <AuthShowcasePanel type="register" />

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
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold text-advo-muted transition hover:border-advo-border hover:bg-white hover:text-advo-text"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {t("auth.common.backToMainSite")}
          </Link>
        </div>

        <div className="relative z-10 mb-3 flex items-center justify-between lg:hidden">
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

        <div className="relative z-10 mx-auto w-full max-w-[33rem] flex-1 py-4">
          <AuthCard>
            {/* ── What are you opening? ── */}
            <div role="group" aria-label={t("auth.register.tabReseller")} className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    id: "reseller" as const,
                    icon: Building2,
                    title: t("auth.register.type.resellerTitle"),
                    body: t("auth.register.type.resellerBody"),
                  },
                  {
                    id: "agent" as const,
                    icon: Sparkles,
                    title: t("auth.register.type.agentTitle"),
                    body: t("auth.register.type.agentBody"),
                  },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const selected = accountType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setAccountType(item.id);
                      setError(null);
                      setErrors({});
                      setAgentErrors({});
                    }}
                    className={cx(
                      "group relative overflow-hidden rounded-2xl border p-3 text-left transition-all duration-200",
                      selected
                        ? "border-advo-gold/60 bg-[linear-gradient(180deg,#fff9ee_0%,#ffffff_100%)] shadow-[0_10px_24px_-18px_rgba(241,99,4,0.8)]"
                        : "border-advo-border bg-advo-page hover:border-advo-gold/30 hover:bg-white",
                    )}
                  >
                    <span
                      className={cx(
                        "flex size-8 items-center justify-center rounded-xl transition",
                        selected
                          ? "bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)] text-advo-charcoal"
                          : "bg-white text-advo-muted ring-1 ring-advo-border group-hover:text-[#b15f00]",
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <p
                      className={cx(
                        "mt-2 text-[12px] font-black leading-tight",
                        selected ? "text-[#8a4a00]" : "text-advo-text",
                      )}
                    >
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

            <header className="mt-5 space-y-1.5">
              <h1 className="text-[1.35rem] font-black leading-tight tracking-tight text-advo-text">
                {accountType === "reseller"
                  ? t("auth.register.titleReseller")
                  : t("auth.register.titleAgent")}
              </h1>
              <p className="text-xs leading-relaxed text-advo-muted">
                {accountType === "reseller"
                  ? t("auth.register.subtitleReseller")
                  : t("auth.register.subtitleAgent")}
              </p>
            </header>

            {accountType === "reseller" ? (
              <>
                <div className="mt-5 border-t border-advo-border pt-4">
                  <StepRail
                    current={step}
                    hint={t("auth.register.timeHint")}
                    steps={[
                      { label: t("auth.register.stepAccount") },
                      { label: t("auth.register.stepBusiness") },
                      { label: t("auth.register.stepVerify") },
                    ]}
                    onSelect={(target) => {
                      setError(null);
                      setStep(target as Step);
                    }}
                  />
                </div>

                <form className="mt-5 space-y-4" onSubmit={onSubmit}>
                  <div key={step} className="advo-auth-step space-y-4">
                    <div>
                      <h2 className="text-[13px] font-black text-advo-text">{stepCopy.title}</h2>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-advo-muted">{stepCopy.body}</p>
                    </div>

                    {step === 1 && (
                      <>
                        <div className="rounded-2xl bg-advo-page p-3">
                          <p className="mb-2.5 text-center text-[10px] font-bold tracking-[0.1em] text-advo-muted uppercase">
                            {t("auth.register.socialPrompt")}
                          </p>
                          <SocialLoginButtons intent="register" />
                        </div>

                        <Field
                          error={errors.ownerName}
                          icon={<User className="size-4" aria-hidden="true" />}
                          id="ownerName"
                          label={t("auth.register.fullNameLabel")}
                        >
                          <TextInput
                            autoComplete="name"
                            id="ownerName"
                            invalid={Boolean(errors.ownerName)}
                            onChange={(value) => update("ownerName", value)}
                            placeholder={t("auth.register.ownerNamePlaceholder")}
                            value={form.ownerName}
                            withIcon
                          />
                        </Field>

                        <Field
                          error={errors.email}
                          hint={t("auth.register.emailHint")}
                          icon={<Mail className="size-4" aria-hidden="true" />}
                          id="email"
                          label={t("email")}
                        >
                          <TextInput
                            autoComplete="email"
                            id="email"
                            invalid={Boolean(errors.email)}
                            onChange={(value) => update("email", value)}
                            placeholder={t("auth.field.emailPlaceholder")}
                            type="email"
                            value={form.email}
                            withIcon
                          />
                        </Field>

                        <Field
                          error={errors.phone}
                          hint={t("auth.register.phoneHint")}
                          icon={<Phone className="size-4" aria-hidden="true" />}
                          id="phone"
                          label={t("phone")}
                        >
                          <TextInput
                            autoComplete="tel"
                            className="font-mono"
                            id="phone"
                            inputMode="tel"
                            invalid={Boolean(errors.phone)}
                            onBlur={() => update("phone", normalizePhone(form.phone))}
                            onChange={(value) => update("phone", value)}
                            placeholder="+255712345678"
                            value={form.phone}
                            withIcon
                          />
                        </Field>

                        <Field
                          error={errors.password}
                          icon={null}
                          id="password"
                          label={t("auth.password.minLength")}
                        >
                          <PasswordInput
                            id="password"
                            invalid={Boolean(errors.password)}
                            onChange={(value) => update("password", value)}
                            value={form.password}
                          />
                        </Field>

                        <PasswordStrength value={form.password} />
                      </>
                    )}

                    {step === 2 && (
                      <>
                        <Field
                          error={errors.businessName}
                          icon={<Building2 className="size-4" aria-hidden="true" />}
                          id="businessName"
                          label={t("auth.register.businessNameLabel")}
                        >
                          <TextInput
                            autoComplete="organization"
                            id="businessName"
                            invalid={Boolean(errors.businessName)}
                            onChange={(value) => update("businessName", value)}
                            placeholder={t("auth.register.businessNamePlaceholder")}
                            value={form.businessName}
                            withIcon
                          />
                        </Field>

                        {slug ? (
                          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-3">
                            <Globe className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold tracking-wide text-emerald-900 uppercase">
                                {t("auth.register.slugPreview")}
                              </p>
                              <p className="mt-0.5 truncate font-mono text-xs font-bold text-emerald-900">
                                {slug}.advowifi.com
                              </p>
                              <p className="mt-0.5 text-[10px] leading-snug text-emerald-800">
                                {t("auth.register.slugNote")}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="rounded-xl bg-advo-page px-3 py-2.5 text-[11px] leading-relaxed text-advo-muted">
                            {t("auth.register.businessNameHint")}
                          </p>
                        )}

                        <Field
                          action={
                            <span className="text-[10px] font-semibold text-advo-muted">
                              {t("auth.common.optional")}
                            </span>
                          }
                          error={errors.referralCode}
                          hint={
                            form.referralCode.trim().length >= 4 ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                <BadgeCheck className="size-3" aria-hidden="true" />
                                {t("auth.register.referralValid")}
                              </span>
                            ) : (
                              t("auth.register.referralBonusHint")
                            )
                          }
                          icon={null}
                          id="referralCode"
                          label={t("referralCodeOptional")}
                        >
                          <input
                            autoComplete="off"
                            className={cx(
                              "w-full rounded-field border bg-advo-page px-3.5 py-3 font-mono text-sm font-bold uppercase tracking-wider text-advo-text outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-advo-muted focus:bg-white focus:ring-2",
                              errors.referralCode
                                ? "border-[#d94a4a] focus:border-[#d94a4a] focus:ring-[#d94a4a]/15"
                                : "border-advo-border focus:border-advo-gold/60 focus:ring-advo-gold/25",
                            )}
                            id="referralCode"
                            onChange={(event) => update("referralCode", event.target.value.toUpperCase())}
                            placeholder={t("auth.register.referralCodePlaceholder")}
                            value={form.referralCode}
                          />
                        </Field>

                        <div className="rounded-2xl border border-advo-border bg-advo-page p-3.5">
                          <p className="text-[10px] font-bold tracking-[0.1em] text-advo-muted uppercase">
                            {t("auth.register.nextSteps.title")}
                          </p>
                          <ol className="mt-2 grid grid-cols-3 gap-2">
                            {[
                              { icon: CheckCircle2, label: t("auth.register.nextSteps.plan") },
                              { icon: Globe, label: t("auth.register.nextSteps.site") },
                              { icon: Wifi, label: t("auth.register.nextSteps.device") },
                            ].map((item, index) => {
                              const Icon = item.icon;
                              return (
                                <li key={item.label} className="flex flex-col items-center gap-1 text-center">
                                  <span className="flex size-7 items-center justify-center rounded-full bg-white text-[#b15f00] ring-1 ring-advo-border">
                                    <Icon className="size-3.5" aria-hidden="true" />
                                  </span>
                                  <span className="text-[9px] font-bold leading-tight text-advo-muted">
                                    {index + 1}. {item.label}
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      </>
                    )}

                    {step === 3 && (
                      <>
                        <div className="rounded-2xl border border-advo-border bg-advo-page p-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold tracking-[0.1em] text-advo-muted uppercase">
                              {t("auth.register.summary.title")}
                            </p>
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-advo-muted">
                              <ShieldCheck className="size-3 text-emerald-600" aria-hidden="true" />
                              {t("auth.register.stepVerify")}
                            </span>
                          </div>
                          <dl className="mt-2 space-y-1.5">
                            {[
                              {
                                label: t("auth.register.fullNameLabel"),
                                value: form.ownerName,
                                step: 1 as Step,
                              },
                              { label: t("email"), value: form.email, step: 1 as Step },
                              {
                                label: t("auth.register.businessNameLabel"),
                                value: form.businessName,
                                step: 2 as Step,
                              },
                            ].map((row) => (
                              <div key={row.label} className="flex items-baseline justify-between gap-3">
                                <dt className="shrink-0 text-[10px] font-semibold text-advo-muted">
                                  {row.label}
                                </dt>
                                <dd className="flex min-w-0 items-baseline gap-2">
                                  <span className="truncate text-[11px] font-bold text-advo-text">{row.value}</span>
                                  <button
                                    type="button"
                                    onClick={() => setStep(row.step)}
                                    className="shrink-0 text-[10px] font-bold text-[#b15f00] underline underline-offset-2"
                                  >
                                    {t("auth.register.summary.edit")}
                                  </button>
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>

                        <EmailOtpStep
                          body={t("auth.otp.resellerBody")}
                          email={form.email}
                          key={`reseller-${form.email}`}
                          onVerified={(token, verifiedEmail) => setResellerOtp({ token, email: verifiedEmail })}
                          role="RESELLER"
                          verified={emailVerified}
                        />

                        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-advo-page p-3">
                          <input
                            checked={form.acceptTerms}
                            className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-advo-border accent-advo-gold focus:ring-advo-gold"
                            id="terms"
                            onChange={(event) => update("acceptTerms", event.target.checked)}
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
                      </>
                    )}
                  </div>

                  {error ? <Notice tone="danger">{error}</Notice> : null}
                  {info ? <Notice tone="success">{info}</Notice> : null}

                  <div className="flex items-center gap-2.5 border-t border-advo-border pt-4">
                    {step > 1 ? (
                      <button
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-advo-border bg-advo-page px-3.5 py-3 text-xs font-bold text-advo-text transition hover:bg-white active:scale-95"
                        onClick={goBack}
                        type="button"
                      >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        {t("back")}
                      </button>
                    ) : null}

                    {step < 3 ? (
                      <button
                        className={buttonClasses({ variant: "gold", size: "lg", className: "flex-1" })}
                        type="submit"
                      >
                        <span>{t("auth.register.next")}</span>
                        <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        className={buttonClasses({ variant: "gold", size: "lg", className: "flex-1" })}
                        disabled={pending || !form.acceptTerms || !emailVerified}
                        type="submit"
                      >
                        <span>{pending ? t("auth.register.submitPending") : t("auth.register.submit")}</span>
                        <Sparkles className="size-4 shrink-0" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </form>
              </>
            ) : (
              /* ── Agent ── */
              <div className="mt-5 border-t border-advo-border pt-4">
                <ul className="grid grid-cols-3 gap-2">
                  {[
                    { icon: Coins, title: t("auth.register.agent.benefit.commission.title") },
                    { icon: LayoutDashboard, title: t("auth.register.agent.benefit.dashboard.title") },
                    { icon: BadgeCheck, title: t("auth.register.agent.benefit.code.title") },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <li
                        key={item.title}
                        className="rounded-xl border border-advo-border bg-advo-page px-2 py-2.5 text-center"
                      >
                        <Icon className="mx-auto size-4 text-[#b15f00]" aria-hidden="true" />
                        <p className="mt-1 text-[9px] font-bold leading-tight text-advo-text">{item.title}</p>
                      </li>
                    );
                  })}
                </ul>

                <form className="advo-auth-step mt-4 space-y-4" onSubmit={onAgentSubmit}>
                  <Field
                    error={agentErrors.name}
                    icon={<User className="size-4" aria-hidden="true" />}
                    id="agent-name"
                    label={t("auth.register.fullNameLabel")}
                  >
                    <TextInput
                      autoComplete="name"
                      id="agent-name"
                      invalid={Boolean(agentErrors.name)}
                      onChange={(value) => updateAgent("name", value)}
                      placeholder={t("auth.register.fullNamePlaceholder")}
                      value={agentForm.name}
                      withIcon
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      error={agentErrors.email}
                      icon={<Mail className="size-4" aria-hidden="true" />}
                      id="agent-email"
                      label={t("email")}
                    >
                      <TextInput
                        autoComplete="email"
                        id="agent-email"
                        invalid={Boolean(agentErrors.email)}
                        onChange={(value) => updateAgent("email", value)}
                        placeholder={t("auth.register.agentEmailPlaceholder")}
                        type="email"
                        value={agentForm.email}
                        withIcon
                      />
                    </Field>

                    <Field
                      error={agentErrors.phone}
                      icon={<Phone className="size-4" aria-hidden="true" />}
                      id="agent-phone"
                      label={t("phone")}
                    >
                      <TextInput
                        autoComplete="tel"
                        className="font-mono"
                        id="agent-phone"
                        inputMode="tel"
                        invalid={Boolean(agentErrors.phone)}
                        onBlur={() => updateAgent("phone", normalizePhone(agentForm.phone))}
                        onChange={(value) => updateAgent("phone", value)}
                        placeholder="+255712345678"
                        value={agentForm.phone}
                        withIcon
                      />
                    </Field>
                  </div>

                  <Field
                    action={
                      <span className="text-[10px] font-semibold text-advo-muted">
                        {t("auth.common.optional")}
                      </span>
                    }
                    error={agentErrors.referralCode}
                    hint={
                      agentForm.referralCode.trim().length >= 4 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                          <BadgeCheck className="size-3" aria-hidden="true" />
                          {t("auth.register.referralValid")}
                        </span>
                      ) : (
                        t("auth.register.referralHint")
                      )
                    }
                    icon={null}
                    id="agent-code"
                    label={t("auth.register.referralLabel")}
                  >
                    <input
                      autoComplete="off"
                      className={cx(
                        "w-full rounded-field border bg-advo-page px-3.5 py-3 font-mono text-sm font-bold uppercase tracking-wider text-advo-text outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-advo-muted focus:bg-white focus:ring-2",
                        agentErrors.referralCode
                          ? "border-[#d94a4a] focus:border-[#d94a4a] focus:ring-[#d94a4a]/15"
                          : "border-advo-border focus:border-advo-gold/60 focus:ring-advo-gold/25",
                      )}
                      id="agent-code"
                      onChange={(event) => updateAgent("referralCode", event.target.value.toUpperCase())}
                      placeholder={t("auth.register.referralPlaceholder")}
                      value={agentForm.referralCode}
                    />
                  </Field>

                  <div>
                    <Field
                      error={agentErrors.password}
                      icon={null}
                      id="agent-password"
                      label={t("auth.password.minLength")}
                    >
                      <PasswordInput
                        id="agent-password"
                        invalid={Boolean(agentErrors.password)}
                        onChange={(value) => updateAgent("password", value)}
                        value={agentForm.password}
                      />
                    </Field>
                    <PasswordStrength value={agentForm.password} />
                  </div>

                  <EmailOtpStep
                    body={t("auth.otp.agentBody")}
                    email={agentForm.email}
                    key={`agent-${agentForm.email}`}
                    onVerified={(token, verifiedEmail) => setAgentOtp({ token, email: verifiedEmail })}
                    role="AGENT"
                    verified={agentVerified}
                  />

                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-advo-page p-3">
                    <input
                      checked={agentForm.acceptTerms}
                      className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-advo-border accent-advo-gold focus:ring-advo-gold"
                      id="agent-terms"
                      onChange={(event) => updateAgent("acceptTerms", event.target.checked)}
                      type="checkbox"
                    />
                    <span className="text-[11px] leading-relaxed text-advo-muted">
                      {t("auth.register.agentTermsLead")}{" "}
                      <Link className={linkAccent} href="/terms">
                        {t("auth.register.agentTermsLink")}
                      </Link>{" "}
                      {t("auth.register.termsAnd")}{" "}
                      <Link className={linkAccent} href="/privacy">
                        {t("auth.register.termsPrivacy")}
                      </Link>{" "}
                      {t("auth.register.agentTermsTrail")}
                    </span>
                  </label>

                  {error ? <Notice tone="danger">{error}</Notice> : null}
                  {info ? <Notice tone="success">{info}</Notice> : null}

                  <button
                    className={buttonClasses({ variant: "gold", size: "lg", className: "w-full" })}
                    disabled={pending || !agentForm.acceptTerms || !agentVerified}
                    id="agent-submit-btn"
                    type="submit"
                  >
                    <span>{pending ? t("auth.register.agentSubmitPending") : t("auth.register.agentSubmit")}</span>
                    <Sparkles className="size-4 shrink-0" aria-hidden="true" />
                  </button>
                </form>
              </div>
            )}

            <div className="mt-6 border-t border-advo-border pt-5 text-center text-[13px] text-advo-muted">
              <span>{t("auth.register.haveAccount")} </span>
              <Link className={linkAccent} href="/login">
                {t("auth.register.loginLink")}
              </Link>
            </div>
          </AuthCard>

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
