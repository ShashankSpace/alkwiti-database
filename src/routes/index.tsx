import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Wallet, Package, ShoppingCart, Receipt, PiggyBank, ArrowRight } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { KpiCard, SectionCard, GoalBar, useMoney } from "@/components/dashboard/primitives";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { GoalCard } from "@/components/dashboard/goal-card";
import { usePeriodData } from "@/components/dashboard/use-period-data";
import type { RangePreset } from "@/components/dashboard/date-range";
import { useFinance } from "@/lib/finance/store";
import { formatPercent, founderRateLabel } from "@/lib/finance/currency";
import type { ExpenseBucket } from "@/lib/finance/types";
import { format, parseISO } from "date-fns";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Overview · ALKWITI" }],
  }),
  component: Overview,
});

const BUCKET_ORDER: ExpenseBucket[] = ["operational", "salary", "china", "dubai"];

const BUCKET_NAMES: Record<ExpenseBucket, string> = {
  operational: "Operational",
  salary: "Founder salaries",
  china: "China visit",
  dubai: "Dubai",
};

function Overview() {
  const [preset, setPreset] = useState<RangePreset>("all");
  const data = usePeriodData(preset);
  const { config } = useFinance();
  const money = useMoney();

  const salaryRate = config.founders.reduce((s, f) => s + f.salaryRate, 0);
  const bucketRates: Record<ExpenseBucket, number> = {
    salary: salaryRate,
    china: data.china.currentRate,
    dubai: data.dubai.currentRate,
    operational: data.operational.allocationRate,
  };

  const recent = [
    ...data.currentInvoices.map((i) => ({
      id: i.id,
      date: i.date,
      kind: "Revenue" as const,
      label: `${i.customer} · ${i.product}`,
      amount: i.inrEquivalent,
      positive: true,
    })),
    ...data.currentExpenses.map((e) => ({
      id: e.id,
      date: e.date,
      kind: "Expense" as const,
      label: e.description,
      amount: e.inrEquivalent,
      positive: false,
    })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 8);

  return (
    <DashboardShell title="Overview" rangePreset={preset} onRangeChange={setPreset}>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <KpiCard
          label="ALKWITI Revenue"
          amountInr={data.totals.alkwitiRevenue}
          icon={Wallet}
          delta={data.hasPrevious ? data.deltas.alkwitiRevenue : undefined}
          accent
        />
        <KpiCard
          label="Product Sales Value"
          amountInr={data.totals.productSalesValue}
          icon={Package}
          delta={data.hasPrevious ? data.deltas.productSalesValue : undefined}
          compact
        />
        <KpiCard
          label="Gross Order Value"
          amountInr={data.totals.grossOrderValue}
          icon={ShoppingCart}
          delta={data.hasPrevious ? data.deltas.grossOrderValue : undefined}
          compact
        />
        <KpiCard
          label="Expenses"
          amountInr={data.totals.expenses}
          icon={Receipt}
          delta={data.hasPrevious ? data.deltas.expenses : undefined}
          invertDelta
        />
        <KpiCard
          label="Available Cash"
          amountInr={data.totals.availableCash}
          icon={PiggyBank}
          delta={data.hasPrevious ? data.deltas.availableCash : undefined}
        />
      </div>

      {/* Chart + cash summary */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title="" className="lg:col-span-2">
          <RevenueChart invoices={data.currentInvoices} expenses={data.currentExpenses} />
        </SectionCard>

        <SectionCard title="Cash position" description="Revenue minus all money that went out">
          <div className="space-y-3">
            <SummaryRow label="Total revenue" value={money(data.lifetime.alkwitiRevenue)} />
            <SummaryRow
              label="Actual expenses (all outflows)"
              value={`− ${money(data.lifetime.expenses)}`}
              muted
            />
            {BUCKET_ORDER.filter((b) => data.lifetimeSpent[b] !== 0).map((b) => (
              <SummaryRow
                key={b}
                label={`· ${BUCKET_NAMES[b]}`}
                value={money(data.lifetimeSpent[b])}
                small
                muted
              />
            ))}
            <div className="h-px bg-border" />
            <SummaryRow label="Available cash" value={money(data.lifetime.availableCash)} strong />

            <div className="mt-4 rounded-xl border border-border bg-background p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Remaining allocation (allocated − spent)
              </p>
              <div className="mt-2 space-y-2 text-sm">
                {data.cash.buckets.map((b) => (
                  <SummaryRow
                    key={b.key}
                    label={`${BUCKET_NAMES[b.key]} (${formatPercent(bucketRates[b.key])})`}
                    value={b.remaining < 0 ? `Over by ${money(-b.remaining)}` : money(b.remaining)}
                    hint={`${money(b.allocated)} allocated − ${money(b.spent)} spent`}
                    tone={b.remaining < 0 ? "destructive" : undefined}
                    small
                  />
                ))}
                {Math.abs(data.cash.unallocated) >= 0.5 && (
                  <SummaryRow
                    label="Unallocated"
                    value={money(data.cash.unallocated)}
                    hint="Allocation rates in Settings don't total 100%"
                    small
                  />
                )}
                <div className="h-px bg-border" />
                <SummaryRow
                  label="Total remaining"
                  value={money(data.cash.totalRemaining)}
                  hint={
                    data.cash.matched
                      ? "✓ Matches available cash"
                      : `Differs from available cash by ${money(
                          Math.abs(data.cash.totalRemaining - data.cash.availableCash),
                        )}`
                  }
                  hintTone={data.cash.matched ? "success" : "destructive"}
                  strong
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Each bucket gets its share of revenue. Money spent from a bucket (from the Notion
                Category) reduces what remains, so total remaining equals available cash.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Goals */}
      <div className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Financial goals</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <GoalCard goal={data.china} />
          <GoalCard goal={data.dubai} />
        </div>
      </div>

      {/* Operational budget + salaries + recent activity */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Operational budget"
          description={`${formatPercent(data.operational.allocationRate)} allocation vs operational spend`}
        >
          <div className="flex items-end justify-between">
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {money(data.operational.spent)}
            </p>
            <p className="text-sm text-muted-foreground">of {money(data.operational.budget)}</p>
          </div>
          <div className="mt-2">
            <GoalBar
              value={data.operational.utilization}
              tone={data.operational.utilization > 1 ? "destructive" : "brand"}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{Math.round(data.operational.utilization * 100)}% utilized</span>
            {data.operational.remaining < 0 ? (
              <span className="text-destructive">Over by {money(-data.operational.remaining)}</span>
            ) : (
              <span>{money(data.operational.remaining)} remaining</span>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Founder salary allocations"
          description={founderRateLabel(config.founders.map((f) => f.salaryRate))}
        >
          <div className="space-y-4">
            {data.salaries.map((s) => (
              <div key={s.founderId}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{s.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {money(s.paid)} / {money(s.allocated)}
                  </span>
                </div>
                <div className="mt-1.5">
                  <GoalBar value={s.allocated > 0 ? s.paid / s.allocated : 0} tone="success" />
                </div>
                {s.outstanding < 0 ? (
                  <p className="mt-1 text-xs text-destructive">
                    Overpaid by {money(-s.outstanding)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {money(s.outstanding)} unpaid allocation
                  </p>
                )}
              </div>
            ))}
            {data.unattributedSalary > 0 && (
              <p className="text-xs text-muted-foreground">
                {money(data.unattributedSalary)} of founder salary not matched to a founder — check
                the Vendor in Notion
              </p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Recent activity" description="Latest revenue & expenses">
          <ul className="divide-y divide-border">
            {recent.length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">No records in this range.</li>
            )}
            {recent.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="flex items-center gap-3 py-2.5">
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full ${
                    r.positive ? "bg-brand/12 text-brand" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <ArrowRight className={`size-3.5 ${r.positive ? "-rotate-45" : "rotate-45"}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{r.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.kind} · {format(parseISO(r.date), "d MMM yyyy")}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-medium tabular-nums ${
                    r.positive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {r.positive ? "" : "− "}
                  {money(r.amount)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}

function SummaryRow({
  label,
  value,
  strong,
  muted,
  small,
  hint,
  tone,
  hintTone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  small?: boolean;
  /** Small secondary line under the row. */
  hint?: string;
  /** Colors the value. */
  tone?: "destructive" | "success" | undefined;
  /** Colors the hint line. */
  hintTone?: "destructive" | "success" | undefined;
}) {
  const toneClass = (t?: "destructive" | "success") =>
    t === "destructive" ? "text-destructive" : t === "success" ? "text-success" : "";
  return (
    <div>
      <div className="flex items-center justify-between">
        <span
          className={`${small ? "text-xs" : "text-sm"} ${
            muted ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {label}
        </span>
        <span
          className={`tabular-nums ${small ? "text-xs" : "text-sm"} ${
            strong ? "text-lg font-semibold" : "font-medium"
          } ${toneClass(tone) || "text-foreground"}`}
        >
          {value}
        </span>
      </div>
      {hint && (
        <p className={`text-[11px] ${toneClass(hintTone) || "text-muted-foreground"}`}>{hint}</p>
      )}
    </div>
  );
}
