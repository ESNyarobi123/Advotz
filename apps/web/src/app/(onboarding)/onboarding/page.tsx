import Link from "next/link";

export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold">Reseller onboarding</h1>
      <p className="mb-8 text-[var(--advo-muted)]">
        Complete profile, choose a plan/trial, create your first site, then
        claim a device. Controller provisioning runs as a background operation
        and does not block account creation.
      </p>
      <ol className="mb-8 list-decimal space-y-3 pl-5">
        <li>Business profile</li>
        <li>Platform plan / trial</li>
        <li>First site</li>
        <li>Device setup</li>
      </ol>
      <Link
        href="/reseller"
        className="rounded-lg bg-[var(--advo-blue)] px-4 py-2 font-semibold text-white"
      >
        Continue to dashboard
      </Link>
    </div>
  );
}
