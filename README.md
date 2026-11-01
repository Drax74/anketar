# Madrid accommodation poll

A private group poll built with Vite, Supabase, and Motion. Use Node.js 24 LTS (minimum 22.12).

```sh
npm ci
npm run dev
```

Open the Vite address with the `/anketar/` base path. The existing Supabase project provides Google authentication, approved membership, accommodations, votes, and the scraper Edge Function. Database policies and the Edge Function are deployed separately in Supabase.

Inter and Material Symbols are bundled locally from Fontsource. Building does not fetch Google Fonts. Font licenses are distributed in `public/font-licenses.txt`.

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
