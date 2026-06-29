#!/usr/bin/env python3
"""
Filename: seed_sil_dictionary.py
Project:  Thok — Indigenous Language Preservation PWA

Description:
    Seeds the Supabase database with Dinka concepts and lexicon entries parsed
    from the SIL/Duerksen Dinka-English Dictionary by parse_sil_dictionary.py.

    Input file : scripts/sil_seed.json
    Outcome    : 4,113 new concepts (c_4257+), 978 reused, 6,298 entries

    This script is structurally identical to seed_dinka_glossary.py but uses a
    different SEED_CONTRIBUTOR UUID (…000003 vs …000002) so that entries can be
    traced to their source dictionary. It is run after the Brisco glossary seed
    so that the 978 overlapping English concepts are detected as already existing
    (concepts_reused) rather than duplicated with different IDs.

Source:
    Duerksen, J. & SIL International. Dinka-English Dictionary.
    Unicode conversion by Roger Blench, 17 December 2005.
    Parsed output: scripts/sil_seed.json

Usage:
    SUPABASE_SERVICE_ROLE_KEY=<key> python3 scripts/seed_sil_dictionary.py

    Safe to re-run — existing concepts and entries are silently skipped.
    Must be run AFTER seed_dinka_glossary.py to ensure correct concept ID ordering.
"""

import os
import json
import sys
import requests

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL     = 'https://imcidnujyhzanrimwscx.supabase.co'
SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

# Bot UUID for the SIL/Duerksen Dinka-English Dictionary seed. Distinct from the
# Brisco glossary bot (…000002) so data source is traceable per lexicon entry.
SEED_CONTRIBUTOR = '00000000-0000-0000-0000-000000000003'

SEED_JSON        = os.path.join(os.path.dirname(__file__), 'sil_seed.json')

# Floor for seed concept IDs; the actual next ID is derived from the database
# maximum at runtime so this script always continues from the correct offset
# regardless of how many concepts were inserted by earlier seeds.
CONCEPT_ID_START = 1000

if not SERVICE_ROLE_KEY:
    print('Error: set SUPABASE_SERVICE_ROLE_KEY environment variable.')
    sys.exit(1)

HEADERS = {
    'apikey':        SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
}


def rest(method, path, body=None, params=None):
    """
    Make an authenticated REST request to the Supabase PostgREST API.

    Wraps requests.request with the project's service-role auth headers and
    raises a descriptive RuntimeError for any HTTP 4xx/5xx response so callers
    can handle specific failure modes (e.g. duplicate key) without inspecting
    status codes directly.

    Parameters:
        method (str):  HTTP verb — 'GET', 'POST', 'PATCH', or 'DELETE'.
        path   (str):  PostgREST table path, e.g. 'concepts' or 'lexicon_entries'.
        body   (dict): JSON request body for POST/PATCH requests.
        params (dict): URL query parameters for GET requests (filters, selects).

    Returns:
        list | dict | None:
            Parsed JSON response body, or None for responses with no body (e.g.
            some 204 No Content responses).

    Raises:
        RuntimeError: If the HTTP response status is 400 or higher, with the
                      method, path, status code, and first 300 chars of the body.
    """
    url  = f'{SUPABASE_URL}/rest/v1/{path}'
    resp = requests.request(method, url, headers=HEADERS, json=body, params=params)
    if resp.status_code >= 400:
        raise RuntimeError(f'{method} {path} → {resp.status_code}: {resp.text[:300]}')
    return resp.json() if resp.text else None


# ── Step 1: look up Dinka language_id ─────────────────────────────────────────

print('Looking up Dinka language id…')
langs = rest('GET', 'languages', params={'code': 'eq.dinka', 'select': 'id'})
if not langs:
    print('Error: Dinka language not found.')
    sys.exit(1)
dinka_lang_id = langs[0]['id']
print(f'  Dinka language_id = {dinka_lang_id}')

# ── Step 2: upsert SIL seed contributor ───────────────────────────────────────

print('Upserting SIL seed contributor…')
try:
    rest('POST', 'contributors', body={
        'id':          SEED_CONTRIBUTOR,
        'town':        'Rumbek',
        'state':       'Lakes State',
        'language_id': dinka_lang_id,
        'l1_status':   'L1',
    })
except RuntimeError:
    # Contributor already exists from a previous seed run — safe to continue.
    pass

# ── Step 3: load existing concepts (english_gloss → id) ──────────────────────

print('Loading existing concepts…')
existing_concepts: dict[str, str] = {}
offset = 0
while True:
    # PostgREST caps responses at 1000 rows; page through until exhausted.
    page = rest('GET', 'concepts',
        params={'select': 'id,english_gloss', 'limit': 1000, 'offset': offset})
    if not page:
        break
    for row in page:
        existing_concepts[row['english_gloss'].lower().strip()] = row['id']
    if len(page) < 1000:
        break
    offset += 1000

print(f'  Found {len(existing_concepts)} existing concepts.')

# Determine the highest numeric concept ID in the database so the next new ID
# starts immediately after it. When this script runs after seed_dinka_glossary.py,
# max_id will be ~c_4256 and this script's new concepts begin at c_4257.
max_id = CONCEPT_ID_START - 1
for cid in existing_concepts.values():
    if cid.startswith('c_'):
        try:
            n = int(cid[2:])
            if n > max_id:
                max_id = n
        except ValueError:
            pass
next_id = max(max_id + 1, CONCEPT_ID_START)
print(f'  Next seed concept id: c_{next_id:04d}')

# ── Step 4: load SIL seed data ────────────────────────────────────────────────

with open(SEED_JSON, encoding='utf-8') as f:
    seed_data = json.load(f)

print(f'Loaded {len(seed_data)} concepts from sil_seed.json.')

# ── Step 5: insert concepts + entries ─────────────────────────────────────────

concepts_inserted = 0
concepts_reused   = 0
entries_inserted  = 0
entries_skipped   = 0

for i, concept in enumerate(seed_data):
    if i % 200 == 0 and i > 0:
        print(f'  [{i}/{len(seed_data)}] concepts +{concepts_inserted} '
              f'reused={concepts_reused} entries +{entries_inserted}')

    english = concept['english'].lower().strip()

    if english in existing_concepts:
        # Concept already seeded by seed_dinka_glossary.py or found in the
        # hand-curated set; reuse its ID so both dictionaries link to the same
        # concept record, enriching it with additional dialect entries.
        concept_id = existing_concepts[english]
        concepts_reused += 1
    else:
        concept_id = f'c_{next_id:04d}'
        next_id += 1
        try:
            rest('POST', 'concepts', body={
                'id':            concept_id,
                'english_gloss': concept['english'],
                'swadesh_list':  False,
            })
            existing_concepts[english] = concept_id
            concepts_inserted += 1
        except RuntimeError as e:
            if 'duplicate' in str(e).lower() or 'unique' in str(e).lower():
                # Race condition with a concurrent run: treat as reused.
                concepts_reused += 1
                continue
            print(f'  Concept error "{english}": {e}')
            continue

    # Insert entries one at a time so a single bad row doesn't abort the batch.
    for entry in concept['entries']:
        region_state = entry.get('region_state') or 'Warrap State'
        dialect      = entry.get('dialect') or 'SWr'

        try:
            rest('POST', 'lexicon_entries', body={
                'concept_id':     concept_id,
                'contributor_id': SEED_CONTRIBUTOR,
                'native_word':    entry['dinka_word'],
                'region_town':    f'{dialect} dialect',
                'region_state':   region_state,
                # language_id is set automatically by a DB trigger that reads
                # the contributor's language_id; it must not be sent here.
            })
            entries_inserted += 1
        except RuntimeError as e:
            err = str(e)
            if 'duplicate' in err.lower() or 'unique' in err.lower():
                entries_skipped += 1
            else:
                print(f'  Entry error "{entry["dinka_word"]}" for "{english}": {e}')

print('\n── Seed complete ──────────────────────────────────────────')
print(f'  Concepts inserted : {concepts_inserted}')
print(f'  Concepts reused   : {concepts_reused}')
print(f'  Entries inserted  : {entries_inserted}')
print(f'  Entries skipped   : {entries_skipped}')
