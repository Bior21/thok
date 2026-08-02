-- =============================================================================
-- Allow 'no_audio' as a valid audio_verdict.
--
-- submit-review normalises a missing audio_verdict to 'no_audio' for seed
-- reviews (entries with no recording) — see submit-review/index.ts and
-- apps/api/routers/reviews.py. The CHECK constraint added in
-- 20240101000002_review_redesign.sql never included it, so every seed
-- review violates "review_verdicts_audio_verdict_check".
-- =============================================================================

ALTER TABLE review_verdicts
  DROP CONSTRAINT review_verdicts_audio_verdict_check,
  ADD CONSTRAINT review_verdicts_audio_verdict_check
    CHECK (audio_verdict IN ('correct', 'valid_variant', 'bad_audio', 'no_audio'));
