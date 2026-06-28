#!/usr/bin/env python3
"""
scripts/seed_dinka_glossary.py

Seeds Supabase with Dinka concepts and lexicon entries from dinka_seed.json.

Run:
  SUPABASE_SERVICE_ROLE_KEY=<key> python3 scripts/seed_dinka_glossary.py

What it does:
  1. Upserts a seed contributor (Dinka, Warrap State).
  2. For each concept in dinka_seed.json:
     - If english_gloss already exists in concepts, uses that id.
     - Otherwise inserts with a new id starting at c_1000.
  3. For each Dinka entry, inserts a lexicon_entry linked to the concept.
     (The DB trigger sets language_id from the contributor automatically.)

Safe to re-run — skips duplicates.
"""

import os
import json
import sys
import time
import requests

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL      = 'https://imcidnujyhzanrimwscx.supabase.co'
SERVICE_ROLE_KEY  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
SEED_CONTRIBUTOR  = '00000000-0000-0000-0000-000000000002'  # glossary seed bot
SEED_JSON         = os.path.join(os.path.dirname(__file__), 'dinka_seed.json')
CONCEPT_ID_START  = 1000   # seed concepts start at c_1000

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
    url = f'{SUPABASE_URL}/rest/v1/{path}'
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

# ── Step 2: upsert seed contributor ───────────────────────────────────────────

print('Upserting seed contributor…')
rest('POST', 'contributors',
    body={
        'id':          SEED_CONTRIBUTOR,
        'town':        'Rumbek',
        'state':       'Warrap State',
        'language_id': dinka_lang_id,
        'l1_status':   'L1',
    },
)
# Upsert via PATCH if already exists (ignore conflict)
try:
    rest('POST', 'contributors',
        body={
            'id':          SEED_CONTRIBUTOR,
            'town':        'Rumbek',
            'state':       'Warrap State',
            'language_id': dinka_lang_id,
            'l1_status':   'L1',
        },
    )
except RuntimeError:
    pass  # already exists, fine

# ── Step 3: load existing concepts (english_gloss → id) ──────────────────────

print('Loading existing concepts…')
existing_concepts: dict[str, str] = {}
offset = 0
while True:
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

# Find max numeric id so we don't collide
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

# ── Step 4: load seed data ────────────────────────────────────────────────────

with open(SEED_JSON, encoding='utf-8') as f:
    seed_data = json.load(f)

print(f'Loaded {len(seed_data)} seed concepts.')

# ── Step 5: insert concepts + entries ─────────────────────────────────────────

concepts_inserted = 0
concepts_reused   = 0
entries_inserted  = 0
entries_skipped   = 0

# Batch size for entries
BATCH = 50

for i, concept in enumerate(seed_data):
    if i % 200 == 0 and i > 0:
        print(f'  [{i}/{len(seed_data)}] concepts +{concepts_inserted} '
              f'reused={concepts_reused} entries +{entries_inserted}')

    english = concept['english'].lower().strip()

    # Find or create concept
    if english in existing_concepts:
        concept_id = existing_concepts[english]
        concepts_reused += 1
    else:
        concept_id = f'c_{next_id:04d}'
        next_id += 1
        try:
            rest('POST', 'concepts', body={
                'id':           concept_id,
                'english_gloss': concept['english'],
                'swadesh_list': False,
            })
            existing_concepts[english] = concept_id
            concepts_inserted += 1
        except RuntimeError as e:
            # Duplicate — another run probably inserted it
            if 'duplicate' in str(e).lower() or 'unique' in str(e).lower():
                concepts_reused += 1
                continue
            print(f'  Concept error "{english}": {e}')
            continue

    # Insert lexicon entries one by one (to handle per-row errors gracefully)
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
                # language_id set automatically by DB trigger from contributor
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
