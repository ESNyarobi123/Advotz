"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
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
    <div id="faq" className="mx-auto w-full max-w-4xl scroll-mt-28 space-y-4">
      <div className="text-center mb-8">
        <span className="mb-3 inline-block rounded-full border border-[#FBA102]/45 bg-[#FBA102]/10 px-3 py-1 text-xs font-bold tracking-wider text-[#FBA102] uppercase">
          {t("marketing.faq.badge")}
        </span>
        <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
          {t("marketing.faq.title")}
        </h2>
        <p className="mt-3 text-base text-white/65">
          {t("marketing.faq.subtitle")}
        </p>
      </div>

      <div className="space-y-3">
        {faqs.map((faq, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div
              key={idx}
              className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
                isOpen
                  ? "border-[#FBA102] bg-white/[0.06]"
                  : "border-white/10 bg-white/[0.03] hover:border-[#FBA102]/40"
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                className="w-full px-6 py-4.5 flex items-center justify-between text-left gap-4"
              >
                <span className="text-sm font-bold text-white sm:text-base">
                  {faq.q}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-[#F16304] transition-transform duration-300 shrink-0 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isOpen && (
                <div className="border-t border-white/10 px-6 pt-1 pb-5 text-sm leading-relaxed text-white/70">
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
