import type { ExpenseRecord, GoalContribution, InvoiceRecord, SalaryPayment } from "./types";

/**
 * The Data Layer boundary.
 *
 * The dashboard reads all financial records through this interface. The mega
 * prompt keeps the actual integration exploratory (Google Sheets, Excel,
 * OneDrive, an API, an MCP connection, ...), and requires that the data source
 * can change later WITHOUT rebuilding the UI. This interface is that seam:
 *
 *   - The presentation layer never imports a concrete source.
 *   - A real source (SheetsDataSource, ApiDataSource, McpDataSource, ...) just
 *     implements this interface and gets swapped in one place.
 *   - No AI layer lives inside the dashboard.
 *
 * All amounts returned MUST be in INR (the source-of-truth currency). A source
 * that pulls foreign-currency invoices is responsible for populating
 * `inrEquivalent` before handing records over.
 */
export interface FinanceDataSource {
  /** A short label shown in the UI sync status, e.g. "Sample data" or "Google Sheets". */
  readonly name: string;
  /** True when the records are demo data and must not be mixed with real figures. */
  readonly isSample: boolean;

  getInvoices(): Promise<InvoiceRecord[]>;
  /** Operational expenses only — salary / China / Dubai rows are peeled off. */
  getExpenses(): Promise<ExpenseRecord[]>;
  getSalaryPayments(): Promise<SalaryPayment[]>;
  /** Actual categorized contributions toward the China / Dubai goals. */
  getGoalContributions(): Promise<GoalContribution[]>;
}

/**
 * De-duplicate invoices before they enter the calculation layer.
 * Mirrors section 35: the same invoice must not be counted twice because it
 * appears in multiple syncs/folders. Identity = reference + date + customer +
 * gross order value.
 */
export function dedupeInvoices(records: InvoiceRecord[]): InvoiceRecord[] {
  const seen = new Set<string>();
  const out: InvoiceRecord[] = [];
  for (const r of records) {
    const key = [
      r.reference.trim().toLowerCase(),
      r.date,
      r.customer.trim().toLowerCase(),
      r.grossOrderValue.toFixed(2),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
