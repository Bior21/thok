-- =============================================================================
-- Migration v1.2 — Multi-language support + language request feature
--
-- Changes:
--   1. Drop the single-active-language constraint so Nuer can be enabled.
--   2. Activate Nuer alongside Dinka.
--   3. Update contributor trigger to respect a pre-set language_id from the
--      application layer (instead of always overwriting with active_language_id()).
--   4. Update the lexicon entry trigger to inherit language from the contributor
--      rather than assuming a global active language.
--   5. Add language_requests table for community-driven language submissions.
-- =============================================================================

-- 1. Remove the single-language gate
DROP TRIGGER  IF EXISTS trg_single_active_language ON languages;
DROP FUNCTION IF EXISTS enforce_single_active_language();

-- 2. Activate Nuer
UPDATE languages SET is_mvp_active = TRUE WHERE code = 'nuer';

-- 3. Contributor trigger: honour language_id if already provided by the app.
--    If not provided, fall back to the first active language (safe default).
CREATE OR REPLACE FUNCTION set_contributor_location_metadata()
RETURNS TRIGGER AS $$
DECLARE
    target_lang_id  INTEGER;
    mapped_dialect  INTEGER;
BEGIN
    IF NEW.language_id IS NOT NULL THEN
        target_lang_id := NEW.language_id;
    ELSE
        SELECT id INTO target_lang_id
        FROM languages
        WHERE is_mvp_active = TRUE
        ORDER BY id
        LIMIT 1;
        NEW.language_id := target_lang_id;
    END IF;

    IF NEW.town IS NOT NULL THEN
        SELECT dialect_id INTO mapped_dialect
        FROM region_dialect_map
        WHERE LOWER(town) = LOWER(NEW.town)
          AND language_id = target_lang_id
        LIMIT 1;
        NEW.dialect_id := mapped_dialect;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Lexicon entry trigger: inherit language_id from the contributor, not the
--    global active language. This lets Nuer and Dinka entries coexist.
CREATE OR REPLACE FUNCTION set_entry_language_defaults()
RETURNS TRIGGER AS $$
DECLARE
    contrib_lang_id INTEGER;
BEGIN
    IF NEW.contributor_id IS NOT NULL THEN
        SELECT language_id INTO contrib_lang_id
        FROM contributors
        WHERE id = NEW.contributor_id;
    END IF;

    IF contrib_lang_id IS NULL THEN
        SELECT id INTO contrib_lang_id
        FROM languages
        WHERE is_mvp_active = TRUE
        ORDER BY id
        LIMIT 1;
    END IF;

    NEW.language_id        := contrib_lang_id;
    NEW.tone_language_flag := (SELECT is_tonal FROM languages WHERE id = NEW.language_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Language request table — community submissions to add a new language
CREATE TABLE IF NOT EXISTS language_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    language_name   TEXT NOT NULL,
    region          TEXT NOT NULL,
    est_speakers    TEXT,
    contact_name    TEXT NOT NULL,
    contact_email   TEXT NOT NULL,
    message         TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
