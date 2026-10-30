import { Client, isFullPage } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type { FinanceDataSource } from "./data-source";
import { classifyRawCategory } from "./engine";
import type { ExpenseCategory, ExpenseRecord, InvoiceRecord, PaymentStatus } from "./types";

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
 *
 * Every Expenses row is money that left the account and is returned as an
 * expense. Its raw Category decides the bucket it is spent from (Founder
 * Salary / China Industry Visit / Dubai Incorporation / operational).
 */

// ---- property readers (tolerant of missing/renamed fields) ----------------

type Props = PageObjectResponse["properties"];
type Prop = Props[string];

/**
 * Look up a property by name, tolerant of casing and stray whitespace, so
 * "Invoice Date" in Notion matches "Invoice date" here (and "Category " with a
 * trailing space still matches "Category").
 */
function getProp(props: Props, name: string): Prop | undefined {
  const exact = props[name];
  if (exact) return exact;
  const want = name.trim().toLowerCase().replace(/\s+/g, " ");
  for (const [key, value] of Object.entries(props)) {
    if (key.trim().toLowerCase().replace(/\s+/g, " ") === want) return value;
  }
  return undefined;
}

function readTitle(props: Props, name: string): string {
  const p = getProp(props, name);
  if (p?.type === "title") return p.title.map((t) => t.plain_text).join("").trim();
  return "";
}

function readText(props: Props, name: string): string {
  const p = getProp(props, name);
  if (p?.type === "rich_text") return p.rich_text.map((t) => t.plain_text).join("").trim();
  if (p?.type === "title") return p.title.map((t) => t.plain_text).join("").trim();
  return "";
}

function readNumber(props: Props, name: string): number {
  const p = getProp(props, name);
  if (p?.type === "number" && typeof p.number === "number") return p.number;
  if (p?.type === "formula" && p.formula.type === "number" && typeof p.formula.number === "number")
    return p.formula.number;
  return 0;
}

function readDate(props: Props, name: string): string | undefined {
  const p = getProp(props, name);
  if (p?.type === "date" && p.date?.start) return p.date.start.slice(0, 10);
  return undefined;
}

function readSelect(props: Props, name: string): string {
  const p = getProp(props, name);
  if (p?.type === "select") return p.select?.name?.trim() ?? "";
  if (p?.type === "status") return p.status?.name?.trim() ?? "";
  if (p?.type === "multi_select") return p.multi_select[0]?.name?.trim() ?? "";
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
  "software and subscriptions": "software",
  "software & subscriptions": "software",
  internet: "internet",
  "internet expenses": "internet",
  "internet expense": "internet",
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
  const rawCategory = readSelect(props, "Category") || readText(props, "Category");

  return {
    id: page.id,
    date: date ?? new Date().toISOString().slice(0, 10),
    description,
    category: normalizeCategory(rawCategory),
    ...(rawCategory ? { categoryLabel: rawCategory } : {}),
    bucket: classifyRawCategory(rawCategory),
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

export class NotionDataSource implements FinanceDataSource {
  readonly name = "Notion";
  readonly isSample = false;
  private client: Client;

  /** Cache of database ID → its first data source ID (resolved once per instance). */
  private dataSourceIds = new Map<string, string>();

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
   * Every Expenses row is an outflow and is returned here regardless of its
   * Category; the row's `bucket` (from the raw Category) says which
   * allocation it is spent from. Salary payments and goal contributions are
   * derived from these same rows by the engine, so nothing is counted twice.
   */
  async getExpenses(): Promise<ExpenseRecord[]> {
    const pages = await this.queryAll(this.expensesDatabaseId);
    return pages.map(pageToExpense).filter((r): r is ExpenseRecord => r !== null);
  }
}
