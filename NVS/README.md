# NovelShare

Web app for discovering fiction, following authors, and drafting new chapters. Frontend is static HTML/CSS/JS; backend uses Supabase (Postgres + auth/storage) for data and auth.

## Features
- Reader experience: homepage hero, browse grid, novel detail, chapter reader with progress, and personal library.
- Account flows: signup/login, email verification, password reset/forgot, and profile view/edit screens.
- Author tools: dashboards to add/edit novels and chapters, plus work detail pages.
- Persistent UX niceties: guest-mode redirect, localStorage hints, responsive layouts, shared styling.

## Project structure
- `index.html` – entry that redirects to `pages/home.html`.
- `pages/` – all UI screens (home, browse, library, reader, profile, auth, author tools).
- `assets/` – shared CSS, images, and icons.
- `database/` – SQL schema/query sketches; align tables with your Supabase project.

## Running locally
1) From `NVS/`, start a simple server (avoids file:// CORS quirks): `python -m http.server 8000`
2) Visit `http://localhost:8000/` (redirects to `pages/home.html`). You can also open `index.html` directly in a browser if preferred.

## Deployment
- Live preview: https://novel-share.vercel.app

## Notes
- Wire API calls to your Supabase project URL and anon/public keys (store secrets securely; do not commit service keys).
- Ensure Postgres tables/policies in Supabase match `database/` schemas; add RLS policies for per-user access.
- Update assets/styles in `assets/` to rebrand without touching page markup.
