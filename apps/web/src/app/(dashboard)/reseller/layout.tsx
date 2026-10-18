import { DashboardShell } from "@/features/shell/DashboardShell";
import { ResellerSiteScopeProvider } from "@/features/resellers/site-scope";

export default function ResellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell role="RESELLER">
      <ResellerSiteScopeProvider>{children}</ResellerSiteScopeProvider>
    </DashboardShell>
  );
}
