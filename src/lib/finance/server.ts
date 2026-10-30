import { createServerFn } from "@tanstack/react-start";
import type { ExpenseRecord, InvoiceRecord } from "./types";

/**
 * Server-side finance data loader.
 *
 * Runs ONLY on the server, so the Notion integration token (a secret) never
 * reaches the browser. The client store calls this server function; it decides
 * the source:
 *   - Notion, when NOTION_TOKEN + the two database IDs are present
 *   - Sample data otherwise (so the app works before Notion is wired up)
 *
 * Env vars (server-only — NOT prefixed VITE_):
 *   NOTION_TOKEN
 *   NOTION_REVENUE_DB_ID
 *   NOTION_EXPENSES_DB_ID
 */
export interface FinancePayload {
  source: { name: string; isSample: boolean };
  invoices: InvoiceRecord[];
  /** ALL outflows; salary payments and goal contributions are derived from these. */
  expenses: ExpenseRecord[];
  /** Present when the configured source failed and we fell back / errored. */
  warning?: string;
}

export const fetchFinanceData = createServerFn({ method: "GET" }).handler(
  async (): Promise<FinancePayload> => {
    const token = process.env["NOTION_TOKEN"];
    const revenueDatabaseId = process.env["NOTION_REVENUE_DB_ID"];
    const expensesDatabaseId = process.env["NOTION_EXPENSES_DB_ID"];

    const notionConfigured = Boolean(token && revenueDatabaseId && expensesDatabaseId);

    if (notionConfigured) {
      try {
        // Import inside the handler so @notionhq/client stays out of the client bundle.
        const { NotionDataSource } = await import("./notion-source");
        const source = new NotionDataSource({
          token: token!,
          revenueDatabaseId: revenueDatabaseId!,
          expensesDatabaseId: expensesDatabaseId!,
        });
        const [invoices, expenses] = await Promise.all([
          source.getInvoices(),
          source.getExpenses(),
        ]);
        return {
          source: { name: source.name, isSample: source.isSample },
          invoices,
          expenses,
        };
      } catch (e) {
        // Notion configured but failed — surface a warning and fall back to sample
        // so the dashboard still renders instead of white-screening.
        const { SampleDataSource } = await import("./sample-data");
        const source = new SampleDataSource();
        const [invoices, expenses] = await Promise.all([
          source.getInvoices(),
          source.getExpenses(),
        ]);
        return {
          source: { name: "Sample data", isSample: true },
          invoices,
          expenses,
          warning:
            e instanceof Error
              ? `Notion fetch failed: ${e.message}. Showing sample data.`
              : "Notion fetch failed. Showing sample data.",
        };
      }
    }

    // No Notion config — sample data.
    const { SampleDataSource } = await import("./sample-data");
    const source = new SampleDataSource();
    const [invoices, expenses] = await Promise.all([source.getInvoices(), source.getExpenses()]);
    return {
      source: { name: source.name, isSample: source.isSample },
      invoices,
      expenses,
    };
  },
);
