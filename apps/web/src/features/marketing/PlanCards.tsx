import { CheckCircle2, Sparkles, ShieldOff } from "lucide-react";
import type { PublicPlan } from "@advo/contracts";
import type { Translator } from "@advo/i18n";
import { ButtonLink, Card, cx } from "@/features/marketing/ui";

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
function CapacityTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-advo-border bg-advo-surface-soft/60 px-2 py-2.5 text-center">
      <p className="truncate text-sm font-black tracking-tight text-advo-text tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold text-advo-muted">{label}</p>
    </div>
  );
}

/** The shadow on the highlighted tier — tuned to read as "lifted", not "glowing". */
const POPULAR_LIFT = "0 24px 48px -24px rgba(27,94,164,0.5)";

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
  ctaHref,
  ctaLabel,
}: {
  plan: PublicPlan;
  t: Translator;
  popular?: boolean;
  /** Tighter emphasis for the single-plan layout, where there is nothing to lift above. */
  featured?: boolean;
  ctaHref: string;
  ctaLabel?: string;
}) {
  const points = sellingPoints(plan, t);

  return (
    <div
      className={cx(
        "relative flex h-full w-full flex-col rounded-card border bg-white p-7 transition duration-300 lg:p-8",
        popular
          ? "border-advo-blue/60 lg:-translate-y-3"
          : "border-advo-border shadow-advo-card hover:-translate-y-1 hover:border-advo-blue/25 hover:shadow-advo-lift",
        featured && "border-advo-blue/40",
      )}
      style={popular ? { boxShadow: POPULAR_LIFT } : undefined}
    >
      {/* A gradient hairline ties the card to the brand without a heavy border. */}
      <span
        aria-hidden="true"
        className={cx(
          "absolute inset-x-0 top-0 h-1 rounded-t-card",
          popular ? "bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)]" : "bg-advo-blue/25",
        )}
      />

      {popular ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[linear-gradient(135deg,#fba102_0%,#f16304_100%)] px-3.5 py-1 text-[10px] font-black tracking-wider text-advo-charcoal uppercase shadow-md">
          {t("marketing.pricing.popular")}
        </span>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-advo-text">{plan.name}</h3>
          <p className="mt-0.5 font-mono text-[10px] font-bold text-advo-muted">{plan.code}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {plan.commercialPromise === "ad_free" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
              <ShieldOff aria-hidden="true" className="size-3" />
              {t("marketing.plans.adFree")}
            </span>
          ) : null}
          {plan.isDemo ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              {t("marketing.plans.demo")}
            </span>
          ) : null}
        </div>
      </div>

      <p className="mt-2 min-h-10 text-sm text-advo-muted">{plan.description}</p>

      {/* Price */}
      <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-3xl font-black tracking-tight text-advo-text tabular-nums">
          TZS {formatTzs(plan.priceTzs)}
        </span>
        <span className="text-sm font-medium text-advo-muted">
          /{" "}
          {plan.periodDays === 30
            ? t("marketing.plans.perMonth")
            : t("marketing.plans.perPeriod", { days: plan.periodDays })}
        </span>
      </div>

      {/* Trial — an acquisition offer, so it gets its own line rather than a bullet. */}
      {plan.trialDays ? (
        <p className="mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
          <Sparkles aria-hidden="true" className="size-3" />
          {t("marketing.plans.trial", { days: plan.trialDays })}
        </p>
      ) : null}

      {/* Capacity */}
      <div className="mt-6 border-t border-advo-border pt-5">
        <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">
          {t("marketing.plans.capacity")}
        </p>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <CapacityTile label={t("marketing.plans.sites")} value={capacityLabel(plan.capacity.sites, t)} />
          <CapacityTile label={t("marketing.plans.devices")} value={capacityLabel(plan.capacity.devices, t)} />
          <CapacityTile label={t("marketing.plans.packages")} value={capacityLabel(plan.capacity.packagesPerSite, t)} />
        </div>
      </div>

      {/* What the plan actually grants */}
      <ul className="mt-5 flex-1 space-y-2.5 border-t border-advo-border pt-5">
        {points.map((line) => (
          <li className="flex items-start gap-2.5 text-sm text-advo-text" key={line}>
            <CheckCircle2
              aria-hidden="true"
              className={cx("mt-0.5 size-4 shrink-0", popular ? "text-advo-gold" : "text-advo-blue")}
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-7">
        <ButtonLink href={ctaHref} variant={popular ? "primary" : "outline"} size="lg" arrow className="w-full">
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
}: {
  plans: PublicPlan[];
  t: Translator;
  popularId: string | null;
  ctaForPlan?: (plan: PublicPlan) => { href: string; label?: string };
}) {
  const centred = plans.length >= 5;

  const gridClasses = cx(
    "grid grid-cols-1 items-stretch gap-6",
    plans.length === 1 && "mx-auto max-w-md",
    plans.length === 2 && "md:grid-cols-2",
    plans.length === 3 && "md:grid-cols-2 lg:grid-cols-3",
    plans.length === 4 && "md:grid-cols-2 xl:grid-cols-4",
  );

  return (
    <div className={centred ? "flex flex-wrap justify-center gap-6" : gridClasses}>
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
          />
        );
        return centred ? (
          <div className="flex w-full items-stretch md:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]" key={plan.id}>
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
