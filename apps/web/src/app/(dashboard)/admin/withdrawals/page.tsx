import { Suspense } from "react";
import { AdminWithdrawalsScreen } from "@/features/admin/withdrawals";

export default function Page() {
  return (
    <Suspense>
      <AdminWithdrawalsScreen />
    </Suspense>
  );
}
