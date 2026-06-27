# Thok · Thuɔŋjäŋ

A mobile-first, offline-capable Progressive Web App for collecting foundational Dinka lexicon data — word-audio pairs with dialect metadata — to power future speech recognition, machine translation, and educational tools.

## Status

MVP · Dinka only · Active development

## What this is

Thok collects **Concept → Word → Audio** mappings from Dinka speakers. Contributors record native words against image or text prompts. A peer review system validates entries using dialect-aware affinity routing. The resulting dataset is exported in CLDF-compatible format for ML and linguistic research use.

## Documentation

Each source file carries a header comment explaining its design and rationale —
that is the source of truth. The database schema in `supabase/migrations/` is
similarly annotated, including the scoring model and an admin runbook for
activating new languages.

## Repo structure

```
thok/
├── apps/
│   └── web/                  # React PWA (Next.js)
│       └── src/
│           ├── app/          # Routes: home, onboarding, task
│           ├── components/   # Contribute, review, dictionary, layout
│           ├── hooks/        # useTask, useRecorder
│           ├── lib/          # api, supabase, db (Dexie), sync, audio
│           ├── store/        # Zustand app store
│           └── types/        # Shared TypeScript types
├── supabase/
│   ├── functions/            # Edge Functions (Deno)
│   └── migrations/           # SQL migrations (schema + seed data)
└── .github/workflows/        # CI: typecheck, lint, build
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (React), Tailwind CSS |
| Offline DB | IndexedDB via Dexie.js |
| Audio | MediaRecorder API (WebM/Opus) |
| Backend | Supabase (PostgreSQL + Storage + Edge Functions) |
| Deployment | Vercel (frontend) + Supabase (backend) |

## Getting started

### Prerequisites

- Node.js 18+
- Supabase CLI
- A Supabase project

### 1. Clone and install

```bash
git clone https://github.com/your-org/thok.git
cd thok
npm install
```

### 2. Set up environment variables

```bash
cp apps/web/.env.example apps/web/.env.local
# Fill in your Supabase project URL and anon key
```

### 3. Apply the database schema

```bash
supabase db push
```

This applies two migrations: the schema, and a seed migration that creates the
`concepts` and `lexicon` Storage buckets and loads a starter set of ~40 common
concepts. The app is usable immediately after this — no manual setup required.

To add more prompts later, insert rows into the `concepts` table. Rows with an
`image_path` render as image prompts (upload the image to the `concepts`
bucket); rows with `prompt_context` render as context prompts; rows with neither
render the English gloss as a word prompt.

### 4. Run the development server

```bash
npm run dev --workspace=apps/web
```

### 5. Run Edge Functions locally

```bash
supabase functions serve
```

## Design principles

1. **Offline-first** — all user actions succeed without internet
2. **Mobile-first** — target: Android budget devices
3. **Frontend is dumb** — all business logic lives on the backend
4. **Scalable by data** — new languages added via DB rows, not code changes
5. **Open by design** — CLDF-compatible export from day one

## Contributing

This is a community-driven language preservation project. Contributions welcome — see `CONTRIBUTING.md`.

## Licence

MIT
