import { Client, isFullPage } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { DEFAULT_CONFIG } from "./config";
import type { FinanceDataSource } from "./data-source";
import type {
  ExpenseCategory,
  ExpenseRecord,
  FounderConfig,
  GoalContribution,
  InvoiceRecord,
  PaymentStatus,
  SalaryPayment,
} from "./types";

/**
 * ============================================================================
 * NotionDataSource — reads the Revenue and Expenses Notion databases.
 * ============================================================================
 * SERVER-ONLY. The Notion integration token is a secret and must never reach
 * the browser. This module is imported exclusively from a server function.
 *
 * Notion is treated as the source of truth (Option A). ChatGPT writes rows into
 * the Notion databases; the dashboard reads them here and maps each page to the
 * dashboard's InvoiceRecord / ExpenseRecord shape. All amounts are INR.
 *
 * Expected property names (see docs/NOTION_SETUP.md):
 *   Revenue DB:  Reference(title), Date(date), Customer(text), Country(text),
 *                Product(text), Category(select), Product Sales Value(number),
 *                Shipping(number), Other Charges(number), Gross Order Value(number, optional),
 *                ALKWITI Revenue(number), Payment Status(status/select), Payment Date(date)
 *   Expenses DB: Description(title), Category(select), Reference amount(number),
 *                Date(date), Invoice date(date), Due date(date), Vendor(text)
 */

// ---- property readers (tolerant of missing/renamed fields) ----------------

type Props = PageObjectResponse["properties"];

function readTitle(props: Props, name: string): string {
  const p = props[name];
  if (p?.type === "title") return p.title.map((t) => t.plain_text).join("").trim();
  return "";
}

function readText(props: Props, name: string): string {
  const p = props[name];
  if (p?.type === "rich_text") return p.rich_text.map((t) => t.plain_text).join("").trim();
  if (p?.type === "title") return p.title.map((t) => t.plain_text).join("").trim();
  return "";
}

function readNumber(props: Props, name: string): number {
  const p = props[name];
  if (p?.type === "number" && typeof p.number === "number") return p.number;
  if (p?.type === "formula" && p.formula.type === "number" && typeof p.formula.number === "number")
    return p.formula.number;
  return 0;
}

function readDate(props: Props, name: string): string | undefined {
  const p = props[name];
  if (p?.type === "date" && p.date?.start) return p.date.start.slice(0, 10);
  return undefined;
}

function readSelect(props: Props, name: string): string {
  const p = props[name];
  if (p?.type === "select") return p.select?.name?.trim() ?? "";
  if (p?.type === "status") return p.status?.name?.trim() ?? "";
  return "";
}

// ---- normalizers -----------------------------------------------------------

function normalizePaymentStatus(raw: string): PaymentStatus {
  const v = raw.toLowerCase();
  if (v.includes("paid")) return "paid";
  if (v.includes("partial")) return "partial";
  if (v.includes("pend") || v.includes("unpaid") || v.includes("due")) return "pending";
  return "unknown";
}

const CATEGORY_ALIASES: Record<string, ExpenseCategory> = {
  software: "software",
  subscription: "software",
  subscriptions: "software",
  marketing: "marketing",
  ads: "marketing",
  advertising: "marketing",
  printing: "printing",
  print: "printing",
  brochure: "brochures",
  brochures: "brochures",
  "business card": "business-cards",
  "business cards": "business-cards",
  "business-cards": "business-cards",
  travel: "travel",
  office: "office",
  "professional services": "professional-services",
  "professional-services": "professional-services",
  legal: "professional-services",
  "business tools": "business-tools",
  "business-tools": "business-tools",
  tools: "business-tools",
};

function normalizeCategory(raw: string): ExpenseCategory {
  const v = raw.trim().toLowerCase();
  return CATEGORY_ALIASES[v] ?? "other";
}

/**
 * Classify a RAW Notion Category select value into one of the special buckets
 * or "operational". This runs on the raw string (trimmed + lower-cased),
 * independently of `normalizeCategory` — which collapses these special labels
 * to "other" and so cannot carry their meaning.
 *
 *   "Founder Salary"        → salary       (→ actual SalaryPayment)
 *   "China Industry Visit"  → china        (→ actual China contribution)
 *   "Dubai Incorporation"   → dubai        (→ actual Dubai contribution)
 *   anything else           → operational  (→ ordinary operating expense)
 */
export function classifyRawCategory(raw: string): "salary" | "china" | "dubai" | "operational" {
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
 * first-token match, then a substring match in either direction.
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
  // 3. Substring match in either direction.
  for (const f of founders) {
    const n = f.name.trim().toLowerCase();
    if (n && (n.includes(v) || v.includes(n))) return f.id;
  }
  return null;
}

// ---- mappers ---------------------------------------------------------------

function pageToInvoice(page: PageObjectResponse): InvoiceRecord | null {
  const props = page.properties;
  const reference = readTitle(props, "Reference") || readText(props, "Reference");
  const date = readDate(props, "Date");
  // Skip rows that are clearly empty / not yet filled in.
  if (!reference && !date) return null;

  const productSalesValue = readNumber(props, "Product Sales Value");
  const shipping = readNumber(props, "Shipping");
  const otherCharges = readNumber(props, "Other Charges");
  const govColumn = readNumber(props, "Gross Order Value");
  const grossOrderValue = govColumn > 0 ? govColumn : productSalesValue + shipping + otherCharges;
  const alkwitiRevenue = readNumber(props, "ALKWITI Revenue");

  const country = readText(props, "Country");
  const category = readSelect(props, "Category") || readText(props, "Category");
  const paymentDate = readDate(props, "Payment Date");

  return {
    id: page.id,
    reference: reference || page.id,
    date: date ?? new Date().toISOString().slice(0, 10),
    customer: readText(props, "Customer"),
    ...(country ? { customerCountry: country } : {}),
    product: readText(props, "Product"),
    ...(category ? { productCategory: category } : {}),
    productSalesValue,
    shipping,
    otherCharges,
    grossOrderValue,
    alkwitiRevenue,
    currency: "INR",
    inrEquivalent: alkwitiRevenue,
    paymentStatus: normalizePaymentStatus(readSelect(props, "Payment Status")),
    ...(paymentDate ? { paymentDate } : {}),
  };
}

function pageToExpense(page: PageObjectResponse): ExpenseRecord | null {
  const props = page.properties;
  const description = readTitle(props, "Description") || readText(props, "Description");
  // Money value. "Reference amount" is the amount column; fall back to "Amount".
  const amount = readNumber(props, "Reference amount") || readNumber(props, "Amount");
  // Primary date for grouping: prefer "Date", then "Invoice date", then "Due date".
  const invoiceDate = readDate(props, "Invoice date");
  const dueDate = readDate(props, "Due date");
  const date = readDate(props, "Date") ?? invoiceDate ?? dueDate;
  if (!description && !amount) return null;

  const vendor = readText(props, "Vendor");
  const reference = readText(props, "Reference") || readText(props, "Reference number");

  return {
    id: page.id,
    date: date ?? new Date().toISOString().slice(0, 10),
    description,
    category: normalizeCategory(readSelect(props, "Category") || readText(props, "Category")),
    amount,
    currency: "INR",
    inrEquivalent: amount,
    ...(vendor ? { vendor } : {}),
    ...(reference ? { reference } : {}),
    ...(invoiceDate ? { invoiceDate } : {}),
    ...(dueDate ? { dueDate } : {}),
  };
}

// ---- the data source -------------------------------------------------------

export interface NotionConfig {
  token: string;
  revenueDatabaseId: string;
  expensesDatabaseId: string;
}

/**
 * Accept whatever the user pasted and return a clean Notion ID.
 * Handles: raw 32-char hex, dashed UUIDs, full URLs, and "Title-<id>" slugs
 * (Notion's "Copy link" prepends the page title before the id).
 */
export function normalizeNotionId(raw: string): string {
  const trimmed = raw.trim();
  // Notion IDs are the FINAL 32 hex chars. Take the last 32 hex characters that
  // sit at the very end (after stripping any query string and dashes), so a
  // "Title-<id>" slug like "ALKWITI-Revenue-<id>" doesn't leak a letter in.
  const withoutQuery = trimmed.split("?")[0] ?? trimmed;
  const compact = withoutQuery.replace(/-/g, "");
  const match = compact.match(/[0-9a-fA-F]{32}$/);
  const id = match?.[0];
  if (!id) return trimmed; // fall back; Notion will report if it's invalid
  // Format as a dashed UUID (Notion accepts both, but this is canonical).
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

/** The Expenses DB split into its three buckets by raw Category. */
interface ExpensePartition {
  expenses: ExpenseRecord[];
  salaryPayments: SalaryPayment[];
  goalContributions: GoalContribution[];
}

export class NotionDataSource implements FinanceDataSource {
  readonly name = "Notion";
  readonly isSample = false;
  private client: Client;

  /** Cache of database ID → its first data source ID (resolved once per instance). */
  private dataSourceIds = new Map<string, string>();

  /** Memoized Expenses-DB partition so the three getters share one query. */
  private expensePartition: Promise<ExpensePartition> | null = null;

  private revenueDatabaseId: string;
  private expensesDatabaseId: string;

  constructor(cfg: NotionConfig) {
    this.client = new Client({ auth: cfg.token });
    this.revenueDatabaseId = normalizeNotionId(cfg.revenueDatabaseId);
    this.expensesDatabaseId = normalizeNotionId(cfg.expensesDatabaseId);
  }

  /**
   * The 2025-09-03 Notion API moved querying from databases to *data sources*
   * (a database contains one or more). Given a database ID, resolve the ID of
   * its first data source, which is what we actually query.
   */
  private async resolveDataSourceId(databaseId: string): Promise<string> {
    const cached = this.dataSourceIds.get(databaseId);
    if (cached) return cached;

    const db = (await this.client.databases.retrieve({
      database_id: databaseId,
    })) as { data_sources?: { id: string }[] };

    const first = db.data_sources?.[0]?.id;
    if (!first) {
      throw new Error(
        `Notion database ${databaseId} has no data sources. Share the database with the integration.`,
      );
    }
    this.dataSourceIds.set(databaseId, first);
    return first;
  }

  private async queryAll(databaseId: string): Promise<PageObjectResponse[]> {
    const dataSourceId = await this.resolveDataSourceId(databaseId);
    const pages: PageObjectResponse[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.client.dataSources.query({
        data_source_id: dataSourceId,
        ...(cursor ? { start_cursor: cursor } : {}),
        page_size: 100,
      });
      for (const row of res.results) {
        if (isFullPage(row)) pages.push(row);
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return pages;
  }

  async getInvoices(): Promise<InvoiceRecord[]> {
    const pages = await this.queryAll(this.revenueDatabaseId);
    return pages.map(pageToInvoice).filter((r): r is InvoiceRecord => r !== null);
  }

  /**
   * Query the Expenses DB once and partition every row by its RAW Category:
   *   - "Founder Salary"       → SalaryPayment (Vendor → founderId)
   *   - "China Industry Visit" → GoalContribution (china)
   *   - "Dubai Incorporation"  → GoalContribution (dubai)
   *   - anything else          → operational ExpenseRecord
   * Salary / goal rows are excluded from operational expenses so they never
   * inflate spend or available cash. The result is memoized so the three public
   * getters share a single query.
   */
  private async partitionExpenses(): Promise<ExpensePartition> {
    if (!this.expensePartition) {
      this.expensePartition = this.queryAll(this.expensesDatabaseId).then((pages) => {
        const expenses: ExpenseRecord[] = [];
        const salaryPayments: SalaryPayment[] = [];
        const goalContributions: GoalContribution[] = [];

        for (const page of pages) {
          const props = page.properties;
          const rawCategory = readSelect(props, "Category") || readText(props, "Category");
          const bucket = classifyRawCategory(rawCategory);

          if (bucket === "operational") {
            const record = pageToExpense(page);
            if (record) expenses.push(record);
            continue;
          }

          // Shared reads for the special buckets (mirrors pageToExpense).
          const description = readTitle(props, "Description") || readText(props, "Description");
          const amount = readNumber(props, "Reference amount") || readNumber(props, "Amount");
          const date =
            readDate(props, "Date") ??
            readDate(props, "Invoice date") ??
            readDate(props, "Due date") ??
            new Date().toISOString().slice(0, 10);
          const vendor = readText(props, "Vendor");

          // Skip rows that are clearly empty / not yet filled in.
          if (!description && !amount) continue;

          if (bucket === "salary") {
            const founderId = matchFounder(vendor, DEFAULT_CONFIG.founders);
            if (!founderId) {
              // Keep unmatched salary rows OUT of operational expenses; skip gracefully.
              console.warn(
                `[notion-source] Founder Salary row "${description}" has Vendor "${vendor}" ` +
                  `that matches no configured founder — skipping.`,
              );
              continue;
            }
            salaryPayments.push({ id: page.id, founderId, date, amount });
            continue;
          }

          // bucket is "china" | "dubai".
          goalContributions.push({
            key: bucket,
            id: page.id,
            date,
            amount,
            ...(description ? { description } : {}),
            ...(vendor ? { vendor } : {}),
          });
        }

        return { expenses, salaryPayments, goalContributions };
      });
    }
    return this.expensePartition;
  }

  async getExpenses(): Promise<ExpenseRecord[]> {
    // Operational rows only — salary / China / Dubai rows are peeled off.
    return (await this.partitionExpenses()).expenses;
  }

  async getSalaryPayments(): Promise<SalaryPayment[]> {
    // Real "Founder Salary" rows from Notion, mapped Vendor → founderId.
    return (await this.partitionExpenses()).salaryPayments;
  }

  async getGoalContributions(): Promise<GoalContribution[]> {
    // Actual "China Industry Visit" / "Dubai Incorporation" rows.
    return (await this.partitionExpenses()).goalContributions;
  }
}
