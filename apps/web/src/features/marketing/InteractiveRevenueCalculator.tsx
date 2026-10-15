"use client";

import { useState } from "react";
import Link from "next/link";
import { DollarSign, TrendingUp, Sparkles, ArrowRight, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function InteractiveRevenueCalculator() {
  const { t } = useI18n();
  const [dailyUsers, setDailyUsers] = useState(75);
  const [avgPrice, setAvgPrice] = useState(1500);
  const [venueType, setVenueType] = useState<"cafe" | "hotel" | "hostel" | "wisp">("cafe");

  const venues = [
    { id: "cafe", name: t("marketing.calculator.venue.cafe"), defaultUsers: 60, defaultPrice: 1000 },
    { id: "hotel", name: t("marketing.calculator.venue.hotel"), defaultUsers: 100, defaultPrice: 2500 },
    { id: "hostel", name: t("marketing.calculator.venue.hostel"), defaultUsers: 150, defaultPrice: 2000 },
    { id: "wisp", name: t("marketing.calculator.venue.wisp"), defaultUsers: 250, defaultPrice: 1500 },
  ];

  function handleVenueChange(type: "cafe" | "hotel" | "hostel" | "wisp") {
    setVenueType(type);
    const v = venues.find((x) => x.id === type);
    if (v) {
      setDailyUsers(v.defaultUsers);
      setAvgPrice(v.defaultPrice);
    }
  }

  // Calculations
  const dailyGross = dailyUsers * avgPrice;
  const monthlyGross = dailyGross * 30;
  // Estimated provider mobile money fees (approx 2%)
  const estimatedMomoFee = Math.round(monthlyGross * 0.02);
  // Estimated Advo TZ platform fee + subscription
  const platformFee = Math.round(monthlyGross * 0.05) + 25000;
  // Net Profit
  const netMonthlyProfit = Math.max(0, monthlyGross - estimatedMomoFee - platformFee);

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-10">
      {/* Decorative gradient orb */}
      <div
        className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-10 pointer-events-none blur-3xl"
        style={{
          background: "radial-gradient(circle, #FBA102 0%, #F16304 100%)",
        }}
      />

      <div className="text-center max-w-2xl mx-auto mb-8">
        <span
          className="inline-block text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3"
          style={{
            background: "linear-gradient(135deg, rgba(251, 161, 2, 0.15) 0%, rgba(241, 99, 4, 0.15) 100%)",
            color: "#FBA102",
            border: "1px solid rgba(241, 99, 4, 0.3)",
          }}
        >
          {t("marketing.calculator.badge")}
        </span>
        <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
          {t("marketing.calculator.title")}
        </h2>
        <p className="mt-3 text-base text-white/65">
          {t("marketing.calculator.subtitle")}
        </p>

        {/* Venue Quick Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
          {venues.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => handleVenueChange(v.id as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
                venueType === v.id
                  ? "bg-[linear-gradient(135deg,#FBA102_0%,#F16304_100%)] text-[#111213] border-[#F16304] shadow-sm"
                  : "border-white/10 bg-white/5 text-white/70 hover:border-[#FBA102]/40"
              }`}
            >
              {v.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Sliders Input Column */}
        <div className="lg:col-span-6 space-y-6">
          {/* Slider 1: Daily Users */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold tracking-wide text-white/80 uppercase">
                {t("marketing.calculator.dailyUsers.label")}
              </label>
              <span className="text-lg font-black text-[#F16304] font-mono">
                {t("marketing.calculator.guestsValue", { count: dailyUsers })}
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={500}
              step={5}
              value={dailyUsers}
              onChange={(e) => setDailyUsers(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/15 accent-[#F16304]"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-white/45">
              <span>{t("marketing.calculator.guestsTick", { count: 10 })}</span>
              <span>{t("marketing.calculator.guestsTick", { count: 250 })}</span>
              <span>{t("marketing.calculator.guestsTick", { count: 500 })}</span>
            </div>
          </div>

          {/* Slider 2: Average Package Price */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold tracking-wide text-white/80 uppercase">
                {t("marketing.calculator.avgPrice.label")}
              </label>
              <span className="text-lg font-black text-[#F16304] font-mono">
                TZS {avgPrice.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min={500}
              max={5000}
              step={100}
              value={avgPrice}
              onChange={(e) => setAvgPrice(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/15 accent-[#F16304]"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-white/45">
              <span>TZS 500</span>
              <span>TZS 2,500</span>
              <span>TZS 5,000</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-white/55">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[#03ac77]" />
            <span>
              {t("marketing.calculator.note")}
            </span>
          </div>
        </div>

        {/* Results Card Column */}
        <div className="lg:col-span-6">
          <div
            className="rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-2xl"
            style={{
              background: "linear-gradient(145deg, #111213 0%, #24180c 100%)",
              border: "1px solid rgba(251, 161, 2, 0.35)",
            }}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-xs text-white/70">{t("marketing.calculator.result.dailyGross")}</span>
                <span className="text-sm font-bold font-mono text-white">
                  TZS {dailyGross.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-xs text-white/70">{t("marketing.calculator.result.monthlyGross")}</span>
                <span className="text-base font-bold font-mono text-white">
                  TZS {monthlyGross.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-white/60">
                <span>{t("marketing.calculator.result.fees")}</span>
                <span className="font-mono text-red-300">
                  - TZS {(estimatedMomoFee + platformFee).toLocaleString()}
                </span>
              </div>

              {/* Main Net Profit Highlight */}
              <div className="pt-4 border-t border-white/15">
                <div className="text-xs uppercase font-bold tracking-wider text-[#FBA102]">
                  {t("marketing.calculator.result.netProfit")}
                </div>
                <div className="text-3xl sm:text-4xl font-black font-mono mt-1 text-[#FBA102] drop-shadow-sm">
                  TZS {netMonthlyProfit.toLocaleString()}
                </div>
                <div className="text-xs text-white/70 mt-1">
                  {t("marketing.calculator.result.yearly", {
                    amount: (netMonthlyProfit * 12).toLocaleString(),
                  })}
                </div>
              </div>

              <div className="pt-4">
                <Link
                  href="/register"
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-[#111213] shadow-lg transition bg-[linear-gradient(135deg,#FBA102_0%,#F16304_100%)] hover:brightness-105"
                  style={{
                    boxShadow: "0 12px 28px -14px rgba(241, 99, 4, 0.85)",
                  }}
                >
                  <span>{t("marketing.calculator.cta")}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
