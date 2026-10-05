"use client";

import { Button } from "@heroui/react";
import { PortalModal } from "@/components/PortalModal";
import type { PortalTheme } from "@/lib/portal-types";
import { SUPPORT_PHONE, SUPPORT_TEL, supportWhatsAppHref, useLocale } from "@/lib/portal";

/** Customer-help dialog with call and WhatsApp actions. */
export function SupportModal({ open, onClose, theme }: { open: boolean; onClose: () => void; theme?: PortalTheme }) {
  const { t } = useLocale();
  return (
    <PortalModal onClose={onClose} open={open} theme={theme} title={t("portal.supportTitle")}>
      <p className="mb-4 text-center text-sm text-[var(--advo-muted)]">{t("portal.supportLead")}</p>
      <p className="mb-4 text-center text-lg font-black" style={{ color: "var(--advo-blue)" }}>
        {SUPPORT_PHONE}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <a href={SUPPORT_TEL}>
          <Button fullWidth style={{ background: "var(--advo-blue)", color: "#ffffff", borderRadius: theme?.radius }} type="button">
            ☎ {t("portal.supportCall")}
          </Button>
        </a>
        <a href={supportWhatsAppHref(t("portal.supportLead"))} rel="noopener" target="_blank">
          <Button fullWidth style={{ background: "linear-gradient(135deg, #119447, #25d366)", color: "#ffffff", borderRadius: theme?.radius }} type="button">
            ◉ {t("portal.supportWhatsapp")}
          </Button>
        </a>
      </div>
    </PortalModal>
  );
}
