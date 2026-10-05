import { Suspense } from "react";
import { AdminPaymentsScreen } from "@/features/admin/payments";

export default function Page() {
  return (
    <Suspense>
      <AdminPaymentsScreen />
    </Suspense>
  );
}
