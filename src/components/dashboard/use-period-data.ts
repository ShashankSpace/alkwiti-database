import { useMemo } from "react";
import { useFinance } from "@/lib/finance/store";
import {
  computeCashPosition,
  computeChinaGoal,
  computeDubaiGoal,
  computeOperational,
  computeSalaries,
  computeTotals,
  dataDateRange,
  deriveGoalContributions,
  deriveSalaryPayments,
  filterByRange,
  kpiDelta,
  spentByBucket,
} from "@/lib/finance/engine";
import { previousRange, resolveRange, type RangePreset } from "./date-range";

/**
 * Resolves the selected range against the data, filters invoices/expenses to
 * it, and computes every headline figure the pages need. Also computes the
 * previous equal-length period for KPI deltas.
 *
 * Goals & allocations use lifetime (all) revenue, because goal progress is
 * cumulative — a date filter narrows the KPIs/charts, not the goal totals.
 */
export function usePeriodData(preset: RangePreset) {
  const { invoices, expenses, config } = useFinance();

  return useMemo(() => {
    const derived = dataDateRange(invoices, expenses);
    const anchor = derived?.max ?? new Date();
    const range = resolveRange(preset, anchor);

    const currentInvoices = filterByRange(invoices, range);
    const currentExpenses = filterByRange(expenses, range);
    const totals = computeTotals(currentInvoices, currentExpenses);

    // Previous period (only meaningful for bounded ranges).
    const prev = range ? previousRange(range) : null;
    const prevInvoices = filterByRange(invoices, prev);
    const prevExpenses = filterByRange(expenses, prev);
    const prevTotals = computeTotals(prevInvoices, prevExpenses);

    const deltas = {
      alkwitiRevenue: kpiDelta(totals.alkwitiRevenue, prevTotals.alkwitiRevenue),
      productSalesValue: kpiDelta(totals.productSalesValue, prevTotals.productSalesValue),
      grossOrderValue: kpiDelta(totals.grossOrderValue, prevTotals.grossOrderValue),
      expenses: kpiDelta(totals.expenses, prevTotals.expenses),
      availableCash: kpiDelta(totals.availableCash, prevTotals.availableCash),
    };

    // Lifetime figures drive cumulative goals & allocations.
    // `expenses` is EVERY outflow (operational, salary, China, Dubai), so totals
    // and available cash count all money that left the account. Salary payments
    // and goal contributions are derived from the same rows by their bucket;
    // computeOperational counts only operational-bucket rows as its spend.
    const { payments: salaryPayments, unattributed: unattributedSalary } = deriveSalaryPayments(
      expenses,
      config.founders,
    );
    const goalContributions = deriveGoalContributions(expenses);
    const lifetime = computeTotals(invoices, expenses);
    const lifetimeSpent = spentByBucket(expenses);
    const china = computeChinaGoal(lifetime.alkwitiRevenue, config, goalContributions);
    const dubai = computeDubaiGoal(lifetime.alkwitiRevenue, config, goalContributions);
    const salaries = computeSalaries(lifetime.alkwitiRevenue, config, salaryPayments);
    const operational = computeOperational(lifetime.alkwitiRevenue, config, expenses);
    const cash = computeCashPosition(lifetime, salaries, china, dubai, operational, expenses);

    return {
      range,
      hasPrevious: Boolean(range),
      currentInvoices,
      currentExpenses,
      totals,
      deltas,
      lifetime,
      lifetimeSpent,
      china,
      dubai,
      salaries,
      unattributedSalary,
      operational,
      cash,
    };
  }, [invoices, expenses, config, preset]);
}
