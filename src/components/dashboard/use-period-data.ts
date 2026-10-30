import { useMemo } from "react";
import { useFinance } from "@/lib/finance/store";
import {
  computeChinaGoal,
  computeDubaiGoal,
  computeOperational,
  computeSalaries,
  computeTotals,
  dataDateRange,
  filterByRange,
  kpiDelta,
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
  const { invoices, expenses, salaryPayments, goalContributions, config } = useFinance();

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
    // `expenses` here is the operational-only array: the Notion source's
    // getExpenses() and SAMPLE_EXPENSES both exclude salary/China/Dubai rows,
    // so computeTotals / computeOperational are never inflated by them. Real
    // salary payments and goal contributions flow in via their own channels.
    const lifetime = computeTotals(invoices, expenses);
    const china = computeChinaGoal(lifetime.alkwitiRevenue, config, goalContributions);
    const dubai = computeDubaiGoal(lifetime.alkwitiRevenue, config, goalContributions);
    const salaries = computeSalaries(lifetime.alkwitiRevenue, config, salaryPayments);
    const operational = computeOperational(lifetime.alkwitiRevenue, config, expenses);

    return {
      range,
      hasPrevious: Boolean(range),
      currentInvoices,
      currentExpenses,
      totals,
      deltas,
      lifetime,
      china,
      dubai,
      salaries,
      operational,
    };
  }, [invoices, expenses, salaryPayments, goalContributions, config, preset]);
}
