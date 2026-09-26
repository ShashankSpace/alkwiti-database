import type { CurrencyCode, FinanceConfig } from "./types";

/**
 * Default business rules straight from the ALKWITI mega prompt.
 * These are DEFAULTS only — every value is editable in Settings and persisted
 * when the user presses Save (nothing auto-saves while typing).
 */
export const DEFAULT_CONFIG: FinanceConfig = {
  founders: [
    { id: "shashank", name: "Shashank Space", salaryRate: 0.15 },
    { id: "mithrha", name: "Mithrha Ramakrishnan", salaryRate: 0.15 },
  ],
  china: {
    target: 250000,
    allocationRate: 0.4,
  },
  operational: {
    rateBeforeChina: 0.2,
    rateAfterChina: 0.3,
  },
  dubai: {
    target: 500000,
    rateBeforeChina: 0.1,
    rateAfterChina: 0.4,
  },
  currency: {
    default: "INR",
    usdInrRate: 83.5,
    rateUpdatedAt: "2026-09-23T00:00:00.000Z",
  },
};

const STORAGE_KEY = "alkwiti.finance.config.v1";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Take a finite number from untrusted input, else the fallback. */
function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function currencyCode(v: unknown, fallback: CurrencyCode): CurrencyCode {
  return v === "INR" || v === "USD" ? v : fallback;
}

function coerceFounders(v: unknown, base: FinanceConfig["founders"]): FinanceConfig["founders"] {
  if (!Array.isArray(v)) return base;
  const merged = base.map((fallback, idx) => {
    const raw = v[idx];
    if (!isRecord(raw)) return fallback;
    return {
      id: str(raw["id"], fallback.id),
      name: str(raw["name"], fallback.name),
      salaryRate: num(raw["salaryRate"], fallback.salaryRate),
    };
  });
  return [merged[0]!, merged[1]!];
}

/**
 * Deep-merge untrusted persisted config (localStorage or the Supabase `jsonb`
 * column) over the defaults, validating every field. New config fields survive
 * upgrades, and malformed/partial payloads can never produce NaN rates.
 */
export function coerceConfig(raw: unknown, base: FinanceConfig = DEFAULT_CONFIG): FinanceConfig {
  if (!isRecord(raw)) return base;

  const china = isRecord(raw["china"]) ? raw["china"] : {};
  const operational = isRecord(raw["operational"]) ? raw["operational"] : {};
  const dubai = isRecord(raw["dubai"]) ? raw["dubai"] : {};
  const currency = isRecord(raw["currency"]) ? raw["currency"] : {};

  return {
    founders: coerceFounders(raw["founders"], base.founders),
    china: {
      target: num(china["target"], base.china.target),
      allocationRate: num(china["allocationRate"], base.china.allocationRate),
    },
    operational: {
      rateBeforeChina: num(operational["rateBeforeChina"], base.operational.rateBeforeChina),
      rateAfterChina: num(operational["rateAfterChina"], base.operational.rateAfterChina),
    },
    dubai: {
      target: num(dubai["target"], base.dubai.target),
      rateBeforeChina: num(dubai["rateBeforeChina"], base.dubai.rateBeforeChina),
      rateAfterChina: num(dubai["rateAfterChina"], base.dubai.rateAfterChina),
    },
    currency: {
      default: currencyCode(currency["default"], base.currency.default),
      usdInrRate: num(currency["usdInrRate"], base.currency.usdInrRate),
      rateUpdatedAt: str(currency["rateUpdatedAt"], base.currency.rateUpdatedAt),
    },
  };
}

/**
 * Structural equality for two configs. Used to decide whether Settings has
 * unsaved changes, so it must not depend on key insertion order.
 */
export function configsEqual(a: FinanceConfig, b: FinanceConfig): boolean {
  if (a === b) return true;
  const foundersEqual = a.founders.every((f, i) => {
    const o = b.founders[i];
    return Boolean(o) && f.id === o!.id && f.name === o!.name && f.salaryRate === o!.salaryRate;
  });
  return (
    foundersEqual &&
    a.china.target === b.china.target &&
    a.china.allocationRate === b.china.allocationRate &&
    a.operational.rateBeforeChina === b.operational.rateBeforeChina &&
    a.operational.rateAfterChina === b.operational.rateAfterChina &&
    a.dubai.target === b.dubai.target &&
    a.dubai.rateBeforeChina === b.dubai.rateBeforeChina &&
    a.dubai.rateAfterChina === b.dubai.rateAfterChina &&
    a.currency.default === b.currency.default &&
    a.currency.usdInrRate === b.currency.usdInrRate
    // rateUpdatedAt is metadata stamped at save time — never a user-visible edit.
  );
}

/** Read the browser-cached config. Returns defaults on SSR or bad data. */
export function loadConfig(): FinanceConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return coerceConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Write the browser cache. This is the offline/not-signed-in tier. */
export function saveConfig(config: FinanceConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* storage full or unavailable — ignore, config stays in memory */
  }
}

export function resetConfig(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
