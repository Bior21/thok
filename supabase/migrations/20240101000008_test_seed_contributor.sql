-- Test seed: second contributor for reviewing
-- This ensures review tasks appear in development after every `supabase db reset`.
-- The contributor is from Malakal, Upper Nile State.
-- ID is fixed so it's stable across resets: 11111111-1111-1111-1111-111111111111

INSERT INTO contributors (id, town, state, age_range, gender, l1_status)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Malakal', 'Upper Nile State',
  '25-34', 'male', 'L1'
)
ON CONFLICT (id) DO NOTHING;

-- Seed 5 entries from this test contributor so review tasks appear for
-- other contributors (review tasks need at least one entry from a different contributor).
-- language_id is auto-set by the trg_entry_language_defaults trigger.
INSERT INTO lexicon_entries (id, contributor_id, concept_id, native_word, region_town, region_state, synced_at)
VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'c_0001', 'mony',  'Malakal', 'Upper Nile State', now()),
  ('aaaaaaaa-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'c_0002', 'ee',    'Malakal', 'Upper Nile State', now()),
  ('aaaaaaaa-0003-0003-0003-000000000003', '11111111-1111-1111-1111-111111111111', 'c_0003', 'wën',   'Malakal', 'Upper Nile State', now()),
  ('aaaaaaaa-0004-0004-0004-000000000004', '11111111-1111-1111-1111-111111111111', 'c_0004', 'ŋuan',  'Malakal', 'Upper Nile State', now()),
  ('aaaaaaaa-0005-0005-0005-000000000005', '11111111-1111-1111-1111-111111111111', 'c_0005', 'nyaan', 'Malakal', 'Upper Nile State', now())
ON CONFLICT (id) DO NOTHING;
