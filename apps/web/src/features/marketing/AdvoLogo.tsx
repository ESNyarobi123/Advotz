import Link from "next/link";

interface AdvoLogoProps {
  className?: string;
  /**
   * `dark` is the lockup for charcoal surfaces (white "Advo").
   * `light` is the lockup for white and paper surfaces (navy "Advo").
   * The orange "wifi" and the mark are the same in both.
   */
  variant?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  withLink?: boolean;
  /**
   * Shrinks the lockup by one step below the `sm` breakpoint. The mobile
   * header shares a single row with the language switch and menu button.
   */
  responsive?: boolean;
}

const SOURCES = {
  dark: "/brand/advo-logo.png",
  light: "/brand/advo-logo-on-light.png",
} as const;

export function AdvoLogo({
  className = "",
  variant = "dark",
  size = "md",
  withLink = true,
  responsive = false,
}: AdvoLogoProps) {
  const heights = {
    sm: "h-11",
    md: responsive ? "h-11 sm:h-14" : "h-14",
    lg: responsive ? "h-12 sm:h-16" : "h-16",
  };

  const content = (
    // The file is the full stacked lockup (mark + Advowifi), already transparent.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt="Advowifi"
      className={`w-auto select-none ${heights[size]} ${className}`}
      draggable={false}
      src={SOURCES[variant]}
    />
  );

  if (withLink) {
    return (
      <Link href="/" className="inline-flex hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
