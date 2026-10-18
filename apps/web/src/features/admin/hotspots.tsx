"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Label, Modal, useOverlayState } from "@heroui/react";
import { Notice } from "@advo/ui";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Field, PageHero, ResourceView } from "@/features/common/components";
import { ActionButton } from "@/features/common/actions";
import { api } from "@/lib/api";
import { formValues, toInt, useAction, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

/**
 * Row shape returned by `GET /admin/hotspots`.
 * Only `active` rows appear on the public marketing map.
 */
type HotspotRow = {
  id: string;
  name: string;
  address: string;
  city: string;
  region: string;
  latitude: number;
  longitude: number;
  category: string;
  description: string;
  imageUrl: string | null;
  portalSlug: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export function AdminHotspotsScreen() {
  const { t } = useI18n();
  const hotspots = useResource<HotspotRow[]>("/admin/hotspots");
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "HIDDEN">("ALL");
  const [editing, setEditing] = useState<HotspotRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const rows = useMemo(() => {
    const all = hotspots.data ?? [];
    if (filter === "ACTIVE") return all.filter((row) => row.active);
    if (filter === "HIDDEN") return all.filter((row) => !row.active);
    return all;
  }, [hotspots.data, filter]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row: HotspotRow) {
    setEditing(row);
    setFormOpen(true);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHero
        actions={
          <Button onPress={openCreate} type="button" variant="primary">
            <Plus className="size-3.5" />
            {t("admin.hotspots.new")}
          </Button>
        }
        description={t("admin.hotspots.subtitle")}
        eyebrow={t("admin.hotspots.badge")}
        icon={<MapPin />}
        iconTone="accent"
        title={t("admin.hotspots.title")}
      />

      <div className="inline-flex items-center gap-0.5 rounded-xl border border-[var(--advo-border)] bg-white p-0.5">
        {(
          [
            ["ALL", "admin.hotspots.filter.all"],
            ["ACTIVE", "admin.hotspots.filter.active"],
            ["HIDDEN", "admin.hotspots.filter.hidden"],
          ] as const
        ).map(([id, labelKey]) => {
          const active = filter === id;
          return (
            <button
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                active ? "bg-advo-blue text-white shadow-xs" : "text-advo-muted hover:text-advo-text"
              }`}
              key={id}
              onClick={() => setFilter(id)}
              type="button"
            >
              {t(labelKey)}
            </button>
          );
        })}
      </div>

      <ResourceView resource={hotspots}>
        {() =>
          rows.length === 0 ? (
            <Card className="p-8 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-advo-blue/10 text-advo-blue">
                <MapPin className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm text-advo-muted">{t("admin.hotspots.empty")}</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <Card className="flex flex-wrap items-start justify-between gap-3 p-4" key={row.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.category ? (
                        <span className="rounded-full bg-advo-blue/10 px-2 py-0.5 text-[10px] font-bold text-advo-blue">
                          {row.category}
                        </span>
                      ) : null}
                      {!row.active ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-advo-muted">
                          {t("admin.hotspots.visible.no")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          {t("admin.hotspots.visible.yes")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm font-bold text-advo-text">{row.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-advo-muted">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {[row.address, row.city, row.region].filter(Boolean).join(", ") ||
                        `${row.latitude.toFixed(4)}, ${row.longitude.toFixed(4)}`}
                    </p>
                    {row.description ? (
                      <p className="mt-1 max-w-xl text-xs text-advo-muted line-clamp-2">{row.description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button onPress={() => openEdit(row)} size="sm" type="button" variant="outline">
                      <Pencil className="size-3.5" />
                      {t("admin.hotspots.edit")}
                    </Button>
                    <ActionButton
                      confirm={t("admin.hotspots.confirmDelete")}
                      onDone={() => hotspots.reload()}
                      onRun={() => api.del(`/admin/hotspots/${row.id}`)}
                      variant="danger"
                    >
                      <Trash2 className="size-3.5" />
                      {t("admin.hotspots.delete")}
                    </ActionButton>
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </ResourceView>

      <HotspotFormModal
        hotspot={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => hotspots.reload()}
        open={formOpen}
      />
    </div>
  );
}

function HotspotFormModal({
  open,
  hotspot,
  onClose,
  onSaved,
}: {
  open: boolean;
  hotspot: HotspotRow | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });
  const [done, setDone] = useState(false);

  const save = useAction(async (form: HTMLFormElement) => {
    const v = formValues(form);
    const payload = {
      name: v.name ?? "",
      address: v.address ?? "",
      city: v.city ?? "",
      region: v.region ?? "",
      latitude: Number(v.latitude),
      longitude: Number(v.longitude),
      category: v.category ?? "",
      description: v.description ?? "",
      imageUrl: v.imageUrl || null,
      portalSlug: v.portalSlug || null,
      sortOrder: toInt(v.sortOrder) ?? 0,
      active: v.active === "on",
    };
    if (hotspot) await api.put(`/admin/hotspots/${hotspot.id}`, payload);
    else await api.post("/admin/hotspots", payload);
    form.reset();
    await onSaved();
    setDone(true);
  });

  useEffect(() => {
    if (open) {
      setDone(false);
      save.setError(null);
    }
  }, [open, save.setError]);

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
                {hotspot ? t("admin.hotspots.edit") : t("admin.hotspots.new")}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {done ? (
                <div className="space-y-4">
                  <Notice tone="success">{t("admin.hotspots.saved")}</Notice>
                  <div className="flex justify-end border-t border-[var(--advo-border)] pt-4">
                    <Button onPress={close} type="button" variant="primary">
                      {t("common.close")}
                    </Button>
                  </div>
                </div>
              ) : (
                <form
                  className="space-y-4"
                  key={hotspot?.id ?? "create"}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save.run(event.currentTarget);
                  }}
                >
                  <p className="text-xs text-advo-muted">{t("admin.hotspots.formHint")}</p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field defaultValue={hotspot?.name} label={t("admin.hotspots.name")} name="name" required />
                    <Field
                      defaultValue={hotspot?.category}
                      label={t("admin.hotspots.category")}
                      name="category"
                      placeholder={t("admin.hotspots.categoryPlaceholder")}
                    />
                  </div>

                  <Field defaultValue={hotspot?.address} label={t("admin.hotspots.address")} name="address" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field defaultValue={hotspot?.city} label={t("admin.hotspots.city")} name="city" />
                    <Field defaultValue={hotspot?.region} label={t("admin.hotspots.region")} name="region" />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field
                      defaultValue={hotspot?.latitude ?? -6.7924}
                      label={t("admin.hotspots.latitude")}
                      name="latitude"
                      required
                      step={0.000001}
                      type="number"
                    />
                    <Field
                      defaultValue={hotspot?.longitude ?? 39.2083}
                      label={t("admin.hotspots.longitude")}
                      name="longitude"
                      required
                      step={0.000001}
                      type="number"
                    />
                    <Field
                      defaultValue={hotspot?.sortOrder ?? 0}
                      label={t("admin.hotspots.sortOrder")}
                      min={0}
                      name="sortOrder"
                      type="number"
                    />
                  </div>

                  <div>
                    <Label htmlFor="f-hotspot-description">{t("admin.hotspots.description")}</Label>
                    <textarea
                      className="w-full rounded-field border border-[var(--advo-border)] bg-white px-3 py-2 text-sm focus:border-advo-blue focus:outline-none"
                      defaultValue={hotspot?.description}
                      id="f-hotspot-description"
                      maxLength={2000}
                      name="description"
                      rows={3}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      defaultValue={hotspot?.imageUrl ?? ""}
                      label={t("admin.hotspots.imageUrl")}
                      name="imageUrl"
                      placeholder="https://"
                    />
                    <Field
                      defaultValue={hotspot?.portalSlug ?? ""}
                      label={t("admin.hotspots.portalSlug")}
                      name="portalSlug"
                      placeholder={t("admin.hotspots.portalSlugPlaceholder")}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm font-bold text-advo-text">
                    <input className="accent-advo-blue" defaultChecked={hotspot?.active ?? true} name="active" type="checkbox" />
                    {t("admin.hotspots.active")}
                  </label>

                  {save.error ? <Notice tone="danger">{save.error}</Notice> : null}

                  <div className="flex items-center justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
                    <Button onPress={close} type="button" variant="outline">
                      {t("admin.hotspots.cancel")}
                    </Button>
                    <Button isDisabled={save.pending} type="submit" variant="primary">
                      {save.pending ? t("admin.hotspots.saving") : t("admin.hotspots.save")}
                    </Button>
                  </div>
                </form>
              )}
            </Modal.Body>
            <Modal.CloseTrigger aria-label={t("common.close")} />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
