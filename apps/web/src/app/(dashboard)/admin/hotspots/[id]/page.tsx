"use client";

import { useParams } from "next/navigation";
import { AdminHotspotPerformanceScreen } from "@/features/admin/hotspot-performance";

export default function Page() {
  const params = useParams<{ id: string }>();
  return <AdminHotspotPerformanceScreen hotspotId={params.id} />;
}
