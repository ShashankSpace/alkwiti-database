import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "./config";
import { dedupeInvoices } from "./data-source";
import { fetchFinanceData } from "./server";
import type {
  CurrencyCode,
  ExpenseRecord,
  FinanceConfig,
  InvoiceRecord,
  SalaryPayment,
} from "./types";

interface FinanceState {
  /**
   * The committed config — what every calculation reads. Settings edits live in
   * a local draft and only land here when the user presses Save; there is no
   * auto-save while typing.
   */
  config: FinanceConfig;
  /**
   * Commit a config: updates the in-memory value and the browser cache.
   * Account (Supabase) persistence is layered on top by `SettingsSyncProvider`
   * — call `useSettingsSync().save()` from the UI rather than this directly.
   */
  commitConfig: (next: FinanceConfig) => void;
  /** False until the browser-cached config has been read (SSR renders defaults). */
  configHydrated: boolean;

  /** Active display currency (mirrors config.currency.default but toggled live). */
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;

  invoices: InvoiceRecord[];
  expenses: ExpenseRecord[];
  salaryPayments: SalaryPayment[];

  loading: boolean;
  error: string | null;
  source: { name: string; isSample: boolean };
  lastSyncedAt: Date | null;
  refresh: () => void;
}

const FinanceContext = createContext<FinanceState | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<FinanceConfig>(DEFAULT_CONFIG);
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CONFIG.currency.default);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<{ name: string; isSample: boolean }>({
    name: "Sample data",
    isSample: true,
  });
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [configHydrated, setConfigHydrated] = useState(false);

  // Hydrate the browser-cached config on the client (SSR-safe).
  useEffect(() => {
    const stored = loadConfig();
    setConfig(stored);
    setCurrency(stored.currency.default);
    setConfigHydrated(true);
  }, []);

  const refresh = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchFinanceData()
      .then((payload) => {
        if (cancelled) return;
        setInvoices(dedupeInvoices(payload.invoices));
        setExpenses(payload.expenses);
        setSalaryPayments(payload.salaryPayments);
        setSource(payload.source);
        setError(payload.warning ?? null);
        setLastSyncedAt(new Date());
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load financial data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = refresh();
    return cleanup;
  }, [refresh]);

  const commitConfig = useCallback<FinanceState["commitConfig"]>((next) => {
    // Cache write happens here (not inside the setState updater) so the reducer
    // stays pure and React's double-invocation in dev can't write twice.
    saveConfig(next);
    setConfig(next);
  }, []);

  const value = useMemo<FinanceState>(
    () => ({
      config,
      commitConfig,
      configHydrated,
      currency,
      setCurrency,
      invoices,
      expenses,
      salaryPayments,
      loading,
      error,
      source,
      lastSyncedAt,
      refresh,
    }),
    [
      config,
      commitConfig,
      configHydrated,
      currency,
      invoices,
      expenses,
      salaryPayments,
      loading,
      error,
      source,
      lastSyncedAt,
      refresh,
    ],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceState {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be used within a FinanceProvider");
  return ctx;
}
