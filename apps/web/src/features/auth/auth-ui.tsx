"use client";

/**
 * Shared building blocks for the login and registration screens.
 *
 * The auth pages used to repeat the same field, label, icon and OTP markup in
 * five places, with three different input focus styles. These components are
 * the single source of truth so the sign-in and sign-up surfaces behave and
 * feel like one product.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cx } from "@/features/marketing/ui";

export const fieldBase =
  "w-full rounded-field border bg-advo-page px-3.5 py-3 text-sm text-advo-text outline-none transition placeholder:text-advo-muted focus:bg-white focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60";
export const fieldIdle = "border-advo-border focus:border-advo-gold/60 focus:ring-advo-gold/25";
export const fieldInvalid = "border-[#d94a4a] bg-[#fdf3f3] focus:border-[#d94a4a] focus:ring-[#d94a4a]/15";
export const labelClass =
  "mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-advo-text uppercase";
export const linkAccent =
  "font-bold text-[#b15f00] underline underline-offset-2 transition hover:text-advo-orange";

/* ── Card ───────────────────────────────────────────────────────────────── */

/** The white auth card: gold hairline, warm glow, one consistent radius. */
export function AuthCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-card border border-advo-border bg-white p-6 shadow-advo-card sm:p-8",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#fba102_0%,#f16304_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 size-52 rounded-full bg-[radial-gradient(circle,rgba(251,161,2,0.12),transparent_70%)] blur-2xl"
      />
      <div className="relative">{children}</div>
    </div>
  );
}

/* ── Text field ─────────────────────────────────────────────────────────── */

export function Field({
  id,
  label,
  hint,
  error,
  icon,
  trailing,
  action,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label className={cx(labelClass, "mb-0")} htmlFor={id}>
          {label}
        </label>
        {action}
      </div>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
            {icon}
          </span>
        ) : null}
        {children}
        {trailing ? (
          <span className="absolute inset-y-0 right-0 flex items-center pr-3.5">{trailing}</span>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1.5 flex items-start gap-1 text-[11px] font-semibold text-[#b3261e]">
          <span aria-hidden="true">•</span>
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-advo-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  type = "text",
  icon,
  placeholder,
  autoComplete,
  invalid,
  withIcon,
  className,
  ...rest
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  icon?: React.ReactNode;
  placeholder?: string;
  autoComplete?: string;
  invalid?: boolean;
  withIcon?: boolean;
  className?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "id" | "value" | "onChange" | "type" | "placeholder" | "autoComplete" | "className"
>) {
  return (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      type={type}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className={cx(
        fieldBase,
        invalid ? fieldInvalid : fieldIdle,
        icon || withIcon ? "pl-11" : undefined,
        className,
      )}
      {...rest}
    />
  );
}

/** Password input with the reveal toggle the rest of the product uses. */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete = "new-password",
  invalid,
  onEnter,
  placeholder = "••••••••••",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  invalid?: boolean;
  onEnter?: () => void;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={cx(fieldBase, invalid ? fieldInvalid : fieldIdle, "pl-11 pr-11")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) onEnter();
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-advo-muted">
        <ShieldCheck className="size-4" aria-hidden="true" />
      </span>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t("auth.password.hide") : t("auth.password.show")}
        className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-advo-muted transition hover:text-advo-text"
      >
        {shown ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </>
  );
}

/* ── Password strength ──────────────────────────────────────────────────── */

/** Four checks, one bar. The API only requires 10 characters, so the rest are advice. */
export function PasswordStrength({ value }: { value: string }) {
  const { t } = useI18n();
  const rules = [
    { key: "length", ok: value.length >= 10, label: t("auth.password.rule.length") },
    { key: "mix", ok: /[a-z]/i.test(value) && /\d/.test(value), label: t("auth.password.rule.mix") },
    {
      key: "case",
      ok: /[a-z]/.test(value) && /[A-Z]/.test(value),
      label: t("auth.password.rule.case"),
    },
    { key: "symbol", ok: /[^A-Za-z0-9]/.test(value), label: t("auth.password.rule.symbol") },
  ];
  const score = rules.filter((rule) => rule.ok).length;
  const level =
    value.length === 0
      ? null
      : score <= 1
        ? "weak"
        : score === 2
          ? "fair"
          : score === 3
            ? "good"
            : "strong";
  const barTone =
    level === "weak"
      ? "bg-[#d94a4a]"
      : level === "fair"
        ? "bg-[#e08f02]"
        : level === "good"
          ? "bg-[#4d9c5b]"
          : "bg-[#166534]";

  return (
    <div className="space-y-2 pt-1" aria-live="polite">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cx(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              i < score ? barTone : "bg-advo-track",
            )}
          />
        ))}
        {level ? (
          <span className="ml-1 text-[10px] font-bold text-advo-muted">
            {t(`auth.password.level.${level}` as const)}
          </span>
        ) : null}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {rules.map((rule) => (
          <li
            key={rule.key}
            className={cx(
              "flex items-center gap-1.5 text-[10px] leading-tight",
              rule.ok ? "font-semibold text-[#166534]" : "text-advo-muted",
            )}
          >
            <span
              className={cx(
                "flex size-3 items-center justify-center rounded-full",
                rule.ok ? "bg-[#e7f6ee]" : "bg-advo-surface-soft",
              )}
            >
              {rule.ok ? <Check className="size-2" aria-hidden="true" /> : <span className="size-1 rounded-full bg-advo-muted/50" />}
            </span>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── OTP ────────────────────────────────────────────────────────────────── */

const toCells = (value: string, length: number) =>
  Array.from({ length }, (_, i) => value.replace(/\D/g, "")[i] ?? "");

/**
 * Six separate boxes instead of one wide input.
 *
 * Each box holds one digit, typing advances, backspace goes back, arrows move
 * and a pasted code fills the row from the focused box. The whole code is
 * reported upward as a single string, so callers keep their existing shape.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  length = 6,
  label,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  length?: number;
  label: string;
  invalid?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [cells, setCells] = useState<string[]>(() => toCells(value, length));

  // Keep the boxes in step when the parent clears or reseeds the value.
  useEffect(() => {
    if (cells.join("") !== value.replace(/\D/g, "").slice(0, length)) {
      setCells(toCells(value, length));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, length]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function publish(next: string[]) {
    const joined = next.join("");
    setCells(next);
    onChange(joined);
    if (joined.length === length) onComplete?.(joined);
  }

  function write(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      const next = [...cells];
      next[index] = "";
      publish(next);
      return;
    }
    const next = [...cells];
    let cursor = index;
    for (const digit of digits) {
      if (cursor >= length) break;
      next[cursor] = digit;
      cursor += 1;
    }
    publish(next);
    refs.current[Math.min(cursor, length - 1)]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      if (cells[index]) {
        const next = [...cells];
        next[index] = "";
        publish(next);
      } else if (index > 0) {
        const next = [...cells];
        next[index - 1] = "";
        publish(next);
        refs.current[index - 1]?.focus();
      }
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
      event.preventDefault();
    }
    if (event.key === "ArrowRight" && index < length - 1) {
      refs.current[index + 1]?.focus();
      event.preventDefault();
    }
  }

  const filled = cells.filter(Boolean).length;

  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center justify-between gap-1.5 sm:gap-2"
      onPaste={(event) => {
        const text = event.clipboardData.getData("text").replace(/\D/g, "");
        if (!text) return;
        event.preventDefault();
        publish(toCells(text.slice(0, length), length));
        refs.current[Math.min(text.length, length - 1)]?.focus();
      }}
    >
      {cells.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          aria-label={`${label} ${index + 1}`}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          disabled={disabled}
          inputMode="numeric"
          maxLength={1}
          pattern="\d*"
          value={digit}
          className={cx(
            "h-12 w-full min-w-0 rounded-xl border text-center font-mono text-lg font-black text-advo-text outline-none transition",
            "focus:border-advo-gold focus:bg-white focus:ring-2 focus:ring-advo-gold/25",
            invalid
              ? "border-[#d94a4a] bg-[#fdf3f3]"
              : digit
                ? "border-advo-gold/50 bg-white shadow-xs"
                : "border-advo-border bg-advo-page",
          )}
          onChange={(event) => write(index, event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => handleKeyDown(index, event)}
        />
      ))}
      <span className="sr-only" aria-live="polite">
        {filled}/{length}
      </span>
    </div>
  );
}

/* ── Steps ──────────────────────────────────────────────────────────────── */

/**
 * Segmented progress, not a connected line: the segments survive a 320px
 * screen, read at a glance, and let a completed step be clicked to go back.
 */
export function StepRail({
  steps,
  current,
  onSelect,
  hint,
}: {
  steps: Array<{ label: string }>;
  current: number;
  onSelect?: (step: number) => void;
  hint?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-black tracking-[0.16em] text-[#b15f00] uppercase">
          {t("auth.stepper.position", { current, total: steps.length })}
        </span>
        {hint ? (
          <span className="truncate text-[10px] font-semibold text-advo-muted">{hint}</span>
        ) : null}
      </div>
      <div className="flex gap-1.5">
        {steps.map((step, index) => {
          const number = index + 1;
          const done = number < current;
          const active = number === current;
          const clickable = done && onSelect;
          return (
            <button
              key={step.label}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelect?.(number)}
              aria-current={active ? "step" : undefined}
              aria-label={`${number}. ${step.label}`}
              title={step.label}
              className={cx(
                "group flex-1",
                clickable ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span
                className={cx(
                  "block h-1.5 rounded-full transition-all duration-300",
                  active
                    ? "bg-[linear-gradient(90deg,#fba102_0%,#f16304_100%)] shadow-[0_2px_8px_-2px_rgba(241,99,4,0.6)]"
                    : done
                      ? "bg-[linear-gradient(90deg,#fba102_0%,#f16304_100%)]"
                      : "bg-advo-track",
                )}
              />
              <span
                className={cx(
                  "mt-1.5 hidden truncate text-[10px] font-bold transition sm:block",
                  active ? "text-[#b15f00]" : done ? "text-advo-text" : "text-advo-muted",
                )}
              >
                {step.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


/* ── Small chrome ───────────────────────────────────────────────────────── */

/** Row of reassurance chips under a primary action. */
export function TrustRow({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[10px] font-semibold text-advo-muted">
      {items.map((item) => (
        <li key={item} className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3 text-emerald-600" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Mirrors the API's `slugifyBusinessName` base, minus the random suffix. */
export function slugPreview(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base;
}

export function useSlugPreview(name: string) {
  const debounced = useDebounced(name, 200);
  return useMemo(() => slugPreview(debounced), [debounced]);
}
