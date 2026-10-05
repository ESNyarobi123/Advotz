import Link from "next/link";

interface AdvoLogoProps {
  className?: string;
  variant?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  withLink?: boolean;
}

export function AdvoLogo({
  className = "",
  variant = "dark",
  size = "md",
  withLink = true,
}: AdvoLogoProps) {
  const isLight = variant === "light";
  
  const iconSizes = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };

  const textSizes = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-3xl",
  };

  const badgeSizes = {
    sm: "text-[10px] px-1.5 py-0.5",
    md: "text-xs px-2 py-0.5",
    lg: "text-sm px-2.5 py-1",
  };

  const content = (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {/* Brand Icon Badge */}
      <div
        className={`${iconSizes[size]} relative flex items-center justify-center rounded-xl overflow-hidden shadow-lg border border-white/15 transition-transform duration-300 hover:scale-105`}
        style={{
          background: "linear-gradient(135deg, #111213 0%, #1a1e24 100%)",
          boxShadow: "0 4px 14px 0 rgba(0, 0, 0, 0.4), inset 0 1px 1px 0 rgba(255, 255, 255, 0.15)",
        }}
      >
        {/* Ambient glow behind icon */}
        <div
          className="absolute inset-0 opacity-40 blur-md pointer-events-none"
          style={{
            background: "radial-gradient(circle, #FBA102 0%, #F16304 40%, #1B5EA4 80%, transparent 100%)",
          }}
        />

        {/* Vector SVG Emblem: WiFi Broadcast Arcs + Signal Pulse */}
        <svg
          viewBox="0 0 40 40"
          className="w-4/5 h-4/5 relative z-10"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Gold to Orange gradient for top arcs */}
            <linearGradient id="advoBrandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FBA102" />
              <stop offset="100%" stopColor="#F16304" />
            </linearGradient>
            {/* Blue to Bright Blue gradient for core pulse */}
            <linearGradient id="advoBlueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2176C2" />
              <stop offset="100%" stopColor="#1B5EA4" />
            </linearGradient>
          </defs>

          {/* Outer Wave Arc */}
          <path
            d="M 6 15 A 18 18 0 0 1 34 15"
            stroke="url(#advoBrandGrad)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />

          {/* Middle Wave Arc */}
          <path
            d="M 11 20 A 12 12 0 0 1 29 20"
            stroke="url(#advoBrandGrad)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />

          {/* Inner Fast Arc (Blue) */}
          <path
            d="M 15 25 A 6.5 6.5 0 0 1 25 25"
            stroke="url(#advoBlueGrad)"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Central Active Signal Pulse Dot */}
          <circle cx="20" cy="30" r="3" fill="#FFFFFF" />
          <circle cx="20" cy="30" r="5" stroke="url(#advoBlueGrad)" strokeWidth="1.5" opacity="0.8" />
        </svg>
      </div>

      {/* Typography: Advo + TZ Badge */}
      <div className="flex items-center gap-1.5 font-bold tracking-tight">
        <span
          className={`${textSizes[size]} ${
            isLight ? "text-[#18212F]" : "text-white"
          } tracking-tight font-extrabold`}
        >
          Advo
        </span>
        <span
          className={`${badgeSizes[size]} font-black rounded-md tracking-wider uppercase shadow-sm`}
          style={{
            background: "linear-gradient(135deg, #FBA102 0%, #F16304 100%)",
            color: "#111213",
            boxShadow: "0 2px 8px rgba(241, 99, 4, 0.35)",
          }}
        >
          TZ
        </span>
      </div>
    </div>
  );

  if (withLink) {
    return (
      <Link href="/" className="hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
