"use client";

import { useMemo, useState } from "react";
import { Button, Card, Modal, useOverlayState } from "@heroui/react";
import { formatDateTime } from "@advo/api-client";
import { Notice, StatusChip, statusTone } from "@advo/ui";
import { PageHero, ResourceView } from "@/features/common/components";
import { api } from "@/lib/api";
import { useI18n, type I18n } from "@/lib/i18n";
import { formValues, useAction, useResource } from "@/lib/hooks";
import {
  Check,
  Copy,
  Cpu,
  Eye,
  EyeOff,
  Lock,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Router,
  Search,
  Trash2,
  Wifi,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";

type DeviceWifi = {
  id: string;
  name: string;
  band: "2.4" | "5" | "both";
  hidden: boolean;
  secured: boolean;
};

type DeviceRow = {
  id: string;
  name: string | null;
  mac: string;
  model: string | null;
  hardwareVersion: string | null;
  firmware: string | null;
  observedStatus: string | null;
  lastSeenAt: string | null;
  controllerId: string | null;
  site: { id: string; name: string } | null;
  wifi?: DeviceWifi[];
};

type SiteOption = { id: string; name: string };

/** A device is active when the Controller currently reports it as connected. */
const ONLINE_STATUSES = new Set(["ACTIVE", "ONLINE", "CONNECTED"]);

/** Common Omada models offered as suggestions; the field stays free text. */
const OMADA_MODELS = [
  "EAP225",
  "EAP245",
  "EAP610",
  "EAP650",
  "ER605",
  "ER7206",
  "SG2008",
  "SG2210",
];

function isOnline(device: DeviceRow): boolean {
  return ONLINE_STATUSES.has((device.observedStatus ?? "").toUpperCase());
}

/**
 * Enum → message key. The API's enum values are the wire vocabulary; every
 * lookup falls back to a de-underscored value so a new enum never renders raw.
 */
const DEVICE_STATUS_KEYS: Record<string, string> = {
  ACTIVE: "device.status.ACTIVE",
  CONNECTED: "device.status.CONNECTED",
  ONLINE: "device.status.ONLINE",
  DISCONNECTED: "device.status.DISCONNECTED",
  OFFLINE: "device.status.OFFLINE",
  FAILED: "device.status.FAILED",
  ERROR: "device.status.ERROR",
  PENDING: "device.status.PENDING",
  ADOPTING: "device.status.ADOPTING",
  UNKNOWN: "device.status.UNKNOWN",
  NOT_OBSERVED: "device.status.NOT_OBSERVED",
};

function deviceStatusLabel(t: I18n["t"], status: string | null): string {
  if (!status) return t("device.status.UNKNOWN");
  const key = DEVICE_STATUS_KEYS[status.toUpperCase()];
  return key ? t(key as "device.status.UNKNOWN") : status.replace(/_/g, " ");
}

export function ResellerDevicesScreen() {
  const { t } = useI18n();
  const devices = useResource<DeviceRow[]>("/reseller/devices");
  const sites = useResource<SiteOption[]>("/reseller/sites");

  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const overlay = useOverlayState({
    isOpen: showForm,
    onOpenChange: (next) => {
      if (!next) setShowForm(false);
    },
  });

  const addDevice = useAction(
    async (form: HTMLFormElement) => {
      await api.post("/reseller/device-claims", formValues(form));
      form.reset();
      setShowForm(false);
    },
    async () => {
      await devices.reload();
    },
  );

  function copyToClipboard(text: string, id: string) {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const deviceList = devices.data ?? [];
  const siteList = sites.data ?? [];

  const onlineCount = deviceList.filter(isOnline).length;
  const offlineCount = deviceList.length - onlineCount;

  const term = query.trim().toLowerCase();
  const visibleDevices = useMemo(
    () =>
      deviceList.filter((device) => {
        if (filter === "online" && !isOnline(device)) return false;
        if (filter === "offline" && isOnline(device)) return false;
        if (!term) return true;
        return (
          (device.name ?? "").toLowerCase().includes(term) ||
          device.mac.toLowerCase().includes(term) ||
          (device.model ?? "").toLowerCase().includes(term) ||
          (device.site?.name ?? "").toLowerCase().includes(term) ||
          (device.firmware ?? "").toLowerCase().includes(term) ||
          (device.wifi ?? []).some((network) => network.name.toLowerCase().includes(term))
        );
      }),
    [deviceList, filter, term],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHero
        actions={
          <Button onPress={() => setShowForm(true)} type="button" variant="primary">
            <Plus className="size-3.5" />
            {t("reseller.devices.action.add")}
          </Button>
        }
        description={t("reseller.devices.subtitle")}
        eyebrow={t("nav.group.network")}
        icon={<Router />}
        iconTone="accent"
        title={t("reseller.devices.title")}
      />

      {/* ── Online / offline summary cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DeviceStatCard
          hint={t("reseller.devices.kpi.totalHint")}
          icon={Cpu}
          label={t("reseller.devices.kpi.total")}
          testId="device-kpi-total"
          tone="blue"
          value={deviceList.length}
        />
        <DeviceStatCard
          hint={t("reseller.devices.kpi.onlineHint")}
          icon={Wifi}
          label={t("reseller.devices.kpi.online")}
          testId="device-kpi-online"
          tone="emerald"
          value={onlineCount}
        />
        <DeviceStatCard
          hint={t("reseller.devices.kpi.offlineHint")}
          icon={WifiOff}
          label={t("reseller.devices.kpi.offline")}
          testId="device-kpi-offline"
          tone="rose"
          value={offlineCount}
        />
      </div>

      {/* ── Devices list ── */}
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-black tracking-tight text-advo-text">
            {t("reseller.devices.list.title")}
            <span className="ml-1.5 font-bold text-advo-muted">
              {t("reseller.devices.list.count", { count: deviceList.length })}
            </span>
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-advo-muted" />
              <input
                aria-label={t("reseller.devices.search.placeholder")}
                className="w-full rounded-xl border border-advo-border bg-white py-1.5 pl-8 pr-7 text-xs font-medium text-advo-text transition placeholder:text-advo-muted focus:border-advo-blue focus:outline-none sm:w-56"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("reseller.devices.search.placeholder")}
                type="search"
                value={query}
              />
              {query ? (
                <button
                  aria-label={t("reseller.devices.search.clear")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-advo-muted transition hover:bg-slate-100 hover:text-advo-text"
                  onClick={() => setQuery("")}
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>

            <div
              aria-label={t("reseller.devices.filter.all")}
              className="inline-flex items-center gap-0.5 rounded-xl border border-advo-border bg-white p-0.5"
              role="group"
            >
              {(["all", "online", "offline"] as const).map((key) => {
                const active = filter === key;
                const Icon = key === "online" ? Wifi : key === "offline" ? WifiOff : Cpu;
                return (
                  <button
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                      active ? "bg-advo-blue text-white shadow-xs" : "text-advo-muted hover:text-advo-text"
                    }`}
                    key={key}
                    onClick={() => setFilter(key)}
                    type="button"
                  >
                    <Icon className="h-3 w-3" />
                    {key === "all"
                      ? t("reseller.devices.filter.all")
                      : key === "online"
                        ? t("reseller.devices.filter.online")
                        : t("reseller.devices.filter.offline")}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <ResourceView resource={devices}>
          {(rows) =>
            rows.length === 0 ? (
              <Card className="p-8 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-advo-blue/10 text-advo-blue">
                  <Router className="h-6 w-6" />
                </span>
                <h3 className="mt-3 text-sm font-bold text-advo-text">{t("reseller.devices.empty.title")}</h3>
                <p className="mx-auto mt-1 max-w-md text-xs text-advo-muted">{t("reseller.devices.empty.body")}</p>
                <Button className="mt-4" onPress={() => setShowForm(true)} type="button" variant="primary">
                  <Plus className="size-3.5" />
                  {t("reseller.devices.empty.cta")}
                </Button>
              </Card>
            ) : visibleDevices.length === 0 ? (
              <Card className="p-6 text-center text-xs text-advo-muted">
                {t("reseller.devices.search.noMatch", { query })}
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleDevices.map((device) => (
                  <DeviceCard
                    copied={copiedId === device.id}
                    device={device}
                    key={device.id}
                    onCopy={() => copyToClipboard(device.mac, device.id)}
                    onReload={() => devices.reload()}
                    t={t}
                  />
                ))}
              </div>
            )
          }
        </ResourceView>
      </section>

      {/* ── Add device popup form ── */}
      <Modal.Root state={overlay}>
        <Modal.Backdrop>
          <Modal.Container size="lg">
            <Modal.Dialog className="bg-white">
              <Modal.Header>
                <Modal.Heading className="text-base font-black text-advo-text">
                  {t("reseller.devices.form.title")}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addDevice.run(event.currentTarget);
                  }}
                >
                  <p className="text-xs text-advo-muted">{t("reseller.devices.form.subtitle")}</p>
                  {addDevice.error ? <Notice tone="danger">{addDevice.error}</Notice> : null}
                  {siteList.length === 0 ? (
                    <Notice tone="warning">{t("reseller.devices.form.siteEmpty")}</Notice>
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs font-bold text-advo-text" htmlFor="device-site">
                        {t("reseller.devices.form.site")}
                      </label>
                      <select
                        className="w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs font-bold text-advo-text transition focus:border-advo-blue focus:bg-white focus:outline-none"
                        id="device-site"
                        name="siteId"
                        required
                      >
                        <option value="">{t("reseller.devices.form.sitePlaceholder")}</option>
                        {siteList.map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <DeviceField
                      id="device-name"
                      label={t("reseller.devices.form.name")}
                      name="name"
                      placeholder={t("reseller.devices.form.namePlaceholder")}
                      required
                    />
                    <DeviceField
                      id="device-mac"
                      label={t("reseller.devices.form.mac")}
                      name="mac"
                      placeholder={t("reseller.devices.form.macPlaceholder")}
                      required
                    />
                    {/* Optional: the Controller reports the exact model after adoption. */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs font-bold text-advo-text" htmlFor="device-model">
                        {t("reseller.devices.form.model")}
                      </label>
                      <input
                        className="w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs font-medium text-advo-text transition placeholder:text-advo-muted focus:border-advo-blue focus:bg-white focus:outline-none"
                        id="device-model"
                        list="device-models"
                        name="model"
                        placeholder={t("reseller.devices.form.modelPlaceholder")}
                        type="text"
                      />
                      <datalist id="device-models">
                        {OMADA_MODELS.map((model) => (
                          <option key={model} value={model} />
                        ))}
                      </datalist>
                    </div>

                    <div className="space-y-2 rounded-2xl border border-advo-border bg-advo-page/60 p-3 sm:col-span-2">
                      <div>
                        <p className="text-xs font-bold text-advo-text">{t("reseller.devices.form.loginSection")}</p>
                        <p className="mt-0.5 text-[11px] text-advo-muted">{t("reseller.devices.form.loginHint")}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <DeviceField
                          id="device-username"
                          label={t("reseller.devices.form.deviceUsername")}
                          name="deviceUsername"
                          placeholder={t("reseller.devices.form.deviceUsernamePlaceholder")}
                          required
                        />
                        <DeviceField
                          autoComplete="new-password"
                          id="device-password"
                          label={t("reseller.devices.form.devicePassword")}
                          name="devicePassword"
                          placeholder={t("reseller.devices.form.devicePasswordPlaceholder")}
                          required
                          type="password"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 border-t border-advo-border pt-4">
                    <Button onPress={() => setShowForm(false)} type="button" variant="outline">
                      {t("reseller.devices.form.cancel")}
                    </Button>
                    <Button isDisabled={addDevice.pending || siteList.length === 0} type="submit" variant="primary">
                      <Plus className="size-3.5" />
                      {addDevice.pending ? t("reseller.devices.form.pending") : t("reseller.devices.form.submit")}
                    </Button>
                  </div>
                </form>
              </Modal.Body>
              <Modal.CloseTrigger aria-label={t("reseller.devices.form.cancel")} />
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Presentational pieces
 * ───────────────────────────────────────────────────────────────────────────*/

const TILE_TONES = {
  blue: { bar: "from-advo-blue to-advo-blue-hover", icon: "bg-advo-blue/10 text-advo-blue" },
  emerald: { bar: "from-emerald-500 to-emerald-400", icon: "bg-emerald-50 text-emerald-600" },
  rose: { bar: "from-rose-500 to-rose-400", icon: "bg-rose-50 text-rose-600" },
} as const;

function DeviceStatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  testId,
}: {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  tone: keyof typeof TILE_TONES;
  testId: string;
}) {
  const palette = TILE_TONES[tone];
  return (
    <Card className="relative overflow-hidden p-4" data-testid={testId}>
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${palette.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-advo-muted">{label}</p>
          <p className="mt-1 text-3xl font-black leading-none tracking-tight text-advo-text">{value}</p>
        </div>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${palette.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 truncate text-[11px] font-semibold text-advo-muted">{hint}</p>
    </Card>
  );
}

type DeviceDialog = "rename" | "retry" | "remove" | "wifi";

/** One device as a card, with rename, retry, remove and WiFi on the site. */
function DeviceCard({
  device,
  t,
  copied,
  onCopy,
  onReload,
}: {
  device: DeviceRow;
  t: I18n["t"];
  copied: boolean;
  onCopy: () => void;
  onReload: () => Promise<void>;
}) {
  const online = isOnline(device);
  const status = (device.observedStatus ?? "UNKNOWN").toUpperCase();
  const [dialog, setDialog] = useState<DeviceDialog | null>(null);
  const [hidden, setHidden] = useState(false);
  const [band, setBand] = useState<DeviceWifi["band"]>("both");
  const overlay = useOverlayState({
    isOpen: dialog !== null,
    onOpenChange: (next) => {
      if (!next) setDialog(null);
    },
  });
  const close = () => setDialog(null);
  const rename = useAction(async (form: HTMLFormElement) => {
    const values = formValues(form);
    await api.post(`/reseller/devices/${device.id}/rename`, { name: values.name, model: values.model ?? "" });
    close();
  }, onReload);
  const retry = useAction(async (form: HTMLFormElement) => {
    await api.post(`/reseller/devices/${device.id}/retry`, formValues(form));
    close();
  }, onReload);
  const remove = useAction(async () => {
    await api.del(`/reseller/devices/${device.id}`);
    close();
  }, onReload);
  const addWifi = useAction(async (form: HTMLFormElement) => {
    const values = formValues(form);
    await api.post(`/reseller/devices/${device.id}/wifi`, {
      name: values.name,
      password: values.password,
      hidden,
      band,
    });
    setHidden(false);
    setBand("both");
    close();
  }, onReload);
  const pending = rename.pending || retry.pending || remove.pending || addWifi.pending;
  const error = rename.error || retry.error || remove.error || addWifi.error;
  const label = device.name ?? device.model ?? device.mac;
  const networks = device.wifi ?? [];

  return (
    <Card className="flex flex-col p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
              online ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
            }`}
          >
            <Router className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-advo-text" title={device.name ?? device.model ?? device.mac}>
              {device.name ?? device.model ?? device.mac}
            </h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-advo-muted">
              <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="truncate">{device.site?.name ?? t("reseller.devices.card.noSite")}</span>
            </p>
          </div>
        </div>
        <StatusChip tone={online ? "success" : statusTone(status)}>
          {deviceStatusLabel(t, device.observedStatus)}
        </StatusChip>
      </div>

      <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-advo-border bg-slate-50 px-2.5 py-1.5">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          {t("reseller.devices.card.mac")}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-advo-text select-all" title={device.mac}>
          {device.mac}
        </span>
        <button
          aria-label={copied ? t("common.copied") : t("common.copy")}
          className="shrink-0 rounded-lg p-1 text-advo-muted transition hover:bg-white hover:text-advo-text"
          onClick={onCopy}
          title={t("common.copy")}
          type="button"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Detail label={t("reseller.devices.card.firmware")} value={device.firmware || "—"} mono />
        <Detail label={t("reseller.devices.card.model")} value={device.model || "—"} />
        <Detail
          label={t("reseller.devices.card.lastSeen")}
          value={device.lastSeenAt ? formatDateTime(device.lastSeenAt) : t("reseller.devices.card.never")}
        />
        <Detail label={t("reseller.devices.card.site")} value={device.site?.name ?? t("reseller.devices.card.noSite")} />
      </div>

      <div className="mt-3 rounded-xl border border-advo-border/70 bg-advo-page px-2.5 py-2">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{t("reseller.devices.card.wifi")}</p>
        {networks.length === 0 ? (
          <p className="mt-1 text-[11px] font-semibold text-advo-muted">{t("reseller.devices.card.wifiEmpty")}</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {networks.map((network) => (
              <li className="flex items-center gap-1.5 text-[11px] font-bold text-advo-text" key={network.id}>
                <Wifi className="h-3 w-3 shrink-0 text-advo-blue" />
                <span className="min-w-0 flex-1 truncate" title={network.name}>
                  {network.name}
                </span>
                {network.secured ? <Lock className="h-3 w-3 shrink-0 text-slate-400" /> : null}
                {network.hidden ? <EyeOff className="h-3 w-3 shrink-0 text-slate-400" /> : <Eye className="h-3 w-3 shrink-0 text-slate-400" />}
                <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[9px] font-bold text-advo-muted">
                  {network.band === "2.4"
                    ? t("reseller.devices.wifi.band24")
                    : network.band === "5"
                      ? t("reseller.devices.wifi.band5")
                      : t("reseller.devices.wifi.bandBoth")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1 border-t border-advo-border pt-3">
        <CardAction icon={Pencil} label={t("reseller.devices.action.rename")} onPress={() => setDialog("rename")} />
        <CardAction icon={RefreshCw} label={t("reseller.devices.action.retry")} onPress={() => setDialog("retry")} />
        <CardAction icon={Trash2} label={t("reseller.devices.action.remove")} onPress={() => setDialog("remove")} tone="danger" />
        <CardAction icon={Wifi} label={t("reseller.devices.action.wifi")} onPress={() => setDialog("wifi")} />
      </div>

      <Modal.Root state={overlay}>
        <Modal.Backdrop>
          <Modal.Container size="md">
            <Modal.Dialog className="bg-white">
              <Modal.Header>
                <Modal.Heading>
                  {dialog === "rename"
                    ? t("reseller.devices.rename.title")
                    : dialog === "retry"
                      ? t("reseller.devices.retry.title")
                      : dialog === "remove"
                        ? t("reseller.devices.remove.title")
                        : dialog === "wifi"
                          ? t("reseller.devices.wifi.title")
                          : ""}
                </Modal.Heading>
                <p className="mt-1 text-xs text-advo-muted">
                  {dialog === "rename"
                    ? t("reseller.devices.rename.subtitle")
                    : dialog === "retry"
                      ? t("reseller.devices.retry.subtitle")
                      : dialog === "wifi"
                        ? t("reseller.devices.wifi.subtitle", { site: device.site?.name ?? t("reseller.devices.card.noSite") })
                        : dialog === "remove"
                          ? t("reseller.devices.remove.body", { name: label })
                          : ""}
                </p>
              </Modal.Header>
              <Modal.Body>
                {error ? <Notice tone="danger">{error}</Notice> : null}
                {dialog === "rename" ? (
                  <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void rename.run(event.currentTarget); }}>
                    <DeviceField defaultValue={device.name ?? ""} id={`rename-name-${device.id}`} label={t("reseller.devices.rename.name")} name="name" required />
                    <DeviceField defaultValue={device.model ?? ""} id={`rename-model-${device.id}`} label={t("reseller.devices.rename.model")} name="model" />
                    <DialogActions cancel={t("reseller.devices.form.cancel")} onCancel={close} pending={pending} submit={rename.pending ? t("reseller.devices.rename.pending") : t("reseller.devices.rename.save")} />
                  </form>
                ) : null}
                {dialog === "retry" ? (
                  <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void retry.run(event.currentTarget); }}>
                    <DeviceField id={`retry-user-${device.id}`} label={t("reseller.devices.retry.username")} name="deviceUsername" required />
                    <DeviceField autoComplete="new-password" id={`retry-pass-${device.id}`} label={t("reseller.devices.retry.password")} name="devicePassword" required type="password" />
                    <DialogActions cancel={t("reseller.devices.form.cancel")} onCancel={close} pending={pending} submit={retry.pending ? t("reseller.devices.retry.pending") : t("reseller.devices.retry.submit")} />
                  </form>
                ) : null}
                {dialog === "remove" ? (
                  <div className="flex justify-end gap-2">
                    <Button isDisabled={pending} onPress={close} type="button" variant="outline">
                      {t("reseller.devices.remove.no")}
                    </Button>
                    <Button isDisabled={pending} onPress={() => void remove.run()} type="button" variant="danger">
                      {remove.pending ? t("reseller.devices.remove.pending") : t("reseller.devices.remove.yes")}
                    </Button>
                  </div>
                ) : null}
                {dialog === "wifi" ? (
                  <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void addWifi.run(event.currentTarget); }}>
                    <DeviceField id={`wifi-name-${device.id}`} label={t("reseller.devices.wifi.name")} name="name" required />
                    <DeviceField autoComplete="new-password" id={`wifi-pass-${device.id}`} label={t("reseller.devices.wifi.password")} name="password" type="password" />
                    <p className="-mt-1 text-[11px] text-advo-muted">{t("reseller.devices.wifi.passwordHint")}</p>
                    <label className="flex items-center gap-2 text-xs font-bold text-advo-text">
                      <input checked={hidden} className="size-4 accent-advo-blue" onChange={(event) => setHidden(event.target.checked)} type="checkbox" />
                      {t("reseller.devices.wifi.hide")}
                    </label>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-advo-text">{t("reseller.devices.wifi.band")}</p>
                      <div className="grid grid-cols-3 gap-1.5" role="group">
                        {(["2.4", "5", "both"] as const).map((choice) => (
                          <button
                            className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition ${
                              band === choice ? "border-advo-blue bg-advo-blue text-white" : "border-advo-border bg-advo-page text-advo-text"
                            }`}
                            key={choice}
                            onClick={() => setBand(choice)}
                            type="button"
                          >
                            {choice === "2.4" ? t("reseller.devices.wifi.band24") : choice === "5" ? t("reseller.devices.wifi.band5") : t("reseller.devices.wifi.bandBoth")}
                          </button>
                        ))}
                      </div>
                    </div>
                    <DialogActions cancel={t("reseller.devices.form.cancel")} onCancel={close} pending={pending} submit={addWifi.pending ? t("reseller.devices.wifi.pending") : t("reseller.devices.wifi.submit")} />
                  </form>
                ) : null}
              </Modal.Body>
              <Modal.CloseTrigger aria-label={t("reseller.devices.form.cancel")} />
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </Card>
  );
}

function CardAction({
  icon: Icon,
  label,
  onPress,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-bold transition ${
        tone === "danger" ? "text-rose-600 hover:bg-rose-50" : "text-advo-text hover:bg-advo-page"
      }`}
      onClick={onPress}
      type="button"
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function DialogActions({ cancel, submit, pending, onCancel }: { cancel: string; submit: string; pending: boolean; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button isDisabled={pending} onPress={onCancel} type="button" variant="outline">
        {cancel}
      </Button>
      <Button isDisabled={pending} type="submit" variant="primary">
        {submit}
      </Button>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-advo-border/60 bg-advo-page px-2.5 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 truncate text-[11px] font-bold text-advo-text ${mono ? "font-mono" : ""}`} title={value}>
        {value}
      </p>
    </div>
  );
}

function DeviceField({
  id,
  name,
  label,
  placeholder,
  required,
  type = "text",
  autoComplete,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "password";
  autoComplete?: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-advo-text" htmlFor={id}>
        {label}
      </label>
      <input
        autoComplete={autoComplete}
        className="w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs font-medium text-advo-text transition placeholder:text-advo-muted focus:border-advo-blue focus:bg-white focus:outline-none"
        defaultValue={defaultValue}
        id={id}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </div>
  );
}
