-- =============================================================================
-- Track when a contributor skips a concept they don't know
--
-- A skip tells us two things:
--   1. This contributor doesn't know this word right now
--   2. Aggregated across contributors, frequently skipped concepts reveal
--      lexical gaps — words that may not have an established Dinka equivalent
--
-- UNIQUE on (contributor_id, concept_id) — we only need one skip record per
-- person per concept. ON CONFLICT DO NOTHING handles repeated skips silently.
-- =============================================================================

CREATE TABLE concept_skips (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  contributor_id UUID        NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
  concept_id     TEXT        NOT NULL REFERENCES concepts(id)     ON DELETE CASCADE,
  skipped_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (contributor_id, concept_id)
);

-- View: most-skipped concepts across all contributors.
-- Useful for identifying words that may not exist in Dinka or need different prompts.
CREATE VIEW concept_skip_rates AS
SELECT
  c.id,
  c.english_gloss,
  c.concept_type,
  COUNT(cs.contributor_id) AS skip_count,
  (SELECT COUNT(*) FROM contributors) AS total_contributors,
  ROUND(
    COUNT(cs.contributor_id)::numeric /
    NULLIF((SELECT COUNT(*) FROM contributors), 0) * 100, 1
  ) AS skip_pct
FROM concepts c
LEFT JOIN concept_skips cs ON cs.concept_id = c.id
GROUP BY c.id, c.english_gloss, c.concept_type
ORDER BY skip_count DESC;
