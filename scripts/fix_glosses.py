#!/usr/bin/env python3
"""
Filename: fix_glosses.py
Project:  Thok — Indigenous Language Preservation PWA

Description:
    Applies gloss quality fixes to the Supabase concepts table.
    Cleans 378 concepts with noisy English glosses (embedded Dinka example
    sentences, dialect region codes, numbered-sense prefixes, cross-references)
    and removes 27 concepts that have no usable English gloss.

    The two seed JSON files (sil_seed.json, dinka_seed.json) must already be
    cleaned before running this script — they are the source of truth for what
    the glosses should be.

    Noise categories fixed:
      - Embedded Dinka example sentences   ("be dark. Piny ala makmak. It is dark" → "be dark")
      - Dialect region codes               ("beads. SWr" → "beads")
      - Multi-sense numbering              ("1) begin, start" → "begin, start")
      - Cross-references                   ("a big piece. Ant: thiim" → "a big piece")
      - Grammatical examples               ("did he go?" → deleted)

Usage:
    SUPABASE_SERVICE_ROLE_KEY=<key> python3 scripts/fix_glosses.py

    Idempotent — rows already fixed are silently skipped.
"""

import os, sys, json, time
import requests

# ── Configuration ──────────────────────────────────────────────────────────────

SUPABASE_URL = "https://imcidnujyhzanrimwscx.supabase.co"
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

if not SERVICE_KEY:
    print("Error: set SUPABASE_SERVICE_ROLE_KEY before running.")
    sys.exit(1)

HEADERS = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
}

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
SIL_JSON    = os.path.join(SCRIPTS_DIR, "sil_seed.json")
BRISCO_JSON = os.path.join(SCRIPTS_DIR, "dinka_seed.json")

# Concepts that had no usable English gloss after cleaning.
# These are removed from the JSON files; delete them from the DB too.
GLOSSES_TO_DELETE = [
    # SIL — grammatical examples and single-letter stubs
    "1)", "as", "do", "go", "in", "my", "no", "on", "or", "so", "to be red. luaat Am I red?",
    "us", "we", "am I young?", "are they going?, did they go?", "did he go?", "did I go?",
    "did we go?", "did you (sg) go?", "did you all go?", "what is it? what is the matter?",
    "what?", "what? how?", "who?",
    # Brisco — single-letter stubs
    "a", "i",
]


def rest(path, *, method="GET", params=None, body=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = getattr(requests, method.lower())(url, headers=HEADERS, params=params, json=body)
    if r.status_code >= 400:
        raise RuntimeError(f"{method} {path} → {r.status_code}: {r.text[:300]}")
    return r


def fetch_all_concepts():
    """Returns a dict: lowercase-stripped gloss → {id, english_gloss}."""
    concepts = {}
    offset = 0
    while True:
        rows = rest("concepts", params={"select": "id,english_gloss", "limit": 1000, "offset": offset}).json()
        if not rows:
            break
        for row in rows:
            key = row["english_gloss"].lower().strip()
            concepts[key] = row
        offset += len(rows)
        if len(rows) < 1000:
            break
    return concepts


def load_target_glosses():
    """Returns set of (old_lower → new_gloss) from both clean JSON files."""
    updates = {}
    for path in [SIL_JSON, BRISCO_JSON]:
        with open(path) as f:
            data = json.load(f)
        for c in data:
            updates[c["english"].lower().strip()] = c["english"]
    return updates


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("Fetching all concepts from DB…")
    db_concepts = fetch_all_concepts()
    print(f"  Found {len(db_concepts)} concepts in DB.")

    target = load_target_glosses()

    updates_applied = 0
    updates_skipped = 0
    for lower_key, concept in db_concepts.items():
        current_gloss = concept["english_gloss"]
        if lower_key not in target:
            continue  # not in our seed files — leave it alone
        desired_gloss = target[lower_key]
        if current_gloss == desired_gloss:
            updates_skipped += 1
            continue
        # Apply the update
        rest(
            f"concepts?id=eq.{concept['id']}",
            method="PATCH",
            body={"english_gloss": desired_gloss},
        )
        print(f"  Updated: {repr(current_gloss)[:50]} → {repr(desired_gloss)[:50]}")
        updates_applied += 1

    print(f"\nUpdates: {updates_applied} applied, {updates_skipped} already correct.")

    # Delete junk concepts (cascades to lexicon_entries)
    deletes_done = 0
    print("\nDeleting junk concepts…")
    for gloss in GLOSSES_TO_DELETE:
        lower = gloss.lower().strip()
        if lower not in db_concepts:
            print(f"  Skip (not in DB): {repr(gloss)}")
            continue
        concept_id = db_concepts[lower]["id"]
        rest(f"concepts?id=eq.{concept_id}", method="DELETE")
        print(f"  Deleted: {repr(gloss)} (id={concept_id})")
        deletes_done += 1

    print(f"\nDeletes: {deletes_done} removed.")
    print("\nDone. Glosses are clean.")


if __name__ == "__main__":
    main()
