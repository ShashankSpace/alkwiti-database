import type { FinanceDataSource } from "./data-source";
import type { ExpenseRecord, GoalContribution, InvoiceRecord, SalaryPayment } from "./types";

/**
 * ============================================================================
 * SAMPLE DATA — for development and demos only.
 * ============================================================================
 * Every record below is flagged `sample: true`. Do NOT mix this with real
 * ALKWITI financial data. All amounts are in INR (source-of-truth currency).
 *
 * The numbers model ALKWITI's actual operating shape: a sourcing/procurement
 * business that earns a commission (roughly 7–9%) on the product value it
 * sources. Product Sales Value → Gross Order Value → ALKWITI Revenue.
 *
 * Total sample ALKWITI revenue is tuned so the China goal (₹2.5L) is partway
 * complete — which keeps the Dubai allocation at its "before China" rate,
 * demonstrating the dynamic stage logic on load.
 */

const inv = (
  id: string,
  date: string,
  customer: string,
  country: string,
  product: string,
  category: string,
  productSalesValue: number,
  shipping: number,
  otherCharges: number,
  alkwitiRevenue: number,
  paymentStatus: InvoiceRecord["paymentStatus"],
  paymentDate?: string,
): InvoiceRecord => ({
  id,
  reference: id,
  date,
  customer,
  customerCountry: country,
  product,
  productCategory: category,
  productSalesValue,
  shipping,
  otherCharges,
  grossOrderValue: productSalesValue + shipping + otherCharges,
  alkwitiRevenue,
  currency: "INR",
  inrEquivalent: alkwitiRevenue,
  paymentStatus,
  ...(paymentDate ? { paymentDate } : {}),
  sample: true,
});

export const SAMPLE_INVOICES: InvoiceRecord[] = [
  inv(
    "ALK-2026-0007",
    "2026-06-12",
    "Nordwind Elektronik GmbH",
    "Germany",
    "PCB assemblies",
    "Components",
    620000,
    42000,
    8000,
    49600,
    "paid",
    "2026-06-25",
  ),
  inv(
    "ALK-2026-0008",
    "2026-06-28",
    "Meridian Robotics",
    "USA",
    "Servo motor batch",
    "Equipment",
    385000,
    31000,
    5000,
    30800,
    "paid",
    "2026-07-10",
  ),
  inv(
    "ALK-2026-0009",
    "2026-07-09",
    "Sahara Instruments LLC",
    "UAE",
    "Sensor modules",
    "Components",
    244000,
    18000,
    3000,
    19520,
    "paid",
    "2026-07-22",
  ),
  inv(
    "ALK-2026-0010",
    "2026-07-21",
    "Kestrel Automation",
    "UK",
    "Industrial controllers",
    "Equipment",
    512000,
    36000,
    6000,
    40960,
    "paid",
    "2026-08-04",
  ),
  inv(
    "ALK-2026-0011",
    "2026-08-05",
    "Aurora Medical Devices",
    "Australia",
    "Precision connectors",
    "Components",
    178000,
    12000,
    2000,
    14240,
    "paid",
    "2026-08-19",
  ),
  inv(
    "ALK-2026-0012",
    "2026-08-16",
    "Meridian Robotics",
    "USA",
    "Linear actuators",
    "Equipment",
    430000,
    34000,
    5000,
    34400,
    "paid",
    "2026-08-30",
  ),
  inv(
    "ALK-2026-0013",
    "2026-08-27",
    "Delta Power Systems",
    "India",
    "Power supply units",
    "Components",
    296000,
    9000,
    4000,
    23680,
    "partial",
  ),
  inv(
    "ALK-2026-0014",
    "2026-09-03",
    "Nordwind Elektronik GmbH",
    "Germany",
    "RF transceiver modules",
    "Components",
    358000,
    26000,
    4000,
    28640,
    "paid",
    "2026-09-15",
  ),
  inv(
    "ALK-2026-0015",
    "2026-09-10",
    "Kestrel Automation",
    "UK",
    "HMI panels",
    "Equipment",
    268000,
    21000,
    3000,
    21440,
    "pending",
  ),
  inv(
    "ALK-2026-0016",
    "2026-09-17",
    "Cedar Grove Labs",
    "Canada",
    "Lab-grade thermocouples",
    "Components",
    205000,
    15000,
    2500,
    16400,
    "pending",
  ),
  inv(
    "ALK-2026-0017",
    "2026-09-21",
    "Sahara Instruments LLC",
    "UAE",
    "Enclosure hardware",
    "Office",
    142000,
    11000,
    2000,
    11360,
    "pending",
  ),
];

export const SAMPLE_EXPENSES: ExpenseRecord[] = [
  {
    id: "EXP-001",
    date: "2026-06-15",
    description: "Sourcing CRM & analytics suite",
    category: "software",
    amount: 8400,
    currency: "INR",
    inrEquivalent: 8400,
    vendor: "Airtable",
    sample: true,
  },
  {
    id: "EXP-002",
    date: "2026-06-20",
    description: "Company brochures (500 units)",
    category: "brochures",
    amount: 12500,
    currency: "INR",
    inrEquivalent: 12500,
    vendor: "PrintHub",
    sample: true,
  },
  {
    id: "EXP-003",
    date: "2026-07-02",
    description: "Business cards — both founders",
    category: "business-cards",
    amount: 3200,
    currency: "INR",
    inrEquivalent: 3200,
    vendor: "Vistaprint",
    sample: true,
  },
  {
    id: "EXP-004",
    date: "2026-07-11",
    description: "LinkedIn ads — supplier outreach",
    category: "marketing",
    amount: 18000,
    currency: "INR",
    inrEquivalent: 18000,
    vendor: "LinkedIn",
    sample: true,
  },
  {
    id: "EXP-005",
    date: "2026-07-19",
    description: "Design & productivity tools",
    category: "business-tools",
    amount: 5600,
    currency: "INR",
    inrEquivalent: 5600,
    vendor: "Figma",
    sample: true,
  },
  {
    id: "EXP-006",
    date: "2026-08-04",
    description: "Supplier visit — domestic travel",
    category: "travel",
    amount: 22400,
    currency: "INR",
    inrEquivalent: 22400,
    vendor: "IndiGo",
    sample: true,
  },
  {
    id: "EXP-007",
    date: "2026-08-18",
    description: "Legal — Dubai incorporation advisory",
    category: "professional-services",
    amount: 26000,
    currency: "INR",
    inrEquivalent: 26000,
    vendor: "Emirates Corp Advisory",
    sample: true,
  },
  {
    id: "EXP-008",
    date: "2026-09-01",
    description: "Cloud storage & domain renewal",
    category: "software",
    amount: 4100,
    currency: "INR",
    inrEquivalent: 4100,
    vendor: "Google Workspace",
    sample: true,
  },
  {
    id: "EXP-009",
    date: "2026-09-12",
    description: "Trade catalogue printing",
    category: "printing",
    amount: 9800,
    currency: "INR",
    inrEquivalent: 9800,
    vendor: "PrintHub",
    sample: true,
  },
  {
    id: "EXP-010",
    date: "2026-09-19",
    description: "Co-working desk — September",
    category: "office",
    amount: 14000,
    currency: "INR",
    inrEquivalent: 14000,
    vendor: "WeWork",
    sample: true,
  },
];

export const SAMPLE_SALARY_PAYMENTS: SalaryPayment[] = [
  { id: "PAY-001", founderId: "shashank", date: "2026-07-05", amount: 18000, sample: true },
  { id: "PAY-002", founderId: "mithrha", date: "2026-07-05", amount: 18000, sample: true },
  { id: "PAY-003", founderId: "shashank", date: "2026-08-05", amount: 20000, sample: true },
  { id: "PAY-004", founderId: "mithrha", date: "2026-08-05", amount: 15000, sample: true },
];

/**
 * Actual categorized contributions toward the China / Dubai goals. These model
 * Notion expense rows tagged "China Industry Visit" / "Dubai Incorporation" —
 * money genuinely spent toward each goal, shown alongside the computed
 * allocation projection (never folded into operational spend).
 */
export const SAMPLE_GOAL_CONTRIBUTIONS: GoalContribution[] = [
  {
    key: "china",
    id: "GC-001",
    date: "2026-07-14",
    amount: 32000,
    description: "China Industry Visit — flight deposit",
    vendor: "Air China",
    sample: true,
  },
  {
    key: "china",
    id: "GC-002",
    date: "2026-08-22",
    amount: 18500,
    description: "China Industry Visit — supplier meeting logistics",
    vendor: "Guangzhou Expo",
    sample: true,
  },
  {
    key: "dubai",
    id: "GC-003",
    date: "2026-08-09",
    amount: 45000,
    description: "Dubai Incorporation — licensing fee",
    vendor: "Emirates Corp Advisory",
    sample: true,
  },
  {
    key: "dubai",
    id: "GC-004",
    date: "2026-09-16",
    amount: 21000,
    description: "Dubai Incorporation — registered agent",
    vendor: "Emirates Corp Advisory",
    sample: true,
  },
];

/** In-memory sample implementation of the data-source seam. */
export class SampleDataSource implements FinanceDataSource {
  readonly name = "Sample data";
  readonly isSample = true;

  async getInvoices(): Promise<InvoiceRecord[]> {
    return SAMPLE_INVOICES;
  }
  async getExpenses(): Promise<ExpenseRecord[]> {
    return SAMPLE_EXPENSES;
  }
  async getSalaryPayments(): Promise<SalaryPayment[]> {
    return SAMPLE_SALARY_PAYMENTS;
  }
  async getGoalContributions(): Promise<GoalContribution[]> {
    return SAMPLE_GOAL_CONTRIBUTIONS;
  }
}
