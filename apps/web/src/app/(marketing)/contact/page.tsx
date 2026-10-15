"use client";

import { useState } from "react";
import { Phone, Mail, MapPin, CheckCircle2, MessageSquare, ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function ContactPage() {
  const { t } = useI18n();
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    businessName: "",
    phone: "",
    email: "",
    venueType: "cafe",
    message: "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <div className="w-full bg-[#F7F9FC] py-16 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span
            className="inline-block text-xs font-bold uppercase tracking-wider px-3.5 py-1 rounded-full mb-3"
            style={{
              background: "linear-gradient(135deg, rgba(251, 161, 2, 0.15) 0%, rgba(241, 99, 4, 0.15) 100%)",
              color: "#b15f00",
              border: "1px solid rgba(251, 161, 2, 0.35)",
            }}
          >
            {t("marketing.contact.badge")}
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#18212F] tracking-tight">
            {t("marketing.contact.title")}
          </h1>
          <p className="text-base sm:text-lg text-[#526174] mt-4">
            {t("marketing.contact.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start max-w-5xl mx-auto">
          {/* Contact Details Column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-3xl border border-[#DFE5EC] bg-white p-8 shadow-sm space-y-6">
              <h3 className="text-xl font-bold text-[#18212F]">
                {t("marketing.contact.details.title")}
              </h3>

              <div className="space-y-4 text-sm text-[#18212F]">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#fff4e0] border border-[#FBA102]/30 flex items-center justify-center text-[#b15f00] shrink-0 mt-0.5">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-[#526174] uppercase">{t("marketing.contact.details.office")}</div>
                    <div className="font-semibold mt-0.5">Dar es Salaam, Tanzania</div>
                    <div className="text-xs text-[#526174]">Kariakoo & Mikocheni</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-[#FBA102] shrink-0 mt-0.5">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-[#526174] uppercase">{t("marketing.contact.details.phone")}</div>
                    <div className="font-semibold mt-0.5">+255 700 000 000</div>
                    <div className="text-xs text-[#526174]">{t("marketing.contact.details.hours")}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F16304] shrink-0 mt-0.5">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-[#526174] uppercase">{t("marketing.contact.details.email")}</div>
                    <div className="font-semibold mt-0.5">support@advo.tz</div>
                    <div className="text-xs text-[#526174]">{t("marketing.contact.details.emailResponse")}</div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#F7F9FC] border border-[#DFE5EC] text-xs text-[#526174] space-y-1">
                <div className="font-bold text-[#18212F]">{t("marketing.contact.details.installTitle")}</div>
                <div>
                  {t("marketing.contact.details.installBody")}
                </div>
              </div>
            </div>
          </div>

          {/* Inquiry Form Column */}
          <div className="lg:col-span-7">
            <div className="rounded-3xl border border-[#DFE5EC] bg-white p-8 sm:p-10 shadow-sm">
              {submitted ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-bold text-[#18212F]">
                    {t("marketing.contact.success.title")}
                  </h3>
                  <p className="text-sm text-[#526174] max-w-md mx-auto">
                    {t("marketing.contact.success.body")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="text-xs font-bold text-[#FBA102] underline pt-4"
                  >
                    {t("marketing.contact.success.again")}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <h3 className="text-xl font-bold text-[#18212F] mb-2">
                    {t("marketing.contact.form.title")}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#18212F] mb-1">
                        {t("marketing.contact.form.name")}
                      </label>
                      <input
                        required
                        type="text"
                        placeholder={t("marketing.contact.form.namePlaceholder")}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full rounded-field border border-[#DFE5EC] bg-white px-3.5 py-2.5 text-xs text-[#18212F] outline-none focus:border-[#FBA102]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#18212F] mb-1">
                        {t("marketing.contact.form.business")}
                      </label>
                      <input
                        type="text"
                        placeholder={t("marketing.contact.form.businessPlaceholder")}
                        value={formData.businessName}
                        onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                        className="w-full rounded-field border border-[#DFE5EC] bg-white px-3.5 py-2.5 text-xs text-[#18212F] outline-none focus:border-[#FBA102]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#18212F] mb-1">
                        {t("marketing.contact.form.phone")}
                      </label>
                      <input
                        required
                        type="tel"
                        placeholder={t("marketing.contact.form.phonePlaceholder")}
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full rounded-field border border-[#DFE5EC] bg-white px-3.5 py-2.5 text-xs text-[#18212F] outline-none focus:border-[#FBA102]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#18212F] mb-1">
                        {t("marketing.contact.form.venueType")}
                      </label>
                      <select
                        value={formData.venueType}
                        onChange={(e) => setFormData({ ...formData, venueType: e.target.value })}
                        className="w-full rounded-field border border-[#DFE5EC] bg-white px-3.5 py-2.5 text-xs text-[#18212F] outline-none focus:border-[#FBA102]"
                      >
                        <option value="cafe">{t("marketing.contact.form.venue.cafe")}</option>
                        <option value="hotel">{t("marketing.contact.form.venue.hotel")}</option>
                        <option value="hostel">{t("marketing.contact.form.venue.hostel")}</option>
                        <option value="wisp">{t("marketing.contact.form.venue.wisp")}</option>
                        <option value="agent">{t("marketing.contact.form.venue.agent")}</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#18212F] mb-1">
                      {t("marketing.contact.form.message")}
                    </label>
                    <textarea
                      rows={4}
                      placeholder={t("marketing.contact.form.messagePlaceholder")}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full rounded-field border border-[#DFE5EC] bg-white px-3.5 py-2.5 text-xs text-[#18212F] outline-none focus:border-[#FBA102]"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-xs text-[#111213] shadow-md transition bg-[linear-gradient(135deg,#FBA102_0%,#F16304_100%)] hover:brightness-105"
                    >
                      <span>{t("marketing.contact.form.submit")}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
