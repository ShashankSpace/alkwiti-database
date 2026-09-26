import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/supabase/auth";
import { useFinance } from "@/lib/finance/store";
import { useTheme, type ThemeMode } from "@/lib/theme";
import {
  accountSyncAvailable,
  fetchAccountSettings,
  writeAccountSettings,
  type AccountSettings,
} from "./account";

/**
 * Ties the Settings page to two storage tiers:
 *
 *   1. this browser (localStorage) — always written, works offline and when
 *      Supabase isn't configured
 *   2. the signed-in Google account (Supabase Auth user metadata) — written on
 *      Save and read back on sign-in, so settings follow the user across
 *      devices in production. No database tables involved.
 *
 * Nothing here auto-saves. The Settings page keeps a draft and calls `save()`.
 */
export type SettingsSyncStatus =
  | "disabled" // Supabase not configured (local dev without keys)
  | "signed-out"
  | "loading" // reading the account's saved settings
  | "ready"
  | "error";

export interface SettingsSaveResult {
  /** The browser copy always gets written, even if the account write fails. */
  savedLocally: boolean;
  syncedToAccount: boolean;
  error: string | null;
}

interface SettingsSyncState {
  status: SettingsSyncStatus;
  /** Whether account sync is possible at all (Supabase configured). */
  available: boolean;
  signedIn: boolean;
  /** The Google account settings sync to, when signed in. */
  accountEmail: string | null;
  /** Last account-sync error, if any. Local saves still succeeded. */
  error: string | null;
  saving: boolean;
  lastSavedAt: Date | null;
  /** Persist settings: browser first, then the account. */
  save: (next: AccountSettings) => Promise<SettingsSaveResult>;
  /** Re-read the account's saved settings. */
  reload: () => void;
}

const SettingsSyncContext = createContext<SettingsSyncState | null>(null);

export function SettingsSyncProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { config, commitConfig, configHydrated, setCurrency } = useFinance();
  const { mode, setMode } = useTheme();

  const [loadingAccount, setLoadingAccount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Read the latest committed values inside effects without making them deps.
  const configRef = useRef(config);
  configRef.current = config;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  /**
   * The theme we believe the account holds. null until the account has been
   * read, which keeps the background theme-push effect below quiet during
   * hydration.
   */
  const accountThemeRef = useRef<ThemeMode | null>(null);

  const userId = user?.id ?? null;

  const applyAccountSettings = useCallback(
    (settings: AccountSettings) => {
      commitConfig(settings.config);
      setCurrency(settings.config.currency.default);
      setMode(settings.theme);
    },
    [commitConfig, setCurrency, setMode],
  );

  // On sign-in: read the account's saved settings. If the account has none yet,
  // seed it from this browser so existing local settings migrate up.
  useEffect(() => {
    accountThemeRef.current = null;
    if (!accountSyncAvailable || !userId || !configHydrated) return;

    let cancelled = false;
    setLoadingAccount(true);
    setError(null);

    (async () => {
      try {
        const remote = await fetchAccountSettings();
        if (cancelled) return;
        if (remote) {
          accountThemeRef.current = remote.theme;
          applyAccountSettings(remote);
        } else {
          const seed = { config: configRef.current, theme: modeRef.current };
          accountThemeRef.current = seed.theme;
          await writeAccountSettings(seed);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not reach your account settings.");
      } finally {
        if (!cancelled) setLoadingAccount(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, configHydrated, reloadKey, applyAccountSettings]);

  // The header's light/dark toggle commits a theme outside the Settings page, so
  // mirror any committed change up to the account. Without this, a reload would
  // pull the stale account theme back and the toggle would look like it failed.
  useEffect(() => {
    if (!accountSyncAvailable || !userId) return;
    if (accountThemeRef.current === null || accountThemeRef.current === mode) return;

    accountThemeRef.current = mode;
    let cancelled = false;
    writeAccountSettings({ config: configRef.current, theme: mode }).catch((e: unknown) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "Could not save your appearance preference.");
    });

    return () => {
      cancelled = true;
    };
  }, [mode, userId]);

  const save = useCallback<SettingsSyncState["save"]>(
    async (next) => {
      setSaving(true);
      try {
        // Tier 1 — in memory + this browser. Never fails loudly.
        commitConfig(next.config);
        setCurrency(next.config.currency.default);
        setMode(next.theme);

        // Tier 2 — the signed-in Google account.
        if (!accountSyncAvailable || !userId) {
          setError(null);
          setLastSavedAt(new Date());
          return { savedLocally: true, syncedToAccount: false, error: null };
        }

        try {
          accountThemeRef.current = next.theme;
          await writeAccountSettings(next);
          setError(null);
          setLastSavedAt(new Date());
          return { savedLocally: true, syncedToAccount: true, error: null };
        } catch (e) {
          const message =
            e instanceof Error ? e.message : "Could not save to your account. Try again.";
          setError(message);
          setLastSavedAt(new Date());
          return { savedLocally: true, syncedToAccount: false, error: message };
        }
      } finally {
        setSaving(false);
      }
    },
    [commitConfig, setCurrency, setMode, userId],
  );

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const status: SettingsSyncStatus = !accountSyncAvailable
    ? "disabled"
    : authLoading || loadingAccount
      ? "loading"
      : !userId
        ? "signed-out"
        : error
          ? "error"
          : "ready";

  const value = useMemo<SettingsSyncState>(
    () => ({
      status,
      available: accountSyncAvailable,
      signedIn: Boolean(userId),
      accountEmail: user?.email ?? null,
      error,
      saving,
      lastSavedAt,
      save,
      reload,
    }),
    [status, userId, user?.email, error, saving, lastSavedAt, save, reload],
  );

  return <SettingsSyncContext.Provider value={value}>{children}</SettingsSyncContext.Provider>;
}

export function useSettingsSync(): SettingsSyncState {
  const ctx = useContext(SettingsSyncContext);
  if (!ctx) throw new Error("useSettingsSync must be used within a SettingsSyncProvider");
  return ctx;
}
