import type { ReactNode } from "react";
import { MarketingHeader } from "@/features/marketing/MarketingHeader";
import { MarketingFooter } from "@/features/marketing/MarketingFooter";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9FC] text-[#18212F] selection:bg-[#FBA102] selection:text-[#111213]">
      <MarketingHeader />
      <div className="flex-1">{children}</div>
      <MarketingFooter />
    </div>
  );
}
