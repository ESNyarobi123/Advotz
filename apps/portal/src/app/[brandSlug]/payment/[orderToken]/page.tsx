import { PaymentStatus } from "./PaymentStatus";

export const dynamic = "force-dynamic";

export default async function PaymentPage({ params }: { params: Promise<{ brandSlug: string; orderToken: string }> }) {
  const { brandSlug, orderToken } = await params;
  return <PaymentStatus slug={brandSlug} orderToken={orderToken} />;
}
