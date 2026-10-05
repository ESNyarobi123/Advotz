import type { ReactNode } from "react";
import { MarketingHeader } from "@/features/marketing/MarketingHeader";
import { MarketingFooter } from "@/features/marketing/MarketingFooter";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9FC] text-[#18212F] selection:bg-[#1B5EA4] selection:text-white">
      <MarketingHeader />
      <div className="flex-1">{children}</div>
      <MarketingFooter />
    </div>
  );
}
