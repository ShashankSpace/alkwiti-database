# Finance data source — Notion setup

The dashboard reads revenue (invoices) and expenses from two **Notion
databases**. Notion is the source of truth: ChatGPT writes rows into Notion, and
the dashboard reads them live. Until you configure the env vars below, the app
runs on built-in sample data.

The Notion token is a **secret** and is used **server-side only** — it never
reaches the browser.

---

## 1. Create two databases in Notion

Create these as **full-page databases** (not inline). Property names are
**case-sensitive** and must match exactly.

### Revenue database

| Property | Type | Notes |
| --- | --- | --- |
| `Reference` | **Title** | Invoice / order reference. Required. |
| `Date` | Date | Invoice date. |
| `Customer` | Text | |
| `Country` | Text | Optional. |
| `Product` | Text | |
| `Category` | Select | Optional. |
| `Product Sales Value` | Number | INR. |
| `Shipping` | Number | INR. |
| `Other Charges` | Number | INR. |
| `Gross Order Value` | Number | Optional — computed if omitted. |
| `ALKWITI Revenue` | Number | INR. The commission. Drives all allocations. |
| `Payment Status` | Status or Select | "Paid" / "Pending" / "Partial". |
| `Payment Date` | Date | Optional. |

### Expenses database

| Property | Type | Notes |
| --- | --- | --- |
| `Description` | **Title** | Required. |
| `Category` | Select | Drives classification — see below. |
| `Reference amount` | Number | INR. The amount spent (drives expense totals). |
| `Date` | Date | Primary date used for weekly/monthly grouping. |
| `Invoice date` | Date | Optional. |
| `Due date` | Date | Optional. |
| `Vendor` | Text | For `Founder Salary` rows, this names which founder. |

#### Category-based classification

Each Expenses row is routed by its `Category` select into one of four buckets.
Category matching is case-insensitive and trimmed, but these are the canonical
option labels:

| `Category` option | Treated as | Effect |
| --- | --- | --- |
| `Founder Salary` | Founder salary payment | Added to the matching founder's **paid** total (actual vs allocated). NOT an operational expense. The `Vendor` field selects the founder (see below). |
| `China Industry Visit` | China goal contribution | Shown as **Contributed (actual)** on the China goal, alongside the computed allocation projection. |
| `Dubai Incorporation` | Dubai goal contribution | Shown as **Contributed (actual)** on the Dubai goal, alongside the computed allocation projection. |
| *any other category* | Operational expense | Counts toward operational spend exactly as before — e.g. Software, Marketing, Travel, Office, Printing, Software and Subscriptions, Internet Expenses. |

Rows in the first three buckets are peeled out of operational expenses, so they
never inflate total expenses or available cash.

**Founder matching for `Founder Salary` rows:** the `Vendor` string is matched
against the founder names in Settings (defaults: `Shashank Space`,
`Mithrha Ramakrishnan`). Matching is tolerant — case-insensitive exact name,
then first-name token, then substring either direction — so `Shashank`,
`shashank space`, or the full name all resolve. A salary row whose `Vendor`
matches no founder is skipped (logged server-side) and never counted as an
operational expense.

All money is stored in **INR** (the dashboard's source-of-truth currency). USD is
a display-only conversion in the app.

---

## 2. Create a Notion integration and get the token

1. Go to <https://www.notion.so/my-integrations> → **New integration**.
2. Name it (e.g. "ALKWITI Dashboard"), pick your workspace, type **Internal**.
3. Copy the **Internal Integration Secret** → this is `NOTION_TOKEN`.

## 3. Share both databases with the integration

For **each** database: open it → top-right **•••** → **Connections** (or "Add
connections") → select your integration. Without this the API can't see the
database.

## 4. Get the database IDs

Open each database as a full page. The ID is the 32-character string in the URL:

```
https://www.notion.so/<workspace>/<THIS_IS_THE_DATABASE_ID>?v=...
```

Copy the Revenue DB ID → `NOTION_REVENUE_DB_ID`, Expenses DB ID →
`NOTION_EXPENSES_DB_ID`.

## 5. Add the env vars

In your `.env` (server-only — do **not** prefix with `VITE_`):

```
NOTION_TOKEN=ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_REVENUE_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_EXPENSES_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Restart the dev server (`npm run dev`). The header sync status will now read
**"Notion"** instead of **"Sample data"**.

---

## How it works in the code

| Piece | File |
| --- | --- |
| Notion reader (server-only), maps pages → records | `src/lib/finance/notion-source.ts` |
| Server function that picks Notion vs sample, holds the token | `src/lib/finance/server.ts` |
| Client store — calls the server function, never Notion directly | `src/lib/finance/store.tsx` |

Flow: **ChatGPT → Notion database → server function reads via Notion API → maps
to InvoiceRecord/ExpenseRecord → dashboard renders**. If Notion is configured but
a fetch fails, the dashboard falls back to sample data and shows a warning in the
sync status rather than breaking.

### Notes

- The 2025-09-03 Notion API introduced **data sources**; the reader resolves the
  database's first data source automatically, so you only need the database ID.
- Duplicate invoices are de-duped by reference + date + customer + order value.
- Salary payments ARE read from Notion: `Founder Salary` expense rows are mapped
  to the matching founder and shown as **actual paid vs allocated** on the salary
  cards. `China Industry Visit` and `Dubai Incorporation` rows are shown as actual
  **contributed** amounts alongside each goal's computed allocation projection —
  the projection math is unchanged; the actuals are added next to it.
- Refresh is on-demand via the header refresh button; add polling later if you
  want near-live updates.
