# Contributing to Thok

Thok is a community-driven Dinka language-preservation project. Contributions of
code, concepts, and dialect data are all welcome.

## Ground rules

- **Frontend is dumb.** All business logic (scheduling, scoring, dialect
  routing, visibility) lives in Edge Functions and the database. The client
  renders what the server returns and queues what the user submits — nothing
  more. Keep it that way.
- **Offline-first.** Every user action must succeed without a network. Write to
  IndexedDB first, then sync. Never block the UI on a request.
- **Scalable by data, not code.** New languages, dialects, concepts, and scoring
  weights are added as database rows, not code changes.

## Development setup

See [README.md](./README.md#getting-started). In short:

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # fill in Supabase values
supabase db push                                # schema + seed data
npm run dev --workspace=apps/web
supabase functions serve                        # Edge Functions
```

## Before opening a pull request

Run the same checks CI runs:

```bash
npm run typecheck --workspace=apps/web
npm run lint --workspace=apps/web
npm run build --workspace=apps/web
```

All three must pass. The build uses `output: 'export'` (static PWA), so anything
that requires a server at runtime will fail the build by design.

## Project layout

- `apps/web/src/lib/` — `api` (server calls), `db` (Dexie/IndexedDB), `sync`
  (upload queue), `audio` (MediaRecorder).
- `apps/web/src/hooks/` — `useTask` and `useRecorder` own all task and recording
  state; components stay presentational.
- `supabase/functions/` — one Deno Edge Function per endpoint.
- `supabase/migrations/` — schema and seed data. Add a new timestamped migration
  rather than editing an applied one.

## Adding concepts

Insert rows into the `concepts` table (see the seed migration for the format).
For image prompts, upload the image to the `concepts` Storage bucket and set
`image_path` to its path.

## Licence

By contributing you agree your contributions are licensed under the MIT licence.
