-- =============================================================================
-- Add sentence support to the concepts table
--
-- Words and sentences are both "concepts" — things we want Dinka speakers to
-- record. Adding concept_type lets the app treat them differently in the UI
-- (single word input vs. full sentence input) while sharing the same
-- collection pipeline, storage, and review system.
--
-- intent tags the communicative goal of each sentence (greeting, request,
-- description...) so researchers can filter by pragmatic category.
--
-- sentence_components links each sentence to the word concepts it contains,
-- creating a cross-reference between sentence recordings and the individual
-- word recordings that make them up.
-- =============================================================================

-- Add concept_type: 'word' (default) or 'sentence'
ALTER TABLE concepts
  ADD COLUMN concept_type TEXT NOT NULL DEFAULT 'word'
  CHECK (concept_type IN ('word', 'sentence'));

-- Add intent: communicative purpose of the sentence (greeting, request, etc.)
ALTER TABLE concepts
  ADD COLUMN intent TEXT;

-- Link sentences to their component word concepts.
-- For example, "I want water" links to: I (c_0159), want (c_0283), water (c_0001)
-- This lets the app suggest word recordings when a sentence has been recorded
-- but some of its component words have not yet been collected individually.
CREATE TABLE sentence_components (
  sentence_concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  word_concept_id     TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  position            INT  NOT NULL,  -- word order within the sentence (1-based)
  PRIMARY KEY (sentence_concept_id, word_concept_id)
);
