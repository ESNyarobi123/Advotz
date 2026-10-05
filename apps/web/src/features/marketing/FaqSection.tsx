"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function FaqSection() {
  const { t } = useI18n();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: t("marketing.faq.q1"),
      a: t("marketing.faq.a1"),
    },
    {
      q: t("marketing.faq.q2"),
      a: t("marketing.faq.a2"),
    },
    {
      q: t("marketing.faq.q3"),
      a: t("marketing.faq.a3"),
    },
    {
      q: t("marketing.faq.q4"),
      a: t("marketing.faq.a4"),
    },
    {
      q: t("marketing.faq.q5"),
      a: t("marketing.faq.a5"),
    },
    {
      q: t("marketing.faq.q6"),
      a: t("marketing.faq.a6"),
    },
  ];

  return (
    <div id="faq" className="w-full max-w-4xl mx-auto space-y-4">
      <div className="text-center mb-8">
        <span
          className="inline-block text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3"
          style={{
            background: "linear-gradient(135deg, rgba(27, 94, 164, 0.15) 0%, rgba(33, 118, 194, 0.15) 100%)",
            color: "#1B5EA4",
            border: "1px solid rgba(27, 94, 164, 0.25)",
          }}
        >
          {t("marketing.faq.badge")}
        </span>
        <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-[#18212F] tracking-tight">
          {t("marketing.faq.title")}
        </h2>
        <p className="text-base text-[#526174] mt-3">
          {t("marketing.faq.subtitle")}
        </p>
      </div>

      <div className="space-y-3">
        {faqs.map((faq, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div
              key={idx}
              className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                isOpen
                  ? "border-[#1B5EA4] bg-white shadow-md"
                  : "border-[#DFE5EC] bg-white hover:border-slate-300"
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                className="w-full px-6 py-4.5 flex items-center justify-between text-left gap-4"
              >
                <span className="font-bold text-sm sm:text-base text-[#18212F]">
                  {faq.q}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-[#1B5EA4] transition-transform duration-300 shrink-0 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isOpen && (
                <div className="px-6 pb-5 pt-1 text-sm text-[#526174] leading-relaxed border-t border-slate-100 animate-in fade-in duration-200">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
