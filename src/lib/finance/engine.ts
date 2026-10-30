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
  CashPosition,
  CashPositionBucket,
  ExpenseBucket,
  ExpenseCategory,
  ExpenseRecord,
  FinanceConfig,
  FinancialTotals,
  FounderConfig,
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

// ---------------------------------------------------------------------------
// Buckets: which allocation an outflow is spent from
// ---------------------------------------------------------------------------

/** Display names for the four spending buckets. */
export const EXPENSE_BUCKET_LABELS: Record<ExpenseBucket, string> = {
  operational: "Operational",
  salary: "Founder Salary",
  china: "China Industry Visit",
  dubai: "Dubai Incorporation",
};

/** Display names for the normalized operational categories. */
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  software: "Software & subscriptions",
  internet: "Internet",
  marketing: "Marketing",
  printing: "Printing",
  brochures: "Brochures",
  "business-cards": "Business cards",
  travel: "Travel",
  office: "Office",
  "professional-services": "Professional services",
  "business-tools": "Business tools",
  other: "Other",
};

/**
 * Classify a RAW Category value (e.g. the Notion select label) into a bucket.
 * Runs on the raw string (trimmed + lower-cased), independently of the
 * normalized `ExpenseCategory`, which collapses these labels to "other".
 *
 *   "Founder Salary"        → salary
 *   "China Industry Visit"  → china
 *   "Dubai Incorporation"   → dubai
 *   anything else           → operational
 */
export function classifyRawCategory(raw: string): ExpenseBucket {
  const v = raw.trim().toLowerCase();
  if (v === "founder salary") return "salary";
  if (v === "china industry visit") return "china";
  if (v === "dubai incorporation") return "dubai";
  return "operational";
}

/**
 * Match a Vendor string from a salary row against the configured founders and
 * return the matching founder `id`, or `null` if none matches. Tolerant of
 * casing, surrounding whitespace, and partial names ("Mithrha" vs
 * "Mithrha Ramakrishnan"): tries exact (case-insensitive) name match, then a
 * first-token match, then a substring match in either direction. The substring
 * step ignores strings shorter than 3 characters so "S" or "Sh" never match.
 */
export function matchFounder(vendor: string, founders: FounderConfig[]): string | null {
  const v = vendor.trim().toLowerCase();
  if (!v) return null;

  // 1. Exact (case-insensitive, trimmed) name match.
  for (const f of founders) {
    if (f.name.trim().toLowerCase() === v) return f.id;
  }
  // 2. First-token match (e.g. "shashank" ↔ "Shashank Space").
  const vendorFirst = v.split(/\s+/)[0] ?? "";
  for (const f of founders) {
    const founderFirst = f.name.trim().toLowerCase().split(/\s+/)[0] ?? "";
    if (vendorFirst && founderFirst && vendorFirst === founderFirst) return f.id;
  }
  // 3. Substring match in either direction, only for strings of 3+ characters.
  for (const f of founders) {
    const n = f.name.trim().toLowerCase();
    if (Math.min(v.length, n.length) < 3) continue;
    if (n.includes(v) || v.includes(n)) return f.id;
  }
  return null;
}

/** Total spent from each bucket (INR). */
export function spentByBucket(expenses: ExpenseRecord[]): Record<ExpenseBucket, number> {
  const pick = (b: ExpenseBucket) =>
    sumBy(
      expenses.filter((e) => e.bucket === b),
      (e) => e.inrEquivalent,
    );
  return {
    operational: pick("operational"),
    salary: pick("salary"),
    china: pick("china"),
    dubai: pick("dubai"),
  };
}

/**
 * Salary payments derived from salary-bucket expense rows. Vendor → founder via
 * `matchFounder`; rows that match no founder are summed into `unattributed`
 * (they still count as expenses and as salary-bucket spend).
 */
export function deriveSalaryPayments(
  expenses: ExpenseRecord[],
  founders: FounderConfig[],
): { payments: SalaryPayment[]; unattributed: number } {
  const payments: SalaryPayment[] = [];
  let unattributed = 0;
  for (const e of expenses) {
    if (e.bucket !== "salary") continue;
    const founderId = matchFounder(e.vendor ?? "", founders);
    if (!founderId) {
      unattributed += e.inrEquivalent;
      continue;
    }
    payments.push({
      id: e.id,
      founderId,
      date: e.date,
      amount: e.inrEquivalent,
      ...(e.sample ? { sample: true } : {}),
    });
  }
  return { payments, unattributed: round2(unattributed) };
}

/** Goal contributions derived from china/dubai-bucket expense rows. */
export function deriveGoalContributions(expenses: ExpenseRecord[]): GoalContribution[] {
  const out: GoalContribution[] = [];
  for (const e of expenses) {
    if (e.bucket !== "china" && e.bucket !== "dubai") continue;
    out.push({
      key: e.bucket,
      id: e.id,
      date: e.date,
      amount: e.inrEquivalent,
      ...(e.description ? { description: e.description } : {}),
      ...(e.vendor ? { vendor: e.vendor } : {}),
      ...(e.sample ? { sample: true } : {}),
    });
  }
  return out;
}

/** Total ALKWITI revenue (commission) across the given invoices. */
export function totalRevenue(invoices: InvoiceRecord[]): number {
  return sumBy(invoices, (i) => i.inrEquivalent);
}

/**
 * Headline totals — the three sales metrics plus expenses and available cash.
 * `expenses` must be ALL outflows (every bucket).
 */
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
 * Revenue at which the China goal is fully funded (target ÷ China rate).
 * Revenue up to this point is split with the "before China" rates; revenue
 * earned after it uses the "after China" rates and China receives nothing more.
 */
export function chinaThresholdRevenue(config: FinanceConfig): number {
  if (config.china.target <= 0) return 0;
  if (config.china.allocationRate <= 0) return Infinity;
  return config.china.target / config.china.allocationRate;
}

/** Revenue split into the part earned before and after China completes. */
function splitAtChina(revenue: number, config: FinanceConfig): { before: number; after: number } {
  const threshold = chinaThresholdRevenue(config);
  return { before: Math.min(revenue, threshold), after: Math.max(revenue - threshold, 0) };
}

/**
 * China goal progress. Accumulated = revenue × china.allocationRate, capped at
 * the target (revenue after completion is no longer allocated to China).
 */
export function computeChinaGoal(
  revenue: number,
  config: FinanceConfig,
  contributions: GoalContribution[] = [],
): GoalProgress {
  const chinaDone = isChinaComplete(revenue, config);
  const { before } = splitAtChina(revenue, config);
  const accumulated = round2(before * config.china.allocationRate);
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
    status: chinaDone ? "complete" : "in-progress",
    currentRate: chinaDone ? 0 : config.china.allocationRate,
    contributed,
    unspent: round2(accumulated - contributed),
  };
}

/** Whether the China goal is complete for the given revenue. */
export function isChinaComplete(revenue: number, config: FinanceConfig): boolean {
  return revenue * config.china.allocationRate >= config.china.target;
}

/**
 * Dubai goal progress. The allocation rate is DYNAMIC:
 *   - rateBeforeChina (e.g. 10%) on revenue earned while China is incomplete
 *   - rateAfterChina  (e.g. 40%) on revenue earned after China completes
 */
export function computeDubaiGoal(
  revenue: number,
  config: FinanceConfig,
  contributions: GoalContribution[] = [],
): GoalProgress {
  const chinaDone = isChinaComplete(revenue, config);
  const currentRate = chinaDone ? config.dubai.rateAfterChina : config.dubai.rateBeforeChina;
  const { before, after } = splitAtChina(revenue, config);
  const accumulated = round2(
    before * config.dubai.rateBeforeChina + after * config.dubai.rateAfterChina,
  );
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
    unspent: round2(accumulated - contributed),
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
 *   - rateBeforeChina (e.g. 20%) on revenue earned while China is incomplete
 *   - rateAfterChina  (e.g. 30%) on revenue earned after China completes
 * `expenses` may be all outflows; only operational-bucket rows count as spend.
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
  const { before, after } = splitAtChina(revenue, config);
  const budget = round2(
    before * config.operational.rateBeforeChina + after * config.operational.rateAfterChina,
  );
  const spent = sumBy(
    expenses.filter((e) => e.bucket === "operational"),
    (e) => e.inrEquivalent,
  );
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

/** The category name to show for an expense row. */
export function expenseCategoryLabel(e: ExpenseRecord): string {
  if (e.bucket !== "operational") return EXPENSE_BUCKET_LABELS[e.bucket];
  return e.categoryLabel?.trim() || EXPENSE_CATEGORY_LABELS[e.category];
}

/**
 * Expense totals grouped by displayed category (INR), across ALL outflows.
 * Salary / China / Dubai rows group under their bucket name; operational rows
 * under their source category label. The amounts sum to the total expenses.
 */
export function expensesByCategory(
  expenses: ExpenseRecord[],
): { key: string; label: string; bucket: ExpenseBucket; amount: number }[] {
  const map = new Map<
    string,
    { key: string; label: string; bucket: ExpenseBucket; amount: number }
  >();
  for (const e of expenses) {
    const label = expenseCategoryLabel(e);
    const key = label.toLowerCase();
    const prev = map.get(key);
    if (prev) prev.amount = round2(prev.amount + e.inrEquivalent);
    else map.set(key, { key, label, bucket: e.bucket, amount: round2(e.inrEquivalent) });
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/**
 * Remaining allocation per bucket (allocated − spent), reconciled with cash.
 * Σ remaining + unallocated = revenue − all outflows = available cash.
 * Overspent buckets keep their negative remaining (no clamping).
 */
export function computeCashPosition(
  totals: FinancialTotals,
  salaries: SalarySummary[],
  china: GoalProgress,
  dubai: GoalProgress,
  operational: OperationalSummary,
  expenses: ExpenseRecord[],
): CashPosition {
  const spent = spentByBucket(expenses);
  const make = (key: ExpenseBucket, allocated: number): CashPositionBucket => ({
    key,
    allocated,
    spent: spent[key],
    remaining: round2(allocated - spent[key]),
  });
  const buckets = [
    make(
      "salary",
      sumBy(salaries, (s) => s.allocated),
    ),
    make("china", china.accumulated),
    make("dubai", dubai.accumulated),
    make("operational", operational.budget),
  ];
  const totalAllocated = sumBy(buckets, (b) => b.allocated);
  const totalSpent = sumBy(buckets, (b) => b.spent);
  const unallocated = round2(totals.alkwitiRevenue - totalAllocated);
  const totalRemaining = round2(sumBy(buckets, (b) => b.remaining) + unallocated);
  return {
    buckets,
    unallocated,
    totalAllocated,
    totalSpent,
    totalRemaining,
    availableCash: totals.availableCash,
    matched: Math.abs(totalRemaining - totals.availableCash) < 0.01,
  };
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
 * Available cash per bucket = bucket revenue − bucket expenses (all outflows).
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
