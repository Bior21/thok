#!/usr/bin/env -S npx ts-node --esm
/**
 * scripts/seed_dinka_glossary.ts
 *
 * Seeds the Supabase database with Dinka concepts and lexicon entries
 * parsed from the Brisco/SIL 2006 glossary.
 *
 * Run:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> npx ts-node scripts/seed_dinka_glossary.ts
 *
 * What it does:
 *   1. Upserts each English concept into the `concepts` table (by english_gloss).
 *   2. For each Dinka entry, inserts a `lexicon_entry` linked to the concept,
 *      attributed to the seed contributor (UUID below), marked needs_review=true.
 *
 * Safe to re-run — uses upsert for concepts and skips duplicate entries.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://imcidnujyhzanrimwscx.supabase.co';
const SERVICE_ROLE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SEED_CONTRIBUTOR_ID = '00000000-0000-0000-0000-000000000002'; // glossary seed bot
const LANGUAGE_CODE       = 'dinka';

// Dialect code → South Sudan state (matches what the parser emits)
const DIALECT_STATE: Record<string, string> = {
  SWr:  'Warrap State',
  SWt:  'Warrap State',
  SWm:  'Northern Bahr el Ghazal',
  SWj:  'Warrap State',
  SW:   'Warrap State',
  SCa:  'Lakes State',
  SC:   'Lakes State',
  SA:   'Lakes State',
  SEb:  'Jonglei State',
  SE:   'Jonglei State',
  NWr:  'Unity State',
  NWn:  'Other / Outside South Sudan',
  NWE:  'Unity State',
  NW:   'Unity State',
  NEd:  'Upper Nile State',
  NEb:  'Upper Nile State',
  NE:   'Upper Nile State',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeedEntry {
  dinka_word:   string;
  dialect:      string | null;
  region_state: string;
}

interface SeedConcept {
  english: string;
  entries: SeedEntry[];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!SERVICE_ROLE_KEY) {
    console.error('Set SUPABASE_SERVICE_ROLE_KEY before running.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const seedPath = join(dirname(fileURLToPath(import.meta.url)), 'dinka_seed.json');
  const concepts: SeedConcept[] = JSON.parse(readFileSync(seedPath, 'utf8'));

  console.log(`Loaded ${concepts.length} concepts from seed file.`);

  // ── 1. Ensure seed contributor exists ─────────────────────────────────────
  const { error: contribErr } = await supabase
    .from('contributors')
    .upsert({
      id:            SEED_CONTRIBUTOR_ID,
      town:          'Seed Bot',
      state:         'Warrap State',
      region_state:  'Warrap State',
      dialect:       'SWr',
      l1_status:     'L1',
    }, { onConflict: 'id', ignoreDuplicates: true });

  if (contribErr) {
    console.error('Could not ensure seed contributor:', contribErr.message);
    process.exit(1);
  }

  // ── 2. Get language_id for Dinka ──────────────────────────────────────────
  const { data: lang, error: langErr } = await supabase
    .from('languages')
    .select('id')
    .eq('code', LANGUAGE_CODE)
    .single();

  if (langErr || !lang) {
    console.error('Could not find Dinka language record:', langErr?.message);
    process.exit(1);
  }
  const languageId = lang.id;
  console.log(`Dinka language_id: ${languageId}`);

  // ── 3. Process each concept ───────────────────────────────────────────────
  let conceptsInserted = 0;
  let entriesInserted  = 0;
  let skipped          = 0;

  for (let i = 0; i < concepts.length; i++) {
    const concept = concepts[i];

    // Progress log every 100
    if (i > 0 && i % 100 === 0) {
      console.log(`  [${i}/${concepts.length}] concepts=${conceptsInserted} entries=${entriesInserted}`);
    }

    // Upsert concept by english_gloss
    const { data: existingConcept } = await supabase
      .from('concepts')
      .select('id')
      .eq('english_gloss', concept.english)
      .maybeSingle();

    let conceptId: string;

    if (existingConcept) {
      conceptId = existingConcept.id;
    } else {
      const { data: newConcept, error: conceptErr } = await supabase
        .from('concepts')
        .insert({
          english_gloss: concept.english,
          prompt_type:   'word',
          concept_type:  'word',
          source:        'seed_brisco_2006',
        })
        .select('id')
        .single();

      if (conceptErr || !newConcept) {
        console.error(`  Failed to insert concept "${concept.english}":`, conceptErr?.message);
        skipped++;
        continue;
      }
      conceptId = newConcept.id;
      conceptsInserted++;
    }

    // Insert lexicon entries for this concept
    for (const entry of concept.entries) {
      const regionState = entry.region_state ?? 'Warrap State';
      const dialect     = entry.dialect ?? 'SWr';
      const town        = DIALECT_STATE[dialect] ? `${dialect} dialect` : 'Warrap State';

      // Check for duplicate (same concept + same word)
      const { data: existing } = await supabase
        .from('lexicon_entries')
        .select('id')
        .eq('concept_id', conceptId)
        .eq('native_word', entry.dinka_word)
        .eq('language_id', languageId)
        .maybeSingle();

      if (existing) continue;

      const { error: entryErr } = await supabase
        .from('lexicon_entries')
        .insert({
          concept_id:       conceptId,
          contributor_id:   SEED_CONTRIBUTOR_ID,
          language_id:      languageId,
          native_word:      entry.dinka_word,
          region_state:     regionState,
          town:             town,
          dialect_inferred: dialect,
          source:           'seed_brisco_2006',
          needs_review:     true,
          review_count:     0,
          confidence_score: 0,
        });

      if (entryErr) {
        // Ignore unique constraint violations (safe to re-run)
        if (!entryErr.message.includes('duplicate') && !entryErr.message.includes('unique')) {
          console.error(`  Entry error for "${entry.dinka_word}":`, entryErr.message);
        }
        continue;
      }
      entriesInserted++;
    }
  }

  console.log('\n── Seed complete ─────────────────────────────────────');
  console.log(`  Concepts inserted : ${conceptsInserted}`);
  console.log(`  Entries inserted  : ${entriesInserted}`);
  console.log(`  Skipped           : ${skipped}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
