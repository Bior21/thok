-- =============================================================================
-- Review Redesign Migration
-- Splits verdict into independent text + audio dimensions.
-- Adds correction entry lineage and dispute tracking.
-- Backward-compatible: existing review_verdicts rows continue to work.
-- =============================================================================

-- =============================================================================
-- 1. LEXICON ENTRIES: source tracking, lineage, dispute, split verification
-- =============================================================================

ALTER TABLE lexicon_entries
  ADD COLUMN source TEXT NOT NULL DEFAULT 'contribution'
    CHECK (source IN ('contribution', 'correction')),
  ADD COLUMN corrected_from_entry_id UUID
    REFERENCES lexicon_entries(id) ON DELETE SET NULL,
  ADD COLUMN is_disputed    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN text_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN audio_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Migrate existing is_verified into text_verified + audio_verified.
-- Old entries are treated as having both dimensions verified together.
UPDATE lexicon_entries
SET text_verified = is_verified, audio_verified = is_verified;

-- =============================================================================
-- 2. REVIEW VERDICTS: split into text + audio dimensions
-- =============================================================================

ALTER TABLE review_verdicts
  -- New verdict columns (independent per dimension)
  ADD COLUMN text_verdict  TEXT
    CHECK (text_verdict  IN ('correct', 'valid_variant', 'wrong_word')),
  ADD COLUMN wrong_type    TEXT
    CHECK (wrong_type    IN ('wrong_spelling', 'wrong_word')),
  ADD COLUMN text_correction        TEXT,
  ADD COLUMN audio_verdict TEXT
    CHECK (audio_verdict IN ('correct', 'valid_variant', 'bad_audio')),
  ADD COLUMN correction_audio_path  TEXT,
  -- Score deltas stored at insert time (one per dimension)
  ADD COLUMN text_score_delta  NUMERIC(5,4) NOT NULL DEFAULT 0.0,
  ADD COLUMN audio_score_delta NUMERIC(5,4) NOT NULL DEFAULT 0.0;

-- =============================================================================
-- 3. AFFINITY SCORE WEIGHTS: add dimension column
-- =============================================================================

ALTER TABLE affinity_score_weights
  ADD COLUMN dimension TEXT NOT NULL DEFAULT 'legacy'
    CHECK (dimension IN ('legacy', 'text', 'audio'));

-- Existing rows represent the old combined verdict — mark as legacy.
UPDATE affinity_score_weights SET dimension = 'legacy';

-- Widen the verdict CHECK constraint to include new dimension-specific values.
-- The original inline CHECK was auto-named affinity_score_weights_verdict_check.
ALTER TABLE affinity_score_weights
  DROP CONSTRAINT IF EXISTS affinity_score_weights_verdict_check;
ALTER TABLE affinity_score_weights
  ADD CONSTRAINT affinity_score_weights_verdict_check
  CHECK (verdict IN ('correct', 'incorrect', 'valid_variant', 'unsure', 'wrong_word', 'bad_audio'));

-- Rebuild primary key to include dimension.
ALTER TABLE affinity_score_weights DROP CONSTRAINT affinity_score_weights_pkey;
ALTER TABLE affinity_score_weights
  ADD PRIMARY KEY (affinity_tier, verdict, dimension);

-- ── Text dimension weights ────────────────────────────────────────────────────
-- Same tier weighting as before. wrong_word carries the same penalty as
-- old incorrect. valid_variant is slightly rewarded (plausible signal).

INSERT INTO affinity_score_weights (affinity_tier, verdict, score_delta, dimension) VALUES
  (1, 'correct',       0.4000, 'text'),
  (1, 'valid_variant', 0.1000, 'text'),
  (1, 'wrong_word',   -0.2000, 'text'),
  (2, 'correct',       0.2500, 'text'),
  (2, 'valid_variant', 0.1000, 'text'),
  (2, 'wrong_word',   -0.2000, 'text'),
  (3, 'correct',       0.1500, 'text'),
  (3, 'valid_variant', 0.1000, 'text'),
  (3, 'wrong_word',   -0.2000, 'text'),
  (4, 'correct',       0.0800, 'text'),
  (4, 'valid_variant', 0.0500, 'text'),
  (4, 'wrong_word',   -0.2000, 'text');

-- ── Audio dimension weights ───────────────────────────────────────────────────
-- bad_audio is tier-agnostic: audio quality is objective, dialect doesn't
-- affect it. All tiers carry the same -0.30 penalty for bad audio.

INSERT INTO affinity_score_weights (affinity_tier, verdict, score_delta, dimension) VALUES
  (1, 'correct',       0.4000, 'audio'),
  (1, 'valid_variant', 0.1000, 'audio'),
  (1, 'bad_audio',    -0.3000, 'audio'),
  (2, 'correct',       0.2500, 'audio'),
  (2, 'valid_variant', 0.0800, 'audio'),
  (2, 'bad_audio',    -0.3000, 'audio'),
  (3, 'correct',       0.1500, 'audio'),
  (3, 'valid_variant', 0.0600, 'audio'),
  (3, 'bad_audio',    -0.3000, 'audio'),
  (4, 'correct',       0.0800, 'audio'),
  (4, 'valid_variant', 0.0400, 'audio'),
  (4, 'bad_audio',    -0.3000, 'audio');

-- =============================================================================
-- 4. UPDATED recompute_confidence TRIGGER
-- Handles both legacy rows (verdict column) and new rows (text/audio columns).
-- =============================================================================

CREATE OR REPLACE FUNCTION recompute_confidence()
RETURNS TRIGGER AS $$
DECLARE
  text_score   NUMERIC(5,4);
  audio_score  NUMERIC(5,4);
  legacy_score NUMERIC(5,4);
  has_new_rows BOOLEAN;
BEGIN
  -- Check if any new-style verdicts exist for this entry.
  SELECT EXISTS (
    SELECT 1 FROM review_verdicts
    WHERE entry_id = NEW.entry_id
      AND text_verdict IS NOT NULL
  ) INTO has_new_rows;

  IF has_new_rows THEN
    -- Text confidence: sum of text_score_delta from new-style rows.
    SELECT GREATEST(0.0, LEAST(1.0, COALESCE(SUM(text_score_delta), 0.0)))
    INTO text_score
    FROM review_verdicts
    WHERE entry_id = NEW.entry_id AND text_verdict IS NOT NULL;

    -- Audio confidence: sum of audio_score_delta from new-style rows.
    SELECT GREATEST(0.0, LEAST(1.0, COALESCE(SUM(audio_score_delta), 0.0)))
    INTO audio_score
    FROM review_verdicts
    WHERE entry_id = NEW.entry_id AND audio_verdict IS NOT NULL;

    UPDATE lexicon_entries
    SET
      confidence_score = (text_score + audio_score) / 2.0,
      text_verified    = (text_score  >= 0.6),
      audio_verified   = (audio_score >= 0.6),
      is_verified      = (text_score  >= 0.6 AND audio_score >= 0.6)
    WHERE id = NEW.entry_id;

  ELSE
    -- Legacy path: sum old score_delta column.
    SELECT GREATEST(0.0, LEAST(1.0, COALESCE(SUM(score_delta), 0.0)))
    INTO legacy_score
    FROM review_verdicts
    WHERE entry_id = NEW.entry_id;

    UPDATE lexicon_entries
    SET
      confidence_score = legacy_score,
      is_verified      = (legacy_score >= 0.6)
    WHERE id = NEW.entry_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 5. DISPUTE FLAG TRIGGER
-- Sets is_disputed = TRUE on the original entry when a correction is inserted.
-- Cleared by application code when a correction is validated or rejected.
-- =============================================================================

CREATE OR REPLACE FUNCTION flag_disputed_entry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.corrected_from_entry_id IS NOT NULL THEN
    UPDATE lexicon_entries
    SET is_disputed = TRUE
    WHERE id = NEW.corrected_from_entry_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_flag_disputed
  AFTER INSERT ON lexicon_entries
  FOR EACH ROW EXECUTE FUNCTION flag_disputed_entry();

-- =============================================================================
-- 6. UPDATED dataset_export VIEW
-- Adds new verdict counts; keeps old votes_incorrect for backward compat.
-- Must DROP first — CREATE OR REPLACE cannot reorder or rename existing columns.
-- =============================================================================

DROP VIEW IF EXISTS dataset_export;

CREATE VIEW dataset_export AS
SELECT
  e.id                                    AS entry_id,
  e.concept_id,
  c.english_gloss,
  e.native_word,
  e.source,
  e.corrected_from_entry_id,
  e.is_disputed,
  l.code                                  AS language,
  l.iso_639_3,
  l.is_tonal                              AS tone_language_flag,
  d.code                                  AS dialect,
  e.region_town,
  e.region_state,
  e.audio_path_wav,
  e.audio_path_opus,
  e.audio_duration_sec,
  e.audio_snr_flag,
  e.speaker_age_range,
  e.speaker_gender,
  e.speaker_l1_status,
  e.confidence_score,
  e.is_verified,
  e.text_verified,
  e.audio_verified,
  COUNT(rv.id)                            AS review_count,
  -- Legacy verdict counts (old-style reviews)
  SUM(CASE WHEN rv.verdict = 'correct'       AND rv.text_verdict IS NULL THEN 1 ELSE 0 END) AS votes_correct_legacy,
  SUM(CASE WHEN rv.verdict = 'incorrect'     AND rv.text_verdict IS NULL THEN 1 ELSE 0 END) AS votes_incorrect,
  SUM(CASE WHEN rv.verdict = 'valid_variant' AND rv.text_verdict IS NULL THEN 1 ELSE 0 END) AS votes_variant_legacy,
  -- New text verdict counts
  SUM(CASE WHEN rv.text_verdict = 'correct'       THEN 1 ELSE 0 END) AS text_votes_correct,
  SUM(CASE WHEN rv.text_verdict = 'valid_variant' THEN 1 ELSE 0 END) AS text_votes_variant,
  SUM(CASE WHEN rv.text_verdict = 'wrong_word'    THEN 1 ELSE 0 END) AS text_votes_wrong,
  -- New audio verdict counts
  SUM(CASE WHEN rv.audio_verdict = 'correct'       THEN 1 ELSE 0 END) AS audio_votes_correct,
  SUM(CASE WHEN rv.audio_verdict = 'valid_variant' THEN 1 ELSE 0 END) AS audio_votes_variant,
  SUM(CASE WHEN rv.audio_verdict = 'bad_audio'     THEN 1 ELSE 0 END) AS audio_votes_bad,
  e.created_at,
  e.synced_at
FROM lexicon_entries e
JOIN concepts      c  ON c.id  = e.concept_id
JOIN languages     l  ON l.id  = e.language_id
LEFT JOIN dialects d  ON d.id  = e.dialect_id
LEFT JOIN review_verdicts rv ON rv.entry_id = e.id
WHERE e.is_visible = TRUE
GROUP BY e.id, c.english_gloss, l.code, l.iso_639_3, l.is_tonal, d.code;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
