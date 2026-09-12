# Production migration — 12 September 2026

The latest application uses Supabase through `/api/app/*`. Local demo accounts remain available only in local development.

## Persistence and authorization
- `004_live_backend.sql` adds RLS-protected records and atomic revision-checked writes; existing v1 tables remain intact.
- Only server-side service credentials can access these records. Each request validates Google authentication with Supabase and enforces role/ownership permissions.
- Archive contributors manage groups, sets and playlists. Super Admin controls roles and user management.
- Public media uploads use `teksboy-media`; verification images use private `teksboy-evidence`, served only to their owner and authorized reviewers.
- Local sign-in/account enumeration endpoints are unavailable in production.

## Import
- Imported 81 current sets, 14 groups, 4 tracks, 22 community links, 4 types and 13 avatars.
- No local test users, checklists, comments or evidence were imported.
- The existing real Google account is Super Admin. Its two earlier live checklists were preserved with legacy sets archived from the public catalog.
- Import scripts are additive and preserve previously imported rows. Do not run the old catalog seed over production.

## Validation
- TypeScript and domain tests cover authentication requirements, contributor permissions, owner bootstrap, ownership isolation, private evidence, verification approval and invalidation.
- Production smoke checks validate Supabase connectivity, anonymous reads and denial of CMS/local-login access.
- The repository has pre-existing lint errors in unused UI primitives; migration files are checked separately.

## Operations
Set runtime variables SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY (secret), TEKSBOY_OWNER_EMAIL and SITE_URL. Do not expose the server key in client configuration.

The server applies a revision-checked transaction to a request-scoped copy of records. This keeps current behavior consistent for this initial community release. At higher volume, replace whole-snapshot reads with indexed per-feature queries and paginate activity/notifications. Database backups and ongoing monitoring remain operational responsibilities.
