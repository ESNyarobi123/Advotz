"use client";

import { createApiClient } from "@advo/api-client";

/**
 * The guest portal reads its language from `@/lib/locale`, which is re-exported
 * here so every screen keeps importing `useLocale` from one place.
 */
export { useLocale, type PortalLocale } from "./locale";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Guest calls never carry a dashboard session cookie. */
export const portalApi = createApiClient({ baseUrl: API_URL, withCredentials: false });

/**
 * Customer-help number shown on the connected page. Defaults to the Advotz
 * support line used by the pilot; override per deployment with an env var.
 */
export const SUPPORT_PHONE = (process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? "+255785114104").trim();

/** `tel:` target — digits plus an optional leading `+`. */
export const SUPPORT_TEL = `tel:${SUPPORT_PHONE.replace(/[^\d+]/g, "")}`;

/** WhatsApp click-to-chat link with a pre-filled greeting. */
export function supportWhatsAppHref(message: string): string {
  const digits = SUPPORT_PHONE.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Omada external-portal redirect parameters we forward to the API; anything else is ignored. */
export const CONTEXT_PARAMS = ["clientMac", "clientIp", "apMac", "gatewayMac", "ssidName", "radioId", "vid", "site", "redirectUrl", "t"] as const;

const ctxKey = (slug: string) => `advo:ctx:${slug}`;

export function saveContext(slug: string, token: string, expiresInSeconds: number) {
  sessionStorage.setItem(ctxKey(slug), JSON.stringify({ token, expiresAt: Date.now() + expiresInSeconds * 1000 }));
}

export function loadContext(slug: string): string | null {
  try {
    const raw = sessionStorage.getItem(ctxKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token: string; expiresAt: number };
    return parsed.expiresAt > Date.now() + 5000 ? parsed.token : null;
  } catch {
    return null;
  }
}

export function clearContext(slug: string) {
  sessionStorage.removeItem(ctxKey(slug));
}

export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 64);
}

export function remainingText(expiresAt: string | null, now: number): string {
  if (!expiresAt) return "—";
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "0:00";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${String(m).padStart(2, "0")}m`;
}
