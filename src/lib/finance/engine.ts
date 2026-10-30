import {
  eachWeekOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type {
  ExpenseRecord,
  FinanceConfig,
  FinancialTotals,
  GoalContribution,
  Granularity,
  GoalProgress,
  InvoiceRecord,
  KpiDelta,
  OperationalSummary,
  PeriodBucket,
  SalaryPayment,
  SalarySummary,
} from "./types";

/** Round to 2 decimals (INR precision) avoiding float drift. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sum a numeric field over records. */
function sumBy<T>(records: T[], pick: (r: T) => number): number {
  return round2(records.reduce((acc, r) => acc + pick(r), 0));
}

/** Total ALKWITI revenue (commission) across the given invoices. */
export function totalRevenue(invoices: InvoiceRecord[]): number {
  return sumBy(invoices, (i) => i.inrEquivalent);
}

/** Headline totals — the three sales metrics plus expenses and available cash. */
export function computeTotals(
  invoices: InvoiceRecord[],
  expenses: ExpenseRecord[],
): FinancialTotals {
  const alkwitiRevenue = totalRevenue(invoices);
  const productSalesValue = sumBy(invoices, (i) => i.productSalesValue);
  const grossOrderValue = sumBy(invoices, (i) => i.grossOrderValue);
  const totalExpenses = sumBy(expenses, (e) => e.inrEquivalent);
  return {
    alkwitiRevenue,
    productSalesValue,
    grossOrderValue,
    expenses: totalExpenses,
    // Cash is revenue minus money ACTUALLY spent. Allocations are not expenses.
    availableCash: round2(alkwitiRevenue - totalExpenses),
  };
}

/**
 * China goal progress. Accumulated = revenue × china.allocationRate.
 * Considered complete once accumulated ≥ target.
 */
export function computeChinaGoal(
  revenue: number,
  config: FinanceConfig,
  contributions: GoalContribution[] = [],
): GoalProgress {
  const accumulated = round2(revenue * config.china.allocationRate);
  const target = config.china.target;
  const remaining = round2(Math.max(target - accumulated, 0));
  const completion = target > 0 ? Math.min(accumulated / target, 1) : 0;
  const contributed = sumBy(
    contributions.filter((c) => c.key === "china"),
    (c) => c.amount,
  );
  return {
    key: "china",
    label: "China Industrial Visit",
    target,
    accumulated,
    remaining,
    completion,
    status: accumulated >= target ? "complete" : "in-progress",
    currentRate: config.china.allocationRate,
    contributed,
  };
}

/** Whether the China goal is complete for the given revenue. */
export function isChinaComplete(revenue: number, config: FinanceConfig): boolean {
  return revenue * config.china.allocationRate >= config.china.target;
}

/**
 * Dubai goal progress. The allocation rate is DYNAMIC:
 *   - 10% (rateBeforeChina) while the China goal is incomplete
 *   - 40% (rateAfterChina) once the China goal is complete
 * The rate is resolved automatically from China's status.
 */
export function computeDubaiGoal(
  revenue: number,
  config: FinanceConfig,
  contributions: GoalContribution[] = [],
): GoalProgress {
  const chinaDone = isChinaComplete(revenue, config);
  const currentRate = chinaDone ? config.dubai.rateAfterChina : config.dubai.rateBeforeChina;
  const accumulated = round2(revenue * currentRate);
  const target = config.dubai.target;
  const remaining = round2(Math.max(target - accumulated, 0));
  const completion = target > 0 ? Math.min(accumulated / target, 1) : 0;
  const contributed = sumBy(
    contributions.filter((c) => c.key === "dubai"),
    (c) => c.amount,
  );
  return {
    key: "dubai",
    label: "Dubai Company Incorporation",
    target,
    accumulated,
    remaining,
    completion,
    status: accumulated >= target ? "complete" : "in-progress",
    currentRate,
    rateReason: chinaDone
      ? "China Industrial Visit goal completed"
      : "China Industrial Visit goal not yet completed",
    contributed,
  };
}

/** Salary allocation vs actual payments, per founder. */
export function computeSalaries(
  revenue: number,
  config: FinanceConfig,
  payments: SalaryPayment[],
): SalarySummary[] {
  return config.founders.map((f) => {
    const allocated = round2(revenue * f.salaryRate);
    const paid = sumBy(
      payments.filter((p) => p.founderId === f.id),
      (p) => p.amount,
    );
    return {
      founderId: f.id,
      name: f.name,
      rate: f.salaryRate,
      allocated,
      paid,
      outstanding: round2(allocated - paid),
    };
  });
}

/**
 * Operational budget (allocation) vs actual operational spend.
 * The allocation rate is DYNAMIC, gated on the China goal like Dubai:
 *   - rateBeforeChina (e.g. 20%) while the China goal is incomplete
 *   - rateAfterChina  (e.g. 30%) once the China goal is complete
 */
export function computeOperational(
  revenue: number,
  config: FinanceConfig,
  expenses: ExpenseRecord[],
): OperationalSummary {
  const chinaDone = isChinaComplete(revenue, config);
  const allocationRate = chinaDone
    ? config.operational.rateAfterChina
    : config.operational.rateBeforeChina;
  const budget = round2(revenue * allocationRate);
  const spent = sumBy(expenses, (e) => e.inrEquivalent);
  const remaining = round2(budget - spent);
  const utilization = budget > 0 ? spent / budget : 0;
  return {
    allocationRate,
    budget,
    spent,
    remaining,
    utilization,
    rateReason: chinaDone
      ? "China Industrial Visit goal completed"
      : "China Industrial Visit goal not yet completed",
  };
}

/** Expense totals grouped by category (INR). */
export function expensesByCategory(
  expenses: ExpenseRecord[],
): { category: ExpenseRecord["category"]; amount: number }[] {
  const map = new Map<ExpenseRecord["category"], number>();
  for (const e of expenses) {
    map.set(e.category, round2((map.get(e.category) ?? 0) + e.inrEquivalent));
  }
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** A signed delta between a current and previous value. */
export function kpiDelta(current: number, previous: number): KpiDelta {
  const change = round2(current - previous);
  const changePct = previous !== 0 ? change / Math.abs(previous) : null;
  return { current, previous, change, changePct };
}

// ---------------------------------------------------------------------------
// Time bucketing (weekly / monthly)
// ---------------------------------------------------------------------------

function inRange(dateIso: string, start: Date, end: Date): boolean {
  const d = parseISO(dateIso);
  return isWithinInterval(d, { start, end });
}

/** The min/max invoice+expense date, used to derive the full available range. */
export function dataDateRange(
  invoices: InvoiceRecord[],
  expenses: ExpenseRecord[],
): { min: Date; max: Date } | null {
  const dates = [...invoices.map((i) => i.date), ...expenses.map((e) => e.date)]
    .map((d) => parseISO(d))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (dates.length === 0) return null;
  return {
    min: new Date(Math.min(...dates.map((d) => d.getTime()))),
    max: new Date(Math.max(...dates.map((d) => d.getTime()))),
  };
}

/**
 * Aggregate invoices + expenses into weekly or monthly buckets across a range.
 * Available cash per bucket = bucket revenue − bucket expenses.
 */
export function bucketize(
  invoices: InvoiceRecord[],
  expenses: ExpenseRecord[],
  granularity: Granularity,
  range?: { start: Date; end: Date },
): PeriodBucket[] {
  const derived = dataDateRange(invoices, expenses);
  if (!derived && !range) return [];
  const start = range?.start ?? derived!.min;
  const end = range?.end ?? derived!.max;
  if (start > end) return [];

  const starts =
    granularity === "weekly"
      ? eachWeekOfInterval({ start, end }, { weekStartsOn: 1 })
      : eachMonthOfInterval({ start, end });

  return starts.map((bucketStart) => {
    const bucketEnd =
      granularity === "weekly"
        ? endOfWeek(bucketStart, { weekStartsOn: 1 })
        : endOfMonth(bucketStart);
    const normStart =
      granularity === "weekly"
        ? startOfWeek(bucketStart, { weekStartsOn: 1 })
        : startOfMonth(bucketStart);

    const inv = invoices.filter((i) => inRange(i.date, normStart, bucketEnd));
    const exp = expenses.filter((e) => inRange(e.date, normStart, bucketEnd));

    const alkwitiRevenue = totalRevenue(inv);
    const bucketExpenses = sumBy(exp, (e) => e.inrEquivalent);

    return {
      key:
        granularity === "weekly" ? format(normStart, "RRRR-'W'II") : format(normStart, "yyyy-MM"),
      label: granularity === "weekly" ? format(normStart, "d MMM") : format(normStart, "MMM yyyy"),
      start: format(normStart, "yyyy-MM-dd"),
      end: format(bucketEnd, "yyyy-MM-dd"),
      alkwitiRevenue,
      productSalesValue: sumBy(inv, (i) => i.productSalesValue),
      grossOrderValue: sumBy(inv, (i) => i.grossOrderValue),
      expenses: bucketExpenses,
      availableCash: round2(alkwitiRevenue - bucketExpenses),
    };
  });
}

/** Filter records to a date range (inclusive). */
export function filterByRange<T extends { date: string }>(
  records: T[],
  range: { start: Date; end: Date } | null,
): T[] {
  if (!range) return records;
  return records.filter((r) => inRange(r.date, range.start, range.end));
}
