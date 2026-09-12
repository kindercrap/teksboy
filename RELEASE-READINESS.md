# Production release audit — 12 September 2026

Status: NOT READY TO DEPLOY the latest local feature set.

## Confirmed
- Production build succeeds on Node 24.
- Supabase project udvhnhdczlxmyeufyexe is healthy; Google authentication is enabled.
- Existing live schema: categories, sets, cards, tracks, profiles, admin_users, checklists, checklist_cards, audit_log.
- Existing hosting URL: https://teksboy-collection.directorremj.chatgpt.site (earlier deployment; not the latest local app).
- Live owner email confirmed privately by the user; assign its authenticated UUID during migration.
- Local test collectors, progress, comments and evidence must stay local.

## Blocking migration work
1. Replace development-only /__local endpoints with authenticated production APIs. The Vite configureServer middleware does not ship in the Worker build. Do not expose the account-switching or Enter local CMS login endpoints publicly.
2. Extend Supabase schema for profile bio/photo/Facebook, configurable roles and permissions, public collector/checklist views, pins, comments/replies, notifications, community types/links, avatars, verification requests and activity. Enforce ownership and role permissions in server code/RLS, not UI alone.
3. Import the current public catalog, preserving stable set/card IDs, group logos, prices, ordering and curated community/playlist data. The original 002_seed.sql is an outdated first catalog and must not be rerun over existing data.
4. Store public catalog uploads in public Storage; keep proof/evidence in a separate private bucket with short-lived authorized access.
5. Connect all screens and mutations to the production API, including exports, removal, Super Admin protection, reviewer decisions and notifications.
6. Assign the verified Google owner account Super Admin after confirming its authenticated UUID. Do not copy local-admin/local-demo identifiers or grant roles from user-editable auth metadata.
7. Replace local-only metadata lookup with production public collector lookup. Set the deployment origin and verify crawler-visible share tags.
8. Check Supabase redirect URLs, hosting audience and real sign-in/out on the final domain; run cross-user and anonymous access tests before release.

## Prepared public import
Run `node scripts/export-public-catalog.mjs` to refresh `supabase/import/public-catalog.json` and copy referenced public CMS uploads into `public/images/catalog-import/`. The export explicitly excludes users, checklists, comments, private evidence and local activity. It does not modify Supabase or the local database.

## Publishing tooling

The Sites plugin moved from curated-remote 0.1.62 to bundled 0.1.66 during preparation. The current publishing tools are available there. The remaining blocker is application/backend migration, not the build.

Do not present the old hosted URL as an updated release. Do not deploy the development middleware or local SQLite database to work around the migration.


