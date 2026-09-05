# Teksboy

A card archive and Google-authenticated checklist app, built with React, TypeScript, Vinext (Next.js API compatibility), and Supabase PostgreSQL.

## Run

Use Node 22.13+ (Node 24 recommended).

```sh
npm ci
cp .env.example .env
npm run dev
```

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env`. Only the public key is exposed by `/api/config`; never put a service-role key there.

## Database

Apply `supabase/001_schema.sql` once to a new project, followed by `supabase/002_seed.sql` and `supabase/003_catalog_visibility.sql`. The seed imports 10 sets, 541 numbered cards, and three category tracks. Back prints are covers, not collectible cards. The media storage bucket is public for catalog artwork, with administrator-only uploads.

All application tables use row-level security. Users can only write their own checklists. Card membership in the checklist's set is checked by a database trigger. Catalog changes and administrator checklist changes are logged. Catalog IDs and card set membership cannot change. Archive sets instead of deleting records referenced by collectors.

## Google login

Enable Google in Supabase Authentication → Sign In / Providers. Supply a Google Cloud OAuth web client ID and secret. Configure its authorized redirect URI as `https://YOUR_PROJECT.supabase.co/auth/v1/callback`. Add your app's production URL and `http://localhost:3000/` to Supabase Authentication → URL Configuration. The app uses PKCE.

After the owner's first login, assign administrator access in SQL Editor:

```sql
insert into public.admin_users(user_id)
select id from auth.users where email = 'YOUR_OWNER_EMAIL'
on conflict do nothing;
```

Administrator access is never derived from editable user metadata. Visit `/admin` after signing in. CMS supports catalog and playlist editing, uploads, validated bulk card import, user suspension, checklist inspection and corrections, and audit viewing. Role assignment is an owner-only SQL operation.

## Checks

```sh
npx tsc --noEmit
node --experimental-strip-types --test scripts/core.test.ts
npm run build
```

## Behavior

- Anonymous visitors can browse and use an explicitly unsaved checklist preview. Creating a personal checklist requires Google login.
- Checklist changes save individually; failed saves roll back and display an error. Pending changes block closing the editor.
- PNG exports use actual scans, contain no email, and split into 20-card pages.
- Category music starts on opening the editor when browser policy permits. Mute and volume are device-local preferences.
- Reduced-motion users receive static state feedback.
- WebMCP `open_teks_set` is feature-detected. Its browser contract has not been verified in a supported WebMCP context.

## Deploy

`npm run build` produces a Cloudflare Worker and static assets through Sites. Configure the same two environment variables in the deployment platform. GitHub stores the source; a server-capable host is required (this build is not a GitHub Pages static export).

