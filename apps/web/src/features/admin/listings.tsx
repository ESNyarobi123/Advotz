"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Label, Modal, useOverlayState } from "@heroui/react";
import { Notice } from "@advo/ui";
import { Briefcase, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Field, PageHero, ResourceView, SelectField } from "@/features/common/components";
import { ActionButton } from "@/features/common/actions";
import { api } from "@/lib/api";
import { formValues, toInt, useAction, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

/**
 * Row shape returned by `GET /admin/listings`.
 *
 * Jobs and opportunities are a platform-wide feed shown to guests on the
 * connected captive-portal page. Only Active rows reach the portal.
 */
type ListingRow = {
  id: string;
  kind: "JOB" | "OPPORTUNITY";
  title: string;
  organization: string;
  location: string;
  employmentType: string;
  summary: string;
  description: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const KIND_OPTIONS = [
  { value: "JOB", labelKey: "admin.listings.kind.JOB" },
  { value: "OPPORTUNITY", labelKey: "admin.listings.kind.OPPORTUNITY" },
] as const;

export function AdminListingsScreen() {
  const { t } = useI18n();
  const listings = useResource<ListingRow[]>("/admin/listings");
  const [filter, setFilter] = useState<"ALL" | "JOB" | "OPPORTUNITY">("ALL");
  const [editing, setEditing] = useState<ListingRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const rows = useMemo(() => {
    const all = listings.data ?? [];
    return filter === "ALL" ? all : all.filter((row) => row.kind === filter);
  }, [listings.data, filter]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row: ListingRow) {
    setEditing(row);
    setFormOpen(true);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHero
        actions={
          <Button onPress={openCreate} type="button" variant="primary">
            <Plus className="size-3.5" />
            {t("admin.listings.new")}
          </Button>
        }
        description={t("admin.listings.subtitle")}
        eyebrow={t("admin.listings.badge")}
        icon={<Briefcase />}
        iconTone="accent"
        title={t("admin.listings.title")}
      />

      <div className="inline-flex items-center gap-0.5 rounded-xl border border-[var(--advo-border)] bg-white p-0.5">
        {(["ALL", "JOB", "OPPORTUNITY"] as const).map((id) => {
          const active = filter === id;
          const label = id === "ALL" ? t("admin.listings.filter.all") : t(`admin.listings.kind.${id}` as "admin.listings.kind.JOB");
          return (
            <button
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                active ? "bg-advo-blue text-white shadow-xs" : "text-advo-muted hover:text-advo-text"
              }`}
              key={id}
              onClick={() => setFilter(id)}
              type="button"
            >
              {label}
            </button>
          );
        })}
      </div>

      <ResourceView resource={listings}>
        {() =>
          rows.length === 0 ? (
            <Card className="p-8 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-advo-blue/10 text-advo-blue">
                <Briefcase className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm text-advo-muted">{t("admin.listings.empty")}</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <Card className="flex flex-wrap items-start justify-between gap-3 p-4" key={row.id}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          row.kind === "JOB" ? "bg-advo-blue/10 text-advo-blue" : "bg-advo-gold/15 text-amber-700"
                        }`}
                      >
                        {t(`admin.listings.kind.${row.kind}` as "admin.listings.kind.JOB")}
                      </span>
                      {!row.active ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-advo-muted">
                          {t("admin.listings.visible.no")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-sm font-bold text-advo-text">{row.title}</p>
                    {row.organization ? <p className="text-xs text-advo-muted">{row.organization}</p> : null}
                    {row.location ? (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-advo-muted">
                        <MapPin className="h-3 w-3" />
                        {row.location}
                      </p>
                    ) : null}
                    {row.summary ? <p className="mt-1 max-w-xl text-xs text-advo-muted">{row.summary}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button onPress={() => openEdit(row)} size="sm" type="button" variant="outline">
                      <Pencil className="size-3.5" />
                      {t("admin.listings.edit")}
                    </Button>
                    <ActionButton
                      confirm={t("admin.listings.confirmDelete")}
                      onDone={() => listings.reload()}
                      onRun={() => api.del(`/admin/listings/${row.id}`)}
                      variant="danger"
                    >
                      <Trash2 className="size-3.5" />
                      {t("admin.listings.delete")}
                    </ActionButton>
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </ResourceView>

      <ListingFormModal
        listing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => listings.reload()}
        open={formOpen}
      />
    </div>
  );
}

function ListingFormModal({
  open,
  listing,
  onClose,
  onSaved,
}: {
  open: boolean;
  listing: ListingRow | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });
  const [done, setDone] = useState(false);

  const save = useAction(async (form: HTMLFormElement) => {
    const v = formValues(form);
    const payload = {
      kind: v.kind === "OPPORTUNITY" ? "OPPORTUNITY" : "JOB",
      title: v.title ?? "",
      organization: v.organization ?? "",
      location: v.location ?? "",
      employmentType: v.employmentType ?? "",
      summary: v.summary ?? "",
      description: v.description ?? "",
      sortOrder: toInt(v.sortOrder) ?? 0,
      active: v.active === "on",
    };
    if (listing) await api.put(`/admin/listings/${listing.id}`, payload);
    else await api.post("/admin/listings", payload);
    form.reset();
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

  const kindOptions = KIND_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }));

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="bg-white">
            <Modal.Header>
              <Modal.Heading className="text-base font-black text-advo-text">
                {listing ? t("admin.listings.edit") : t("admin.listings.new")}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {done ? (
                <div className="space-y-4">
                  <Notice tone="success">{t("admin.listings.saved")}</Notice>
                  <div className="flex justify-end border-t border-[var(--advo-border)] pt-4">
                    <Button onPress={close} type="button" variant="primary">
                      {t("common.close")}
                    </Button>
                  </div>
                </div>
              ) : (
                <form
                  className="space-y-4"
                  key={listing?.id ?? "create"}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save.run(event.currentTarget);
                  }}
                >
                  <p className="text-xs text-advo-muted">{t("admin.listings.formHint")}</p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectField
                      defaultValue={listing?.kind ?? "JOB"}
                      label={t("admin.listings.kind")}
                      name="kind"
                      options={kindOptions}
                      required
                    />
                    <Field
                      defaultValue={listing?.sortOrder ?? 0}
                      label={t("admin.listings.sortOrder")}
                      min={0}
                      name="sortOrder"
                      type="number"
                    />
                  </div>

                  <Field defaultValue={listing?.title} label={t("admin.listings.titleField")} name="title" required />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field defaultValue={listing?.organization} label={t("admin.listings.organization")} name="organization" />
                    <Field defaultValue={listing?.location} label={t("admin.listings.location")} name="location" />
                  </div>
                  <Field
                    defaultValue={listing?.employmentType}
                    label={t("admin.listings.employmentType")}
                    name="employmentType"
                    placeholder={t("admin.listings.employmentTypePlaceholder")}
                  />

                  <div>
                    <Label htmlFor="f-summary">{t("admin.listings.summary")}</Label>
                    <textarea
                      className="w-full rounded-field border border-[var(--advo-border)] bg-white px-3 py-2 text-sm focus:border-advo-blue focus:outline-none"
                      defaultValue={listing?.summary}
                      id="f-summary"
                      maxLength={300}
                      name="summary"
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="f-description">{t("admin.listings.description")}</Label>
                    <textarea
                      className="w-full rounded-field border border-[var(--advo-border)] bg-white px-3 py-2 text-sm focus:border-advo-blue focus:outline-none"
                      defaultValue={listing?.description}
                      id="f-description"
                      maxLength={2000}
                      name="description"
                      rows={4}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm font-bold text-advo-text">
                    <input className="accent-advo-blue" defaultChecked={listing?.active ?? true} name="active" type="checkbox" />
                    {t("admin.listings.active")}
                  </label>

                  {save.error ? <Notice tone="danger">{save.error}</Notice> : null}

                  <div className="flex items-center justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
                    <Button onPress={close} type="button" variant="outline">
                      {t("admin.listings.cancel")}
                    </Button>
                    <Button isDisabled={save.pending} type="submit" variant="primary">
                      {save.pending ? t("admin.listings.saving") : t("admin.listings.save")}
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
