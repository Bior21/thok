# Thok

A mobile-first, offline-capable Progressive Web App for digitizing and preserving indigenous African languages — starting with Dinka (Thuɔŋjäŋ) and Nuer (Thok Naath).

Contributors record words, translations, and pronunciations against image and text prompts. A peer review system validates entries. The resulting dataset powers future speech recognition, machine translation, and educational tools.

## Status

**Active development · Dinka + Nuer live · More languages coming**

## What this is

Thok collects **Concept → Word → Audio** mappings from speakers of indigenous African languages. Each language runs as an independent dataset on top of a shared concept library. Contributors record native words and sentences; other speakers from the same dialect group review and validate them using affinity-tier routing.

Any language community can request to bring their language to Thok via the in-app form. The schema is designed so new languages are activated by a database row, not a code change.

## Active languages

| Language | Native name | Status |
|---|---|---|
| Dinka | Thuɔŋjäŋ | Live |
| Nuer | Thok Naath | Live |
| Shilluk | Dhøg Cøllø | Planned |
| Bari | Bari | Planned |
| Zande | Zande | Planned |
| Juba Arabic | عربي جوبا | Planned |

## Features

- Contribute words and sentences with audio recordings
- Image, word, and context prompt types
- Peer review with dialect-aware affinity routing
- Offline-first — contributions saved locally, synced when online
- Daily streak tracking and milestone celebrations
- Social sharing (Facebook, WhatsApp) at contribution milestones
- Community language request form with email notification
- Installable as a PWA; Android TWA available for Google Play

## Repo structure

```
thok/
├── apps/
│   └── web/                    # Next.js PWA
│       └── src/
│           ├── app/            # Routes: home, onboarding, task, profile,
│           │                   #         request-language
│           ├── components/     # Contribute, review, dictionary, layout
│           ├── hooks/          # useTask, useRecorder
│           ├── lib/            # api, supabase, db (Dexie), sync, audio
│           ├── store/          # Zustand app store
│           └── types/          # Shared TypeScript types
├── supabase/
│   ├── functions/              # Edge Functions (Deno)
│   │   ├── register-contributor/
│   │   ├── next-task/
│   │   ├── submit-entry/
│   │   ├── submit-review/
│   │   ├── upload-audio/
│   │   ├── get-dictionary/
│   │   ├── get-concepts/
│   │   ├── skip-concept/
│   │   └── request-language/
│   └── migrations/             # SQL migrations (schema + seed data)
└── .github/workflows/          # CI: typecheck, lint, build
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (React), Tailwind CSS |
| Offline DB | IndexedDB via Dexie.js |
| Audio | MediaRecorder API (WebM/Opus) |
| Backend | Supabase (PostgreSQL + Storage + Edge Functions) |
| Email | Resend |
| Deployment | Vercel (frontend) + Supabase (backend) |

## Getting started

### Prerequisites

- Node.js 18+
- Supabase CLI
- A Supabase project

### 1. Clone and install

```bash
git clone https://github.com/Bior21/thok.git
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

This applies all migrations: schema, seed data (~370+ concepts including sentences), storage buckets, and multi-language setup. The app is usable immediately after — no manual setup required.

To add more prompts, insert rows into the `concepts` table. Rows with an `image_path` render as image prompts; rows with `prompt_context` render as context prompts; rows with neither render the English gloss as a word prompt.

### 4. Run the development server

```bash
npm run dev --workspace=apps/web
```

### 5. Run Edge Functions locally

```bash
supabase functions serve
```

### 6. (Optional) Enable email notifications

Set a Resend API key in Supabase secrets to receive email notifications when a language request is submitted:

```bash
supabase secrets set RESEND_API_KEY=your_key_here
```

## Adding a new language

1. The language row already exists in the `languages` table — set `is_mvp_active = TRUE`
2. Seed dialects into the `dialects` table if not already present
3. Populate `region_dialect_map` for the new language's regions
4. The onboarding screen picks up the new language automatically once it is active

## Design principles

1. **Offline-first** — all user actions succeed without internet
2. **Mobile-first** — target: Android budget devices
3. **Frontend is dumb** — all business logic lives on the backend
4. **Scalable by data** — new languages activated via DB rows, not code changes
5. **Open by design** — CLDF-compatible export from day one

## Contributing

This is a community-driven language preservation project. Contributions welcome — see `CONTRIBUTING.md`.

## Licence

MIT
