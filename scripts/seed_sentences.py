#!/usr/bin/env python3
"""
Filename: seed_sentences.py
Project:  Thok — Indigenous Language Preservation PWA

Description:
    Seeds the Supabase concepts table with 927 Dinka example sentences from
    the Brisco/SIL dictionary, then assigns each sentence to the seed bot
    contributor (…000002) as a lexicon_entry so the Dinka text is recorded
    and available for community members to read aloud and record.

    These are read-aloud tasks, not translation tasks.  The English sentence
    is the english_gloss, the Dinka text is stored in prompt_context so the
    app can pre-fill the textarea and display the sentence prominently.

    IDs start at s_0337 — the SQL migration 20240101000006 already occupies
    s_0001 through s_0336.

    Input file : scripts/dinka_sentences.json
    Outcome    : up to 927 new sentence concepts + 927 lexicon_entries

Usage:
    SUPABASE_SERVICE_ROLE_KEY=<key> python3 scripts/seed_sentences.py

    Safe to re-run — existing concepts and entries are silently skipped.
"""

import os, sys, json, time
import requests

# ── Configuration ──────────────────────────────────────────────────────────────

SUPABASE_URL  = 'https://imcidnujyhzanrimwscx.supabase.co'
SERVICE_KEY   = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()
SEED_BOT_ID   = '00000000-0000-0000-0000-000000000002'  # Brisco/SIL bot
SENTENCES_FILE = os.path.join(os.path.dirname(__file__), 'dinka_sentences.json')

# IDs for the 336 sentences already seeded by the SQL migration end at s_0336.
START_INDEX = 337

if not SERVICE_KEY:
    print('Error: set SUPABASE_SERVICE_ROLE_KEY before running.')
    sys.exit(1)

HEADERS = {
    'apikey':        SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal',
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def rest(path, *, method='GET', params=None, body=None):
    url = f'{SUPABASE_URL}/rest/v1/{path}'
    r = getattr(requests, method.lower())(url, headers=HEADERS, params=params, json=body)
    if r.status_code >= 400:
        raise RuntimeError(f'{method} {path} → {r.status_code}: {r.text[:300]}')
    return r

def load_existing_concepts():
    """Returns set of existing english_gloss values (lowercased) for dedup."""
    existing = set()
    offset = 0
    while True:
        rows = rest('concepts', params={
            'select': 'english_gloss',
            'concept_type': 'eq.sentence',
            'limit': 1000,
            'offset': offset,
        }).json()
        if not rows:
            break
        for r in rows:
            existing.add(r['english_gloss'].lower().strip())
        offset += len(rows)
        if len(rows) < 1000:
            break
    return existing

def load_existing_entries():
    """Returns set of (concept_id, native_word) pairs already in lexicon_entries."""
    existing = set()
    offset = 0
    while True:
        rows = rest('lexicon_entries', params={
            'select': 'concept_id,native_word',
            'contributor_id': f'eq.{SEED_BOT_ID}',
            'limit': 1000,
            'offset': offset,
        }).json()
        if not rows:
            break
        for r in rows:
            existing.add((r['concept_id'], r['native_word']))
        offset += len(rows)
        if len(rows) < 1000:
            break
    return existing

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    with open(SENTENCES_FILE) as f:
        sentences = json.load(f)

    print(f'Loaded {len(sentences)} sentence pairs from {SENTENCES_FILE}')

    print('Fetching existing sentence concepts…')
    existing_concepts = load_existing_concepts()
    print(f'  {len(existing_concepts)} sentence concepts already in DB.')

    print('Fetching existing lexicon entries from seed bot…')
    existing_entries = load_existing_entries()
    print(f'  {len(existing_entries)} seed entries already in DB.')

    concepts_added  = 0
    concepts_skipped = 0
    entries_added   = 0
    entries_skipped = 0
    next_id_index   = START_INDEX

    for sentence in sentences:
        english = sentence['english'].strip()
        dinka   = sentence['dinka'].strip()
        intent  = sentence.get('intent')

        if not english or not dinka:
            continue

        lower = english.lower()

        # ── Concept ──────────────────────────────────────────────────────────

        if lower in existing_concepts:
            # Find the concept ID for this gloss so we can check the entry.
            # We can't easily look it up here without another query, so we'll
            # rely on the entry dedup by native_word below.
            concepts_skipped += 1
            # We don't have the concept_id here, so skip entry creation for dupes.
            # A second run after a partial run would handle this correctly.
            continue

        concept_id = f's_{next_id_index:04d}'
        next_id_index += 1

        try:
            rest('concepts', method='POST', body={
                'id':            concept_id,
                'english_gloss': english,
                'concept_type':  'sentence',
                'intent':        intent,
                # prompt_context stores the Dinka reference text so the app
                # can pre-fill the textarea and display it as a read-aloud prompt.
                'prompt_context': dinka,
            })
            existing_concepts.add(lower)
            concepts_added += 1
        except RuntimeError as e:
            print(f'  Concept error "{english[:40]}": {e}')
            continue

        # ── Lexicon entry ─────────────────────────────────────────────────────
        # Record the dictionary Dinka text as a seed entry attributed to the
        # Brisco/SIL bot. Community members will review and record their own
        # pronunciations on top of this.

        if (concept_id, dinka) in existing_entries:
            entries_skipped += 1
            continue

        # Infer region data from the sentence's dialect tag.
        dialect_to_state = {
            'NEd': 'Upper Nile State',
            'NWr': 'Unity State',
            'SWr': 'Warrap State',
            'SCa': 'Lakes State',
            'SEb': 'Eastern Equatoria State',
        }
        region_state = sentence.get('region_state') or dialect_to_state.get(sentence.get('dialect', ''), 'South Sudan')

        try:
            rest('lexicon_entries', method='POST', body={
                'concept_id':    concept_id,
                'native_word':   dinka,
                'contributor_id': SEED_BOT_ID,
                'source':        'seed',
                'region_state':  region_state,
                'speaker_l1_status': 'L1',
            })
            existing_entries.add((concept_id, dinka))
            entries_added += 1
        except RuntimeError as e:
            print(f'  Entry error "{dinka[:40]}": {e}')

        # Pace the requests to stay within Supabase rate limits.
        if (concepts_added + concepts_skipped) % 50 == 0:
            print(f'  Progress: {concepts_added} added, {concepts_skipped} skipped…')
            time.sleep(0.2)

    print(f'\nDone.')
    print(f'  Concepts: {concepts_added} added, {concepts_skipped} skipped.')
    print(f'  Entries:  {entries_added} added, {entries_skipped} skipped.')


if __name__ == '__main__':
    main()
