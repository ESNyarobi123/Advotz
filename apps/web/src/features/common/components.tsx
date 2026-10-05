"use client";

import type { ReactNode } from "react";
import { Button, Card, Input, Label, Skeleton, TextArea } from "@heroui/react";
import { AdvoSelect, Notice, SoftIcon, type IconTone } from "@advo/ui";
import { ApiError } from "@/lib/api";
import type { Resource } from "@/lib/hooks";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--advo-text)]">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-[var(--advo-muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Premium-light page banner.
 *
 * A white card that fades into a faint brand tint, with a large tinted icon,
 * an optional eyebrow, a row of status chips (`meta`) and page actions on the
 * right. It replaces the plain `PageHeader` on overview screens where the
 * header doubles as the page's identity.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  icon,
  iconTone = "accent",
  meta,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  iconTone?: IconTone;
  /** Status chips or small stats rendered under the description. */
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="relative mb-6 overflow-hidden rounded-card border border-[var(--advo-border)] bg-gradient-to-br from-white via-white to-[var(--advo-blue-soft)] shadow-advo-card">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,161,2,0.25),transparent_70%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 left-1/3 size-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(27,94,164,0.18),transparent_70%)]"
      />
      <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {icon ? (
            <SoftIcon size="lg" tone={iconTone}>
              {icon}
            </SoftIcon>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[11px] font-bold tracking-[0.14em] text-advo-muted uppercase">{eyebrow}</p>
            ) : null}
            <h1 className="mt-1 text-2xl font-black tracking-tight text-advo-text sm:text-[28px]">{title}</h1>
            {description ? <p className="mt-1.5 max-w-2xl text-sm text-advo-muted">{description}</p> : null}
            {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}

/** Section heading with an optional tinted icon, description and trailing action. */
export function SectionHeader({
  title,
  description,
  icon,
  iconTone = "accent",
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  iconTone?: IconTone;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <SoftIcon size="sm" tone={iconTone}>
            {icon}
          </SoftIcon>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-advo-text">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-advo-muted">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Renders loading, permission-denied, failure and stale states around a resource. */
export function ResourceView<T>({ resource, children }: { resource: Resource<T>; children: (data: T) => ReactNode }) {
  const { data, error, loading, reload } = resource;
  if (error && !data) {
    const denied = error instanceof ApiError && (error.status === 403 || error.status === 401);
    return (
      <Notice tone="danger">
        {denied ? "You do not have permission to view this." : error.message}{" "}
        {!denied ? (
          <button type="button" className="font-semibold underline" onClick={() => void reload()}>
            Try again
          </button>
        ) : null}
      </Notice>
    );
  }
  if (loading && data === undefined)
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  if (data === undefined) return null;
  return (
    <div className={loading ? "opacity-70 transition-opacity" : undefined}>
      {error ? (
        <div className="mb-3">
          <Notice tone="warning">Showing earlier data — refresh failed: {error.message}</Notice>
        </div>
      ) : null}
      {children(data)}
    </div>
  );
}

type FieldProps = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  placeholder?: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  pattern?: string;
  /** Id of a `<datalist>` rendered next to the field for suggestions. */
  list?: string;
};

export function Field({ name, label, hint, ...props }: FieldProps) {
  const id = `f-${name}`;
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {props.required ? <span className="text-[var(--advo-danger)]"> *</span> : null}
      </Label>
      <Input id={id} name={name} {...props} />
      {hint ? <p className="mt-1 text-xs text-[var(--advo-muted)]">{hint}</p> : null}
    </div>
  );
}

export function SelectField({
  name,
  label,
  options,
  required,
  defaultValue,
  multiple,
}: {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  defaultValue?: string;
  multiple?: boolean;
}) {
  const id = `f-${name}`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <AdvoSelect id={id} name={name} required={required} defaultValue={defaultValue} multiple={multiple}>
        {!required && !multiple ? <option value="">—</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </AdvoSelect>
    </div>
  );
}

export function TextareaField({ name, label, required, rows = 3 }: { name: string; label: string; required?: boolean; rows?: number }) {
  const id = `f-${name}`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <TextArea id={id} name={name} required={required} rows={rows} />
    </div>
  );
}

export function CheckboxField({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="h-4 w-4" />
      {label}
    </label>
  );
}

/** A card-wrapped form that disables its submit button while pending and shows inline results. */
export function FormCard({
  title,
  description,
  onSubmit,
  pending,
  error,
  success,
  submitLabel,
  children,
}: {
  title: string;
  description?: ReactNode;
  onSubmit: (form: HTMLFormElement) => void;
  pending: boolean;
  error: string | null;
  success?: ReactNode;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <Card className="mb-6">
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="mt-1 text-sm text-[var(--advo-muted)]">{description}</p> : null}
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(e.currentTarget);
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">{children}</div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {success ? <Notice tone="success">{success}</Notice> : null}
        <Button variant="primary" type="submit" isDisabled={pending}>
          {pending ? "Working…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}

export function InlineError({ error }: { error: string | null }) {
  return error ? <p className="mt-1 text-xs text-[var(--advo-danger)]">{error}</p> : null;
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{children}</code>;
}
