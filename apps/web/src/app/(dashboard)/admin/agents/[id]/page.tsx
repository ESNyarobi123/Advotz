"use client";

import { useParams } from "next/navigation";
import { AdminAgentDetailScreen } from "@/features/admin/agent-detail";

export default function Page() {
  const params = useParams<{ id: string }>();
  return <AdminAgentDetailScreen agentId={params.id} />;
}
