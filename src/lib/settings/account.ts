import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { coerceConfig } from "@/lib/finance/config";
import type { FinanceConfig } from "@/lib/finance/types";
import type { ThemeMode } from "@/lib/theme";

/**
 * Account-level settings storage, built on Supabase Auth alone — no database
 * tables involved.
 *
 * Settings ride along on the auth user's `user_metadata` (the
 * `raw_user_meta_data` column Supabase Auth already maintains), written with
 * `auth.updateUser({ data })` and read back off the session. That's what makes
 * a founder's saved settings follow their Google account across devices.
 *
 * Two things to keep in mind, and why this stays small:
 *   - `user_metadata` travels inside the access token, so the payload is kept to
 *     the config object and a theme string (a few hundred bytes).
 *   - It is writable by the user it belongs to and must never drive
 *     authorization. These are display/calculation preferences, so that's fine.
 *
 * Every function degrades gracefully: without Supabase credentials the caller
 * falls back to the browser-cached copy.
 */
export interface AccountSettings {
  config: FinanceConfig;
  theme: ThemeMode;
}

/** The single `user_metadata` key this app owns. */
export const METADATA_KEY = "alkwiti_settings";

/** True when Supabase credentials exist, i.e. account sync is possible. */
export const accountSyncAvailable = isSupabaseConfigured;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isThemeMode(v: unknown): v is ThemeMode {
  return v === "light" || v === "dark" || v === "system";
}

/**
 * Pull settings out of an auth user. Returns null when the user has never saved
 * (so the caller can seed the account from this browser instead).
 */
export function readAccountSettings(user: User | null): AccountSettings | null {
  const raw = user?.user_metadata?.[METADATA_KEY];
  if (!isRecord(raw)) return null;
  return {
    // Metadata is user-writable, so treat it as untrusted and validate.
    config: coerceConfig(raw["config"]),
    theme: isThemeMode(raw["theme"]) ? raw["theme"] : "system",
  };
}

/**
 * Ask Supabase for the current user and read their saved settings. Authoritative
 * (hits the server) rather than trusting a possibly stale cached session.
 * Throws with a readable message when the request fails.
 */
export async function fetchAccountSettings(): Promise<AccountSettings | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message || "Could not read your account settings.");
  return readAccountSettings(data.user);
}

/**
 * Save settings onto the signed-in user's metadata. Throws on failure.
 *
 * `updateUser` merges the top-level keys of `data`, so writing under a single
 * namespaced key leaves the Google-provided fields (name, avatar_url, …) alone.
 */
export async function writeAccountSettings(settings: AccountSettings): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.auth.updateUser({
    data: {
      [METADATA_KEY]: {
        config: settings.config,
        theme: settings.theme,
        updatedAt: new Date().toISOString(),
      },
    },
  });

  if (error) throw new Error(error.message || "Could not save to your account.");
}
