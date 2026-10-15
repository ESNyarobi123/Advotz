import Link from "next/link";
import { Check, CheckCircle2, Sparkles, ShieldOff } from "lucide-react";
import type { PublicPlan } from "@advo/contracts";
import type { Translator } from "@advo/i18n";
import { ButtonLink, cx } from "@/features/marketing/ui";

/** `null` is unlimited — rendering a bare `null` would read as "none allowed". */
function capacityLabel(value: number | null, t: Translator): string {
  return value === null ? t("marketing.plans.unlimited") : String(value);
}

/** Prices are integer TZS; grouping is what makes five figures readable. */
function formatTzs(priceTzs: string): string {
  return Number(priceTzs).toLocaleString("en-US");
}

/**
 * The selling points a plan card names, in the order an operator weighs them.
 *
 * Every line is read off a flag the guest portal actually obeys, so a card can
 * never advertise a capability the plan does not grant. Wording comes from the
 * translator, which is why the API sends flags rather than prose.
 */
function sellingPoints(plan: PublicPlan, t: Translator): string[] {
  const lines: string[] = [t(`marketing.plans.ads.${plan.advertising}`)];

  if (plan.flags.colorsEdit) lines.push(t("marketing.plans.colors"));
  if (plan.flags.badgeRemovable) lines.push(t("marketing.plans.badgeRemovable"));
  if (plan.flags.voucher) lines.push(t("marketing.plans.voucher"));
  if (plan.flags.orderEdit) lines.push(t("marketing.plans.orderEdit"));
  lines.push(t("marketing.plans.cardStyles", { count: plan.flags.cardStyles.length }));
  if (plan.capacity.sites === null && plan.capacity.devices === null) {
    lines.push(t("marketing.plans.unlimitedSites"));
  }

  return lines;
}

/** One occupancy tile. Values are the whole point, so they lead. */
function CapacityTile({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-2xl border px-2 py-2.5 text-center",
        dark ? "border-white/10 bg-white/5" : "border-advo-border bg-advo-surface-soft/60",
      )}
    >
      <p className={cx("truncate text-sm font-black tracking-tight tabular-nums", dark ? "text-white" : "text-advo-text")}>
        {value}
      </p>
      <p className={cx("mt-0.5 text-[10px] font-semibold", dark ? "text-white/55" : "text-advo-muted")}>{label}</p>
    </div>
  );
}

/** The shadow on the highlighted tier — gold, matching the brand button. */
const POPULAR_LIFT = "0 24px 48px -24px rgba(241,99,4,0.55)";

/**
 * Home pricing cards follow the warm showcase: 28px corners, a pill button
 * under the price, and the popular tier filled with the brand gold.
 */
const SHOWCASE_RADIUS = "rounded-[28px]";

/**
 * One plan, rendered as a pricing card.
 *
 * `popular` lifts the card and adds the badge; it is passed in rather than
 * decided here so the grid can pick the tier only once for the whole list.
 *
 * The card is a plain `div` rather than the shared `Card`, on purpose. `Card`
 * bakes its tone's border colour and shadow into the same class list this
 * component would then override, and two `border-*`/`shadow-*` utilities on one
 * element cannot be ordered by the class attribute — Tailwind emits them in its
 * own order, so the override silently lost the cascade (measured: every card,
 * popular included, kept the neutral border and the default shadow). Owning the
 * whole class list means exactly one border colour is ever present, and the lift
 * shadow is an inline style, which always wins.
 */
export function PlanCard({
  plan,
  t,
  popular = false,
  featured = false,
  dark = false,
  ctaHref,
  ctaLabel,
}: {
  plan: PublicPlan;
  t: Translator;
  popular?: boolean;
  /** Tighter emphasis for the single-plan layout, where there is nothing to lift above. */
  featured?: boolean;
  /** Warm showcase cards on the home pricing band. The pricing page stays light. */
  dark?: boolean;
  ctaHref: string;
  ctaLabel?: string;
}) {
  const points = sellingPoints(plan, t);
  const period =
    plan.periodDays === 30
      ? t("marketing.plans.perMonth")
      : t("marketing.plans.perPeriod", { days: plan.periodDays });

  if (dark) {
    const included = [
      `${capacityLabel(plan.capacity.sites, t)} ${t("marketing.plans.sites")}`,
      `${capacityLabel(plan.capacity.devices, t)} ${t("marketing.plans.devices")}`,
      `${capacityLabel(plan.capacity.packagesPerSite, t)} ${t("marketing.plans.packages")}`,
      ...points,
    ];
    if (plan.trialDays) {
      included.unshift(t("marketing.plans.trial", { days: plan.trialDays }));
    }
    if (plan.isDemo) included.unshift(t("marketing.plans.demo"));
    if (plan.commercialPromise === "ad_free") included.unshift(t("marketing.plans.adFree"));

    return (
      <div
        className={cx(
          "relative flex h-full w-full flex-col p-6 text-[#241C12] sm:p-7",
          SHOWCASE_RADIUS,
          popular
            ? "bg-[linear-gradient(180deg,#FBA102_0%,#F8D56A_42%,#FFF6D8_100%)] shadow-[0_22px_44px_-28px_rgba(251,161,2,0.85)]"
            : "bg-[#FBF6EE] shadow-[0_22px_44px_-30px_rgba(0,0,0,0.65)]",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold tracking-tight">{plan.name}</h3>
          {popular ? (
            <span className="shrink-0 rounded-full bg-[#FBF6EE] px-2.5 py-1 text-[10px] font-bold tracking-wide text-[#241C12] uppercase">
              {t("marketing.pricing.popular")}
            </span>
          ) : null}
        </div>

        <p className="mt-2 line-clamp-3 min-h-[3.75rem] text-sm leading-relaxed text-[#241C12]/70">
          {plan.description}
        </p>

        <div className="mt-5">
          <div className="text-[2.35rem] leading-none font-black tracking-tight tabular-nums sm:text-5xl">
            TZS {formatTzs(plan.priceTzs)}
          </div>
          <p className="mt-2 text-sm text-[#241C12]/55">{period}</p>
        </div>

        <Link
          href={ctaHref}
          className={cx(
            "mt-5 inline-flex h-12 w-full items-center justify-center rounded-full px-5 text-sm font-bold transition duration-200 hover:brightness-105",
            popular
              ? "bg-[#241C12] text-[#FFF8EA] shadow-[0_12px_24px_-14px_rgba(36,28,18,0.75)]"
              : "bg-[#EFE6D8] text-[#241C12] hover:bg-[#E6DCCB]",
          )}
        >
          {ctaLabel ?? t("marketing.plans.choose")}
        </Link>

        <div className="mt-7">
          <p className="text-sm font-bold">{t("marketing.plans.included")}</p>
          <ul className="mt-4 space-y-3">
            {included.map((line) => (
              <li className="flex items-start gap-2.5 text-sm" key={line}>
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border border-[#241C12]/25"
                >
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cx(
        "relative flex h-full w-full flex-col rounded-card border p-7 transition duration-300 lg:p-8",
        dark ? "bg-[#1c1e22] text-white" : "bg-white",
        popular
          ? "border-[#FBA102]/80 lg:-translate-y-3"
          : dark
            ? "border-white/10 hover:-translate-y-1 hover:border-[#FBA102]/45"
            : "border-advo-border shadow-advo-card hover:-translate-y-1 hover:border-advo-gold/40 hover:shadow-advo-lift",
        featured && "border-advo-gold/50",
      )}
      style={popular ? { boxShadow: POPULAR_LIFT } : undefined}
    >
      {/* A gradient hairline ties the card to the brand without a heavy border. */}
      <span
        aria-hidden="true"
        className={cx(
          "absolute inset-x-0 top-0 h-1 rounded-t-card",
          popular ? "bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)]" : "bg-advo-gold/35",
        )}
      />

      {popular ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)] px-3.5 py-1 text-[10px] font-black tracking-wider text-advo-charcoal uppercase shadow-md">
          {t("marketing.pricing.popular")}
        </span>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={cx("text-xl font-bold", dark ? "text-white" : "text-advo-text")}>{plan.name}</h3>
          <p className={cx("mt-0.5 font-mono text-[10px] font-bold", dark ? "text-white/45" : "text-advo-muted")}>{plan.code}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {plan.commercialPromise === "ad_free" ? (
            <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", dark ? "bg-white/10 text-white" : "bg-violet-50 text-violet-700")}>
              <ShieldOff aria-hidden="true" className="size-3" />
              {t("marketing.plans.adFree")}
            </span>
          ) : null}
          {plan.isDemo ? (
            <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-bold", dark ? "bg-[#FBA102]/15 text-[#FBA102]" : "bg-amber-50 text-amber-700")}>
              {t("marketing.plans.demo")}
            </span>
          ) : null}
        </div>
      </div>

      <p className={cx("mt-2 min-h-10 text-sm", dark ? "text-white/60" : "text-advo-muted")}>{plan.description}</p>

      {/* Price */}
      <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={cx("font-mono text-3xl font-black tracking-tight tabular-nums", dark ? "text-[#FBA102]" : "text-advo-text")}>
          TZS {formatTzs(plan.priceTzs)}
        </span>
        <span className={cx("text-sm font-medium", dark ? "text-white/55" : "text-advo-muted")}>
          /{" "}
          {plan.periodDays === 30
            ? t("marketing.plans.perMonth")
            : t("marketing.plans.perPeriod", { days: plan.periodDays })}
        </span>
      </div>

      {/* Trial — an acquisition offer, so it gets its own line rather than a bullet. */}
      {plan.trialDays ? (
        <p className={cx("mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", dark ? "bg-[#03ac77]/15 text-[#03ac77]" : "bg-emerald-50 text-emerald-700")}>
          <Sparkles aria-hidden="true" className="size-3" />
          {t("marketing.plans.trial", { days: plan.trialDays })}
        </p>
      ) : null}

      {/* Capacity */}
      <div className={cx("mt-6 border-t pt-5", dark ? "border-white/10" : "border-advo-border")}>
        <p className={cx("text-[10px] font-bold tracking-wider uppercase", dark ? "text-white/45" : "text-advo-muted")}>
          {t("marketing.plans.capacity")}
        </p>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <CapacityTile dark={dark} label={t("marketing.plans.sites")} value={capacityLabel(plan.capacity.sites, t)} />
          <CapacityTile dark={dark} label={t("marketing.plans.devices")} value={capacityLabel(plan.capacity.devices, t)} />
          <CapacityTile dark={dark} label={t("marketing.plans.packages")} value={capacityLabel(plan.capacity.packagesPerSite, t)} />
        </div>
      </div>

      {/* What the plan actually grants */}
      <ul className={cx("mt-5 flex-1 space-y-2.5 border-t pt-5", dark ? "border-white/10" : "border-advo-border")}>
        {points.map((line) => (
          <li className={cx("flex items-start gap-2.5 text-sm", dark ? "text-white/80" : "text-advo-text")} key={line}>
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-[#03ac77]"
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-7">
        <ButtonLink href={ctaHref} variant={popular ? "primary" : dark ? "onDark" : "outline"} size="lg" arrow className="w-full">
          {ctaLabel ?? t("marketing.plans.choose")}
        </ButtonLink>
      </div>
    </div>
  );
}

/**
 * The plan grid.
 *
 * Columns adapt to how many plans Admin has published, because the number is
 * admin-controlled and a fixed grid strands cards. Two rules from experience:
 *
 * - A 5-across row squeezes each card to ~220px, too tight for a price, three
 *   capacity tiles and a feature list, so 4 is the widest `grid` split used.
 * - Five plans read best as 3 + 2 with the second row centred, which needs a
 *   wrapping flex row rather than `grid` (a grid leaves the sixth cell empty and
 *   the row left-aligned).
 */
export function PlanCardGrid({
  plans,
  t,
  popularId,
  ctaForPlan,
  dark = false,
}: {
  plans: PublicPlan[];
  t: Translator;
  popularId: string | null;
  ctaForPlan?: (plan: PublicPlan) => { href: string; label?: string };
  /** Warm showcase cards on the home pricing band. The pricing page stays light. */
  dark?: boolean;
}) {
  const centred = plans.length >= 5;
  const gap = dark ? "gap-4" : "gap-6";

  const gridClasses = cx(
    "grid grid-cols-1 items-stretch",
    gap,
    plans.length === 1 && "mx-auto max-w-md",
    plans.length === 2 && "md:grid-cols-2",
    plans.length === 3 && "md:grid-cols-2 lg:grid-cols-3",
    plans.length === 4 && "md:grid-cols-2 xl:grid-cols-4",
  );

  return (
    <div className={centred ? cx("flex flex-wrap justify-center", gap) : gridClasses}>
      {plans.map((plan) => {
        const cta = ctaForPlan?.(plan) ?? { href: "/register" };
        const card = (
          <PlanCard
            plan={plan}
            t={t}
            popular={plan.id === popularId}
            featured={plans.length === 1}
            ctaHref={cta.href}
            ctaLabel={cta.label}
            dark={dark}
          />
        );
        return centred ? (
          <div
            className={cx(
              "flex w-full items-stretch",
              dark
                ? "md:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.67rem)]"
                : "md:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]",
            )}
            key={plan.id}
          >
            {card}
          </div>
        ) : (
          <div className="flex items-stretch" key={plan.id}>
            {card}
          </div>
        );
      })}
    </div>
  );
}
