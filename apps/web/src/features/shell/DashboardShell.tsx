"use client";

import { useRouter, usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SessionUser } from "@advo/contracts";
import { Button, Card, Input, Label, Skeleton } from "@heroui/react";
import { Notice } from "@advo/ui";
import { LogOut, UserRound } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import appPackage from "../../../package.json";
import { FloatingSidebar } from "./FloatingSidebar";
import { HOME, type Role } from "./navigation";

/** Real build version — the sidebar used to show a hard-coded "v2.4". */
const appVersion = appPackage.version;

const SessionContext = createContext<SessionUser | null>(null);

export function useSessionUser(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSessionUser must be used inside DashboardShell");
  return user;
}

export function DashboardShell({ role, children }: { role: Role; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function loadMe() {
    try {
      const { user: me } = await api.me();
      if (me.role !== role) {
        router.replace(HOME[me.role]);
        return;
      }
      setUser(me);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      else setFailure(errorMessage(err));
    }
  }

  useEffect(() => {
    void loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function logout() {
    await api.logout().catch(() => undefined);
    router.replace("/login");
  }

  const needsMfa = user?.role === "ADMIN" && !user.mfaPassed;
  // Admin, Reseller and Agent share one dashboard: charcoal pages, gold actions,
  // and the black-and-white sidebar.
  const system = role === "ADMIN" || role === "RESELLER" || role === "AGENT";

  // Drawers and dialogs render outside this shell, so the theme has to live on
  // the body as well or those panels stay on the light palette.
  useEffect(() => {
    if (!system) return;
    document.body.classList.add("reseller-system");
    return () => document.body.classList.remove("reseller-system");
  }, [system]);

  return (
    <div className={`flex min-h-svh flex-col lg:flex-row ${system ? "reseller-system" : ""}`}>
      <FloatingSidebar onLogout={() => void logout()} role={role} user={user} version={appVersion} />
      <main className={`min-w-0 flex-1 p-4 sm:p-6 lg:p-8 ${system ? "text-white" : "text-advo-text"}`}>
        {failure ? (
          <Notice tone="danger">{t("shell.sessionFailed", { reason: failure })}</Notice>
        ) : !user ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : needsMfa ? (
          <MfaGate user={user} onDone={() => void loadMe()} />
        ) : (
          <>
            {user.impersonation ? <ImpersonationBanner user={user} /> : null}
            <SessionContext.Provider value={user}>{children}</SessionContext.Provider>
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Shown across the dashboard while an Admin is acting as another user.
 *
 * Leaving only clears the dedicated impersonation cookie, so the Admin's own
 * session was never disturbed and no re-authentication is needed.
 */
function ImpersonationBanner({ user }: { user: SessionUser }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const info = user.impersonation!;

  async function leave() {
    setPending(true);
    try {
      await api.post("/auth/impersonation/stop");
    } catch {
      // Even if the audit write failed, the cookie is cleared server-side; fall through.
    }
    // Land back on the admin list for whoever the Admin was acting as.
    window.location.assign(user.role === "AGENT" ? "/admin/agents" : "/admin/resellers");
  }

  return (
    <div
      className="mb-5 flex flex-wrap items-center gap-3 rounded-card border border-advo-gold/40 bg-advo-gold-soft px-4 py-3 shadow-advo-card"
      role="status"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-advo-gold text-white">
        <UserRound className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[#8a5a00]">{t("admin.impersonation.banner", { name: user.name })}</p>
        <p className="text-[11px] text-[#8a5a00]/80">
          {t("admin.impersonation.bannerHint", {
            admin: info.adminEmail ?? info.adminUserId,
            when: info.startedAt ? new Date(info.startedAt).toLocaleTimeString() : "—",
          })}
        </p>
      </div>
      <Button isDisabled={pending} onPress={() => void leave()} size="sm" type="button" variant="primary">
        <LogOut className="size-3.5" />
        {pending ? t("admin.impersonation.exiting") : t("admin.impersonation.exit")}
      </Button>
    </div>
  );
}

function MfaGate({ user, onDone }: { user: SessionUser; onDone: () => void }) {
  const { t } = useI18n();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function begin() {
    setPending(true);
    setError(null);
    try {
      setSetup(await api.post<{ secret: string; otpauthUrl: string }>("/auth/mfa/setup"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.post("/auth/mfa/enable", { code });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  if (user.mfaEnabled) {
    return (
      <Card className="max-w-lg">
        <h1 className="text-xl font-bold">{t("shell.mfa.required.title")}</h1>
        <p className="mt-2 text-sm text-[var(--advo-muted)]">{t("shell.mfa.required.body")}</p>
      </Card>
    );
  }

  return (
    <Card className="max-w-lg">
      <h1 className="text-xl font-bold">{t("shell.mfa.setup.title")}</h1>
      <p className="mt-2 text-sm text-[var(--advo-muted)]">{t("shell.mfa.setup.body")}</p>
      {!setup ? (
        <Button variant="primary" className="mt-4" onClick={() => void begin()} isDisabled={pending}>
          {pending ? t("shell.mfa.preparing") : t("shell.mfa.generate")}
        </Button>
      ) : (
        <form onSubmit={enable} className="mt-4 space-y-4">
          <div className="rounded-lg bg-[var(--advo-page)] p-3 text-sm">
            <p className="font-semibold">{t("shell.mfa.secretLabel")}</p>
            <code className="mt-1 block break-all text-xs">{setup.secret}</code>
            <p className="mt-2 break-all text-xs text-[var(--advo-muted)]">{setup.otpauthUrl}</p>
          </div>
          <div>
            <Label htmlFor="mfa-code">{t("shell.mfa.codeLabel")}</Label>
            <Input
              id="mfa-code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <Button variant="primary" type="submit" isDisabled={pending}>
            {pending ? t("shell.mfa.verifying") : t("shell.mfa.enable")}
          </Button>
        </form>
      )}
      {error ? (
        <div className="mt-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
    </Card>
  );
}
