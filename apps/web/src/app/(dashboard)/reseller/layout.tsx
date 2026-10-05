import { DashboardShell } from "@/features/shell/DashboardShell";

export default function ResellerLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell role="RESELLER">{children}</DashboardShell>;
}
