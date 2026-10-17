"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function SocialLoginButtons() {
  const { t } = useI18n();
  const [activeNotice, setActiveNotice] = useState<string | null>(null);

  const socials = [
    {
      id: "google",
      name: "Google",
      ariaLabel: t("auth.social.signInWith", { provider: "Google" }),
      badge: t("auth.social.badge.fast"),
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none">
          <path
            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
            fill="#4285F4"
          />
          <path
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"
            fill="#34A853"
          />
          <path
            d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.99 0 12s.45 3.85 1.24 5.42l4.04-3.15z"
            fill="#FBBC05"
          />
          <path
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            fill="#EA4335"
          />
        </svg>
      ),
      borderHover: "hover:border-[#4285F4]/50 hover:bg-blue-50/30",
    },
    {
      id: "apple",
      name: "Apple",
      ariaLabel: t("auth.social.signInWith", { provider: "Apple" }),
      badge: t("auth.social.badge.secure"),
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 fill-current text-[#111213]">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.33c.62-.75 1.04-1.8 0.93-2.85-.9.04-1.98.6-2.61 1.34-.55.63-1.03 1.68-.9 2.7.99.08 2.02-.49 2.58-1.19z" />
        </svg>
      ),
      borderHover: "hover:border-[#111213]/40 hover:bg-slate-100/50",
    },
    {
      id: "facebook",
      name: "Facebook",
      ariaLabel: t("auth.social.signInWith", { provider: "Facebook" }),
      badge: t("auth.social.badge.popular"),
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="#1877F2">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      borderHover: "hover:border-[#1877F2]/50 hover:bg-blue-50/30",
    },
    {
      id: "instagram",
      name: "Instagram",
      ariaLabel: t("auth.social.signInWith", { provider: "Instagram" }),
      badge: t("auth.social.badge.media"),
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none">
          <defs>
            <radialGradient id="igGradAuth" cx="30%" cy="107%" r="150%">
              <stop offset="0%" stopColor="#fdf497" />
              <stop offset="5%" stopColor="#fdf497" />
              <stop offset="45%" stopColor="#fd5949" />
              <stop offset="60%" stopColor="#d6249f" />
              <stop offset="90%" stopColor="#285AEB" />
            </radialGradient>
          </defs>
          <rect width="24" height="24" rx="6" fill="url(#igGradAuth)" />
          <path
            d="M12 5.838c2.007 0 2.245.008 3.037.043.734.034 1.132.157 1.397.26.35.137.6.3.863.563.262.262.426.513.562.863.103.265.226.663.26 1.397.036.792.044 1.03.044 3.037s-.008 2.245-.044 3.037c-.034.734-.157 1.132-.26 1.397-.136.35-.3.6-.562.863-.263.262-.513.426-.863.562-.265.103-.663.226-1.397.26-.792.036-1.03.044-3.037.044s-2.245-.008-3.037-.044c-.734-.034-1.132-.157-1.397-.26-.35-.136-.6-.3-.863-.562-.262-.263-.426-.513-.563-.863-.103-.265-.226-.663-.26-1.397-.035-.792-.043-1.03-.043-3.037s.008-2.245.043-3.037c.034-.734.157-1.132.26-1.397.137-.35.3-.6.563-.863.262-.262.513-.426.863-.563.265-.103.663-.226 1.397-.26.792-.035 1.03-.043 3.037-.043zm0-1.44c-2.041 0-2.298.009-3.1.045-.8.037-1.347.164-1.826.35a3.69 3.69 0 0 0-1.334.869 3.69 3.69 0 0 0-.87 1.334c-.185.479-.312 1.026-.349 1.826-.037.802-.045 1.059-.045 3.1 0 2.041.008 2.298.045 3.1.037.8.164 1.347.35 1.826.175.454.41.84.87 1.334.493.46.88.694 1.334.87.479.185 1.026.312 1.826.349.802.036 1.059.044 3.1.044 2.041 0 2.298-.008 3.1-.044.8-.037 1.347-.164 1.826-.35a3.69 3.69 0 0 0 1.334-.87 3.69 3.69 0 0 0 .87-1.334c.185-.479.312-1.026.349-1.826.036-.802.044-1.059.044-3.1 0-2.041-.008-2.298-.044-3.1-.037-.8-.164-1.347-.35-1.826a3.69 3.69 0 0 0-.87-1.334 3.69 3.69 0 0 0-1.334-.87c-.479-.185-1.026-.312-1.826-.349-.802-.036-1.059-.044-3.1-.044z"
            fill="#FFFFFF"
          />
          <path
            d="M12 8.257a3.743 3.743 0 1 0 0 7.486 3.743 3.743 0 0 0 0-7.486zm0 6.045a2.302 2.302 0 1 1 0-4.604 2.302 2.302 0 0 1 0 4.604z"
            fill="#FFFFFF"
          />
          <circle cx="15.894" cy="8.106" r="0.875" fill="#FFFFFF" />
        </svg>
      ),
      borderHover: "hover:border-[#d6249f]/50 hover:bg-pink-50/30",
    },
  ];

  function handleClick(provider: string) {
    setActiveNotice(t("auth.social.comingSoon", { provider }));
  }

  return (
    <div className="space-y-4">
      {/* Notice alert when clicked */}
      {activeNotice && (
        <div className="flex animate-in fade-in items-start justify-between rounded-2xl border border-advo-gold/30 bg-advo-gold-soft p-3.5 text-[#7a4200] shadow-sm duration-200">
          <div className="flex items-start gap-2.5">
            <Info className="mt-0.5 size-4 shrink-0 text-[#b15f00]" />
            <div className="text-xs leading-relaxed font-medium">{activeNotice}</div>
          </div>
          <button
            type="button"
            onClick={() => setActiveNotice(null)}
            className="-mr-1 -mt-1 rounded-lg p-1 text-[#b15f00] transition hover:text-advo-charcoal"
            aria-label={t("common.close")}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Grid of 4 Social Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {socials.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => handleClick(s.name)}
            aria-label={s.ariaLabel}
            title={s.ariaLabel}
            className={`group flex items-center justify-center gap-2 rounded-2xl border border-advo-border bg-white px-3 py-3 text-xs font-bold text-advo-text shadow-sm transition-all duration-200 active:scale-95 ${s.borderHover}`}
          >
            <div className="transition-transform group-hover:scale-110">
              {s.icon}
            </div>
            <span className="font-semibold text-xs tracking-tight">{s.name}</span>
          </button>
        ))}
      </div>

      <div className="relative flex items-center justify-center py-2">
        <div className="w-full border-t border-advo-border" />
        <span className="relative shrink-0 rounded-full border border-advo-border bg-white px-3.5 py-1 text-[10px] font-extrabold tracking-wider text-advo-muted uppercase shadow-xs">
          {t("auth.social.continueWithEmail")}
        </span>
      </div>
    </div>
  );
}
