"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card } from "@heroui/react";
import { ApiError } from "@advo/api-client";
import { Notice } from "@advo/ui";
import { FieldInput } from "@/components/FieldInput";
import { PortalFrame } from "@/components/PortalFrame";
import { loadContext, portalApi, useLocale } from "@/lib/portal";

export default function VoucherPage() {
  const { brandSlug } = useParams<{ brandSlug: string }>();
  const router = useRouter();
  const { t, toggle } = useLocale();
  const [contextToken, setContextToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setContextToken(loadContext(brandSlug));
    setReady(true);
  }, [brandSlug]);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    if (!contextToken || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await portalApi.post<{ recoveryToken: string; grantDeviceState: string }>("/portal/vouchers/redeem", { contextToken, code });
      localStorage.setItem(`advo:last-order:${brandSlug}`, res.recoveryToken);
      router.push(`/${brandSlug}/status?token=${encodeURIComponent(res.recoveryToken)}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "DEVICE_LIMIT_REACHED") setError(t("deviceLimit"));
      else if (err instanceof ApiError && err.code === "PORTAL_CONTEXT_EXPIRED") setError(t("contextExpired"));
      else if (err instanceof ApiError && err.status === 400) setError(t("voucherUsedOrExpired"));
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <PortalFrame title={t("haveVoucher")} onToggleLanguage={toggle} languageLabel={t("language")}>
      {ready && !contextToken ? <Notice tone="accent">{t("openFromWifi")}</Notice> : null}
      <Card className="mt-3">
        <form onSubmit={redeem} className="space-y-3">
          <FieldInput
            id="code"
            label={t("voucherCode")}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="XXXX-XXXX"
            required
          />
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button fullWidth isDisabled={pending || !contextToken} size="lg" type="submit" variant="primary">
            {pending ? t("sending") : t("redeem")}
          </Button>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm">
        <Link href={`/${brandSlug}`} className="text-[var(--advo-blue)] underline">
          {t("back")}
        </Link>
      </p>
    </PortalFrame>
  );
}
