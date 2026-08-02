-- =============================================================================
-- Re-apply role grants for tables created after the initial GRANT block.
--
-- `GRANT ... ON ALL TABLES IN SCHEMA public` only covers tables that already
-- existed at the time it ran (see 20240101000000_initial_schema.sql). Tables
-- added by later migrations — concept_skips (...000007) and
-- sentence_components (...000005) — never picked it up, which surfaced as
-- "permission denied for table concept_skips" for service_role. Re-running
-- the same grant statements is idempotent and catches both, plus anything
-- else that slipped through.
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
