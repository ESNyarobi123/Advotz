"use client";

import Link from "next/link";
import { Notice } from "@advo/ui";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AdvoLogo } from "@/features/marketing/AdvoLogo";
import { SocialLoginButtons } from "@/features/auth/SocialLoginButtons";
import { AuthShowcasePanel } from "@/features/auth/AuthShowcasePanel";
import { LocaleSwitcher } from "@/features/common/LocaleSwitcher";
import { buttonClasses, cx } from "@/features/marketing/ui";
import {
  User,
  Mail,
  Phone,
  Lock,
  Building,
  MapPin,
  Radio,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Eye,
  EyeOff,
  Coffee,
  Hotel,
  GraduationCap,
  Wifi,
} from "lucide-react";

const fieldClass =
  "w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-3 text-sm text-advo-text outline-none transition placeholder:text-advo-muted focus:border-advo-gold/60 focus:bg-white focus:ring-2 focus:ring-advo-gold/25";

const fieldWithIcon = cx(fieldClass, "pl-11");

const labelClass =
  "mb-1.5 block text-xs font-bold tracking-wide text-advo-text uppercase";

const linkAccent =
  "font-bold text-[#b15f00] underline underline-offset-2 transition hover:text-advo-orange";

export default function RegisterPage() {
  const { t } = useI18n();
  const router = useRouter();

  const [accountType, setAccountType] = useState<"reseller" | "agent">("reseller");
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [form, setForm] = useState({
    ownerName: "",
    email: "",
    phone: "+255",
    password: "",
    businessName: "",
    venueType: "cafe",
    city: "Dar es Salaam",
    deviceType: "ap",
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

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) setForm((prev) => ({ ...prev, referralCode: ref.slice(0, 32) }));
    const roleParam = params.get("role");
    if (roleParam === "agent") setAccountType("agent");
  }, []);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateAgent<K extends keyof typeof agentForm>(key: K, value: (typeof agentForm)[K]) {
    setAgentForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep1() {
    if (!form.ownerName.trim()) {
      setError(t("auth.register.error.fullName"));
      return false;
    }
    if (!form.email.includes("@")) {
      setError(t("auth.register.error.email"));
      return false;
    }
    if (form.phone.trim().length < 10) {
      setError(t("auth.register.error.phone"));
      return false;
    }
    if (form.password.length < 10) {
      setError(t("auth.register.error.password"));
      return false;
    }
    setError(null);
    return true;
  }

  function validateStep2() {
    if (!form.businessName.trim()) {
      setError(t("auth.register.error.businessName"));
      return false;
    }
    setError(null);
    return true;
  }

  function handleNext(e: React.FormEvent) {
    e.preventDefault();
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  }

  function handlePrev() {
    setError(null);
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.acceptTerms) {
      setError(t("auth.register.error.terms"));
      return;
    }

    setPending(true);
    setError(null);
    setInfo(null);

    try {
      const body = {
        businessName: form.businessName,
        ownerName: form.ownerName,
        email: form.email,
        phone: form.phone,
        password: form.password,
        acceptTerms: true as const,
        ...(form.referralCode.trim() ? { referralCode: form.referralCode.trim() } : {}),
      };

      await apiFetch<{
        verificationRequired: boolean;
        resellerId: string;
      }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      });

      // Account is ACTIVE immediately — send them to sign in with the password they set.
      router.push("/login?registered=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.register.error.registrationFailed"));
    } finally {
      setPending(false);
    }
  }

  async function onAgentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agentForm.name.trim()) {
      setError(t("auth.register.error.fullName"));
      return;
    }
    if (!agentForm.email.includes("@")) {
      setError(t("auth.register.error.email"));
      return;
    }
    if (agentForm.phone.trim().length < 10) {
      setError(t("auth.register.error.phone"));
      return;
    }
    if (agentForm.password.length < 10) {
      setError(t("auth.register.error.password"));
      return;
    }
    if (!agentForm.acceptTerms) {
      setError(t("auth.register.error.agentTerms"));
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
          phone: agentForm.phone.trim(),
          password: agentForm.password,
          referralCode: agentForm.referralCode.trim()
            ? agentForm.referralCode.trim().toUpperCase()
            : undefined,
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

  const stepMeta = [
    { n: 1 as const, label: t("auth.register.stepAccount") },
    { n: 2 as const, label: t("auth.register.stepBusiness") },
    { n: 3 as const, label: t("auth.register.stepDeviceType") },
  ];

  return (
    <div className="flex min-h-screen bg-advo-page text-advo-text selection:bg-[#FBA102] selection:text-advo-charcoal">
      <AuthShowcasePanel type="register" />

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
              href="/"
              className="inline-flex items-center gap-1 text-xs font-semibold text-advo-muted transition hover:text-advo-text"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              {t("auth.common.home")}
            </Link>
          </div>
        </div>

        <div className="relative z-10 mx-auto w-full max-w-xl flex-1 py-6">
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
                <Sparkles className="size-3" aria-hidden="true" />
                {accountType === "reseller"
                  ? t("auth.register.badgeReseller")
                  : t("auth.register.badgeAgent")}
              </span>
              <h1 className="text-2xl font-black tracking-tight text-advo-text sm:text-[1.7rem]">
                {accountType === "reseller"
                  ? t("auth.register.titleReseller")
                  : t("auth.register.titleAgent")}
              </h1>
              <p className="text-sm leading-relaxed text-advo-muted">
                {accountType === "reseller"
                  ? t("auth.register.subtitleReseller")
                  : t("auth.register.subtitleAgent")}
              </p>
            </header>

            {/* Account type tabs */}
            <div className="relative mb-6 grid grid-cols-2 gap-1 rounded-2xl border border-advo-border bg-advo-page p-1">
              <button
                type="button"
                id="tab-reseller"
                onClick={() => {
                  setAccountType("reseller");
                  setError(null);
                }}
                className={cx(
                  "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-all",
                  accountType === "reseller"
                    ? "border border-advo-gold/30 bg-white text-[#b15f00] shadow-sm"
                    : "text-advo-muted hover:text-advo-text",
                )}
              >
                <Building className="size-4" aria-hidden="true" />
                {t("auth.register.tabReseller")}
              </button>
              <button
                type="button"
                id="tab-agent"
                onClick={() => {
                  setAccountType("agent");
                  setError(null);
                }}
                className={cx(
                  "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-all",
                  accountType === "agent"
                    ? "border border-advo-gold/30 bg-white text-[#b15f00] shadow-sm"
                    : "text-advo-muted hover:text-advo-text",
                )}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                {t("auth.register.tabAgent")}
              </button>
            </div>

            {accountType === "agent" ? (
              <form onSubmit={onAgentSubmit} className="relative space-y-4">
                <SocialLoginButtons />

                <div>
                  <label htmlFor="agent-name" className={labelClass}>
                    {t("auth.register.fullNameLabel")}
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                      <User className="size-4" aria-hidden="true" />
                    </div>
                    <input
                      id="agent-name"
                      type="text"
                      required
                      placeholder={t("auth.register.fullNamePlaceholder")}
                      value={agentForm.name}
                      onChange={(e) => updateAgent("name", e.target.value)}
                      className={fieldWithIcon}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="agent-email" className={labelClass}>
                    {t("email")}
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                      <Mail className="size-4" aria-hidden="true" />
                    </div>
                    <input
                      id="agent-email"
                      type="email"
                      required
                      placeholder={t("auth.register.agentEmailPlaceholder")}
                      value={agentForm.email}
                      onChange={(e) => updateAgent("email", e.target.value)}
                      className={fieldWithIcon}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="agent-phone" className={labelClass}>
                    {t("phone")}
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                      <Phone className="size-4" aria-hidden="true" />
                    </div>
                    <input
                      id="agent-phone"
                      type="tel"
                      required
                      placeholder="+255712345678"
                      value={agentForm.phone}
                      onChange={(e) => updateAgent("phone", e.target.value)}
                      className={cx(fieldWithIcon, "font-mono")}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="agent-code" className={cx(labelClass, "mb-0")}>
                      {t("auth.register.referralLabel")}
                    </label>
                    <span className="text-[10px] text-advo-muted">{t("auth.common.optional")}</span>
                  </div>
                  <input
                    id="agent-code"
                    type="text"
                    placeholder={t("auth.register.referralPlaceholder")}
                    value={agentForm.referralCode}
                    onChange={(e) => updateAgent("referralCode", e.target.value.toUpperCase())}
                    className={cx(fieldClass, "uppercase")}
                  />
                  <p className="mt-1.5 text-[11px] text-advo-muted">{t("auth.register.referralHint")}</p>
                </div>

                <div>
                  <label htmlFor="agent-password" className={labelClass}>
                    {t("auth.password.minLength")}
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                      <Lock className="size-4" aria-hidden="true" />
                    </div>
                    <input
                      id="agent-password"
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="••••••••••••"
                      value={agentForm.password}
                      onChange={(e) => updateAgent("password", e.target.value)}
                      className={cx(fieldWithIcon, "pr-11")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-advo-muted transition hover:text-advo-text"
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

                <label className="flex cursor-pointer items-start gap-2.5 pt-1">
                  <input
                    type="checkbox"
                    id="agent-terms"
                    checked={agentForm.acceptTerms}
                    onChange={(e) => updateAgent("acceptTerms", e.target.checked)}
                    className="mt-0.5 size-4 cursor-pointer rounded border-advo-border accent-advo-gold focus:ring-advo-gold"
                  />
                  <span className="text-[11px] leading-relaxed text-advo-muted">
                    {t("auth.register.agentTermsLead")}{" "}
                    <Link href="/terms" className={linkAccent}>
                      {t("auth.register.agentTermsLink")}
                    </Link>{" "}
                    {t("auth.register.termsAnd")}{" "}
                    <Link href="/privacy" className={linkAccent}>
                      {t("auth.register.termsPrivacy")}
                    </Link>{" "}
                    {t("auth.register.agentTermsTrail")}
                  </span>
                </label>

                {error && <Notice tone="danger">{error}</Notice>}
                {info && <Notice tone="success">{info}</Notice>}

                <button
                  type="submit"
                  id="agent-submit-btn"
                  disabled={pending || !agentForm.acceptTerms}
                  className={buttonClasses({
                    variant: "gold",
                    size: "lg",
                    className: "mt-2 w-full",
                  })}
                >
                  <span>
                    {pending
                      ? t("auth.register.agentSubmitPending")
                      : t("auth.register.agentSubmit")}
                  </span>
                  <Sparkles className="size-4 shrink-0" aria-hidden="true" />
                </button>
              </form>
            ) : (
              <>
                {/* Step progress */}
                <div className="relative mb-7 rounded-2xl border border-advo-border bg-advo-page p-4">
                  <div className="absolute top-[2.15rem] right-10 left-10 h-0.5 bg-advo-border" />
                  <div
                    className="absolute top-[2.15rem] left-10 h-0.5 bg-[linear-gradient(90deg,#fba102,#f16304)] transition-all duration-300"
                    style={{
                      width:
                        step === 1 ? "0%" : step === 2 ? "calc(50% - 2.5rem)" : "calc(100% - 5rem)",
                    }}
                  />
                  <ol className="relative z-10 flex items-start justify-between">
                    {stepMeta.map((s) => {
                      const done = step > s.n;
                      const active = step === s.n;
                      return (
                        <li key={s.n} className="flex flex-col items-center">
                          <span
                            className={cx(
                              "flex size-8 items-center justify-center rounded-full text-xs font-bold transition-all",
                              done || active
                                ? "bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)] text-advo-charcoal shadow-md ring-4 ring-advo-gold-soft"
                                : "bg-white text-advo-muted ring-1 ring-advo-border",
                            )}
                          >
                            {done ? (
                              <CheckCircle2 className="size-4" aria-hidden="true" />
                            ) : (
                              s.n
                            )}
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

                <form
                  onSubmit={step === 3 ? onSubmit : handleNext}
                  className="relative space-y-4"
                >
                  {step === 1 && (
                    <div className="animate-in fade-in slide-in-from-right-4 space-y-4 duration-200">
                      <div>
                        <p className="mb-2.5 text-center text-[11px] font-bold tracking-wider text-advo-muted uppercase">
                          {t("auth.register.socialPrompt")}
                        </p>
                        <SocialLoginButtons />
                      </div>

                      <div>
                        <label htmlFor="ownerName" className={labelClass}>
                          {t("auth.register.fullNameLabel")}
                        </label>
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                            <User className="size-4" aria-hidden="true" />
                          </div>
                          <input
                            id="ownerName"
                            type="text"
                            placeholder={t("auth.register.ownerNamePlaceholder")}
                            value={form.ownerName}
                            onChange={(e) => update("ownerName", e.target.value)}
                            required
                            className={fieldWithIcon}
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="email" className={labelClass}>
                          {t("email")}
                        </label>
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                            <Mail className="size-4" aria-hidden="true" />
                          </div>
                          <input
                            id="email"
                            type="email"
                            placeholder={t("auth.field.emailPlaceholder")}
                            value={form.email}
                            onChange={(e) => update("email", e.target.value)}
                            required
                            className={fieldWithIcon}
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="phone" className={labelClass}>
                          {t("phone")}
                        </label>
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                            <Phone className="size-4" aria-hidden="true" />
                          </div>
                          <input
                            id="phone"
                            type="tel"
                            placeholder="+2557XXXXXXXX"
                            value={form.phone}
                            onChange={(e) => update("phone", e.target.value)}
                            required
                            className={cx(fieldWithIcon, "font-mono")}
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="password" className={labelClass}>
                          {t("auth.password.minLength")}
                        </label>
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                            <Lock className="size-4" aria-hidden="true" />
                          </div>
                          <input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••••••"
                            value={form.password}
                            onChange={(e) => update("password", e.target.value)}
                            minLength={10}
                            required
                            className={cx(fieldWithIcon, "pr-11")}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-advo-muted transition hover:text-advo-text"
                            tabIndex={-1}
                            aria-label={
                              showPassword ? t("auth.password.hide") : t("auth.password.show")
                            }
                          >
                            {showPassword ? (
                              <EyeOff className="size-4" aria-hidden="true" />
                            ) : (
                              <Eye className="size-4" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="animate-in fade-in slide-in-from-right-4 space-y-4 duration-200">
                      <div>
                        <label htmlFor="businessName" className={labelClass}>
                          {t("auth.register.businessNameLabel")}
                        </label>
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                            <Building className="size-4" aria-hidden="true" />
                          </div>
                          <input
                            id="businessName"
                            type="text"
                            placeholder={t("auth.register.businessNamePlaceholder")}
                            value={form.businessName}
                            onChange={(e) => update("businessName", e.target.value)}
                            required
                            className={fieldWithIcon}
                          />
                        </div>
                        <p className="mt-1.5 text-[11px] text-advo-muted">
                          {t("auth.register.businessNameHint")}
                        </p>
                      </div>

                      <div>
                        <label htmlFor="venueType" className={labelClass}>
                          {t("auth.register.venueTypeLabel")}
                        </label>
                        <div className="mb-2 grid grid-cols-2 gap-2">
                          {[
                            { id: "cafe", label: t("auth.register.venue.cafe"), icon: Coffee },
                            { id: "hotel", label: t("auth.register.venue.hotel"), icon: Hotel },
                            {
                              id: "hostel",
                              label: t("auth.register.venue.hostel"),
                              icon: GraduationCap,
                            },
                            { id: "wisp", label: t("auth.register.venue.wisp"), icon: Wifi },
                          ].map((item) => {
                            const Icon = item.icon;
                            const isSelected = form.venueType === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => update("venueType", item.id)}
                                className={cx(
                                  "flex items-center gap-2.5 rounded-xl border p-3 text-left text-xs transition-all",
                                  isSelected
                                    ? "border-advo-gold/50 bg-advo-gold-soft font-bold text-[#b15f00] shadow-xs"
                                    : "border-advo-border bg-advo-page text-advo-muted hover:bg-white",
                                )}
                              >
                                <Icon className="size-4 shrink-0" aria-hidden="true" />
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                        <select
                          id="venueType"
                          value={form.venueType}
                          onChange={(e) => update("venueType", e.target.value)}
                          className={fieldClass}
                        >
                          <option value="cafe">{t("auth.register.venueOption.cafe")}</option>
                          <option value="hotel">{t("auth.register.venueOption.hotel")}</option>
                          <option value="hostel">{t("auth.register.venueOption.hostel")}</option>
                          <option value="wisp">{t("auth.register.venueOption.wisp")}</option>
                          <option value="salon">{t("auth.register.venueOption.salon")}</option>
                          <option value="other">{t("auth.register.venueOption.other")}</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="city" className={labelClass}>
                          {t("auth.register.cityLabel")}
                        </label>
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                            <MapPin className="size-4" aria-hidden="true" />
                          </div>
                          <select
                            id="city"
                            value={form.city}
                            onChange={(e) => update("city", e.target.value)}
                            className={fieldWithIcon}
                          >
                            <option value="Dar es Salaam">{t("auth.register.city.dar")}</option>
                            <option value="Arusha">{t("auth.register.city.arusha")}</option>
                            <option value="Zanzibar">{t("auth.register.city.zanzibar")}</option>
                            <option value="Mwanza">{t("auth.register.city.mwanza")}</option>
                            <option value="Dodoma">{t("auth.register.city.dodoma")}</option>
                            <option value="Mbeya">{t("auth.register.city.mbeya")}</option>
                            <option value="Morogoro">{t("auth.register.city.morogoro")}</option>
                            <option value="Tanga">{t("auth.register.city.tanga")}</option>
                            <option value="Kilimanjaro">
                              {t("auth.register.city.kilimanjaro")}
                            </option>
                            <option value="Other">{t("auth.register.city.other")}</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 3 && (
                    <div className="animate-in fade-in slide-in-from-right-4 space-y-4 duration-200">
                      <div>
                        <label htmlFor="deviceType" className={labelClass}>
                          {t("auth.register.deviceTypeLabel")}
                        </label>
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
                            <Radio className="size-4" aria-hidden="true" />
                          </div>
                          <select
                            id="deviceType"
                            value={form.deviceType}
                            onChange={(e) => update("deviceType", e.target.value)}
                            className={fieldWithIcon}
                          >
                            <option value="ap">{t("auth.register.deviceType.ap")}</option>
                            <option value="gateway">{t("auth.register.deviceType.gateway")}</option>
                            <option value="switch">{t("auth.register.deviceType.switch")}</option>
                            <option value="repeater">
                              {t("auth.register.deviceType.repeater")}
                            </option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="referralCode" className={labelClass}>
                          {t("referralCodeOptional")}
                        </label>
                        <input
                          id="referralCode"
                          type="text"
                          placeholder={t("auth.register.referralCodePlaceholder")}
                          value={form.referralCode}
                          onChange={(e) => update("referralCode", e.target.value)}
                          className={cx(fieldClass, "font-mono uppercase")}
                        />
                        <p className="mt-1.5 text-[11px] text-advo-muted">
                          {t("auth.register.referralBonusHint")}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-advo-border bg-advo-page p-4">
                        <label className="flex cursor-pointer items-start gap-3 text-xs text-advo-text">
                          <input
                            type="checkbox"
                            checked={form.acceptTerms}
                            onChange={(e) => update("acceptTerms", e.target.checked)}
                            required
                            className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-advo-border accent-advo-gold focus:ring-advo-gold"
                          />
                          <span className="leading-relaxed">
                            {t("auth.register.termsLead")}{" "}
                            <Link href="/terms" className={linkAccent}>
                              {t("auth.register.termsService")}
                            </Link>{" "}
                            {t("auth.register.termsAnd")}{" "}
                            <Link href="/privacy" className={linkAccent}>
                              {t("auth.register.termsPrivacy")}
                            </Link>{" "}
                            {t("auth.register.termsTrail")}
                          </span>
                        </label>
                      </div>

                      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50 p-3.5">
                        <ShieldCheck className="size-5 shrink-0 text-emerald-600" aria-hidden="true" />
                        <p className="text-[11px] leading-snug text-emerald-900">
                          <strong>{t("auth.register.guaranteeTitle")}</strong>{" "}
                          {t("auth.register.guaranteeBody")}
                        </p>
                      </div>
                    </div>
                  )}

                  {error && <Notice tone="danger">{error}</Notice>}
                  {info && <Notice tone="success">{info}</Notice>}

                  <div className="flex items-center gap-3 border-t border-advo-border pt-4">
                    {step > 1 && (
                      <button
                        type="button"
                        onClick={handlePrev}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-advo-border bg-advo-page px-4 py-3 text-xs font-bold text-advo-text transition hover:bg-white active:scale-95"
                      >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        {t("back")}
                      </button>
                    )}

                    {step < 3 ? (
                      <button
                        type="submit"
                        className={buttonClasses({
                          variant: "gold",
                          size: "lg",
                          className: "flex-1",
                        })}
                      >
                        <span>{t("auth.register.next")}</span>
                        <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={pending || !form.acceptTerms}
                        className={buttonClasses({
                          variant: "gold",
                          size: "lg",
                          className: "flex-1",
                        })}
                      >
                        <span>
                          {pending
                            ? t("auth.register.submitPending")
                            : t("auth.register.submit")}
                        </span>
                        <Sparkles className="size-4 shrink-0" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </form>
              </>
            )}

            <div className="relative mt-8 border-t border-advo-border pt-6 text-center text-sm text-advo-muted">
              <span>{t("auth.register.haveAccount")} </span>
              <Link href="/login" className={linkAccent}>
                {t("auth.register.loginLink")}
              </Link>
            </div>
          </div>
        </div>

        <footer className="relative z-10 pt-4 text-center text-xs text-advo-muted">
          &copy; {new Date().getFullYear()} Advo TZ · {t("auth.common.footerTagline")}
        </footer>
      </div>
    </div>
  );
}
