# Authentication setup — Supabase + Google

The ALKWITI dashboard uses **Supabase Auth** with **Google** as the sign-in
provider. The app code is already wired up; you only need to create the Supabase
project, connect Google, and drop two keys into a `.env` file.

Until those keys are present the app runs in a clear "Authentication not
configured" state and the dashboard stays open for local/sample use.

---

## 1. Create a Supabase project

1. Go to <https://supabase.com/dashboard> and create a new project.
2. Once it's ready, open **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **Project API keys → `anon` `public`** → `VITE_SUPABASE_ANON_KEY`

The anon key is safe to expose in the browser; row-level security protects data.

---

## 2. Create Google OAuth credentials

1. In the [Google Cloud Console](https://console.cloud.google.com/), create (or
   pick) a project.
2. **APIs & Services → OAuth consent screen** — configure it (External is fine;
   add the founders' emails as test users while in testing).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized redirect URI** — this must be your Supabase callback:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
     (Supabase shows this exact URL in the next step.)
4. Copy the generated **Client ID** and **Client secret**.

---

## 3. Enable Google in Supabase

1. In Supabase: **Authentication → Providers → Google**.
2. Toggle it on and paste the **Client ID** and **Client secret** from Google.
3. Save.

### Redirect URLs (Supabase → Authentication → URL Configuration)

- **Site URL**: your app origin, e.g. `http://localhost:8080` in dev or your
  production domain.
- **Redirect URLs** (allow-list) — add the app callback the code uses:
  ```
  http://localhost:8080/auth/callback
  http://localhost:8081/auth/callback
  https://<your-production-domain>/auth/callback
  ```
  The dev server falls back to `8081` when `8080` is busy, so both are listed.

---

## 4. Add the keys locally

```bash
cp .env.example .env
```

Fill in:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
```

Restart the dev server (Vite only reads env at startup):

```bash
npm run dev
```

`.env` is git-ignored — never commit real keys.

---

## 5. Restrict access to the founders (recommended)

Anyone with a Google account can complete the OAuth flow by default. To limit
the dashboard to the two founders, do one of:

- **Allow-list by email** in a Supabase Auth Hook / RLS policy, or
- Keep the Google OAuth consent screen in **testing** with only the founders
  added as test users.

---

## How it works in the code

| Piece | File |
| --- | --- |
| Supabase client (+ configured guard) | `src/lib/supabase/client.ts` |
| Auth context: `user`, `session`, `signInWithGoogle`, `signOut` | `src/lib/supabase/auth.tsx` |
| Sign-in screen ("Continue with Google") | `src/routes/auth.tsx` |
| OAuth redirect handler | `src/routes/auth.callback.tsx` |
| Route guard (redirects to `/auth`) | `src/components/dashboard/shell.tsx` |
| Signed-in user + sign out | `src/components/dashboard/sidebar.tsx` |

Flow: **/auth** → Google → **/auth/callback** (Supabase exchanges the code for a
session via PKCE) → **/** (dashboard). The session is persisted and auto-refreshed;
`onAuthStateChange` keeps the UI in sync. Signing out clears it and the guard
sends you back to `/auth`.

---

## Settings follow the account

Once Google sign-in works, saved Settings automatically sync to the signed-in
user via Supabase Auth user metadata — no tables, no extra setup. See
[SETTINGS_SYNC.md](./SETTINGS_SYNC.md).
