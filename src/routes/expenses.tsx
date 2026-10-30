import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Receipt, Wallet, Gauge } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardShell } from "@/components/dashboard/shell";
import { KpiCard, SectionCard, GoalBar, useMoney } from "@/components/dashboard/primitives";
import { usePeriodData } from "@/components/dashboard/use-period-data";
import type { RangePreset } from "@/components/dashboard/date-range";
import {
  EXPENSE_BUCKET_LABELS,
  EXPENSE_CATEGORY_LABELS,
  bucketize,
  expensesByCategory,
} from "@/lib/finance/engine";
import { convert, currencySymbol, formatPercent } from "@/lib/finance/currency";
import { useFinance } from "@/lib/finance/store";

export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [{ title: "Expenses · ALKWITI" }] }),
  component: ExpensesPage,
});

const CATEGORY_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-5)",
  "var(--color-chart-3)",
  "var(--color-chart-2)",
  "var(--color-chart-4)",
];

function ExpensesPage() {
  const [preset, setPreset] = useState<RangePreset>("all");
  const data = usePeriodData(preset);
  const { currency, config } = useFinance();
  const money = useMoney();
  const rate = config.currency.usdInrRate;
  const sym = currencySymbol(currency);

  const byCategory = expensesByCategory(data.currentExpenses);
  const totalExpenses = data.totals.expenses;

  const monthly = useMemo(
    () =>
      bucketize(data.currentInvoices, data.currentExpenses, "monthly").map((b) => ({
        label: b.label,
        expenses: convert(b.expenses, currency, rate),
      })),
    [data.currentInvoices, data.currentExpenses, currency, rate],
  );

  const expensesSorted = [...data.currentExpenses].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <DashboardShell title="Expenses" rangePreset={preset} onRangeChange={setPreset}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <KpiCard
          label="Total Expenses"
          amountInr={totalExpenses}
          icon={Receipt}
          delta={data.hasPrevious ? data.deltas.expenses : undefined}
          invertDelta
        />
        <KpiCard label="Operational Budget" amountInr={data.operational.budget} icon={Wallet} />
        <KpiCard
          label="Operational Remaining"
          amountInr={data.operational.remaining}
          icon={Gauge}
        />
      </div>

      {/* Operational utilization */}
      <SectionCard
        title="Operational budget utilization"
        description={`${formatPercent(data.operational.allocationRate)} of ALKWITI revenue is the operational allocation — operational categories only`}
        className="mt-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {money(data.operational.spent)}
            </p>
            <p className="text-sm text-muted-foreground">
              operational spend of {money(data.operational.budget)} budget
            </p>
          </div>
          <p className="text-3xl font-semibold tabular-nums text-brand">
            {Math.round(data.operational.utilization * 100)}%
          </p>
        </div>
        <div className="mt-3">
          <GoalBar
            value={data.operational.utilization}
            tone={data.operational.utilization > 1 ? "destructive" : "brand"}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {data.operational.remaining >= 0
            ? `${money(data.operational.remaining)} of operational budget remaining.`
            : `Over budget by ${money(Math.abs(data.operational.remaining))}.`}
        </p>
      </SectionCard>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Monthly expenses */}
        <SectionCard title="Monthly expenses">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                tickFormatter={(v: number) =>
                  `${sym}${new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(v)}`
                }
              />
              <Tooltip
                cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-card)",
                  fontSize: 12,
                }}
                formatter={(v: number) => [
                  `${sym}${new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
                    maximumFractionDigits: currency === "INR" ? 0 : 2,
                  }).format(v)}`,
                  "Expenses",
                ]}
              />
              <Bar
                dataKey="expenses"
                fill="var(--color-chart-5)"
                radius={[6, 6, 0, 0]}
                maxBarSize={44}
              />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* By category */}
        <SectionCard
          title="Expenses by category"
          description="All outflows, including founder salaries and goal spend"
        >
          <div className="space-y-3">
            {byCategory.map((c, idx) => {
              const share = totalExpenses > 0 ? c.amount / totalExpenses : 0;
              return (
                <div key={c.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-foreground">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                      />
                      {c.label}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {money(c.amount, { compact: true })} · {Math.round(share * 100)}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${share * 100}%`,
                        background: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {byCategory.length === 0 && (
              <p className="text-sm text-muted-foreground">No expenses in this range.</p>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Ledger */}
      <SectionCard
        title="Expense records"
        description="Every outflow from the account"
        className="mt-4"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 font-medium">Vendor</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expensesSorted.map((e) => (
                <tr key={e.id}>
                  <td className="py-2.5 whitespace-nowrap text-muted-foreground">
                    {format(parseISO(e.date), "d MMM yy")}
                  </td>
                  <td className="py-2.5 font-medium text-foreground">{e.description}</td>
                  <td className="py-2.5 text-muted-foreground">
                    {e.categoryLabel ??
                      (e.bucket !== "operational"
                        ? EXPENSE_BUCKET_LABELS[e.bucket]
                        : EXPENSE_CATEGORY_LABELS[e.category])}
                  </td>
                  <td className="py-2.5 text-muted-foreground">{e.vendor ?? "—"}</td>
                  <td className="py-2.5 text-right font-medium tabular-nums text-foreground">
                    {money(e.inrEquivalent)}
                  </td>
                </tr>
              ))}
              {expensesSorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted-foreground">
                    No expenses in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </DashboardShell>
  );
}
