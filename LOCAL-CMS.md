# Local CMS

Start the app from PowerShell in this folder:

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" node_modules/vinext/dist/cli.js dev --port 3100
```

Open http://localhost:3100/cms and choose **Enter local CMS**. This is an explicitly local development administrator session, not production authentication. `/admin` redirects here.

## Included

- Collection Groups: create, edit, order, publish, archive, and delete unused groups.
- Collections: name, group, backprint, status, multiple image uploads, card ordering, and removal of unused cards.
- BGM Playlists: per-group tracks, audio uploads, and playback order.
- Users & Roles: local test profiles, Admin/VIP/Normal labels, and suspension. The built-in local administrator stays active. VIP benefits are not implemented; local test account switching is available.
- Dashboard: local user counts, users with checklists, most-collected sets, completion rates, and most-missing cards.

The local Login dialog lets you choose any active account from CMS Users. The account dropdown also offers Switch local account. Profiles, checklist writes, comments and notifications use the selected account session. Suspended accounts cannot sign in. Profiles and checklists now save to SQLite. Existing browser checklist/profile data is imported on first use where catalog IDs still match; the old browser copy is kept as a backup.

## Data and backups

- Database: `.local/teksboy.sqlite` (SQLite, seeded once from `lib/catalog.json` and `lib/categories.json`).
- New uploads: `public/local-media/`.
- Original catalog images: `public/images/teks/`.

Stop the server before backing up the `.local` folder, and also copy `public/local-media/`. Both are excluded from Git. Do not delete the database to refresh the catalog: use the CMS, as deleting it would discard local changes.

Refresh the Archives/checklist page after CMS changes. Published collections in published groups appear in Archives. Archived collections already on the demo collector's checklist remain available there. Save/delete checks prevent deleting collections in use or removing collected cards.

All users and analytics are local test data. Nothing connects to Supabase or publishes changes. The API runs only with the development server, rejects non-loopback access and cross-origin writes, and requires a local admin session for management. Production auth, roles, storage, and database migration are a later step.

Run local database regression tests:

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test scripts/local-cms.test.mjs
```


## Collectors and leaderboard

Collectors in the CMS lets an admin edit collected cards, verify a collection, add a private note, and optionally upload a proof photo. Proof is never required. Verification records the admin and date; changing collected cards, proof, or the collection's card images clears verification. Save changes before verifying again.

Proof uploads are stored under `.local/proofs/` and require the local admin session to view. They are included when backing up `.local`.

The leaderboard is now under Collectors and ranks active collectors by completed sets. Public responses exclude email addresses, proof photos and admin notes.

Super Admin: the protected built-in local administrator is upgraded automatically. Only Super Admins can create or edit Admin/Super Admin accounts. The badge uses an animated rainbow gradient and respects reduced-motion preferences.

## Local social features

The header contains Archives, Collectors, CMS (only when the signed-in account has Admin/Super Admin role), notifications, and an account dropdown. The dropdown links to My Profile, My Checklist, Edit Profile and Logout. The CMS still requires its separate local administrator session for management API access.

Collectors has All and Leaderboard tabs. All supports name search, group filtering and sorting with collection summaries. Leaderboard shows up to ten collectors ranked by completed collections; ties share competition ranks. Verification and roles do not affect rank. All existing and new profiles/checklists are public. Emails, admin notes and proof photos remain private.

My Profile and My Checklist use the collector profile page. Owners can edit their profile and open their checklist editor. Other collectors can view cards and comment/reply/make offers. `/checklist` resolves the signed-in local collector and opens the checklists section; `/leaderboard` redirects to Collectors' leaderboard tab.

Only an Admin/Super Admin session can delete comments through CMS Comments. Authors can edit their own comments; edits show an Edited label. Reporting and owner moderation are removed. Admin commenting restrictions and the five-comments-per-minute limit remain.

Notifications are automatic and in-app only, checked every 30 seconds or on opening the bell. Similar unread comment/reply/offer activity on a page within an hour is grouped. Visit counts are daily deduplicated views, not precise unique-person counts; anonymous local browsers use their user agent for deduplication. Visitor identities are not stored.

Card numbers remain stable when reordered and are included in missing-card downloads. New images receive unused references. Numbers assigned from the catalog may differ from printed card numbers. Cards referenced in comments cannot be deleted.

Everything remains local. Sessions last eight hours and reset with the server; the local demo login is not production authentication. Local sharing URLs only work on this computer. Tests: `node --test scripts/social.test.mjs scripts/local-cms.test.mjs`.

Profile cards and checklist headers show progress boxes and SET COMPLETED labels. Leaderboard supports verified-user filtering (independent of collection verification). Replies are grouped below their parent with indentation and author context.
