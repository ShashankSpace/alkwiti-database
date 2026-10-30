import type { CurrencyCode, FinanceConfig } from "./types";

/**
 * Currency handling.
 *
 * INR is the source of truth. USD is a *display-only* conversion using the
 * configured USD/INR rate. Historical INR values are never modified.
 */

/** Convert an INR amount to the display currency. */
export function convert(amountInr: number, currency: CurrencyCode, usdInrRate: number): number {
  if (currency === "INR") return amountInr;
  if (!usdInrRate || usdInrRate <= 0) return amountInr;
  return amountInr / usdInrRate;
}

/** Format an INR-base amount in the chosen display currency. */
export function formatMoney(
  amountInr: number,
  currency: CurrencyCode,
  usdInrRate: number,
  opts: { compact?: boolean; decimals?: number } = {},
): string {
  const value = convert(amountInr, currency, usdInrRate);
  const { compact = false, decimals } = opts;

  const locale = currency === "INR" ? "en-IN" : "en-US";
  const fractionDigits = decimals ?? (currency === "INR" ? 0 : 2);

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : fractionDigits,
    minimumFractionDigits: compact ? 0 : fractionDigits,
  }).format(value);
}

/**
 * Format an allocation rate (fraction) as a percent label, keeping one decimal
 * when needed so 0.125 shows as "12.5%" rather than a rounded "13%".
 */
export function formatPercent(fraction: number): string {
  return `${Number((fraction * 100).toFixed(1))}%`;
}

/** "15% of revenue each" when the founder rates match, else "15% / 10% of revenue". */
export function founderRateLabel(rates: number[]): string {
  const first = rates[0];
  if (first !== undefined && rates.every((r) => r === first)) {
    return `${formatPercent(first)} of revenue each`;
  }
  return `${rates.map(formatPercent).join(" / ")} of revenue`;
}

/** The currency symbol for the active display currency. */
export function currencySymbol(currency: CurrencyCode): string {
  return currency === "INR" ? "₹" : "$";
}

/** A short human line describing the exchange rate in use. */
export function exchangeRateLabel(config: FinanceConfig): string {
  const updated = new Date(config.currency.rateUpdatedAt);
  const when = Number.isNaN(updated.getTime())
    ? ""
    : updated.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `USD/INR: ₹${config.currency.usdInrRate.toFixed(2)}${when ? ` · Updated ${when}` : ""}`;
}
