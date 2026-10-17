import { formatDuration, formatTzs } from "@advo/api-client";
import { voucherBarcodeSvgMarkup } from "./voucher-barcode";

export type VoucherGroup = {
  id: string;
  name: string;
  state: string;
  createdAt: string;
  packageRevision: { name: string; priceTzs: string; durationSeconds: number };
  /** Includes UNUSED / IN_USE / USED plus raw VoucherState keys. */
  counts: Record<string, number>;
};

export type VoucherRow = {
  id: string;
  code: string;
  state: string;
  redeemedAt: string | null;
  grant: { state: string; expiresAt: string | null } | null;
};

/** Guest-facing lifecycle for filters and chips. */
export type VoucherLifecycle = "unused" | "in_use" | "used";

export const VOUCHER_GROUP_STATE_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

export const VOUCHER_LIFECYCLE_LABELS: Record<VoucherLifecycle, string> = {
  unused: "Unused",
  in_use: "In use",
  used: "Used",
};

export function friendlyVoucherLabel(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value.replace(/_/g, " ");
}

/**
 * Unused = never redeemed.
 * In use = redeemed and the grant is still live.
 * Used = redeemed after the session ended, or revoked/expired.
 */
export function voucherLifecycle(v: VoucherRow): VoucherLifecycle {
  if (v.state === "UNUSED") return "unused";
  if (v.state === "REDEEMED") {
    const grantState = v.grant?.state;
    if (grantState === "ACTIVE" || grantState === "PENDING_ACTIVATION") return "in_use";
  }
  return "used";
}

export function lifecycleTone(life: VoucherLifecycle): "success" | "warning" | "neutral" {
  if (life === "unused") return "success";
  if (life === "in_use") return "warning";
  return "neutral";
}

export function lifecycleChipClass(life: VoucherLifecycle): string {
  if (life === "unused") return "bg-emerald-50 text-emerald-700";
  if (life === "in_use") return "bg-amber-50 text-amber-800";
  return "bg-slate-200 text-slate-600";
}

/** Six-digit codes print as `482 917`; legacy codes stay as stored. */
export function formatVoucherDisplay(code: string): string {
  if (/^\d{6}$/.test(code)) return `${code.slice(0, 3)} ${code.slice(3)}`;
  return code;
}

export function groupLifecycleCounts(group: VoucherGroup): {
  unused: number;
  inUse: number;
  used: number;
} {
  return {
    unused: group.counts.UNUSED ?? 0,
    inUse: group.counts.IN_USE ?? 0,
    used: group.counts.USED ?? 0,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Opens a print window of tear-off slips — Save as PDF from the print dialog. */
export function openPrintableVoucherSheet(group: VoucherGroup, vouchers: VoucherRow[]) {
  const unused = vouchers.filter((v) => v.state === "UNUSED");
  const slips = unused.length > 0 ? unused : vouchers;
  const duration = formatDuration(group.packageRevision.durationSeconds);
  const price = formatTzs(group.packageRevision.priceTzs);
  const title = escapeHtml(group.name);
  const pkg = escapeHtml(group.packageRevision.name);

  const cards = slips
    .map((v) => {
      const display = escapeHtml(formatVoucherDisplay(v.code));
      const barcode = voucherBarcodeSvgMarkup(v.code, 36);
      return `<article class="slip">
  <header><span class="brand">ADVO WIFI</span><span class="pkg">${pkg}</span></header>
  <p class="code">${display}</p>
  <div class="barcode">${barcode}</div>
  <footer><span>${escapeHtml(duration)}</span><span>${escapeHtml(price)}</span></footer>
</article>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title} — vouchers</title>
  <style>
    @page { margin: 12mm; size: A4; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #0f172a;
      background: #fff;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid #e2e8f0;
    }
    .toolbar h1 { margin: 0; font-size: 16px; }
    .toolbar p { margin: 2px 0 0; font-size: 12px; color: #64748b; }
    .toolbar button {
      border: 0;
      border-radius: 10px;
      background: #0057b8;
      color: #fff;
      font-weight: 700;
      font-size: 13px;
      padding: 10px 16px;
      cursor: pointer;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      padding: 16px;
    }
    .slip {
      break-inside: avoid;
      border: 1.5px dashed #94a3b8;
      border-radius: 12px;
      padding: 12px 14px;
      text-align: center;
      background: #fff;
    }
    .slip header {
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #64748b;
    }
    .slip .brand { color: #0057b8; }
    .slip .code {
      margin: 10px 0 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 28px;
      font-weight: 900;
      letter-spacing: 0.18em;
      font-variant-numeric: tabular-nums;
    }
    .slip .barcode { margin: 0 auto 8px; max-width: 160px; }
    .slip footer {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 700;
      color: #475569;
    }
    @media print {
      .toolbar { display: none; }
      .grid { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <h1>${title}</h1>
      <p>${pkg} · ${escapeHtml(duration)} · ${escapeHtml(price)} · ${slips.length} codes · Save as PDF from Print</p>
    </div>
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="grid">${cards}</div>
  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>
</body>
</html>`;

  const win = window.open("", "_blank", "noopener,noreferrer,width=920,height=720");
  if (!win) throw new Error("Pop-up blocked — allow pop-ups to download the printable sheet.");
  win.document.open();
  win.document.write(html);
  win.document.close();
}
