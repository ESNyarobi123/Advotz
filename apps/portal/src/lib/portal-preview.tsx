"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  PORTAL_PREVIEW_MESSAGE,
  PORTAL_PREVIEW_READY,
  portalPreviewMessageSchema,
  type PortalPreviewAppearance,
} from "@advo/contracts";

import { useLocale } from "./locale";

/**
 * The reseller designer's draft appearance, or `null` outside a preview.
 *
 * Provided by `PortalFrame` so that every screen — the frame's own colours and
 * the package cards below it — reads the same override from one place.
 */
const PortalPreviewContext = createContext<PortalPreviewAppearance | null>(null);

/** The draft appearance the designer is previewing, or `null` in a real session. */
export function usePortalPreviewAppearance(): PortalPreviewAppearance | null {
  return useContext(PortalPreviewContext);
}

/**
 * Listens for the reseller designer's draft appearance and hands it to the tree.
 *
 * Three things this deliberately does not do:
 *
 *   - It does not apply anything outside `?preview=1`. A guest's page must never
 *     be styled by a message, and the flag is the designer's own marker.
 *   - It does not trust the sender. A `postMessage` can arrive from any page that
 *     embeds the portal, so the payload is parsed with `safeParse` and a message
 *     that does not match the schema is ignored rather than partially applied.
 *   - It does not persist. The override lives in this component's state, so
 *     reloading the frame drops it and the guest path is untouched.
 */
export function PortalPreviewProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [appearance, setAppearance] = useState<PortalPreviewAppearance | null>(
    null,
  );
  const { setLocale } = useLocale();

  useEffect(() => {
    if (!enabled) return;

    function onMessage(event: MessageEvent) {
      const parsed = portalPreviewMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      if (parsed.data.type !== PORTAL_PREVIEW_MESSAGE) return;
      setAppearance(parsed.data.appearance);
      if (parsed.data.appearance.defaultLocale) {
        setLocale(parsed.data.appearance.defaultLocale);
      }
    }

    window.addEventListener("message", onMessage);
    // The designer may have posted before this effect ran; asking it to send
    // again is what stops the first edit from being the one that is lost.
    window.parent?.postMessage({ type: PORTAL_PREVIEW_READY }, "*");

    return () => window.removeEventListener("message", onMessage);
  }, [enabled, setLocale]);

  return (
    <PortalPreviewContext.Provider value={appearance}>
      {children}
    </PortalPreviewContext.Provider>
  );
}
