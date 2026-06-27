-- =============================================================================
-- South Sudanese Lexicon Data Collection System
-- Database Schema Migration v1.1
-- Target: PostgreSQL 15+ (Supabase-compatible)
--
-- MVP Scope: Dinka only (user-facing)
-- Architecture: multi-language ready, admin-gated expansion
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- REFERENCE / LOOKUP TABLES
-- =============================================================================

-- Languages table.
-- MVP constraint: only one row has is_mvp_active = TRUE (Dinka).
-- Adding a new language requires an admin to INSERT a row AND set is_mvp_active = TRUE.
-- No user-facing path to activate a language exists.
CREATE TABLE languages (
    id              SERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name_english    TEXT NOT NULL,
    name_native     TEXT,
    is_tonal        BOOLEAN NOT NULL DEFAULT FALSE,
    iso_639_3       TEXT,
    -- Admin-gated activation flag.
    -- is_mvp_active = FALSE means the language exists in the schema but is not
    -- accessible to users. Flip to TRUE via admin action only after the existing
    -- pipeline is validated and stable.
    is_mvp_active   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed all target languages. Only Dinka is active at MVP launch.
INSERT INTO languages (code, name_english, name_native, is_tonal, iso_639_3, is_mvp_active) VALUES
    ('dinka',       'Dinka',       'Thuɔŋjäŋ',  TRUE,  'din', TRUE),   -- MVP active
    ('nuer',        'Nuer',        'Thok Naath', TRUE,  'nus', FALSE),
    ('shilluk',     'Shilluk',     'Dhøg Cøllø', TRUE,  'shk', FALSE),
    ('bari',        'Bari',        'Bari',       FALSE, 'bfa', FALSE),
    ('zande',       'Zande',       'Zande',      FALSE, 'zne', FALSE),
    ('juba_arabic', 'Juba Arabic', 'عربي جوبا', FALSE, NULL,  FALSE);

-- Helper function: returns the single active MVP language id.
-- Used by application layer to set language_id without user input.
-- Raises an exception if zero or more than one language is active (safety guard).
CREATE OR REPLACE FUNCTION active_language_id()
RETURNS INTEGER AS $$
DECLARE
    lang_id INTEGER;
BEGIN
    SELECT id INTO lang_id FROM languages WHERE is_mvp_active = TRUE LIMIT 1;
    IF lang_id IS NULL THEN
        RAISE EXCEPTION 'No active MVP language found. Set is_mvp_active = TRUE on exactly one language row.';
    END IF;
    RETURN lang_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Constraint: enforce at most one active language at MVP stage.
-- Remove this constraint when multi-language UI is introduced post-MVP.
CREATE OR REPLACE FUNCTION enforce_single_active_language()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_mvp_active = TRUE THEN
        IF (SELECT COUNT(*) FROM languages WHERE is_mvp_active = TRUE AND id <> NEW.id) > 0 THEN
            RAISE EXCEPTION
                'Only one language may be active at MVP stage. '
                'Deactivate the current active language before enabling a new one, '
                'or remove this constraint when multi-language UI is ready.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_single_active_language
    BEFORE INSERT OR UPDATE ON languages
    FOR EACH ROW EXECUTE FUNCTION enforce_single_active_language();

-- =============================================================================
-- DIALECT REGISTRY
-- =============================================================================

CREATE TABLE dialects (
    id              SERIAL PRIMARY KEY,
    language_id     INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (language_id, code)
);

-- Dinka dialects seeded at launch. Others seeded when language is activated.
INSERT INTO dialects (language_id, code, name) VALUES
    (1, 'rek',    'Rek Dinka'),
    (1, 'padang', 'Padang Dinka'),
    (1, 'bor',    'Bor Dinka'),
    (1, 'ngok',   'Ngok Dinka'),
    (1, 'luac',   'Luac Dinka');

-- Nuer dialects (seeded now; activated when language goes live)
INSERT INTO dialects (language_id, code, name) VALUES
    (2, 'eastern', 'Eastern Nuer'),
    (2, 'western', 'Western Nuer');

-- =============================================================================
-- GEOGRAPHIC ORIGIN → DIALECT MAPPING
-- Maps contributor's self-reported town/state to a dialect_id.
-- Populated by admin. This is the authoritative dialect inference mechanism.
-- Users never see dialect names; they report town + state only.
-- =============================================================================

CREATE TABLE region_dialect_map (
    id              SERIAL PRIMARY KEY,
    town            TEXT NOT NULL,              -- e.g. 'Bor'
    state           TEXT,                       -- e.g. 'Jonglei State'
    dialect_id      INTEGER REFERENCES dialects(id) ON DELETE SET NULL,
    language_id     INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (town, language_id)
);

-- Example mappings for Dinka. Expand as field data informs actual coverage.
INSERT INTO region_dialect_map (town, state, dialect_id, language_id) VALUES
    ('Bor',     'Jonglei State',           (SELECT id FROM dialects WHERE code = 'bor'    AND language_id = 1), 1),
    ('Gogrial', 'Warrap State',             (SELECT id FROM dialects WHERE code = 'rek'    AND language_id = 1), 1),
    ('Aweil',   'Northern Bahr el Ghazal', (SELECT id FROM dialects WHERE code = 'padang' AND language_id = 1), 1),
    ('Abyei',   'Abyei Area',              (SELECT id FROM dialects WHERE code = 'ngok'   AND language_id = 1), 1);

-- =============================================================================
-- CONCEPT REGISTRY
-- =============================================================================

CREATE TABLE concepts (
    id              TEXT PRIMARY KEY,           -- stable identifier e.g. 'c_0124'
    english_gloss   TEXT NOT NULL,              -- e.g. 'water'
    swadesh_list    BOOLEAN NOT NULL DEFAULT FALSE,
    image_path      TEXT,
    prompt_context  TEXT,                       -- optional descriptive context prompt
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- CONTRIBUTORS
-- No login/auth at MVP. Contributors are identified by a device-scoped UUID
-- generated on first open and stored in IndexedDB. No PII beyond town + state.
-- =============================================================================

CREATE TABLE contributors (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Onboarding fields (the only two the UI collects)
    town            TEXT,                       -- e.g. 'Bor'
    state           TEXT,                       -- e.g. 'Jonglei State'

    -- Derived from town via region_dialect_map (never user-selected)
    language_id     INTEGER REFERENCES languages(id) ON DELETE SET NULL,
    dialect_id      INTEGER REFERENCES dialects(id)  ON DELETE SET NULL,

    -- Optional enrichment (collected passively or optionally)
    age_range       TEXT,                       -- e.g. '18-24'
    gender          TEXT,                       -- 'M', 'F', 'NB', 'prefer_not_to_say'
    l1_status       TEXT NOT NULL DEFAULT 'L1',

    is_reviewer     BOOLEAN NOT NULL DEFAULT TRUE, -- all contributors can review
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-populate language_id and dialect_id from town on contributor insert
CREATE OR REPLACE FUNCTION set_contributor_location_metadata()
RETURNS TRIGGER AS $$
DECLARE
    active_lang_id  INTEGER;
    mapped_dialect  INTEGER;
BEGIN
    -- Always assign to the single active MVP language
    active_lang_id := active_language_id();
    NEW.language_id := active_lang_id;

    -- Infer dialect from town if provided
    IF NEW.town IS NOT NULL THEN
        SELECT dialect_id INTO mapped_dialect
        FROM region_dialect_map
        WHERE LOWER(town) = LOWER(NEW.town)
          AND language_id = active_lang_id
        LIMIT 1;
        NEW.dialect_id := mapped_dialect; -- NULL is fine if town not yet mapped
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contributor_location
    BEFORE INSERT ON contributors
    FOR EACH ROW EXECUTE FUNCTION set_contributor_location_metadata();

-- =============================================================================
-- LEXICON ENTRIES
-- Core data table. One row = one submitted word for one concept from one contributor.
-- Multiple rows per concept_id is correct and expected (many-to-one mapping).
-- =============================================================================

CREATE TABLE lexicon_entries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    concept_id          TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    native_word         TEXT NOT NULL,

    -- Language always set programmatically from active_language_id(); never from user input
    language_id         INTEGER NOT NULL REFERENCES languages(id),

    -- Dialect inferred from contributor's town; never user-selected
    dialect_id          INTEGER REFERENCES dialects(id),

    -- Location data from contributor onboarding
    region_town         TEXT,                   -- contributor's reported town
    region_state        TEXT,                   -- contributor's reported state

    -- Tonal flag: auto-set from languages.is_tonal on insert (trigger below)
    tone_language_flag  BOOLEAN NOT NULL DEFAULT FALSE,

    -- Audio
    audio_path_opus     TEXT,                   -- original WebM/Opus upload
    audio_path_wav      TEXT,                   -- WAV/16kHz/mono; set after server-side transcode
    audio_duration_sec  NUMERIC(6,2),
    audio_snr_flag      BOOLEAN,                -- TRUE = low SNR flagged on ingest; not auto-rejected

    -- Contributor link + anonymized speaker metadata
    contributor_id      UUID REFERENCES contributors(id) ON DELETE SET NULL,
    speaker_age_range   TEXT,
    speaker_gender      TEXT,
    speaker_l1_status   TEXT,

    -- Scoring
    confidence_score    NUMERIC(5,4) NOT NULL DEFAULT 0.0,

    -- Visibility
    -- is_visible = TRUE always for MVP. Entries appear in dictionary immediately
    -- after sync, even before verification. This is a product requirement, not a default.
    is_visible          BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at           TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: set language_id to active language; set tone_language_flag from languages table
CREATE OR REPLACE FUNCTION set_entry_language_defaults()
RETURNS TRIGGER AS $$
BEGIN
    NEW.language_id        := active_language_id();
    NEW.tone_language_flag := (SELECT is_tonal FROM languages WHERE id = NEW.language_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entry_language_defaults
    BEFORE INSERT ON lexicon_entries
    FOR EACH ROW EXECUTE FUNCTION set_entry_language_defaults();

-- Trigger: infer dialect_id from town if not already set
CREATE OR REPLACE FUNCTION infer_entry_dialect()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.dialect_id IS NULL AND NEW.region_town IS NOT NULL THEN
        SELECT dialect_id INTO NEW.dialect_id
        FROM region_dialect_map
        WHERE LOWER(town) = LOWER(NEW.region_town)
          AND language_id = NEW.language_id
        LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_infer_entry_dialect
    BEFORE INSERT ON lexicon_entries
    FOR EACH ROW EXECUTE FUNCTION infer_entry_dialect();

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_updated_at_entries
    BEFORE UPDATE ON lexicon_entries
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =============================================================================
-- REVIEW VERDICTS
-- Each review is one row. Affinity tier at time of review is stored for provenance.
-- =============================================================================

CREATE TABLE review_verdicts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id        UUID NOT NULL REFERENCES lexicon_entries(id) ON DELETE CASCADE,
    reviewer_id     UUID REFERENCES contributors(id) ON DELETE SET NULL,

    -- 1 = same dialect, 2 = same state, 3 = same language (floor at MVP), 4 = general
    affinity_tier   SMALLINT NOT NULL CHECK (affinity_tier BETWEEN 1 AND 4),

    verdict         TEXT NOT NULL CHECK (verdict IN ('correct', 'incorrect', 'valid_variant', 'unsure')),

    -- Score delta applied; derived from affinity_score_weights at insert time
    score_delta     NUMERIC(5,4) NOT NULL DEFAULT 0.0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A reviewer cannot submit two verdicts on the same entry
    UNIQUE (entry_id, reviewer_id)
);

-- Prevent self-review: a contributor cannot review their own entries
CREATE OR REPLACE FUNCTION prevent_self_review()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM lexicon_entries e
        WHERE e.id = NEW.entry_id AND e.contributor_id = NEW.reviewer_id
    ) THEN
        RAISE EXCEPTION 'Contributors cannot review their own submissions.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_self_review
    BEFORE INSERT ON review_verdicts
    FOR EACH ROW EXECUTE FUNCTION prevent_self_review();

-- Recompute confidence_score on parent entry after each verdict insert
CREATE OR REPLACE FUNCTION recompute_confidence()
RETURNS TRIGGER AS $$
DECLARE
    new_score NUMERIC(5,4);
BEGIN
    SELECT GREATEST(0.0, LEAST(1.0, COALESCE(SUM(score_delta), 0.0)))
    INTO new_score
    FROM review_verdicts
    WHERE entry_id = NEW.entry_id;

    UPDATE lexicon_entries
    SET confidence_score = new_score,
        is_verified      = (new_score >= 0.6)
    WHERE id = NEW.entry_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recompute_confidence
    AFTER INSERT ON review_verdicts
    FOR EACH ROW EXECUTE FUNCTION recompute_confidence();

-- =============================================================================
-- AFFINITY SCORE WEIGHTS
-- Scoring logic lives in the database, not in application code.
-- Adjust weights here without a code deploy.
-- =============================================================================

CREATE TABLE affinity_score_weights (
    affinity_tier   SMALLINT NOT NULL CHECK (affinity_tier BETWEEN 1 AND 4),
    verdict         TEXT NOT NULL CHECK (verdict IN ('correct', 'incorrect', 'valid_variant', 'unsure')),
    score_delta     NUMERIC(5,4) NOT NULL,
    PRIMARY KEY (affinity_tier, verdict)
);

INSERT INTO affinity_score_weights (affinity_tier, verdict, score_delta) VALUES
    (1, 'correct',        0.4000),
    (1, 'incorrect',     -0.2000),
    (1, 'valid_variant',  0.1000),
    (1, 'unsure',         0.0000),
    (2, 'correct',        0.2500),
    (2, 'incorrect',     -0.2000),
    (2, 'valid_variant',  0.1000),
    (2, 'unsure',         0.0000),
    (3, 'correct',        0.1500),
    (3, 'incorrect',     -0.2000),
    (3, 'valid_variant',  0.1000),
    (3, 'unsure',         0.0000),
    (4, 'correct',        0.0800),
    (4, 'incorrect',     -0.2000),
    (4, 'valid_variant',  0.0500),
    (4, 'unsure',         0.0000);

-- =============================================================================
-- AFFINITY TIER COMPUTATION
-- Returns the affinity tier of a reviewer for a given entry.
-- Used by application layer to (a) route review assignments and
-- (b) populate affinity_tier on review_verdicts insert.
-- At MVP, Tier 3 is the effective minimum since all users share Dinka.
-- =============================================================================

CREATE OR REPLACE FUNCTION compute_affinity_tier(
    p_reviewer_id UUID,
    p_entry_id    UUID
)
RETURNS SMALLINT AS $$
DECLARE
    r_dialect_id  INTEGER;
    r_state       TEXT;
    r_language_id INTEGER;
    e_dialect_id  INTEGER;
    e_state       TEXT;
    e_language_id INTEGER;
BEGIN
    SELECT dialect_id, state, language_id
    INTO r_dialect_id, r_state, r_language_id
    FROM contributors WHERE id = p_reviewer_id;

    SELECT dialect_id, region_state, language_id
    INTO e_dialect_id, e_state, e_language_id
    FROM lexicon_entries WHERE id = p_entry_id;

    IF r_dialect_id IS NOT NULL AND r_dialect_id = e_dialect_id THEN
        RETURN 1;
    ELSIF r_state IS NOT NULL AND LOWER(r_state) = LOWER(e_state) THEN
        RETURN 2;
    ELSIF r_language_id IS NOT NULL AND r_language_id = e_language_id THEN
        RETURN 3;
    ELSE
        RETURN 4;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- OFFLINE SYNC QUEUE
-- Tracks client-side queued entries pending backend confirmation.
-- =============================================================================

CREATE TABLE sync_queue (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_entry_id     TEXT NOT NULL,              -- IndexedDB-generated ID
    contributor_id      UUID REFERENCES contributors(id) ON DELETE SET NULL,
    payload_json        JSONB NOT NULL,
    audio_uploaded      BOOLEAN NOT NULL DEFAULT FALSE,
    metadata_uploaded   BOOLEAN NOT NULL DEFAULT FALSE,
    resolved            BOOLEAN NOT NULL DEFAULT FALSE,
    entry_id            UUID REFERENCES lexicon_entries(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ
);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- CLDF-compatible flat export for ML pipelines and research
CREATE OR REPLACE VIEW dataset_export AS
SELECT
    e.id                                    AS entry_id,
    e.concept_id,
    c.english_gloss,
    e.native_word,
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
    COUNT(rv.id)                            AS review_count,
    SUM(CASE WHEN rv.verdict = 'correct'       THEN 1 ELSE 0 END) AS votes_correct,
    SUM(CASE WHEN rv.verdict = 'incorrect'     THEN 1 ELSE 0 END) AS votes_incorrect,
    SUM(CASE WHEN rv.verdict = 'valid_variant' THEN 1 ELSE 0 END) AS votes_variant,
    SUM(CASE WHEN rv.verdict = 'unsure'        THEN 1 ELSE 0 END) AS votes_unsure,
    e.created_at,
    e.synced_at
FROM lexicon_entries e
JOIN concepts      c  ON c.id  = e.concept_id
JOIN languages     l  ON l.id  = e.language_id
LEFT JOIN dialects d  ON d.id  = e.dialect_id
LEFT JOIN review_verdicts rv ON rv.entry_id = e.id
WHERE e.is_visible = TRUE
GROUP BY e.id, c.english_gloss, l.code, l.iso_639_3, l.is_tonal, d.code;

-- ML coverage dashboard: tracks speaker and dialect targets per concept
CREATE OR REPLACE VIEW concept_coverage AS
SELECT
    e.concept_id,
    c.english_gloss,
    l.code                              AS language,
    COUNT(DISTINCT e.id)                AS total_entries,
    COUNT(DISTINCT e.contributor_id)    AS distinct_speakers,
    COUNT(DISTINCT e.dialect_id)        AS distinct_dialects,
    ROUND(AVG(e.confidence_score), 4)   AS avg_confidence,
    (COUNT(DISTINCT e.contributor_id) >= 5) AS speaker_target_met,   -- ≥5 speakers
    (COUNT(DISTINCT e.dialect_id)     >= 3) AS dialect_target_met    -- ≥3 dialects
FROM lexicon_entries e
JOIN concepts  c ON c.id  = e.concept_id
JOIN languages l ON l.id  = e.language_id
GROUP BY e.concept_id, c.english_gloss, l.code;

-- Affinity routing instrumentation: shows what tier is actually being assigned
-- Alert: ≥80% of verdicts for a language at Tier 3+ = reviewer recruitment gap
CREATE OR REPLACE VIEW affinity_routing_stats AS
SELECT
    l.code                              AS language,
    rv.affinity_tier,
    COUNT(rv.id)                        AS verdict_count,
    ROUND(
        COUNT(rv.id)::NUMERIC /
        NULLIF(SUM(COUNT(rv.id)) OVER (PARTITION BY l.code), 0) * 100,
    1)                                  AS pct_of_language_reviews
FROM review_verdicts rv
JOIN lexicon_entries  e ON e.id  = rv.entry_id
JOIN languages        l ON l.id  = e.language_id
GROUP BY l.code, rv.affinity_tier
ORDER BY l.code, rv.affinity_tier;

-- Admin view: language activation status
CREATE OR REPLACE VIEW language_activation_status AS
SELECT
    l.code,
    l.name_english,
    l.is_mvp_active,
    COUNT(e.id)                         AS total_entries,
    COUNT(DISTINCT e.contributor_id)    AS distinct_contributors
FROM languages l
LEFT JOIN lexicon_entries e ON e.language_id = l.id
GROUP BY l.id, l.code, l.name_english, l.is_mvp_active
ORDER BY l.is_mvp_active DESC, l.id;

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_lexicon_concept       ON lexicon_entries(concept_id);
CREATE INDEX idx_lexicon_language      ON lexicon_entries(language_id);
CREATE INDEX idx_lexicon_dialect       ON lexicon_entries(dialect_id);
CREATE INDEX idx_lexicon_contributor   ON lexicon_entries(contributor_id);
CREATE INDEX idx_lexicon_confidence    ON lexicon_entries(confidence_score DESC);
CREATE INDEX idx_lexicon_verified      ON lexicon_entries(is_verified);
CREATE INDEX idx_lexicon_town_state    ON lexicon_entries(region_town, region_state);
CREATE INDEX idx_review_entry          ON review_verdicts(entry_id);
CREATE INDEX idx_review_reviewer       ON review_verdicts(reviewer_id);
CREATE INDEX idx_review_tier           ON review_verdicts(affinity_tier);
CREATE INDEX idx_contributor_dialect   ON contributors(dialect_id);
CREATE INDEX idx_contributor_location  ON contributors(town, state);
CREATE INDEX idx_sync_unresolved       ON sync_queue(resolved) WHERE resolved = FALSE;

-- =============================================================================
-- ROW-LEVEL SECURITY (Supabase)
--
-- IDENTITY MODEL AT MVP:
-- There is NO Supabase Auth. Contributors are identified by a device-scoped
-- UUID sent in the `x-contributor-id` header. Every data access goes through an
-- Edge Function that uses the SERVICE_ROLE key, which BYPASSES RLS entirely and
-- enforces ownership/visibility in application code (self-review checks, the
-- "verified OR own" dictionary filter, etc.).
--
-- Therefore the correct posture here is: enable RLS with NO policies for the
-- anon/authenticated roles. That denies all direct access via the public anon
-- key (a sensible default — the client never touches these tables directly)
-- while the service-role Edge Functions continue to work unimpeded.
--
-- NOTE: the previous version of this file defined policies keyed on
-- `auth.uid()`. With no auth that always evaluates to NULL, so those policies
-- protected nothing and were misleading. They have been removed deliberately.
--
-- When real auth is introduced post-MVP, add auth.uid()-based policies here and
-- switch the Edge Functions to the user's JWT instead of the service-role key.
-- =============================================================================

ALTER TABLE lexicon_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_verdicts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue        ENABLE ROW LEVEL SECURITY;

-- No policies are defined: with RLS enabled and no policies, the anon and
-- authenticated roles are denied all access. The service-role key used by the
-- Edge Functions bypasses RLS and remains fully functional.

-- =============================================================================
-- ROLE GRANTS
-- Supabase's API roles need explicit table privileges. On hosted Supabase these
-- are often applied by default-privilege rules, but those don't fire for tables
-- created by the migration role here — so we grant them explicitly. This is
-- idempotent and safe on hosted projects too.
--
--   service_role : full DML — this is the identity the Edge Functions use, and
--                  it bypasses RLS (all ownership/visibility is enforced in
--                  function code).
--   anon/auth    : SELECT only, and still gated by RLS on the protected tables
--                  (which deny all). The client never queries tables directly —
--                  these grants just let PostgREST resolve them if ever needed.
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- =============================================================================
-- ADMIN RUNBOOK: ACTIVATING A NEW LANGUAGE POST-MVP
-- =============================================================================
-- To activate a second language after Dinka pipeline is stable:
--
-- 1. Remove or modify the enforce_single_active_language trigger if going multi-language UI.
--
-- 2. Set the target language to active:
--    UPDATE languages SET is_mvp_active = TRUE WHERE code = 'nuer';
--
-- 3. Seed dialects for the new language if not already present.
--
-- 4. Populate region_dialect_map for the new language's regions.
--
-- 5. Update the UI to show a language selector (currently does not exist).
--
-- 6. Update set_entry_language_defaults() trigger if moving to multi-language
--    (replace active_language_id() call with contributor's language_id).
--
-- =============================================================================
-- END OF MIGRATION v1.1
-- =============================================================================
