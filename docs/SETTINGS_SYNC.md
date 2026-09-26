# Settings: explicit save + Google account sync

Settings never save while you type. Edits live in a draft on the page; the save
bar at the bottom shows **Unsaved changes** and nothing is persisted until you
press **Save changes** (or throw the draft away with **Discard**).

Saving writes to two places:

| Tier | Where | When |
| --- | --- | --- |
| Browser | `localStorage` (`alkwiti.finance.config.v1`, `alkwiti.theme.v1`) | Always — works offline and before Supabase is configured |
| Google account | Supabase Auth user metadata | Whenever someone is signed in |

No database tables are involved. Supabase stays purely an authentication
provider: the account copy rides along on the auth user's `user_metadata` (the
`raw_user_meta_data` the Auth schema already maintains), written with
`auth.updateUser({ data })` and read back off the session. That's what makes
saved settings follow a founder's Google account to any device or browser.

On sign-in the account copy is read and applied. If the account has nothing
saved yet, whatever is in the current browser is pushed up to seed it.

A local save always succeeds. If the account write fails, you get a "Saved to
this browser only" toast with the reason, and the Settings page offers a retry.

---

## Production setup

Nothing extra. If Google sign-in works ([AUTH_SETUP.md](./AUTH_SETUP.md)),
account sync works — it's the same auth user record. When
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are absent, the app says so on
the Settings page and stays in browser-only mode.

### Verifying it

1. Sign in with Google, change a value, press Save. The toast should read
   "Synced to your Google account."
2. In Supabase, **Authentication → Users →** that user should show an
   `alkwiti_settings` key under their user metadata (or query
   `select raw_user_meta_data from auth.users` in the SQL editor).
3. Sign in on another browser — the saved values should load.

---

## Tradeoffs of using auth metadata

Worth knowing, since this is deliberately not a table:

- **It travels in the access token.** `user_metadata` is embedded in the JWT, so
  the payload is kept to the config object plus a theme string — a few hundred
  bytes. Don't grow it into arbitrary application data.
- **It's writable by its owner** and must never drive authorization. These are
  display and calculation preferences, so that's fine. Anything security
  relevant would need `app_metadata` or a table with RLS.
- **Supabase's own guidance** is that a `public` table is the better home for
  user data that grows, and that metadata suits data specific to the signed-in
  user which rarely changes ([managing user data](https://supabase.com/docs/guides/auth/managing-user-data)).
  Settings fit the latter. If they ever outgrow that, the swap is contained to
  `src/lib/settings/account.ts`.
- **Metadata is refreshed from Google's claims on sign-in.** Custom keys are
  namespaced under `alkwiti_settings` and preserved, but the browser copy is
  kept as a second tier anyway so a device never loses its settings if the
  account copy is ever reset.

_Content in this section reflects Supabase's published guidance, rephrased for
compliance with licensing restrictions._

---

## How it fits together in code

| Piece | File |
| --- | --- |
| Settings UI, draft state, save bar | `src/routes/settings.tsx` |
| Two-tier save + account hydration | `src/lib/settings/sync.tsx` (`useSettingsSync`) |
| Auth-metadata read/write | `src/lib/settings/account.ts` |
| Committed config + browser cache | `src/lib/finance/store.tsx`, `src/lib/finance/config.ts` |
| Appearance (live preview vs saved) | `src/lib/theme.tsx` |

Two behaviours worth knowing:

- **Appearance previews live.** Picking Light/Dark/System on the Settings page
  applies immediately so you can see it, but it's only kept once you Save.
  Navigating away from an unsaved appearance change reverts it. The quick toggle
  in the header is separate: it commits straight away, and syncs to the account
  too so a reload can't pull a stale value back.
- **The header currency switch** changes the current view only. The saved
  default lives in Settings → Currency.

Untrusted JSON — both the `localStorage` copy and the metadata payload — runs
through `coerceConfig` in `src/lib/finance/config.ts`, which merges it field by
field over the defaults. A partial or malformed payload can't produce `NaN`
rates or a missing founder.
