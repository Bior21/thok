-- =============================================================================
-- Seed data + storage buckets
-- Target: PostgreSQL 15+ (Supabase-compatible)
--
-- WHY THIS MIGRATION EXISTS:
-- The initial schema creates the `concepts` table and the Edge Functions read
-- from two Storage buckets (`concepts`, `lexicon`), but neither the concepts
-- nor the buckets are created anywhere. Without this migration a fresh project
-- runs but is unusable: GET /next-task returns NO_TASKS_AVAILABLE (no concepts)
-- and POST /upload-audio fails with STORAGE_ERROR (no `lexicon` bucket).
--
-- This migration makes a freshly-pushed database immediately usable.
-- =============================================================================

-- =============================================================================
-- STORAGE BUCKETS
-- Both buckets are private — the Edge Functions hand out short-lived signed
-- URLs (10-min expiry). `concepts` holds prompt images, `lexicon` holds audio.
-- On Supabase the storage schema always exists; on plain Postgres this is a
-- no-op-friendly insert that simply won't apply (Supabase is the target).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
    ('concepts', 'concepts', FALSE),
    ('lexicon',  'lexicon',  FALSE)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- CONCEPT SEED
-- A starter set of common, image-free concepts so the contribute loop works
-- the moment the app is deployed — no image upload required.
--
-- prompt_type is derived by the app:
--   image_path set      -> 'image'
--   prompt_context set  -> 'context'
--   neither set         -> 'word'   (these rows render as a plain English word)
--
-- swadesh_list = TRUE marks core basic-vocabulary items (ML priority targets).
-- Concepts here are deliberately culturally relevant to Dinka speakers
-- (cattle, milk, river) alongside the standard Swadesh basics.
-- =============================================================================

INSERT INTO concepts (id, english_gloss, swadesh_list, prompt_context) VALUES
    ('c_0001', 'water',   TRUE,  NULL),
    ('c_0002', 'fire',    TRUE,  NULL),
    ('c_0003', 'sun',     TRUE,  NULL),
    ('c_0004', 'moon',    TRUE,  NULL),
    ('c_0005', 'star',    TRUE,  NULL),
    ('c_0006', 'rain',    TRUE,  NULL),
    ('c_0007', 'wind',    TRUE,  NULL),
    ('c_0008', 'cow',     TRUE,  'What word do you use for a single cow?'),
    ('c_0009', 'cattle',  FALSE, 'What is the word for a herd of cattle?'),
    ('c_0010', 'milk',    TRUE,  NULL),
    ('c_0011', 'goat',    FALSE, NULL),
    ('c_0012', 'fish',    TRUE,  NULL),
    ('c_0013', 'bird',    TRUE,  NULL),
    ('c_0014', 'dog',     TRUE,  NULL),
    ('c_0015', 'tree',    TRUE,  NULL),
    ('c_0016', 'grass',   TRUE,  NULL),
    ('c_0017', 'river',   FALSE, 'What do you call a large river, like the Nile?'),
    ('c_0018', 'person',  TRUE,  NULL),
    ('c_0019', 'man',     TRUE,  NULL),
    ('c_0020', 'woman',   TRUE,  NULL),
    ('c_0021', 'child',   TRUE,  NULL),
    ('c_0022', 'mother',  TRUE,  NULL),
    ('c_0023', 'father',  TRUE,  NULL),
    ('c_0024', 'eye',     TRUE,  NULL),
    ('c_0025', 'ear',     TRUE,  NULL),
    ('c_0026', 'hand',    TRUE,  NULL),
    ('c_0027', 'foot',    TRUE,  NULL),
    ('c_0028', 'head',    TRUE,  NULL),
    ('c_0029', 'mouth',   TRUE,  NULL),
    ('c_0030', 'tooth',   TRUE,  NULL),
    ('c_0031', 'house',   TRUE,  NULL),
    ('c_0032', 'food',    FALSE, NULL),
    ('c_0033', 'name',    TRUE,  NULL),
    ('c_0034', 'one',     TRUE,  NULL),
    ('c_0035', 'two',     TRUE,  NULL),
    ('c_0036', 'three',   TRUE,  NULL),
    ('c_0037', 'big',     TRUE,  NULL),
    ('c_0038', 'small',   TRUE,  NULL),
    ('c_0039', 'good',    TRUE,  NULL),
    ('c_0040', 'eat',     TRUE,  'What is the word for "to eat"?'),
    ('c_0041', 'drink',   TRUE,  'What is the word for "to drink"?'),
    ('c_0042', 'sleep',   TRUE,  'What is the word for "to sleep"?'),
    ('c_0043', 'walk',    TRUE,  'What is the word for "to walk"?'),
    ('c_0044', 'see',     TRUE,  'What is the word for "to see"?')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- END OF SEED MIGRATION
-- =============================================================================
