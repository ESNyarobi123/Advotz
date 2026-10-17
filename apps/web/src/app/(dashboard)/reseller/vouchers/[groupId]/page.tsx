"use client";

import { useParams } from "next/navigation";
import { ResellerVoucherGroupDetailScreen } from "@/features/resellers/voucher-group-detail";

export default function Page() {
  const params = useParams<{ groupId: string }>();
  return <ResellerVoucherGroupDetailScreen groupId={params.groupId} />;
}
