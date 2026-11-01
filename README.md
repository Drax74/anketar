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

## Browser checks

```sh
npx playwright install chromium
npm test
```

The tests run their own Vite server and use fictional members and accommodations. Authentication, API requests, scraper responses, and realtime connections are mocked; tests never change the live poll. To use a system Chromium installation instead:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

The interface supports mobile browsing/rankings navigation, a desktop ranking sidebar, explicit owner editing, browser Back/Forward for mobile details, and reduced-motion preferences.

On mobile, swipe horizontally across the content to switch between Stays and Rankings. Swipe right in a detail to return to the view that opened it, even after scrolling the detail. Pull down at the top of Stays to refresh, or at the top of a detail/add sheet to dismiss it. Short drags do not trigger actions. Screen-edge gestures, multiple fingers, form controls, and active editing stay with the browser; scrolling a sheet back to its top does not dismiss it in the same gesture. Reduced-motion mode keeps the refresh status visible without a spinning animation. No gesture library is required.

## App text

All app-owned copy lives in `src/locales/hr.json` as plain-text key/value pairs, including accessibility labels, placeholders, messages, social metadata, and PWA labels. Edit wording there. Accommodation titles, descriptions, notes, and member names come from Supabase; developer console diagnostics are kept in code.

In JavaScript, use `t('form.title')` from `src/i18n.js`. Messages with values use named placeholders: `t('stay.creator', { name })` fills `{name}`. Use `t()` with `textContent` or `setAttribute`; use `htmlText()` when inserting a message into HTML markup so characters and quotes are escaped. Catalog values must not contain HTML. Croatian vote forms use `votes.one`, `votes.few`, and `votes.other`, selected through `Intl.PluralRules`.

In `index.html` and HTML partials, use `{{t:form.title}}`. Vite resolves these markers for both development and production, so page text and metadata are present in the initial HTML. The PWA manifest reads the same catalog at build time; rebuild after changing its copy. This centralizes the current Croatian language without adding a language picker or dependencies.

`npm test` runs language-helper checks before the browser suite; `npm run test:unit` runs those checks alone.
