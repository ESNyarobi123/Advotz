"use client";

import Link from "next/link";
import { Card } from "@heroui/react";
import { Notice } from "@advo/ui";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AdvoLogo } from "@/features/marketing/AdvoLogo";
import { SocialLoginButtons } from "@/features/auth/SocialLoginButtons";
import { AuthShowcasePanel } from "@/features/auth/AuthShowcasePanel";
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
  Store,
  Wifi,
} from "lucide-react";

export default function RegisterPage() {
  const { t } = useI18n();
  const router = useRouter();

  const [accountType, setAccountType] = useState<"reseller" | "agent">("reseller");

  // Multi-step state for reseller: 1, 2, 3
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [form, setForm] = useState({
    // Step 1: Account
    ownerName: "",
    email: "",
    phone: "+255",
    password: "",
    // Step 2: Business
    businessName: "",
    venueType: "cafe",
    city: "Dar es Salaam",
    // Step 3: Network & Legal
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

  // Step 1 Validation
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

  // Step 2 Validation
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
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
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
        ...(form.referralCode.trim()
          ? { referralCode: form.referralCode.trim() }
          : {}),
      };

      const res = await apiFetch<{
        verificationRequired: boolean;
        notificationSimulated?: boolean;
        devVerificationToken?: string;
      }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (res.devVerificationToken) {
        setInfo(t("auth.register.info.devToken", { token: res.devVerificationToken }));
        router.push(`/verify?token=${encodeURIComponent(res.devVerificationToken)}`);
        return;
      }

      setInfo(t("auth.register.info.checkEmail"));
      router.push("/verify");
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

  return (
    <div className="min-h-screen flex bg-[#F7F9FC] text-[#18212F]">
      {/* Left side: Premium Brand Showcase Panel */}
      <AuthShowcasePanel type="register" />

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

        {/* Mobile-only Top Bar */}
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

        {/* Main Multi-Step Form Card */}
        <div className="w-full max-w-xl mx-auto my-auto py-4">
          <Card className="p-7 sm:p-9 shadow-xl relative overflow-hidden">
            {/* Top Brand Gradient Line */}
            <div
              className="absolute top-0 left-0 right-0 h-1.5"
              style={{
                background: "linear-gradient(90deg, #1B5EA4 0%, #FBA102 50%, #F16304 100%)",
              }}
            />

            {/* Header */}
            <div className="mb-6 space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#1B5EA4]/10 text-[#1B5EA4] mb-1">
                <Sparkles className="w-3 h-3 text-[#FBA102]" />
                {accountType === "reseller" ? t("auth.register.badgeReseller") : t("auth.register.badgeAgent")}
              </div>
              <h1 className="text-2xl font-black text-[#18212F] tracking-tight">
                {accountType === "reseller" ? t("auth.register.titleReseller") : t("auth.register.titleAgent")}
              </h1>
              <p className="text-xs text-[#526174] leading-relaxed">
                {accountType === "reseller"
                  ? t("auth.register.subtitleReseller")
                  : t("auth.register.subtitleAgent")}
              </p>
            </div>

            {/* Role / Account Type Selector Tabs */}
            <div className="grid grid-cols-2 p-1 bg-[#F7F9FC] border border-[#DFE5EC] rounded-2xl mb-6">
              <button
                type="button"
                id="tab-reseller"
                onClick={() => { setAccountType("reseller"); setError(null); }}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                  accountType === "reseller"
                    ? "bg-white text-[#1B5EA4] shadow-sm border border-[#DFE5EC]"
                    : "text-[#526174] hover:text-[#18212F]"
                }`}
              >
                <Building className="w-4 h-4 text-[#1B5EA4]" />
                <span>{t("auth.register.tabReseller")}</span>
              </button>
              <button
                type="button"
                id="tab-agent"
                onClick={() => { setAccountType("agent"); setError(null); }}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                  accountType === "agent"
                    ? "bg-white text-[#F16304] shadow-sm border border-[#DFE5EC]"
                    : "text-[#526174] hover:text-[#18212F]"
                }`}
              >
                <Sparkles className="w-4 h-4 text-[#FBA102]" />
                <span>{t("auth.register.tabAgent")}</span>
              </button>
            </div>

            {accountType === "agent" ? (
              <form onSubmit={onAgentSubmit} className="space-y-4">
                {/* Social Login Buttons */}
                <div className="mb-4">
                  <SocialLoginButtons />
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-[#DFE5EC]" />
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-wider">
                      <span className="bg-white px-3 text-[#526174]">
                        {t("auth.register.agentOrDetails")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#18212F] flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#1B5EA4]" />
                    <span>{t("auth.register.fullNameLabel")}</span>
                  </label>
                  <input
                    id="agent-name"
                    type="text"
                    required
                    placeholder={t("auth.register.fullNamePlaceholder")}
                    value={agentForm.name}
                    onChange={(e) => updateAgent("name", e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-field border border-[#DFE5EC] bg-[#F7F9FC] text-xs font-medium text-[#18212F] focus:bg-white focus:outline-none focus:border-[#1B5EA4] focus:ring-2 focus:ring-[#1B5EA4]/20 transition"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#18212F] flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#1B5EA4]" />
                    <span>{t("email")}</span>
                  </label>
                  <input
                    id="agent-email"
                    type="email"
                    required
                    placeholder={t("auth.register.agentEmailPlaceholder")}
                    value={agentForm.email}
                    onChange={(e) => updateAgent("email", e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-field border border-[#DFE5EC] bg-[#F7F9FC] text-xs font-medium text-[#18212F] focus:bg-white focus:outline-none focus:border-[#1B5EA4] focus:ring-2 focus:ring-[#1B5EA4]/20 transition"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#18212F] flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-[#1B5EA4]" />
                    <span>{t("phone")}</span>
                  </label>
                  <input
                    id="agent-phone"
                    type="tel"
                    required
                    placeholder="+255712345678"
                    value={agentForm.phone}
                    onChange={(e) => updateAgent("phone", e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-field border border-[#DFE5EC] bg-[#F7F9FC] text-xs font-medium text-[#18212F] focus:bg-white focus:outline-none focus:border-[#1B5EA4] focus:ring-2 focus:ring-[#1B5EA4]/20 transition"
                  />
                </div>

                {/* Desired Referral Code */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#18212F] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#FBA102]" />
                      <span>{t("auth.register.referralLabel")}</span>
                    </label>
                    <span className="text-[10px] text-[#526174]">{t("auth.common.optional")}</span>
                  </div>
                  <input
                    id="agent-code"
                    type="text"
                    placeholder={t("auth.register.referralPlaceholder")}
                    value={agentForm.referralCode}
                    onChange={(e) => updateAgent("referralCode", e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 rounded-field border border-[#DFE5EC] bg-[#F7F9FC] text-xs font-medium text-[#18212F] focus:bg-white focus:outline-none focus:border-[#FBA102] focus:ring-2 focus:ring-[#FBA102]/20 transition uppercase"
                  />
                  <p className="text-[10px] text-[#526174]">
                    {t("auth.register.referralHint")}
                  </p>
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#18212F] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#1B5EA4]" />
                    <span>{t("auth.password.minLength")}</span>
                  </label>
                  <div className="relative">
                    <input
                      id="agent-password"
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="••••••••••••"
                      value={agentForm.password}
                      onChange={(e) => updateAgent("password", e.target.value)}
                      className="w-full px-3.5 py-2.5 pr-10 rounded-field border border-[#DFE5EC] bg-[#F7F9FC] text-xs font-medium text-[#18212F] focus:bg-white focus:outline-none focus:border-[#1B5EA4] focus:ring-2 focus:ring-[#1B5EA4]/20 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#526174] hover:text-[#18212F]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Accept Terms */}
                <label className="flex items-start gap-2.5 cursor-pointer pt-2">
                  <input
                    type="checkbox"
                    id="agent-terms"
                    checked={agentForm.acceptTerms}
                    onChange={(e) => updateAgent("acceptTerms", e.target.checked)}
                    className="mt-0.5 rounded border-[#DFE5EC] text-[#1B5EA4] focus:ring-[#1B5EA4]"
                  />
                  <span className="text-[11px] text-[#526174] leading-relaxed">
                    {t("auth.register.agentTermsLead")}{" "}
                    <Link href="/terms" className="text-[#1B5EA4] font-bold hover:underline">
                      {t("auth.register.agentTermsLink")}
                    </Link>{" "}
                    {t("auth.register.termsAnd")}{" "}
                    <Link href="/privacy" className="text-[#1B5EA4] font-bold hover:underline">
                      {t("auth.register.termsPrivacy")}
                    </Link>{" "}
                    {t("auth.register.agentTermsTrail")}
                  </span>
                </label>

                {/* Error Banner */}
                {error && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600">
                    {error}
                  </div>
                )}
                {info && (
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-[#1B5EA4]">
                    {info}
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  id="agent-submit-btn"
                  disabled={pending || !agentForm.acceptTerms}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-xs text-white shadow-lg transition-all duration-200 disabled:opacity-60 active:scale-[0.99] bg-[#1B5EA4] hover:bg-[#2176C2] mt-4"
                  style={{
                    boxShadow: "0 4px 15px rgba(27, 94, 164, 0.45)",
                  }}
                >
                  <span>{pending ? t("auth.register.agentSubmitPending") : t("auth.register.agentSubmit")}</span>
                  <Sparkles className="w-4 h-4 text-[#FBA102]" />
                </button>
              </form>
            ) : (
              <>
            {/* Visual Step Progress Tracker */}
            <div className="mb-8 p-4 rounded-2xl bg-[#F7F9FC] border border-[#DFE5EC]">
              <div className="flex items-center justify-between relative">
                {/* Connecting track line */}
                <div className="absolute top-4 left-6 right-6 h-0.5 bg-[#DFE5EC] -z-0" />
                <div
                  className="absolute top-4 left-6 h-0.5 transition-all duration-300 -z-0"
                  style={{
                    width: step === 1 ? "0%" : step === 2 ? "50%" : "100%",
                    backgroundColor: "#1B5EA4",
                  }}
                />

                {/* Step 1 Indicator */}
                <div className="flex flex-col items-center relative z-10">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      step >= 1
                        ? "bg-[#1B5EA4] text-white shadow-md ring-4 ring-blue-50"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {step > 1 ? <CheckCircle2 className="w-4 h-4 text-white" /> : "1"}
                  </div>
                  <span
                    className={`text-[10px] font-bold mt-1.5 ${
                      step === 1 ? "text-[#1B5EA4]" : "text-[#18212F]"
                    }`}
                  >
                    {t("auth.register.stepAccount")}
                  </span>
                </div>

                {/* Step 2 Indicator */}
                <div className="flex flex-col items-center relative z-10">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      step >= 2
                        ? "bg-[#1B5EA4] text-white shadow-md ring-4 ring-blue-50"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {step > 2 ? <CheckCircle2 className="w-4 h-4 text-white" /> : "2"}
                  </div>
                  <span
                    className={`text-[10px] font-bold mt-1.5 ${
                      step === 2 ? "text-[#1B5EA4]" : "text-[#18212F]"
                    }`}
                  >
                    {t("auth.register.stepBusiness")}
                  </span>
                </div>

                {/* Step 3 Indicator */}
                <div className="flex flex-col items-center relative z-10">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      step === 3
                        ? "text-[#111213] shadow-md ring-4 ring-amber-50"
                        : "bg-slate-200 text-slate-500"
                    }`}
                    style={
                      step === 3
                        ? {
                            background: "linear-gradient(135deg, #FBA102 0%, #F16304 100%)",
                          }
                        : undefined
                    }
                  >
                    3
                  </div>
                  <span
                    className={`text-[10px] font-bold mt-1.5 ${
                      step === 3 ? "text-[#F16304]" : "text-[#18212F]"
                    }`}
                  >
                    {t("auth.register.stepDeviceType")}
                  </span>
                </div>
              </div>
            </div>

            {/* Form Wizard */}
            <form onSubmit={step === 3 ? onSubmit : handleNext} className="space-y-4">
              {/* ============================================================= */}
              {/* STEP 1: Taarifa za Msingi & Akaunti                           */}
              {/* ============================================================= */}
              {step === 1 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                  {/* Social Buttons on top */}
                  <div className="mb-2">
                    <div className="text-[11px] font-bold text-[#18212F] uppercase tracking-wider mb-2.5 text-center">
                      {t("auth.register.socialPrompt")}
                    </div>
                    <SocialLoginButtons />
                  </div>

                  {/* Owner Name */}
                  <div>
                    <label
                      htmlFor="ownerName"
                      className="block text-xs font-bold text-[#18212F] uppercase tracking-wide mb-1.5"
                    >
                      {t("auth.register.fullNameLabel")}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#526174]">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        id="ownerName"
                        type="text"
                        placeholder={t("auth.register.ownerNamePlaceholder")}
                        value={form.ownerName}
                        onChange={(e) => update("ownerName", e.target.value)}
                        required
                        className="w-full rounded-field border border-[#DFE5EC] bg-[#F7F9FC] pl-10 pr-3.5 py-3 text-xs text-[#18212F] outline-none transition focus:bg-white focus:border-[#1B5EA4] focus:ring-2 focus:ring-[#1B5EA4]/20"
                      />
                    </div>
                  </div>

                  {/* Email */}
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
                        placeholder={t("auth.field.emailPlaceholder")}
                        value={form.email}
                        onChange={(e) => update("email", e.target.value)}
                        required
                        className="w-full rounded-field border border-[#DFE5EC] bg-[#F7F9FC] pl-10 pr-3.5 py-3 text-xs text-[#18212F] outline-none transition focus:bg-white focus:border-[#1B5EA4] focus:ring-2 focus:ring-[#1B5EA4]/20"
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label
                      htmlFor="phone"
                      className="block text-xs font-bold text-[#18212F] uppercase tracking-wide mb-1.5"
                    >
                      {t("phone")}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#526174]">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        id="phone"
                        type="tel"
                        placeholder="+2557XXXXXXXX"
                        value={form.phone}
                        onChange={(e) => update("phone", e.target.value)}
                        required
                        className="w-full rounded-field border border-[#DFE5EC] bg-[#F7F9FC] pl-10 pr-3.5 py-3 text-xs text-[#18212F] outline-none transition focus:bg-white focus:border-[#1B5EA4] focus:ring-2 focus:ring-[#1B5EA4]/20 font-mono"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label
                      htmlFor="password"
                      className="block text-xs font-bold text-[#18212F] uppercase tracking-wide mb-1.5"
                    >
                      {t("auth.password.minLength")}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#526174]">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={form.password}
                        onChange={(e) => update("password", e.target.value)}
                        minLength={10}
                        required
                        className="w-full rounded-field border border-[#DFE5EC] bg-[#F7F9FC] pl-10 pr-10 py-3 text-xs text-[#18212F] outline-none transition focus:bg-white focus:border-[#1B5EA4] focus:ring-2 focus:ring-[#1B5EA4]/20"
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
                </div>
              )}

              {/* ============================================================= */}
              {/* STEP 2: Taarifa za Biashara ya WiFi                           */}
              {/* ============================================================= */}
              {step === 2 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                  {/* Business Name */}
                  <div>
                    <label
                      htmlFor="businessName"
                      className="block text-xs font-bold text-[#18212F] uppercase tracking-wide mb-1.5"
                    >
                      {t("auth.register.businessNameLabel")}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#526174]">
                        <Building className="w-4 h-4" />
                      </div>
                      <input
                        id="businessName"
                        type="text"
                        placeholder={t("auth.register.businessNamePlaceholder")}
                        value={form.businessName}
                        onChange={(e) => update("businessName", e.target.value)}
                        required
                        className="w-full rounded-field border border-[#DFE5EC] bg-[#F7F9FC] pl-10 pr-3.5 py-3 text-xs text-[#18212F] outline-none transition focus:bg-white focus:border-[#1B5EA4] focus:ring-2 focus:ring-[#1B5EA4]/20"
                      />
                    </div>
                    <p className="text-[11px] text-[#526174] mt-1.5">
                      {t("auth.register.businessNameHint")}
                    </p>
                  </div>

                  {/* Venue Type Visual Selection */}
                  <div>
                    <label
                      htmlFor="venueType"
                      className="block text-xs font-bold text-[#18212F] uppercase tracking-wide mb-1.5"
                    >
                      {t("auth.register.venueTypeLabel")}
                    </label>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {[
                        { id: "cafe", label: t("auth.register.venue.cafe"), icon: Coffee },
                        { id: "hotel", label: t("auth.register.venue.hotel"), icon: Hotel },
                        { id: "hostel", label: t("auth.register.venue.hostel"), icon: GraduationCap },
                        { id: "wisp", label: t("auth.register.venue.wisp"), icon: Wifi },
                      ].map((item) => {
                        const Icon = item.icon;
                        const isSelected = form.venueType === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => update("venueType", item.id)}
                            className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                              isSelected
                                ? "border-[#1B5EA4] bg-blue-50/50 text-[#1B5EA4] font-bold shadow-xs"
                                : "border-[#DFE5EC] bg-[#F7F9FC] text-[#526174] hover:bg-slate-100"
                            }`}
                          >
                            <Icon className={`w-4 h-4 ${isSelected ? "text-[#1B5EA4]" : "text-[#526174]"}`} />
                            <span className="text-xs">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <select
                      id="venueType"
                      value={form.venueType}
                      onChange={(e) => update("venueType", e.target.value)}
                      className="w-full rounded-field border border-[#DFE5EC] bg-[#F7F9FC] px-3.5 py-2.5 text-xs text-[#18212F] outline-none transition focus:bg-white focus:border-[#1B5EA4]"
                    >
                      <option value="cafe">{t("auth.register.venueOption.cafe")}</option>
                      <option value="hotel">{t("auth.register.venueOption.hotel")}</option>
                      <option value="hostel">{t("auth.register.venueOption.hostel")}</option>
                      <option value="wisp">{t("auth.register.venueOption.wisp")}</option>
                      <option value="salon">{t("auth.register.venueOption.salon")}</option>
                      <option value="other">{t("auth.register.venueOption.other")}</option>
                    </select>
                  </div>

                  {/* City */}
                  <div>
                    <label
                      htmlFor="city"
                      className="block text-xs font-bold text-[#18212F] uppercase tracking-wide mb-1.5"
                    >
                      {t("auth.register.cityLabel")}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#526174]">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <select
                        id="city"
                        value={form.city}
                        onChange={(e) => update("city", e.target.value)}
                        className="w-full rounded-field border border-[#DFE5EC] bg-[#F7F9FC] pl-10 pr-3.5 py-3 text-xs text-[#18212F] outline-none transition focus:bg-white focus:border-[#1B5EA4]"
                      >
                        <option value="Dar es Salaam">{t("auth.register.city.dar")}</option>
                        <option value="Arusha">{t("auth.register.city.arusha")}</option>
                        <option value="Zanzibar">{t("auth.register.city.zanzibar")}</option>
                        <option value="Mwanza">{t("auth.register.city.mwanza")}</option>
                        <option value="Dodoma">{t("auth.register.city.dodoma")}</option>
                        <option value="Mbeya">{t("auth.register.city.mbeya")}</option>
                        <option value="Morogoro">{t("auth.register.city.morogoro")}</option>
                        <option value="Tanga">{t("auth.register.city.tanga")}</option>
                        <option value="Kilimanjaro">{t("auth.register.city.kilimanjaro")}</option>
                        <option value="Other">{t("auth.register.city.other")}</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================= */}
              {/* STEP 3: Vifaa vya Mtandao, Rufaa & Masharti                   */}
              {/* ============================================================= */}
              {step === 3 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                  {/* Device type */}
                  <div>
                    <label
                      htmlFor="deviceType"
                      className="block text-xs font-bold text-[#18212F] uppercase tracking-wide mb-1.5"
                    >
                      {t("auth.register.deviceTypeLabel")}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#526174]">
                        <Radio className="w-4 h-4" />
                      </div>
                      <select
                        id="deviceType"
                        value={form.deviceType}
                        onChange={(e) => update("deviceType", e.target.value)}
                        className="w-full rounded-field border border-[#DFE5EC] bg-[#F7F9FC] pl-10 pr-3.5 py-3 text-xs text-[#18212F] outline-none transition focus:bg-white focus:border-[#1B5EA4]"
                      >
                        <option value="ap">{t("auth.register.deviceType.ap")}</option>
                        <option value="gateway">{t("auth.register.deviceType.gateway")}</option>
                        <option value="switch">{t("auth.register.deviceType.switch")}</option>
                        <option value="repeater">{t("auth.register.deviceType.repeater")}</option>
                      </select>
                    </div>
                  </div>

                  {/* Referral Code */}
                  <div>
                    <label
                      htmlFor="referralCode"
                      className="block text-xs font-bold text-[#18212F] uppercase tracking-wide mb-1.5"
                    >
                      {t("referralCodeOptional")}
                    </label>
                    <input
                      id="referralCode"
                      type="text"
                      placeholder={t("auth.register.referralCodePlaceholder")}
                      value={form.referralCode}
                      onChange={(e) => update("referralCode", e.target.value)}
                      className="w-full rounded-field border border-[#DFE5EC] bg-[#F7F9FC] px-3.5 py-3 text-xs text-[#18212F] outline-none transition focus:bg-white focus:border-[#1B5EA4] font-mono uppercase"
                    />
                    <p className="text-[11px] text-[#526174] mt-1.5">
                      {t("auth.register.referralBonusHint")}
                    </p>
                  </div>

                  {/* Terms Agreement Checkbox */}
                  <div className="p-4 rounded-2xl bg-[#F7F9FC] border border-[#DFE5EC]">
                    <label className="flex items-start gap-3 text-xs text-[#18212F] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.acceptTerms}
                        onChange={(e) => update("acceptTerms", e.target.checked)}
                        required
                        className="mt-0.5 rounded border-[#DFE5EC] text-[#1B5EA4] focus:ring-[#1B5EA4] accent-[#1B5EA4] w-4 h-4 cursor-pointer shrink-0"
                      />
                      <span className="leading-relaxed">
                        {t("auth.register.termsLead")}{" "}
                        <Link href="/terms" className="font-bold text-[#1B5EA4] hover:underline">
                          {t("auth.register.termsService")}
                        </Link>{" "}
                        {t("auth.register.termsAnd")}{" "}
                        <Link href="/privacy" className="font-bold text-[#1B5EA4] hover:underline">
                          {t("auth.register.termsPrivacy")}
                        </Link>{" "}
                        {t("auth.register.termsTrail")}
                      </span>
                    </label>
                  </div>

                  {/* Guarantee Box */}
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="text-[11px] text-emerald-900 leading-snug">
                      <strong>{t("auth.register.guaranteeTitle")}</strong> {t("auth.register.guaranteeBody")}
                    </div>
                  </div>
                </div>
              )}

              {/* Error & Info Messages */}
              {error && <Notice tone="danger">{error}</Notice>}

              {info && <Notice tone="success">{info}</Notice>}

              {/* Multi-Step Action Buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-[#DFE5EC]">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border border-[#DFE5EC] bg-[#F7F9FC] hover:bg-slate-200 text-xs font-bold text-[#18212F] transition active:scale-95"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{t("back")}</span>
                  </button>
                )}

                {step < 3 ? (
                  <button
                    type="submit"
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-xs text-white shadow-md transition-all duration-200 active:scale-[0.99] bg-[#1B5EA4] hover:bg-[#2176C2]"
                    style={{
                      boxShadow: "0 4px 14px rgba(27, 94, 164, 0.35)",
                    }}
                  >
                    <span>{t("auth.register.next")}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={pending || !form.acceptTerms}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-xs text-white shadow-lg transition-all duration-200 disabled:opacity-60 active:scale-[0.99] bg-[#1B5EA4] hover:bg-[#2176C2]"
                    style={{
                      boxShadow: "0 4px 15px rgba(27, 94, 164, 0.45)",
                    }}
                  >
                    <span>{pending ? t("auth.register.submitPending") : t("auth.register.submit")}</span>
                    <Sparkles className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          </>
        )}

            {/* Footer Already Registered Link */}
            <div className="mt-8 pt-6 border-t border-[#DFE5EC] text-center text-xs text-[#526174]">
              <span>{t("auth.register.haveAccount")} </span>
              <Link
                href="/login"
                className="font-bold text-[#1B5EA4] hover:text-[#2176C2] transition underline underline-offset-2"
              >
                {t("auth.register.loginLink")}
              </Link>
            </div>
          </Card>
        </div>

        {/* Simple Footer */}
        <footer className="text-center text-xs text-[#526174] pt-4">
          &copy; {new Date().getFullYear()} Advo TZ · {t("auth.common.footerTagline")}
        </footer>
      </div>
    </div>
  );
}
