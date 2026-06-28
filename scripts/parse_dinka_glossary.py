#!/usr/bin/env python3
"""
Parse the Brisco/SIL Dinka glossary (plain text, two-column Word export)
into structured JSON: English concept → list of Dinka entries with dialect.

Output: scripts/dinka_seed.json
"""

import re
import json

INPUT  = '/Users/biormadolkhombior/Downloads/dinka_dict/dinka_glossary.txt'
OUTPUT = '/Users/biormadolkhombior/Downloads/thok/scripts/dinka_seed.json'

# --- Dialect code → South Sudan state ----------------------------------------

DIALECT_STATE = {
    'SWr':  'Warrap State',
    'SWt':  'Warrap State',          # Tuic (west)
    'SWm':  'Northern Bahr el Ghazal',  # Malual
    'SWj':  'Warrap State',
    'SW':   'Warrap State',
    'SCa':  'Lakes State',           # Agar
    'SC':   'Lakes State',
    'SA':   'Lakes State',           # South Aliap
    'SEb':  'Jonglei State',         # Bor
    'SE':   'Jonglei State',
    'NWr':  'Unity State',           # Ruweng
    'NWn':  'Other / Outside South Sudan',  # Ŋɔk Kordofan (now in Sudan)
    'NWE':  'Unity State',
    'NW':   'Unity State',
    'NEd':  'Upper Nile State',      # Donjol
    'NEb':  'Upper Nile State',      # Abialaŋ
    'NE':   'Upper Nile State',
}

DIALECT_CODES = set(DIALECT_STATE.keys())

# --- Helpers ------------------------------------------------------------------

# Characters that only appear in Dinka (not standard English)
DINKA_RE = re.compile(r'[äëïöɔɛɣŋÄËÏÖɔɛɣŋɛ̈ɔ̈]')

def has_dinka(text):
    return bool(DINKA_RE.search(text))

# Words/tokens that are never Dinka headwords
SKIP_TOKENS = {
    'draft', 'see', 'cf', 'lit', 'var', 'morph', 'prs', 'npr', 'sbj',
    'loc', 'vn', 'va', 'sg', 'pl', 'mat', 'act', 'gen', 'hfi', 'mjb',
    'dlia', 'sil', 'ne', 'nw', 'sw', 'sc', 'se',
}

POS = {'n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'num.',
       'post.', 'pron.', 'interj.', 'part.'}

def is_english_headword(text):
    """
    True if text looks like an English dictionary headword:
    - Short (≤ 5 words)
    - No Dinka characters
    - Starts with a letter
    - Not a page marker or source note
    - Does not end with a period (that would make it a fragment from a Dinka definition)
    """
    s = text.strip()
    if not s or not s[0].isalpha():
        return False
    if has_dinka(s):
        return False
    if 'DRAFT' in s or s.isdigit():
        return False
    # Lines ending with a period are continuation fragments, not headwords
    if s.endswith('.') or s.endswith(',') or s.endswith(';'):
        return False
    words = s.split()
    if len(words) > 5:
        return False
    # Reject lines that look like continuation prose
    if re.search(r'\b(the|a|an|of|in|on|at|to|for|and|or)\b', s, re.I) and len(words) > 3:
        return False
    # Reject source/ref markers
    if words[0].lower() in SKIP_TOKENS:
        return False
    return True

def split_columns(line):
    """
    Split a two-column line into (left, right).
    Strategy: look for a run of 8+ spaces after position 12.
    If leading spaces >= 40, the whole line is right-column.
    """
    leading = len(line) - len(line.lstrip(' '))

    if leading >= 40:
        return '', line.strip()

    # Look for a column separator: 8+ consecutive spaces after position 12
    m = re.search(r' {8,}', line[12:])
    if m:
        split_pos = 12 + m.end()
        left  = line[:12 + m.start()].strip()
        right = line[split_pos:].strip()
        return left, right

    return line.strip(), ''

def extract_dialects(tokens):
    """Return first dialect code found in tokens, and its state."""
    for t in tokens:
        code = t.rstrip('.,;:/')
        if code in DIALECT_CODES:
            return code, DIALECT_STATE[code]
    return None, 'Warrap State'   # default: SWr Rek (75% of glossary)

def parse_dinka_entry(text):
    """
    Parse a Dinka entry line such as:
      'tök NEd SWr SCa num. 1) one. 2) a, an.'
      'bar SWr v. leave orphans. npr: baar.'
      'luac piny abase.'
    Returns (dinka_word, dialect_code, region_state) or None.
    """
    s = text.strip()
    if not s:
        return None

    tokens = s.split()
    first = tokens[0].rstrip('.,;:/')

    # Skip if first token is a pure skip word
    if first.lower() in SKIP_TOKENS:
        return None

    # The Dinka word is either just the first token, or a two-word phrase
    # if the second token also has Dinka chars and isn't a dialect/POS marker
    dinka_word = first
    if len(tokens) > 1:
        second = tokens[1].rstrip('.,;:/')
        if has_dinka(second) and second not in DIALECT_CODES and second not in POS:
            dinka_word = first + ' ' + second

    # Reject example sentences: "Mony acï ...", "Ɣɛn acï ...", "Yïn bï ..."
    # These are Dinka sentences used as examples, not word entries.
    # Signal: second token is a common Dinka sentence particle
    SENTENCE_PARTICLES = {'acï', 'acaa', 'ee', 'ë', 'bï', 'cà', 'cï', 'ke', 'na', 'ku', 'ɣɛn'}
    if len(tokens) >= 2 and tokens[1].rstrip('.,;') in SENTENCE_PARTICLES:
        return None
    # Reject lines where first token is capitalized but second is not a dialect code
    # (capitalized first token + non-dialect second → example sentence like "Mioc ɣɛn...")
    if first and first[0].isupper() and not has_dinka(first):
        if len(tokens) < 2 or tokens[1].rstrip('.,;:/') not in DIALECT_CODES:
            return None

    dialect, state = extract_dialects(tokens[1:8])
    return dinka_word, dialect, state

# --- Main parser --------------------------------------------------------------

def parse_column_lines(lines):
    """
    Given a list of text lines from one column,
    return dict: english_headword → [{'dinka_word', 'dialect', 'region_state'}, ...]
    """
    results = {}
    current = None

    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if 'DRAFT' in line or re.match(r'^\d+$', line):
            continue

        # Continuation lines are indented (start with 2+ spaces in original)
        is_continuation = raw.startswith('  ') and not raw.startswith('     ')

        if not is_continuation and is_english_headword(line):
            current = line.lower().strip()
            if current not in results:
                results[current] = []
        elif current is not None:
            # Try to parse as a Dinka entry
            parsed = parse_dinka_entry(line)
            if parsed:
                dinka_word, dialect, state = parsed
                # Avoid duplicates
                existing = [e['dinka_word'] for e in results[current]]
                # Only keep entries with Dinka chars OR a confirmed dialect code
                has_quality = has_dinka(dinka_word) or (dialect is not None)
                if dinka_word not in existing and has_quality:
                    results[current].append({
                        'dinka_word':   dinka_word,
                        'dialect':      dialect,
                        'region_state': state,
                    })

    return results

def main():
    with open(INPUT, encoding='utf-8') as f:
        all_lines = f.readlines()

    # Skip preamble — dictionary entries start around line 310
    dict_lines = all_lines[310:]

    left_lines  = []
    right_lines = []

    for line in dict_lines:
        left, right = split_columns(line)
        left_lines.append(left)
        right_lines.append(right)

    left_data  = parse_column_lines(left_lines)
    right_data = parse_column_lines(right_lines)

    # Merge both columns
    merged = dict(left_data)
    for eng, entries in right_data.items():
        if eng in merged:
            existing_words = {e['dinka_word'] for e in merged[eng]}
            for entry in entries:
                if entry['dinka_word'] not in existing_words:
                    merged[eng].append(entry)
                    existing_words.add(entry['dinka_word'])
        else:
            merged[eng] = entries

    # Build output — only concepts that have at least one Dinka word
    output = [
        {'english': eng, 'entries': entries}
        for eng, entries in sorted(merged.items())
        if entries
    ]

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f'Extracted {len(output)} concepts with Dinka entries')

    # Show a sample
    for item in output[:10]:
        print(f"\n  [{item['english']}]")
        for e in item['entries'][:3]:
            print(f"    {e['dinka_word']}  ({e['dialect'] or '?'}) → {e['region_state']}")

if __name__ == '__main__':
    main()
