"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button, Card, Input, Modal, useOverlayState } from "@heroui/react";
import { formatDateTime } from "@advo/api-client";
import { AdvoKpi, Notice, SoftIcon, StatusChip } from "@advo/ui";
import { AD_THEMES, type AdCampaignStatus, type AdCampaignView, type AdTheme } from "@advo/contracts";
import { Megaphone, Pause, Pencil, Play, Plus, Search, Sparkles, Square } from "lucide-react";
import { Field, PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import { ReasonDialog } from "@/features/common/reason-dialog";
import { api } from "@/lib/api";
import { formValues, useAction, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

/**
 * Ad campaign authoring.
 *
 * A campaign is the only thing that can appear in a sponsored placement: the
 * reseller chooses whether the placement is on, the plan decides whether it is
 * allowed, and this screen decides what — if anything — fills it. A placement
 * with no active campaign collapses on the guest page rather than showing an
 * empty card, which is why publishing here matters.
 */

const PLACEMENTS: Array<{ id: "ads.banner" | "ads.explore"; labelKey: "admin.campaigns.placement.banner" | "admin.campaigns.placement.explore" }> = [
  { id: "ads.banner", labelKey: "admin.campaigns.placement.banner" },
  { id: "ads.explore", labelKey: "admin.campaigns.placement.explore" },
];

const STATUS_TONE: Record<AdCampaignStatus, "success" | "warning" | "default" | "danger"> = {
  ACTIVE: "success",
  DRAFT: "warning",
  PAUSED: "default",
  ENDED: "danger",
};

const STATUS_KEY = {
  ACTIVE: "admin.campaigns.status.active",
  DRAFT: "admin.campaigns.status.draft",
  PAUSED: "admin.campaigns.status.paused",
  ENDED: "admin.campaigns.status.ended",
} as const;

const THEME_PREVIEW: Record<AdTheme, string> = {
  cafe: "linear-gradient(135deg, #dce4d3, #82976f)",
  tech: "linear-gradient(135deg, #ddd6ed, #76628e)",
  style: "linear-gradient(135deg, #edcfc1, #a57551)",
};

export function AdminCampaignsScreen() {
  const { t } = useI18n();
  const campaigns = useResource<AdCampaignView[]>("/admin/campaigns");
  const [query, setQuery] = useState("");
  const [formTarget, setFormTarget] = useState<AdCampaignView | null | undefined>(undefined);
  const [reasonTarget, setReasonTarget] = useState<{ kind: "end" | "activate" | "pause"; campaign: AdCampaignView } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const rows = campaigns.data ?? [];

  const stats = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((r) => r.status === "ACTIVE").length,
      draft: rows.filter((r) => r.status === "DRAFT").length,
      banner: rows.filter((r) => r.placements.includes("ads.banner")).length,
    };
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => [row.name, row.creative.business, row.creative.title].join(" ").toLowerCase().includes(needle));
  }, [rows, query]);

  async function afterChange(message: string) {
    setFlash(message);
    await campaigns.reload();
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      <PageHero
        actions={
          <Button onPress={() => setFormTarget(null)} size="sm" type="button" variant="primary">
            <Plus className="size-4" />
            {t("admin.campaigns.action.create")}
          </Button>
        }
        description={t("admin.campaigns.description")}
        eyebrow={t("admin.campaigns.eyebrow")}
        icon={<Megaphone />}
        iconTone="violet"
        title={t("admin.campaigns.title")}
      />

      {flash ? (
        <Notice tone="success">
          <span className="flex flex-wrap items-center gap-2">
            {flash}
            <button className="font-bold underline" onClick={() => setFlash(null)} type="button">
              ✕
            </button>
          </span>
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdvoKpi hint={t("admin.campaigns.kpi.totalHint")} icon={<Megaphone />} iconTone="violet" label={t("admin.campaigns.kpi.total")} value={stats.total} />
        <AdvoKpi hint={t("admin.campaigns.kpi.activeHint")} icon={<Play />} iconTone="success" label={t("admin.campaigns.kpi.active")} value={stats.active} />
        <AdvoKpi hint={t("admin.campaigns.kpi.draftHint")} icon={<Pencil />} iconTone="gold" label={t("admin.campaigns.kpi.draft")} value={stats.draft} />
        <AdvoKpi hint={t("admin.campaigns.kpi.bannerHint")} icon={<Sparkles />} iconTone="accent" label={t("admin.campaigns.kpi.banner")} value={stats.banner} />
      </div>

      <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
        <SectionHeader icon={<Search />} iconTone="violet" title={t("admin.campaigns.search.title")} />
        <Input
          aria-label={t("admin.campaigns.search.label")}
          placeholder={t("admin.campaigns.search.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Card>

      <ResourceView resource={campaigns}>
        {() =>
          visible.length === 0 ? (
            <Card className="shadow-advo-card ring-1 ring-advo-border/70">
              <span className="flex flex-col items-center gap-2 py-6">
                <SoftIcon size="lg" tone="violet">
                  <Megaphone />
                </SoftIcon>
                <span className="text-sm font-bold text-advo-text">
                  {rows.length === 0 ? t("admin.campaigns.emptyNone") : t("admin.campaigns.empty")}
                </span>
                <span className="max-w-md text-center text-xs text-advo-muted">{t("admin.campaigns.emptyHint")}</span>
                {rows.length === 0 ? (
                  <Button onPress={() => setFormTarget(null)} size="sm" type="button" variant="primary">
                    <Plus className="size-4" />
                    {t("admin.campaigns.action.create")}
                  </Button>
                ) : null}
              </span>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {visible.map((campaign) => (
                <CampaignCard
                  campaign={campaign}
                  key={campaign.id}
                  onEdit={setFormTarget}
                  onReason={(kind, target) => setReasonTarget({ kind, campaign: target })}
                />
              ))}
            </div>
          )
        }
      </ResourceView>

      <CampaignFormModal open={formTarget !== undefined} campaign={formTarget ?? null} onClose={() => setFormTarget(undefined)} onSaved={afterChange} />

      <ReasonDialog
        labels={{
          title:
            reasonTarget?.kind === "end"
              ? t("admin.campaigns.dialog.endTitle", { name: reasonTarget.campaign.name })
              : reasonTarget?.kind === "activate"
                ? t("admin.campaigns.dialog.activateTitle", { name: reasonTarget.campaign.name })
                : t("admin.campaigns.dialog.pauseTitle", { name: reasonTarget?.campaign.name ?? "" }),
          note:
            reasonTarget?.kind === "end"
              ? t("admin.campaigns.dialog.endNote")
              : reasonTarget?.kind === "activate"
                ? t("admin.campaigns.dialog.activateNote")
                : t("admin.campaigns.dialog.pauseNote"),
          reasonLabel: t("admin.campaigns.dialog.reason"),
          reasonPlaceholder: t("admin.campaigns.dialog.reasonPlaceholder"),
          reasonHint: t("admin.campaigns.dialog.reasonHint"),
          tooShort: t("admin.plans.dialog.reasonTooShort"),
          cancel: t("admin.plans.dialog.cancel"),
          confirm: t("admin.plans.dialog.confirm"),
        }}
        open={reasonTarget !== null}
        tone={reasonTarget?.kind === "end" ? "danger" : "primary"}
        onClose={() => setReasonTarget(null)}
        onSubmit={async (reason) => {
          if (!reasonTarget) return;
          const { kind, campaign } = reasonTarget;
          if (kind === "end") {
            await api.request(`/admin/campaigns/${campaign.id}`, { method: "DELETE", body: JSON.stringify({ reason }) });
          } else {
            await api.post(`/admin/campaigns/${campaign.id}/status`, { status: kind === "activate" ? "ACTIVE" : "PAUSED", reason });
          }
          const verb =
            kind === "end"
              ? t("admin.campaigns.action.end")
              : kind === "activate"
                ? t("admin.campaigns.action.activate")
                : t("admin.campaigns.action.pause");
          await afterChange(`${verb} — ${campaign.name}`);
        }}
      />
    </div>
  );
}

function CampaignCard({
  campaign,
  onEdit,
  onReason,
}: {
  campaign: AdCampaignView;
  onEdit: (campaign: AdCampaignView) => void;
  onReason: (kind: "end" | "activate" | "pause", campaign: AdCampaignView) => void;
}) {
  const { t } = useI18n();
  const ended = campaign.status === "ENDED";
  const active = campaign.status === "ACTIVE";

  return (
    <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {campaign.creative.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-advo-border"
              src={campaign.creative.imageUrl}
            />
          ) : (
            <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl ring-1 ring-advo-border" style={{ background: THEME_PREVIEW[campaign.creative.theme] }} />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-black tracking-tight text-advo-text">{campaign.name}</h3>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-advo-muted">
              <span className="font-bold">{campaign.creative.business}</span> · {campaign.creative.title}
            </p>
            {campaign.creative.phone || campaign.creative.url ? (
              <p className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-advo-muted">
                {campaign.creative.phone ? <span>📞 {campaign.creative.phone}</span> : null}
                {campaign.creative.url ? <span className="max-w-[200px] truncate">🔗 {campaign.creative.url}</span> : null}
              </p>
            ) : null}
          </div>
        </div>
        <StatusChip size="md" tone={STATUS_TONE[campaign.status]}>
          {t(STATUS_KEY[campaign.status])}
        </StatusChip>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {campaign.placements.map((placement) => (
          <span className="rounded-full border border-[var(--advo-border)] bg-advo-surface-soft/60 px-2.5 py-1 text-[11px] font-semibold text-advo-muted" key={placement}>
            {placement === "ads.banner" ? t("admin.campaigns.placement.banner") : t("admin.campaigns.placement.explore")}
          </span>
        ))}
        {campaign.targeting.resellerIds.length === 0 && campaign.targeting.siteIds.length === 0 ? (
          <span className="rounded-full bg-advo-blue-soft px-2.5 py-1 text-[11px] font-bold text-advo-blue">{t("admin.campaigns.audience.everyone")}</span>
        ) : (
          <span className="rounded-full bg-advo-gold-soft px-2.5 py-1 text-[11px] font-bold text-[#b45309]">
            {t("admin.campaigns.audience.targeted", { resellers: campaign.targeting.resellerIds.length, sites: campaign.targeting.siteIds.length })}
          </span>
        )}
      </div>

      <p className="text-[11px] text-advo-muted">
        {campaign.startsAt || campaign.endsAt
          ? `${campaign.startsAt ? formatDateTime(campaign.startsAt) : "—"} → ${campaign.endsAt ? formatDateTime(campaign.endsAt) : "—"}`
          : t("admin.campaigns.schedule.always")}
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--advo-border)] pt-3.5">
        <Button isDisabled={ended} onPress={() => onEdit(campaign)} size="sm" type="button" variant="primary">
          <Pencil className="size-3.5" />
          {t("admin.plans.action.edit")}
        </Button>
        {active ? (
          <Button onPress={() => onReason("pause", campaign)} size="sm" type="button" variant="outline">
            <Pause className="size-3.5" />
            {t("admin.campaigns.action.pause")}
          </Button>
        ) : (
          <Button isDisabled={ended} onPress={() => onReason("activate", campaign)} size="sm" type="button" variant="outline">
            <Play className="size-3.5" />
            {t("admin.campaigns.action.activate")}
          </Button>
        )}
        <Button className="ml-auto" isDisabled={ended} onPress={() => onReason("end", campaign)} size="sm" type="button" variant="danger-soft">
          <Square className="size-3.5" />
          {t("admin.campaigns.action.end")}
        </Button>
      </div>
    </Card>
  );
}

function CampaignFormModal({
  open,
  campaign,
  onClose,
  onSaved,
}: {
  open: boolean;
  campaign: AdCampaignView | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });
  const [done, setDone] = useState(false);
  const [placements, setPlacements] = useState<string[]>(campaign?.placements ?? ["ads.banner"]);
  const [theme, setTheme] = useState<AdTheme>(campaign?.creative.theme ?? "cafe");

  const save = useAction(async (form: HTMLFormElement) => {
    const v = formValues(form);
    const payload = {
      name: v.name,
      status: campaign ? campaign.status : v.status ?? "DRAFT",
      placements,
      creative: {
        business: v.business,
        title: v.title,
        description: v.description ?? "",
        cta: v.cta ?? "Learn more",
        theme,
        ...(v.imageUrl?.trim() ? { imageUrl: v.imageUrl.trim() } : {}),
        ...(v.phone?.trim() ? { phone: v.phone.trim() } : {}),
        ...(v.url?.trim() ? { url: v.url.trim() } : {}),
      },
      targeting: {
        resellerIds: splitIds(v.resellerIds),
        siteIds: splitIds(v.siteIds),
      },
      startsAt: v.startsAt ?? null,
      endsAt: v.endsAt ?? null,
    };
    if (campaign) {
      await api.put(`/admin/campaigns/${campaign.id}`, payload);
      await onSaved(t("admin.campaigns.form.successEdit"));
    } else {
      await api.post("/admin/campaigns", payload);
      await onSaved(t("admin.campaigns.form.successCreate"));
    }
    form.reset();
    setDone(true);
  });

  function close() {
    setDone(false);
    save.setError(null);
    onClose();
  }

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="bg-white">
            <Modal.Header>
              <Modal.Heading className="text-base font-black text-advo-text">
                {campaign ? t("admin.campaigns.form.titleEdit", { name: campaign.name }) : t("admin.campaigns.form.titleCreate")}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {done ? (
                <div className="space-y-4">
                  <Notice tone="success">{campaign ? t("admin.campaigns.form.successEdit") : t("admin.campaigns.form.successCreate")}</Notice>
                  <div className="flex justify-end border-t border-[var(--advo-border)] pt-4">
                    <Button onPress={close} type="button" variant="primary">
                      {t("admin.plans.form.done")}
                    </Button>
                  </div>
                </div>
              ) : (
                <form
                  className="space-y-5"
                  key={campaign?.id ?? "create"}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save.run(e.currentTarget);
                  }}
                >
                  <p className="text-xs text-advo-muted">{t("admin.campaigns.form.description")}</p>

                  <FormSection icon={<Megaphone />} title={t("admin.campaigns.form.section.campaign")}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field defaultValue={campaign?.name} label={t("admin.campaigns.form.name")} name="name" required />
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-advo-text">{t("admin.campaigns.form.status")}</span>
                        {campaign ? (
                          <p className="rounded-field border border-[var(--advo-border)] bg-advo-surface-soft/60 px-3.5 py-2.5 text-xs font-bold text-advo-text">
                            {t(STATUS_KEY[campaign.status])}
                          </p>
                        ) : (
                          <select className="w-full rounded-field border border-advo-border bg-advo-page px-3.5 py-2.5 text-xs font-bold text-advo-text" defaultValue="DRAFT" name="status">
                            <option value="DRAFT">{t("admin.campaigns.status.draft")}</option>
                            <option value="ACTIVE">{t("admin.campaigns.status.active")}</option>
                          </select>
                        )}
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="text-xs font-bold text-advo-text">{t("admin.campaigns.form.placements")}</span>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {PLACEMENTS.map((placement) => {
                          const checked = placements.includes(placement.id);
                          return (
                            <label
                              className={`flex cursor-pointer items-center gap-2 rounded-field border px-3 py-2 text-xs font-bold transition ${
                                checked ? "border-advo-violet bg-advo-violet-soft text-advo-violet" : "border-advo-border text-advo-muted"
                              }`}
                              key={placement.id}
                            >
                              <input
                                checked={checked}
                                className="h-4 w-4 accent-[var(--advo-violet)]"
                                onChange={(e) => setPlacements((prev) => (e.target.checked ? [...prev, placement.id] : prev.filter((p) => p !== placement.id)))}
                                type="checkbox"
                              />
                              {t(placement.labelKey)}
                            </label>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-[11px] text-advo-muted">{t("admin.campaigns.form.placementsHint")}</p>
                    </div>
                  </FormSection>

                  <FormSection icon={<Sparkles />} title={t("admin.campaigns.form.section.creative")}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field defaultValue={campaign?.creative.business} label={t("admin.campaigns.form.business")} name="business" required />
                      <Field defaultValue={campaign?.creative.title} label={t("admin.campaigns.form.headline")} name="title" required />
                    </div>
                    <div className="mt-4">
                      <Field defaultValue={campaign?.creative.description} label={t("admin.campaigns.form.body")} name="description" />
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Field defaultValue={campaign?.creative.imageUrl} label={t("admin.campaigns.form.imageUrl")} name="imageUrl" placeholder="https://example.com/banner.jpg" />
                      <Field defaultValue={campaign?.creative.phone} label={t("admin.campaigns.form.phone")} name="phone" placeholder="+255 712 345 678" />
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Field defaultValue={campaign?.creative.url} label={t("admin.campaigns.form.url")} name="url" placeholder="https://example.com/offer" />
                      <Field defaultValue={campaign?.creative.cta ?? "Learn more"} label={t("admin.campaigns.form.cta")} name="cta" />
                    </div>
                    <div className="mt-4 space-y-1">
                      <span className="text-xs font-bold text-advo-text">{t("admin.campaigns.form.theme")}</span>
                      <div className="flex gap-2">
                        {AD_THEMES.map((option) => (
                          <button
                            className={`h-10 flex-1 rounded-field border-2 transition ${theme === option ? "border-advo-violet" : "border-transparent"}`}
                            key={option}
                            onClick={() => setTheme(option)}
                            style={{ background: THEME_PREVIEW[option] }}
                            type="button"
                          >
                            <span className="text-[10px] font-bold text-white drop-shadow">{t(`admin.campaigns.theme.${option}`)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </FormSection>

                  <FormSection icon={<Search />} title={t("admin.campaigns.form.section.audience")}>
                    <p className="mb-3 text-[11px] text-advo-muted">{t("admin.campaigns.form.audienceHint")}</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field defaultValue={campaign?.targeting.resellerIds.join(", ")} label={t("admin.campaigns.form.resellerIds")} name="resellerIds" placeholder="uuid, uuid" />
                      <Field defaultValue={campaign?.targeting.siteIds.join(", ")} label={t("admin.campaigns.form.siteIds")} name="siteIds" placeholder="uuid, uuid" />
                    </div>
                  </FormSection>

                  <FormSection icon={<Megaphone />} title={t("admin.campaigns.form.section.schedule")}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field defaultValue={toLocalInput(campaign?.startsAt)} label={t("admin.campaigns.form.startsAt")} name="startsAt" type="datetime-local" />
                      <Field defaultValue={toLocalInput(campaign?.endsAt)} label={t("admin.campaigns.form.endsAt")} name="endsAt" type="datetime-local" />
                    </div>
                  </FormSection>

                  {save.error ? <Notice tone="danger">{save.error}</Notice> : null}

                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
                    <Button onPress={close} type="button" variant="ghost">
                      {t("admin.plans.form.cancel")}
                    </Button>
                    <Button isDisabled={save.pending || placements.length === 0} type="submit" variant="primary">
                      {campaign ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                      {save.pending ? "…" : campaign ? t("admin.plans.form.submitEdit") : t("admin.plans.form.submitCreate")}
                    </Button>
                  </div>
                </form>
              )}
            </Modal.Body>
            <Modal.CloseTrigger aria-label={t("admin.plans.form.cancel")} />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

/** A titled group of fields inside the campaign modal. */
function FormSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-[var(--advo-border)] p-4">
      <legend className="flex items-center gap-1.5 px-1.5 text-[10px] font-bold tracking-wider text-advo-muted uppercase">
        <span className="[&_svg]:size-3.5">{icon}</span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

/** Splits a comma/space separated id list, dropping blanks and duplicates. */
function splitIds(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean))];
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO Z string. */
function toLocalInput(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
