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

Every Expenses row is money that left the account. Every row counts in **total
expenses** and reduces **available cash**, whatever its Category. The `Category`
select only decides which allocation bucket the money is spent from. Category
matching is case-insensitive and trimmed, but these are the canonical option
labels:

| `Category` option | Bucket | Effect |
| --- | --- | --- |
| `Founder Salary` | Founder salaries | Counts as spent from the salary allocation and is added to the matching founder's **paid** total (paid vs allocated). The `Vendor` field selects the founder (see below). |
| `China Industry Visit` | China visit | Counts as spent from the China goal's allocation (shown as **Spent** on the China goal). |
| `Dubai Incorporation` | Dubai | Counts as spent from the Dubai goal's allocation (shown as **Spent** on the Dubai goal). |
| *any other category* | Operational | Counts toward operational spend, e.g. Software, Marketing, Travel, Office, Printing, Software and Subscriptions, Internet Expenses. |

All rows appear in the Expenses table with their Notion Category, and the
by-category breakdown sums to the same total as the Overview's actual expenses.

The **Cash position** card on the Overview shows, for each bucket, the
**remaining allocation = allocated − spent**. An overspent bucket shows "Over by"
an amount instead of being hidden. The remaining amounts add up to available
cash, and the card confirms the match.

After the China goal completes, China stops receiving allocation; Operational and
Dubai use their after-China rates on revenue earned after that point (revenue
earned before it keeps the before-China split), so allocations always total 100%
of revenue.

**Founder matching for `Founder Salary` rows:** the `Vendor` string is matched
against the founder names in Settings (defaults: `Shashank Space`,
`Mithrha Ramakrishnan`). Matching is tolerant — case-insensitive exact name,
then first-name token, then substring either direction — so `Shashank`,
`shashank space`, or the full name all resolve. The substring step ignores
strings shorter than 3 characters, so a stray `S` or `Sh` never matches. A
salary row whose `Vendor` matches no founder still counts as an expense and as
salary-bucket spend, and stays in the Expenses table; the salary cards flag it
as not attributed to a founder.

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
- Salary payments and goal spend are derived from the same Expenses rows that
  make up total expenses, so a row is never counted twice or dropped:
  `Founder Salary` rows are mapped to the matching founder and shown as **paid vs
  allocated** on the salary cards; `China Industry Visit` and `Dubai
  Incorporation` rows are shown as **spent** against each goal's allocation.
- Refresh is on-demand via the header refresh button; add polling later if you
  want near-live updates.
