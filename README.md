# Madrid accommodation poll

A private group poll built with Vite, Supabase, and Motion. Use Node.js 24 LTS (minimum 22.12).

```sh
npm ci
npm run dev
```

Open the Vite address with the `/anketar/` base path. The existing Supabase project provides Google authentication, approved membership, accommodations, votes, and the scraper Edge Function. Database policies and the Edge Function are deployed separately in Supabase.

Inter and Material Symbols are bundled locally from Fontsource. Building does not fetch Google Fonts. Only the Material symbols listed in `src/shared/material-icons.json` are shipped; npm scripts regenerate the small icon font automatically. Add new symbols to that mapping before using them (static HTML uses their numeric entities; JavaScript uses `materialIcon(name)`). Croatian Inter letters also use a generated subset; other languages retain the original Fontsource faces and load only when needed. The 800-pixel hero variant serves smaller screens. `public/madrid-default.webp` is the optimized accommodation fallback, derived from `public/madrid-panorama.png`. Empty photos, failed image requests, and the legacy Unsplash default use this shared local image; custom photos keep their own URLs. The original panorama is excluded from offline precaching. Font licenses are distributed in `public/font-licenses.txt`.

```sh
npm run build
npm run preview
```

GitHub Pages builds and deploys `main` through `.github/workflows/deploy.yml`. Build output is generated under `dist`; use an external `--outDir` when checking a build without changing the tracked deployment files.

## Interactive mock development

```sh
npm ci
npm run dev:mock
```

Open the Vite address on port **5175**, with the `/anketar/` base path. This runs the real app against **Mock Service Worker**, with 32 fictional approved users and 16 accommodations. The crowded scenario includes 28, 24, 19, 14, 11, and 10-vote cards, long Croatian names, long/unbroken titles, availability badges, missing photos, and an old entry with no price. The first user is a mock super admin; the others are regular users.

The floating **MOCK · 32 users** control lets you switch users, choose **crowded / tied / empty**, reset data, and simulate another user's vote. Changes persist in this mock origin's local storage until reset. Opening another tab shares the mock accommodations/votes while each tab keeps its own selected user, so you can inspect realtime updates interactively. Scraping returns fictional data; use an accommodation link containing `manual` to exercise the manual-entry fallback.

Hide the controls using their button, or append `?mockControls=0` for clean screenshots. Reload restores controls hidden with the button.

Mock mode uses a local `/anketar/mock-api` endpoint and separate per-tab auth storage; it never reuses a live Supabase session. The official MSW Vite plugin serves the worker only during mock development. The bootstrap waits for MSW before creating the Supabase client. Normal `npm run dev` keeps the real backend; production builds exclude the worker, handlers, mock controls, and seeded data. This mock backend is for UI development and does not replace tests of real Supabase permissions or replication.

`tests/mock-dev.spec.mjs` exercises the actual browser service worker, crowded layouts at six screen widths, writes/reloads, controls, roles, and cross-tab realtime. After building, run `npm run check:production -- <build-directory>` to verify mock assets/data are excluded; CI runs this check too.

## Browser checks

```sh
npx playwright install chromium
npm test
```

The tests run their own Vite server and use fictional members and accommodations. Authentication, API requests, scraper responses, and realtime connections are mocked; tests never change the live poll. To use a system Chromium installation instead:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

`tests/multi-user.spec.mjs` opens two isolated browser contexts with different approved users and a shared in-memory backend. Writes in one session produce Supabase/Phoenix WebSocket messages for both sessions, which pass through the actual Supabase SDK and app subscription handlers. The tests verify new cards, vote additions/removals, rankings, avatars, open details, availability, duplicate events before/after HTTP responses, and simultaneous votes. They also cover reconnect catch-up, stale snapshots, pending creates, server-side deletion, and preserving an unsaved owner form when an admin edits the same proposal. Assertions verify that the documents never reload.

Run only these checks with `npm test -- tests/multi-user.spec.mjs` (add the Chromium environment variable above when using the system browser). The fixture intercepts all Supabase traffic and does not contact a real project. It tests client synchronization, not Supabase replication configuration or live database permissions; a separate real-backend integration suite is still needed for those.

`.github/workflows/test.yml` runs the unit/browser suite and production build on pull requests and pushes to `main`, and can also be triggered manually. Failed browser traces are retained as an artifact. It needs no Supabase credentials.

On subscription/reconnection the app fetches a fresh poll snapshot because Postgres changes are not replayed for disconnected clients. Live-event revisions prevent a delayed snapshot from overwriting newer events, and pending creates/votes remain visible while their requests complete.

The interface supports mobile browsing/rankings navigation, a desktop ranking sidebar, explicit owner editing, browser Back/Forward for mobile details, and reduced-motion preferences.

Click an accommodation's voter avatars (including the `+N` avatar) to open **Glasali su**, a scrollable list of everyone who voted. It uses the same whitelist-derived names as the cards, highlights your own vote, and updates while votes change. The popup works from cards, details, and the featured ranking row; Escape, the close button, or the backdrop dismiss it and return focus to the avatar control.

On mobile, swipe horizontally across the content to switch between Stays and Rankings. Swipe right in a detail to return to the view that opened it, even after scrolling the detail. Pull down at the top of Stays to refresh, or at the top of a detail/add sheet to dismiss it. Short drags do not trigger actions. Screen-edge gestures, multiple fingers, form controls, and active editing stay with the browser; scrolling a sheet back to its top does not dismiss it in the same gesture. Reduced-motion mode keeps the refresh status visible without a spinning animation. No gesture library is required.

## App text

All app-owned copy lives in `src/locales/hr.json` as plain-text key/value pairs, including accessibility labels, placeholders, messages, social metadata, and PWA labels. Edit wording there. Accommodation titles, descriptions, notes, and member names come from Supabase; developer console diagnostics are kept in code.

In JavaScript, use `t('form.title')` from `src/i18n.js`. Messages with values use named placeholders: `t('stay.creator', { name })` fills `{name}`. Use `t()` with `textContent` or `setAttribute`; use `htmlText()` when inserting a message into HTML markup so characters and quotes are escaped. Catalog values must not contain HTML. Croatian vote forms use `votes.one`, `votes.few`, and `votes.other`, selected through `Intl.PluralRules`.

In `index.html` and HTML partials, use `{{t:form.title}}`. Vite resolves these markers for both development and production, so page text and metadata are present in the initial HTML. The PWA manifest reads the same catalog at build time; rebuild after changing its copy. This centralizes the current Croatian language without adding a language picker or dependencies.

`npm test` runs language-helper checks before the browser suite; `npm run test:unit` runs those checks alone.

## Availability and roles

`options.created_by` stores the creator's email, not their displayed name. Cards and details resolve it against `whitelist.name`. Editing never changes that identity.

`options.is_taken` is a non-null boolean, default `false`. The existing edit form exposes a **Zauzeto** checkbox to the owner and super admin. A taken accommodation keeps its existing votes and interactions and shows a dark-red badge on cards/details, ranking rows, sidebar rows, and the unique-leader teaser. Availability changes received through realtime refresh these badges too.

`whitelist.role` supports `user` (default) and `super_admin`. Approved regular users retain their existing behavior and can edit only their own proposals; a super admin can edit any proposal. Roles come only from the whitelist, never Google user metadata. There is no role-management UI. Assignments and changes to whitelist identity must be made through trusted database administration.

Deploy the database changes through the Supabase SQL Editor as the database owner, in this order:

1. Run `supabase/migrations/202611010001_availability_roles.sql`. It adds the fields, validates role values, enables owner/admin UPDATE policies, and protects roles and creator identity. Existing SELECT/INSERT/DELETE policies remain in place. Unknown restrictive UPDATE/ALL policies cause a transactional failure so they can be reviewed without silently removing existing rules.
2. Run `supabase/admin/assign_super_admin.sql` to assign `draksic.m@gmail.com`, the explicitly selected account. It requires exactly one matching whitelist record. Other existing accounts stay `user`.
3. Reload the app and confirm the owner/admin edit paths using actual accounts. The database checks the current role on every update, so a role revocation does not depend on refreshing a JWT.

These SQL files are not deployed by GitHub Pages. Until the migration is applied, the frontend keeps existing editing/adding working and hides the availability control on rows without `is_taken`; absent roles behave as `user`. Local mock/browser tests cannot establish live Supabase deployment or its existing policies.

To test the migration, its repeatability, and database access rules in a disposable PostgreSQL 16 container, run `bash scripts/test-database.sh` with the managed Docker daemon available. The test publishes no ports and uses no production credentials. Files under `supabase/tests` are test fixtures only and must never be run on the live project.
