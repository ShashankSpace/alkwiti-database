/**
 * ALKWITI finance domain types.
 *
 * INR is the source-of-truth currency. Every monetary value stored in these
 * types is in INR with two-decimal precision. USD is a *display* conversion
 * only (see currency.ts) and never mutates the underlying INR values.
 *
 * Core distinction the whole app is built around:
 *   Product Sales Value  →  Gross Order Value  →  ALKWITI Revenue (commission)
 * Only ALKWITI Revenue drives the allocation engine.
 */

export type CurrencyCode = "INR" | "USD";

export type PaymentStatus = "paid" | "pending" | "partial" | "unknown";

/**
 * A single imported invoice / order record.
 * Fields mirror section 12 of the mega prompt — only relevant fields, no filler.
 */
export interface InvoiceRecord {
  /** Stable id used for duplicate detection (invoice/reference number). */
  id: string;
  reference: string;
  /** ISO date (YYYY-MM-DD) the invoice was issued. */
  date: string;
  customer: string;
  customerCountry?: string;
  product: string;
  productCategory?: string;
  /** Value of the products sourced/sold (INR). */
  productSalesValue: number;
  /** Shipping charge (INR). */
  shipping: number;
  /** Any other order-related charges (INR). */
  otherCharges: number;
  /** productSalesValue + shipping + otherCharges (INR). Stored for source fidelity. */
  grossOrderValue: number;
  /** The actual revenue ALKWITI earns — the commission (INR). Drives allocations. */
  alkwitiRevenue: number;
  /** Original transaction currency, for provenance. */
  currency: CurrencyCode;
  /** INR equivalent of the revenue when the source currency differs. */
  inrEquivalent: number;
  paymentStatus: PaymentStatus;
  paymentDate?: string;
  /** True while sample/demo data is in use, so real data never mixes in silently. */
  sample?: boolean;
}

export type ExpenseCategory =
  | "software"
  | "internet"
  | "marketing"
  | "printing"
  | "brochures"
  | "business-cards"
  | "travel"
  | "office"
  | "professional-services"
  | "business-tools"
  | "other";

/**
 * Which allocation an outflow is spent from. Decided by the source's Category
 * ("Founder Salary" → salary, "China Industry Visit" → china,
 * "Dubai Incorporation" → dubai, anything else → operational).
 */
export type ExpenseBucket = "operational" | "salary" | "china" | "dubai";

/**
 * Money that left the account (not an allocation). EVERY outflow is an
 * expense; `bucket` says which allocation it is spent from.
 */
export interface ExpenseRecord {
  id: string;
  /** Primary date used for weekly/monthly grouping. */
  date: string;
  description: string;
  category: ExpenseCategory;
  /** The category name exactly as written in the source (e.g. the Notion select label). */
  categoryLabel?: string;
  /** The allocation this outflow is spent from. */
  bucket: ExpenseBucket;
  /** Amount spent (INR). */
  amount: number;
  currency: CurrencyCode;
  inrEquivalent: number;
  vendor?: string;
  /** Optional reference number for the expense. */
  reference?: string;
  /** Optional invoice date on the bill. */
  invoiceDate?: string;
  /** Optional payment due date. */
  dueDate?: string;
  sample?: boolean;
}

/**
 * A salary payment actually made to a founder (distinct from allocation).
 * Derived from salary-bucket expense rows; the row itself is also an expense.
 */
export interface SalaryPayment {
  id: string;
  founderId: string;
  date: string;
  amount: number; // INR
  sample?: boolean;
}

/**
 * Money actually spent toward a goal (China/Dubai). Derived from china/dubai
 * bucket expense rows; the row itself is also an expense. Distinct from the
 * computed allocation on `GoalProgress`.
 */
export interface GoalContribution {
  /** Which goal this contribution counts toward. */
  key: "china" | "dubai";
  id: string;
  date: string;
  /** Amount contributed (INR). */
  amount: number;
  description?: string;
  vendor?: string;
  sample?: boolean;
}

/** A founder and the share of revenue allocated to them as salary. */
export interface FounderConfig {
  id: string;
  name: string;
  /** Fraction of ALKWITI revenue allocated as salary, e.g. 0.15. */
  salaryRate: number;
}

/** All configurable business rules — nothing is hard-coded in the UI. */
export interface FinanceConfig {
  founders: [FounderConfig, FounderConfig];

  china: {
    /** Target amount in INR, e.g. 250000. */
    target: number;
    /** Fraction of revenue allocated, e.g. 0.40. */
    allocationRate: number;
  };

  operational: {
    /** Allocation before the China goal completes, e.g. 0.20. */
    rateBeforeChina: number;
    /** Allocation after the China goal completes, e.g. 0.30. */
    rateAfterChina: number;
  };

  dubai: {
    /** Target amount in INR, e.g. 500000. */
    target: number;
    /** Allocation before the China goal completes, e.g. 0.10. */
    rateBeforeChina: number;
    /** Allocation after the China goal completes, e.g. 0.40. */
    rateAfterChina: number;
  };

  currency: {
    /** Display currency the dashboard defaults to. Underlying data stays INR. */
    default: CurrencyCode;
    /** How many INR per 1 USD, e.g. 83.5. */
    usdInrRate: number;
    /** When the rate was last set/fetched (ISO string). */
    rateUpdatedAt: string;
  };
}

export type GoalStatus = "in-progress" | "complete";

/** Computed progress toward a target-based goal (China, Dubai). */
export interface GoalProgress {
  key: "china" | "dubai";
  label: string;
  target: number;
  /** Allocation actually accumulated toward the goal (INR). */
  accumulated: number;
  remaining: number;
  /** 0..1 */
  completion: number;
  status: GoalStatus;
  /** Current allocation rate applied (fraction). */
  currentRate: number;
  /** Human explanation of why the rate is what it is (Dubai stage). */
  rateReason?: string;
  /**
   * Actual spend toward this goal (INR), summed from expense rows in the goal's
   * bucket. Money genuinely spent, not an allocation.
   */
  contributed: number;
  /** accumulated − contributed (INR). Negative when the goal is overspent. */
  unspent: number;
}

/** Computed salary allocation vs payments for one founder. */
export interface SalarySummary {
  founderId: string;
  name: string;
  rate: number;
  allocated: number;
  paid: number;
  outstanding: number;
}

/** Operational budget: allocation vs actual spend. Rate is dynamic (China-gated). */
export interface OperationalSummary {
  /** Effective rate applied now (before/after China). */
  allocationRate: number;
  /** Revenue × the operational rate in effect when it was earned (before/after China). */
  budget: number;
  /** Actual spend from operational-bucket rows only. */
  spent: number;
  remaining: number;
  /** 0..1 */
  utilization: number;
  /** Why the current rate is what it is (China stage). */
  rateReason: string;
}

/** The three headline sales metrics plus expenses and cash. */
export interface FinancialTotals {
  alkwitiRevenue: number;
  productSalesValue: number;
  grossOrderValue: number;
  /** All outflows (operational, salary, China, Dubai). */
  expenses: number;
  /** revenue − all outflows (allocations are NOT treated as expenses). */
  availableCash: number;
}

/** Allocation vs actual spend for one bucket. */
export interface CashPositionBucket {
  key: ExpenseBucket;
  allocated: number;
  spent: number;
  /** allocated − spent. Negative when the bucket is overspent. */
  remaining: number;
}

/** Per-bucket remaining allocation, reconciled against available cash. */
export interface CashPosition {
  buckets: CashPositionBucket[];
  /** revenue − Σ allocated (non-zero only if the rates don't total 100%). */
  unallocated: number;
  totalAllocated: number;
  totalSpent: number;
  /** Σ remaining + unallocated. Equals available cash. */
  totalRemaining: number;
  availableCash: number;
  /** True when totalRemaining equals availableCash (to the paisa). */
  matched: boolean;
}

/** A single time bucket (a week or a month) of aggregated figures. */
export interface PeriodBucket {
  /** Machine key, e.g. "2026-W12" or "2026-03". */
  key: string;
  /** Human label, e.g. "Mar 16" or "Mar 2026". */
  label: string;
  start: string;
  end: string;
  alkwitiRevenue: number;
  productSalesValue: number;
  grossOrderValue: number;
  expenses: number;
  availableCash: number;
}

export type Granularity = "weekly" | "monthly";

/** A period comparison delta for a KPI. */
export interface KpiDelta {
  current: number;
  previous: number;
  /** absolute change */
  change: number;
  /** signed fraction, e.g. 0.12 = +12%. null when previous is 0. */
  changePct: number | null;
}
