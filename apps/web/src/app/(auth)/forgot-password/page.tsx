"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label } from "@heroui/react";
import { apiFetch } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await apiFetch<{
        accepted: boolean;
        devResetToken?: string;
      }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(
        res.devResetToken
          ? `If the account exists, a reset was issued. Dev token: ${res.devResetToken}`
          : "If the account exists, a reset link was sent (when a real provider is configured).",
      );
    } catch {
      setMessage(
        "If the account exists, a reset link was sent (when a real provider is configured).",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--advo-page)] px-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-6 text-2xl font-bold">Forgot password</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {message ? (
            <p className="text-sm text-[var(--advo-muted)]">{message}</p>
          ) : null}
          <Button variant="primary" type="submit" isDisabled={pending} className="w-full">
            Send reset
          </Button>
        </form>
        <p className="mt-4 text-sm">
          <Link href="/login" className="text-[var(--advo-blue)]">
            Back to login
          </Link>
        </p>
      </Card>
    </div>
  );
}
