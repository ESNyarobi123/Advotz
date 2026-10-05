"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label } from "@heroui/react";
import { apiFetch } from "@/lib/api";

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [preview, setPreview] = useState<{
    businessName: string;
    contactName: string;
    email: string;
  } | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    apiFetch<{
      businessName: string;
      contactName: string;
      email: string;
    }>("/auth/invite/preview", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(setPreview)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Invalid invitation"),
      );
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiFetch("/auth/invite/accept", {
        method: "POST",
        body: JSON.stringify({
          token,
          ownerName,
          password,
          acceptTerms: true,
        }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Acceptance failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--advo-page)] px-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-2xl font-bold">Advo TZ invitation</h1>
        {preview ? (
          <p className="mb-6 text-sm text-[var(--advo-muted)]">
            Join <strong>{preview.businessName}</strong> as{" "}
            {preview.contactName} ({preview.email})
          </p>
        ) : (
          <p className="mb-6 text-sm text-[var(--advo-muted)]">
            Loading invitation…
          </p>
        )}
        {done ? (
          <p className="text-sm text-[var(--advo-success)]">
            Account created.{" "}
            <Link href="/login" className="text-[var(--advo-blue)]">
              Log in
            </Link>
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label htmlFor="ownerName">Your name</Label>
              <Input
                id="ownerName"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Choose password</Label>
              <Input
                id="password"
                type="password"
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                required
              />
              I accept the terms
            </label>
            {error ? (
              <p className="text-sm text-[var(--advo-danger)]">{error}</p>
            ) : null}
            <Button variant="primary"
              type="submit"
              isDisabled={pending || !acceptTerms || !preview}
              className="w-full"
            >
              {pending ? "Accepting…" : "Accept invitation"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
