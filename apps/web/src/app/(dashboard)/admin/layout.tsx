import { DashboardShell } from "@/features/shell/DashboardShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell role="ADMIN">{children}</DashboardShell>;
}
