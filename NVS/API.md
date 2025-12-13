# NovelShare API (Supabase/Postgres)

API surface is delivered through Supabase REST (PostgREST) and `@supabase/supabase-js`. All resources live in the `public` schema and are protected by Row Level Security (RLS) with policies defined in `database/schema.sql`.

## Base configuration
- Supabase URL: `https://dakeojhwurvhstxiuzsl.supabase.co`
- REST base: `https://dakeojhwurvhstxiuzsl.supabase.co/rest/v1`
- Headers (REST): `apikey: <anon-or-service-key>`, `Authorization: Bearer <supabase-jwt>`, `Content-Type: application/json`
- JS client: `const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);`
- Auth: Supabase Auth (email/password, OAuth). JWT from `supabase.auth.getSession()` is used for database calls. RLS enforces per-user access.

## Auth flows (JS client)
- Sign up: `supabase.auth.signUp({ email, password, options: { data: { username, display_name }}})` then insert profile row.
- Sign in: `supabase.auth.signInWithPassword({ email, password })`.
- OAuth (Google): `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo }})`.
- Sign out: `supabase.auth.signOut()` (UI also clears local user caches).
- Reset password: `supabase.auth.resetPasswordForEmail(email, { redirectTo })`.

## Resources & sample REST usage
Use `select` to shape responses. Unless noted, `id` columns are UUID. RLS notes describe who can do what.

### profiles
- Columns: `id (auth.users PK)`, `username`, `email`, `display_name`, `avatar_url`, `bio`, `location`, `website`, `is_author`, timestamps.
- RLS: anyone can `SELECT`; users can `INSERT/UPDATE` only their own row.
- REST
  - Get my profile: `GET /rest/v1/profiles?id=eq.<user_id>&select=*`
  - Update: `PATCH /rest/v1/profiles?id=eq.<user_id>` body `{ display_name, bio, avatar_url, ... }`

### novels
- Columns: `id`, `title`, `author_id (profiles)`, `author` (display name), `description`, `cover_image`, `genres text[]`, `tags text[]`, `status` (`ongoing|completed|hiatus`), `total_chapters`, `view_count`, `rating_avg`, `rating_count`, timestamps.
- RLS: everyone can `SELECT`; only author (matching `author_id`) can `INSERT/UPDATE/DELETE`.
- REST
  - List: `GET /rest/v1/novels?select=*&order=created_at.desc&limit=20&offset=0`
  - By id: `GET /rest/v1/novels?id=eq.<novel_id>&select=*`
  - Search title: `GET /rest/v1/novels?title=ilike.%25<q>%25&select=*`
  - Create/update: `POST /rest/v1/novels` or `PATCH /rest/v1/novels?id=eq.<novel_id>` body `{ title, description, cover_image, genres, status, author_id, author }`
  - Delete: `DELETE /rest/v1/novels?id=in.(<uuid1>,<uuid2>)`

### chapters
- Columns: `id`, `novel_id`, `chapter_number`, `title`, `content`, `status` (`draft|published|trash`), `word_count`, `is_premium`, timestamps. Unique `(novel_id, chapter_number)`.
- RLS: everyone can `SELECT`; only novel author can `INSERT/UPDATE/DELETE` (checked via `novels.author_id`).
- REST
  - List by novel: `GET /rest/v1/chapters?novel_id=eq.<novel_id>&select=*&order=chapter_number.asc`
  - By chapter number: `GET /rest/v1/chapters?novel_id=eq.<novel_id>&chapter_number=eq.<n>&select=*`
  - Create/update: `POST /rest/v1/chapters` or `PATCH /rest/v1/chapters?id=eq.<chapter_id>` body `{ novel_id, title, content, status, chapter_number }`
  - Delete: `DELETE /rest/v1/chapters?id=eq.<chapter_id>&novel_id=eq.<novel_id>`

### user_library
- Tracks a reader’s saved novels and progress.
- Columns: `id`, `user_id`, `novel_id`, `current_chapter`, `added_at`, `last_read_at`. Unique `(user_id, novel_id)`.
- RLS: users can `SELECT/INSERT/UPDATE/DELETE` only where `user_id = auth.uid()`.
- REST
  - List mine: `GET /rest/v1/user_library?user_id=eq.<user_id>&select=*,novels(*)&order=added_at.desc`
  - Add: `POST /rest/v1/user_library` body `{ user_id, novel_id, current_chapter }`
  - Update progress: `PATCH /rest/v1/user_library?user_id=eq.<user_id>&novel_id=eq.<novel_id>` body `{ current_chapter, last_read_at }`
  - Remove: `DELETE /rest/v1/user_library?user_id=eq.<user_id>&novel_id=eq.<novel_id>`

### reading_history
- Stores latest chapter read per novel.
- Columns: `id`, `user_id`, `novel_id`, `chapter_id` (UUID as text), `chapter_title`, `read_at`. Unique `(user_id, novel_id)`.
- RLS: users only on their rows.
- REST
  - List mine: `GET /rest/v1/reading_history?user_id=eq.<user_id>&select=*,novels(*)&order=read_at.desc`
  - Upsert: `POST /rest/v1/reading_history` body `{ user_id, novel_id, chapter_id, chapter_title, read_at }` with `Prefer: resolution=merge-duplicates`
  - Clear: `DELETE /rest/v1/reading_history?user_id=eq.<user_id>`

### bookmarks
- User bookmarks on chapters.
- Columns: `id`, `user_id`, `novel_id`, `chapter_id` (UUID as text), `note`, `created_at`.
- RLS: users only on their rows.
- REST
  - List mine: `GET /rest/v1/bookmarks?user_id=eq.<user_id>&select=*`
  - Add: `POST /rest/v1/bookmarks` body `{ user_id, novel_id, chapter_id, note }`
  - Delete: `DELETE /rest/v1/bookmarks?id=eq.<bookmark_id>&user_id=eq.<user_id>`

### ratings
- Per-user rating per novel; trigger updates `novels.rating_avg`/`rating_count`.
- Columns: `id`, `user_id`, `novel_id`, `rating (1-5)`, `updated_at`. Unique `(user_id, novel_id)`.
- RLS: users only on their rows; everyone can `SELECT`.
- REST
  - Upsert: `POST /rest/v1/ratings` body `{ user_id, novel_id, rating, updated_at }` with `Prefer: resolution=merge-duplicates`
  - Get my rating: `GET /rest/v1/ratings?user_id=eq.<user_id>&novel_id=eq.<novel_id>&select=rating&limit=1`
  - List for a novel: `GET /rest/v1/ratings?novel_id=eq.<novel_id>&select=rating`

### follows
- Follower/following relationships between profiles.
- Columns: `id`, `follower_id`, `following_id`, `created_at`. Unique `(follower_id, following_id)`.
- RLS: `SELECT` open; `INSERT/DELETE` only for `follower_id = auth.uid()`.
- REST
  - Follow: `POST /rest/v1/follows` body `{ follower_id, following_id }`
  - Unfollow: `DELETE /rest/v1/follows?follower_id=eq.<user_id>&following_id=eq.<author_id>`
  - Who I follow: `GET /rest/v1/follows?follower_id=eq.<user_id>&select=*,profiles!follows_following_id_fkey(*)`

### comments (optional/future)
- Columns: `id`, `user_id`, `novel_id`, `chapter_id` (int), `parent_id`, `content`, `likes_count`, timestamps.
- RLS: `SELECT` open; `INSERT/UPDATE/DELETE` for owner.
- REST
  - List by novel: `GET /rest/v1/comments?novel_id=eq.<novel_id>&select=*`
  - Add: `POST /rest/v1/comments` body `{ user_id, novel_id, chapter_id, parent_id, content }`
  - Update/delete own: `PATCH/DELETE /rest/v1/comments?id=eq.<comment_id>&user_id=eq.<user_id>`

## Supabase JS helpers in code
Key wrappers live in `assets/js/supabase.js`:
- `SupabaseAuth`: `signUp`, `signIn`, `signInWithGoogle`, `resetPassword`, `updatePassword`, `getSession`, `getCurrentUser`, `signOut`.
- `SupabaseDB`: CRUD helpers for `profiles`, `novels`, `chapters`, `user_library`, `reading_history`, `ratings`, `follows`; plus helpers like `countChapters`, `getNovelsByAuthor`, `searchNovels`.
- `SupabaseSync`: syncs localStorage library/history with Supabase; cleans stale rows; manages local deletion markers.
- `NetworkStatus`: lightweight online/offline detection plus Supabase reachability check.

## RLS expectations
- Auth JWT must be present for any write and for user-scoped reads.
- Profiles: users can only mutate their own row.
- Novels/chapters: only the author (`author_id`) may insert/update/delete; reads are public.
- Library/history/bookmarks/ratings/follows: scoped to `auth.uid()`; ratings/follows are publicly readable.
- Ensure service role key is used only in secure server environments; never expose it in the client.
