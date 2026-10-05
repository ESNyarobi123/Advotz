import { DashboardShell } from "@/features/shell/DashboardShell";

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell role="AGENT">{children}</DashboardShell>;
}
