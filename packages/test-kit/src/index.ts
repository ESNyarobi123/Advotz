/** Tenant factories and provider simulators for Phase 1+ tests. */

export function resellerFactory(overrides?: {
  businessName?: string;
  email?: string;
  phone?: string;
}) {
  const n = Math.floor(Math.random() * 1_000_000);
  return {
    businessName: overrides?.businessName ?? `Demo Cafe ${n}`,
    ownerName: "Demo Owner",
    email: overrides?.email ?? `reseller${n}@example.com`,
    phone: overrides?.phone ?? `+2557${String(n).padStart(8, "0").slice(0, 8)}`,
    password: "SecurePass123!",
    acceptTerms: true as const,
  };
}

export function agentFactory(overrides?: {
  email?: string;
  referralCode?: string;
}) {
  const n = Math.floor(Math.random() * 1_000_000);
  return {
    name: `Agent ${n}`,
    email: overrides?.email ?? `agent${n}@example.com`,
    phone: `+2556${String(n).padStart(8, "0").slice(0, 8)}`,
    password: "SecurePass123!",
    referralCode: overrides?.referralCode ?? `AGT${n}`.slice(0, 12).toUpperCase(),
  };
}
