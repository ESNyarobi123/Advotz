"use client";

import { Card } from "@heroui/react";
import { useState, useEffect } from "react";
import {
  Wifi,
  Smartphone,
  CheckCircle2,
  Lock,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  QrCode,
  Sparkles,
  Zap,
  Clock,
  Laptop,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function InteractivePortalSimulator() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"guest" | "reseller">("guest");
  const [selectedPackage, setSelectedPackage] = useState<string>("3hours");
  const [paymentMode, setPaymentMode] = useState<"momo" | "voucher">("momo");
  const [phone, setPhone] = useState("0754 123 456");
  const [voucherCode, setVoucherCode] = useState("");
  const [simState, setSimState] = useState<"idle" | "requesting" | "authorizing" | "connected">("idle");
  const [countdown, setCountdown] = useState(10800); // 3 hours in seconds

  const packages = [
    {
      id: "1hour",
      name: t("marketing.simulator.pkg.1hour.name"),
      duration: t("marketing.simulator.pkg.1hour.duration"),
      priceTzs: 1000,
      badge: t("marketing.simulator.pkg.1hour.badge"),
      speed: "15 Mbps",
    },
    {
      id: "3hours",
      name: t("marketing.simulator.pkg.3hours.name"),
      duration: t("marketing.simulator.pkg.3hours.duration"),
      priceTzs: 2500,
      badge: t("marketing.simulator.pkg.3hours.badge"),
      speed: "25 Mbps",
      highlight: true,
    },
    {
      id: "24hours",
      name: t("marketing.simulator.pkg.24hours.name"),
      duration: t("marketing.simulator.pkg.24hours.duration"),
      priceTzs: 5000,
      badge: t("marketing.simulator.pkg.24hours.badge"),
      speed: "30 Mbps",
    },
    {
      id: "30days",
      name: t("marketing.simulator.pkg.30days.name"),
      duration: t("marketing.simulator.pkg.30days.duration"),
      priceTzs: 35000,
      badge: t("marketing.simulator.pkg.30days.badge"),
      speed: "50 Mbps",
    },
  ];

  const currentPkg = packages.find((p) => p.id === selectedPackage) || packages[1];

  function handleSimulate() {
    setSimState("requesting");
    setTimeout(() => {
      setSimState("authorizing");
      setTimeout(() => {
        setSimState("connected");
        setCountdown(selectedPackage === "1hour" ? 3600 : selectedPackage === "3hours" ? 10800 : 86400);
      }, 1200);
    }, 1400);
  }

  function handleReset() {
    setSimState("idle");
  }

  // Format seconds to HH:MM:SS
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (simState === "connected") {
      const interval = setInterval(() => {
        setCountdown((c) => (c > 0 ? c - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [simState]);

  return (
    <div className="w-full rounded-2xl border border-white/15 bg-[#111213] overflow-hidden shadow-2xl">
      {/* Widget Header & Perspective Switcher */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5 gap-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-white">
            {t("marketing.simulator.title")}
          </span>
          <span className="hidden md:inline text-xs text-white/50">
            · {t("marketing.simulator.subtitle")}
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("guest")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeTab === "guest"
                ? "bg-[#1B5EA4] text-white shadow-sm"
                : "text-white/70 hover:text-white"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>{t("marketing.simulator.tab.guest")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("reseller")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeTab === "reseller"
                ? "bg-[#1B5EA4] text-white shadow-sm"
                : "text-white/70 hover:text-white"
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>{t("marketing.simulator.tab.reseller")}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 md:p-8">
        {activeTab === "guest" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Phone Frame Simulator */}
            <div className="lg:col-span-6 flex justify-center">
              <div
                className="w-full max-w-[340px] rounded-[36px] border-4 border-white/20 p-3 shadow-2xl relative"
                style={{
                  background: "#18212F",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(27, 94, 164, 0.2)",
                }}
              >
                {/* Phone Speaker Notch */}
                <div className="w-28 h-4 bg-black/60 rounded-full mx-auto mb-3 flex items-center justify-center">
                  <div className="w-12 h-1 bg-white/20 rounded-full" />
                </div>

                {/* Captive Portal Screen */}
                <div className="rounded-[24px] bg-[#F7F9FC] text-[#18212F] p-4 text-xs font-sans min-h-[500px] flex flex-col justify-between shadow-inner">
                  {/* Portal Header */}
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-[#DFE5EC]">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-md bg-[#111213] flex items-center justify-center text-white text-[10px] font-black">
                          A
                        </div>
                        <div>
                          <div className="font-bold text-[11px] text-[#18212F]">
                            Palm Beach WiFi
                          </div>
                          <div className="text-[9px] text-[#526174]">
                            SSID: PalmBeach_Guest
                          </div>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[9px] font-semibold px-2 py-0.5 rounded-full">
                        <Wifi className="w-2.5 h-2.5" /> {t("marketing.simulator.portal.signal")}
                      </span>
                    </div>

                    {simState === "connected" ? (
                      /* Connected Success State */
                      <div className="py-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-300">
                        <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-md">
                          <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-[#18212F]">
                            {t("marketing.simulator.connected.title")}
                          </h4>
                          <p className="text-[10px] text-[#526174] mt-1">
                            {t("marketing.simulator.connected.body")}
                          </p>
                        </div>

                        {/* Countdown Timer Card */}
                        <div className="bg-[#111213] text-white rounded-xl p-3 shadow-md space-y-1">
                          <div className="text-[9px] uppercase tracking-wider text-[#FBA102] font-semibold">
                            {t("marketing.simulator.connected.remaining")}
                          </div>
                          <div className="text-xl font-mono font-bold tracking-widest text-white">
                            {formatTime(countdown)}
                          </div>
                          <div className="text-[9px] text-white/60">
                            {t("marketing.simulator.connected.packageLine", { name: currentPkg.name, speed: currentPkg.speed })}
                          </div>
                        </div>

                        {/* Recovery token badge */}
                        <Card className="p-2.5 text-left text-[9px] text-[#526174] space-y-1">
                          <div className="font-bold text-[#18212F] flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-[#1B5EA4]" /> {t("marketing.simulator.recovery.title")}
                          </div>
                          <div>
                            {t("marketing.simulator.recovery.body")}
                          </div>
                        </Card>

                        <button
                          type="button"
                          onClick={handleReset}
                          className="w-full py-2 rounded-lg bg-[#DFE5EC] hover:bg-slate-300 text-[#18212F] font-semibold text-[10px] transition"
                        >
                          {t("marketing.simulator.resetSimulator")}
                        </button>
                      </div>
                    ) : simState === "requesting" || simState === "authorizing" ? (
                      /* Loading / Network Handshake State */
                      <div className="py-12 text-center space-y-4 animate-in fade-in duration-200">
                        <div className="w-12 h-12 rounded-full border-4 border-[#1B5EA4] border-t-transparent animate-spin mx-auto" />
                        <div>
                          <h4 className="font-bold text-xs text-[#18212F]">
                            {simState === "requesting"
                              ? t("marketing.simulator.requesting")
                              : t("marketing.simulator.authorizing")}
                          </h4>
                          <p className="text-[9px] text-[#526174] mt-1">
                            {t("marketing.simulator.confirmPin")}
                          </p>
                        </div>
                      </div>
                    ) : (
                      /* Selection State */
                      <div className="pt-3 space-y-3">
                        <div className="text-[10px] font-bold text-[#526174] uppercase tracking-wider">
                          {t("marketing.simulator.step1")}
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          {packages.map((pkg) => {
                            const isSelected = selectedPackage === pkg.id;
                            return (
                              <button
                                key={pkg.id}
                                type="button"
                                onClick={() => setSelectedPackage(pkg.id)}
                                className={`text-left p-2 rounded-lg border transition relative ${
                                  isSelected
                                    ? "border-[#1B5EA4] bg-blue-50 shadow-sm"
                                    : "border-[#DFE5EC] bg-white hover:border-slate-300"
                                }`}
                              >
                                {pkg.highlight && (
                                  <span
                                    className="absolute -top-1.5 right-1 text-[8px] font-black uppercase px-1.5 rounded"
                                    style={{
                                      background: "linear-gradient(135deg, #FBA102 0%, #F16304 100%)",
                                      color: "#111213",
                                    }}
                                  >
                                    {t("marketing.simulator.pkg.hot")}
                                  </span>
                                )}
                                <div className="font-bold text-[10px] text-[#18212F] truncate">
                                  {pkg.name}
                                </div>
                                <div className="text-[11px] font-extrabold text-[#1B5EA4] mt-0.5">
                                  TZS {pkg.priceTzs.toLocaleString()}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Payment Tab Mode */}
                        <div className="pt-2">
                          <div className="text-[10px] font-bold text-[#526174] uppercase tracking-wider mb-1.5">
                            {t("marketing.simulator.step2")}
                          </div>

                          <Card className="flex p-0.5 text-[10px] mb-2 font-semibold">
                            <button
                              type="button"
                              onClick={() => setPaymentMode("momo")}
                              className={`flex-1 py-1 rounded transition text-center ${
                                paymentMode === "momo"
                                  ? "bg-[#1B5EA4] text-white shadow-sm"
                                  : "text-[#526174]"
                              }`}
                            >
                              {t("marketing.simulator.method.momo")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPaymentMode("voucher")}
                              className={`flex-1 py-1 rounded transition text-center ${
                                paymentMode === "voucher"
                                  ? "bg-[#1B5EA4] text-white shadow-sm"
                                  : "text-[#526174]"
                              }`}
                            >
                              {t("marketing.simulator.method.voucher")}
                            </button>
                          </Card>

                          {paymentMode === "momo" ? (
                            <div className="space-y-1.5">
                              <label className="block text-[9px] font-medium text-[#526174]">
                                {t("marketing.simulator.phoneLabel")}
                              </label>
                              <input
                                type="text"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full rounded-field border border-[#DFE5EC] bg-white px-2.5 py-1.5 text-xs text-[#18212F] outline-none focus:border-[#1B5EA4]"
                              />
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <label className="block text-[9px] font-medium text-[#526174]">
                                {t("marketing.simulator.voucherLabel")}
                              </label>
                              <input
                                type="text"
                                placeholder={t("marketing.simulator.voucherPlaceholder")}
                                value={voucherCode}
                                onChange={(e) => setVoucherCode(e.target.value)}
                                className="w-full rounded-field border border-[#DFE5EC] bg-white px-2.5 py-1.5 text-xs text-[#18212F] outline-none focus:border-[#1B5EA4]"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Portal Footer Action */}
                  {simState === "idle" && (
                    <div className="pt-3 border-t border-[#DFE5EC]">
                      <button
                        type="button"
                        onClick={handleSimulate}
                        className="w-full py-2.5 rounded-lg text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5"
                        style={{
                          backgroundColor: "#1B5EA4",
                        }}
                      >
                        <span>
                          {paymentMode === "momo"
                            ? t("marketing.simulator.pay", { amount: currentPkg.priceTzs.toLocaleString() })
                            : t("marketing.simulator.useVoucher")}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <div className="text-[8px] text-center text-[#526174] mt-1.5">
                        {t("marketing.simulator.secure")}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Explanatory Details beside phone */}
            <div className="lg:col-span-6 space-y-6 text-white">
              <div>
                <span
                  className="inline-block text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3"
                  style={{
                    background: "linear-gradient(135deg, rgba(251, 161, 2, 0.2) 0%, rgba(241, 99, 4, 0.2) 100%)",
                    border: "1px solid rgba(251, 161, 2, 0.4)",
                    color: "#FBA102",
                  }}
                >
                  {t("marketing.simulator.side.badge")}
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold leading-snug">
                  {t("marketing.simulator.side.title")}
                </h3>
                <p className="text-sm text-white/75 mt-2 leading-relaxed">
                  {t("marketing.simulator.side.body")}
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#1B5EA4]/20 border border-[#1B5EA4]/40 flex items-center justify-center text-[#2176C2] shrink-0 mt-0.5">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold text-sm text-white">
                      {t("marketing.simulator.side.feature1.title")}
                    </h5>
                    <p className="text-xs text-white/70 mt-0.5">
                      {t("marketing.simulator.side.feature1.body")}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#FBA102]/20 border border-[#FBA102]/40 flex items-center justify-center text-[#FBA102] shrink-0 mt-0.5">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold text-sm text-white">
                      {t("marketing.simulator.side.feature2.title")}
                    </h5>
                    <p className="text-xs text-white/70 mt-0.5">
                      {t("marketing.simulator.side.feature2.body")}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold text-sm text-white">
                      {t("marketing.simulator.side.feature3.title")}
                    </h5>
                    <p className="text-xs text-white/70 mt-0.5">
                      {t("marketing.simulator.side.feature3.body")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSimulate}
                  className="inline-flex items-center gap-2 text-sm font-bold text-white px-5 py-2.5 rounded-lg shadow-lg transition bg-[#1B5EA4] hover:bg-[#2176C2]"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{t("marketing.simulator.tryPayment")}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Reseller Perspective View */
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {t("marketing.simulator.reseller.title")}
                </h3>
                <p className="text-xs text-white/70 mt-1">
                  {t("marketing.simulator.reseller.subtitle")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/60">{t("marketing.simulator.reseller.siteLabel")}</span>
                <span className="text-xs font-bold text-white bg-white/10 px-3 py-1 rounded-md border border-white/10">
                  Kariakoo Hub · TP-Link Omada OC200
                </span>
              </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#18212F] border border-white/10 rounded-xl p-4">
                <div className="text-xs text-white/60">{t("marketing.simulator.reseller.kpi.revenue")}</div>
                <div className="text-2xl font-black text-[#FBA102] mt-1">
                  TZS 342,500
                </div>
                <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                  {t("marketing.simulator.reseller.kpi.revenueDelta")}
                </div>
              </div>

              <div className="bg-[#18212F] border border-white/10 rounded-xl p-4">
                <div className="text-xs text-white/60">{t("marketing.simulator.reseller.kpi.devices")}</div>
                <div className="text-2xl font-black text-white mt-1">
                  {t("marketing.simulator.reseller.kpi.devicesValue", { count: 87 })}
                </div>
                <div className="text-[10px] text-[#2176C2] mt-1">
                  {t("marketing.simulator.reseller.kpi.devicesSub")}
                </div>
              </div>

              <div className="bg-[#18212F] border border-white/10 rounded-xl p-4">
                <div className="text-xs text-white/60">{t("marketing.simulator.reseller.kpi.transactions")}</div>
                <div className="text-2xl font-black text-white mt-1">
                  {t("marketing.simulator.reseller.kpi.transactionsValue", { count: 124 })}
                </div>
                <div className="text-[10px] text-white/60 mt-1">
                  {t("marketing.simulator.reseller.kpi.transactionsSub")}
                </div>
              </div>

              <div className="bg-[#18212F] border border-white/10 rounded-xl p-4 relative overflow-hidden">
                <div className="text-xs text-white/60">{t("marketing.simulator.reseller.kpi.payable")}</div>
                <div className="text-2xl font-black text-white mt-1">
                  TZS 1,840,000
                </div>
                <div className="mt-2">
                  <span className="inline-block text-[10px] font-bold text-white px-2 py-0.5 rounded bg-[#1B5EA4]">
                    {t("marketing.simulator.reseller.kpi.withdraw")}
                  </span>
                </div>
              </div>
            </div>

            {/* Live Ledger Activity Feed */}
            <div className="bg-[#18212F] rounded-xl border border-white/10 p-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#FBA102]" /> {t("marketing.simulator.reseller.ledger.title")}
                </h4>
                <span className="text-[10px] text-white/50">
                  {t("marketing.simulator.reseller.ledger.note")}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {[
                  {
                    time: t("marketing.simulator.reseller.ago.seconds", { count: 4 }),
                    phone: "+255754***456",
                    pkg: t("marketing.simulator.pkg.3hours.name"),
                    gross: "TZS 2,500",
                    fee: "-TZS 50",
                    net: "+TZS 2,325",
                    provider: "M-Pesa",
                    status: "COMPLETED",
                  },
                  {
                    time: t("marketing.simulator.reseller.ago.minutes", { count: 2 }),
                    phone: "+255713***891",
                    pkg: t("marketing.simulator.pkg.1hour.name"),
                    gross: "TZS 1,000",
                    fee: "-TZS 20",
                    net: "+TZS 930",
                    provider: "Tigo Pesa",
                    status: "COMPLETED",
                  },
                  {
                    time: t("marketing.simulator.reseller.ago.minutes", { count: 6 }),
                    phone: "Voucher ADVO-7712",
                    pkg: t("marketing.simulator.pkg.24hours.name"),
                    gross: "TZS 5,000",
                    fee: "-TZS 0",
                    net: "+TZS 4,750",
                    provider: t("marketing.simulator.reseller.provider.voucher"),
                    status: "REDEEMED",
                  },
                ].map((tx, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <div>
                        <span className="font-semibold text-white">{tx.phone}</span>
                        <span className="text-white/60 ml-2">({tx.pkg})</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <span className="text-white/50">{tx.provider}</span>
                      <span className="font-mono font-bold text-emerald-400">{tx.net}</span>
                      <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
                        {tx.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
