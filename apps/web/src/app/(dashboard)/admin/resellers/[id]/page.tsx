"use client";

import { useParams } from "next/navigation";
import { AdminResellerDetailScreen } from "@/features/admin/reseller-detail";

export default function Page() {
  const params = useParams<{ id: string }>();
  return <AdminResellerDetailScreen resellerId={params.id} />;
}
