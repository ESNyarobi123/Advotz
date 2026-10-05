"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label } from "@heroui/react";
import { apiFetch } from "@/lib/api";

function VerifyForm() {
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiFetch("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      setMessage("Contact verified. You can log in and continue onboarding.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <h1 className="mb-1 text-2xl font-bold">Verify contact</h1>
      <p className="mb-6 text-sm text-[var(--advo-muted)]">
        Enter the verification token from your notification transport.
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="token">Token</Label>
          <Input
            id="token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />
        </div>
        {error ? (
          <p className="text-sm text-[var(--advo-danger)]">{error}</p>
        ) : null}
        {message ? (
          <p className="text-sm text-[var(--advo-success)]">{message}</p>
        ) : null}
        <Button variant="primary" type="submit" isDisabled={pending} className="w-full">
          {pending ? "Verifying…" : "Verify"}
        </Button>
      </form>
      <p className="mt-4 text-sm">
        <Link href="/login" className="text-[var(--advo-blue)]">
          Go to login
        </Link>
      </p>
    </Card>
  );
}

export default function VerifyPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--advo-page)] px-4">
      <Suspense fallback={<Card>Loading…</Card>}>
        <VerifyForm />
      </Suspense>
    </div>
  );
}
