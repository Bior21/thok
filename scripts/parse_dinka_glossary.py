#!/usr/bin/env python3
"""
Parse the Brisco/SIL Dinka glossary (plain text, two-column Word export) into:
  - scripts/dinka_seed.json      English concept → Dinka word entries
  - scripts/dinka_sentences.json Dinka sentence → English translation pairs
"""

import re
import json

INPUT      = '/Users/biormadolkhombior/Downloads/dinka_dict/dinka_glossary.txt'
OUT_WORDS  = '/Users/biormadolkhombior/Downloads/thok/scripts/dinka_seed.json'
OUT_SENTS  = '/Users/biormadolkhombior/Downloads/thok/scripts/dinka_sentences.json'

# --- Dialect code → South Sudan state ----------------------------------------

DIALECT_STATE = {
    'SWr':  'Warrap State',
    'SWt':  'Warrap State',
    'SWm':  'Northern Bahr el Ghazal',
    'SWj':  'Warrap State',
    'SW':   'Warrap State',
    'SCa':  'Lakes State',
    'SC':   'Lakes State',
    'SA':   'Lakes State',
    'SEb':  'Jonglei State',
    'SE':   'Jonglei State',
    'NWr':  'Unity State',
    'NWn':  'Other / Outside South Sudan',
    'NWE':  'Unity State',
    'NW':   'Unity State',
    'NEd':  'Upper Nile State',
    'NEb':  'Upper Nile State',
    'NE':   'Upper Nile State',
}

DIALECT_CODES = set(DIALECT_STATE.keys())

# --- Helpers ------------------------------------------------------------------

DINKA_RE = re.compile(r'[äëïöɔɛɣŋÄËÏÖɔɛɣŋɛ̈ɔ̈]')

def has_dinka(text):
    return bool(DINKA_RE.search(text))

SKIP_TOKENS = {
    'draft', 'see', 'cf', 'lit', 'var', 'morph', 'prs', 'npr', 'sbj',
    'loc', 'vn', 'va', 'sg', 'pl', 'mat', 'act', 'gen', 'hfi', 'mjb',
    'dlia', 'sil', 'ne', 'nw', 'sw', 'sc', 'se',
}

POS = {'n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'num.',
       'post.', 'pron.', 'interj.', 'part.'}

SENTENCE_PARTICLES = {'acï', 'acaa', 'ee', 'ë', 'bï', 'cà', 'cï', 'ke', 'na', 'ku', 'ɣɛn'}

# Sentence pattern:
#   Group 1 — Dinka text: must contain at least one Dinka char, ends at first ". " or ".  "
#   Group 2 — English text: starts with capital letter, no Dinka chars, ≥ 6 chars
SENT_RE = re.compile(
    r'([^\n.]{4,}[äëïöɔɛɣŋ][^\n.]*)'   # Dinka part (has Dinka char)
    r'[.!?]'                              # sentence-ending punctuation
    r'\s{1,4}'                            # 1–4 spaces (not a paragraph gap)
    r'([A-Z][^\näëïöɔɛɣŋ]{5,}[.!?])',   # English part (capital, no Dinka, ≥6 chars)
    re.UNICODE
)

def infer_intent(english):
    if english.rstrip().endswith('?'):
        return 'question'
    if english.rstrip().endswith('!'):
        return 'exclamation'
    # Detect commands: start with imperative verbs or "Don't"
    first = re.split(r"['\s]", english)[0].lower()
    if first in {'don', "don't", 'come', 'go', 'take', 'give', 'bring', 'sit',
                 'stay', 'do', 'be', 'let', 'help', 'tell', 'look', 'stop',
                 'put', 'repent', 'pay', 'follow', 'listen', 'speak', 'stand',
                 'receive', 'try', 'hold', 'keep', 'wait', 'fear', 'leave',
                 'bring', 'use', 'drink', 'eat', 'walk', 'run', 'pray'}:
        return 'command'
    return 'statement'

def is_english_headword(text):
    s = text.strip()
    if not s or not s[0].isalpha():
        return False
    if has_dinka(s):
        return False
    if 'DRAFT' in s or s.isdigit():
        return False
    if s.endswith('.') or s.endswith(',') or s.endswith(';'):
        return False
    words = s.split()
    if len(words) > 5:
        return False
    if re.search(r'\b(the|a|an|of|in|on|at|to|for|and|or)\b', s, re.I) and len(words) > 3:
        return False
    if words[0].lower() in SKIP_TOKENS:
        return False
    return True

def split_columns(line):
    leading = len(line) - len(line.lstrip(' '))
    if leading >= 40:
        return '', line.strip()
    m = re.search(r' {8,}', line[12:])
    if m:
        split_pos = 12 + m.end()
        return line[:12 + m.start()].strip(), line[split_pos:].strip()
    return line.strip(), ''

def extract_dialects(tokens):
    for t in tokens:
        code = t.rstrip('.,;:/')
        if code in DIALECT_CODES:
            return code, DIALECT_STATE[code]
    return None, 'Warrap State'

def parse_dinka_entry(text):
    s = text.strip()
    if not s:
        return None
    tokens = s.split()
    first = tokens[0].rstrip('.,;:/')
    if first.lower() in SKIP_TOKENS:
        return None
    dinka_word = first
    if len(tokens) > 1:
        second = tokens[1].rstrip('.,;:/')
        if has_dinka(second) and second not in DIALECT_CODES and second not in POS:
            dinka_word = first + ' ' + second
    if len(tokens) >= 2 and tokens[1].rstrip('.,;') in SENTENCE_PARTICLES:
        return None
    if first and first[0].isupper() and not has_dinka(first):
        if len(tokens) < 2 or tokens[1].rstrip('.,;:/') not in DIALECT_CODES:
            return None
    dialect, state = extract_dialects(tokens[1:8])
    return dinka_word, dialect, state

# --- Word parser --------------------------------------------------------------

def parse_column_lines(lines):
    results = {}
    current = None
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if 'DRAFT' in line or re.match(r'^\d+$', line):
            continue
        is_continuation = raw.startswith('  ') and not raw.startswith('     ')
        if not is_continuation and is_english_headword(line):
            current = line.lower().strip()
            if current not in results:
                results[current] = []
        elif current is not None:
            parsed = parse_dinka_entry(line)
            if parsed:
                dinka_word, dialect, state = parsed
                existing = [e['dinka_word'] for e in results[current]]
                has_quality = has_dinka(dinka_word) or (dialect is not None)
                if dinka_word not in existing and has_quality:
                    results[current].append({
                        'dinka_word':   dinka_word,
                        'dialect':      dialect,
                        'region_state': state,
                    })
    return results

# --- Sentence parser ----------------------------------------------------------

def join_continuation_lines(lines):
    """
    Join lines that are continuations of the previous line (indented 2 spaces).
    This reconstructs sentences that were wrapped across two lines in the Word doc.
    """
    joined = []
    buffer = ''
    for raw in lines:
        # A continuation line starts with exactly 2 spaces (not more)
        if raw.startswith('  ') and not raw.startswith('    ') and buffer:
            buffer = buffer.rstrip() + ' ' + raw.strip()
        else:
            if buffer:
                joined.append(buffer)
            buffer = raw.rstrip('\n')
    if buffer:
        joined.append(buffer)
    return joined

def extract_sentences_from_column(lines):
    """
    Extract Dinka–English sentence pairs from one column's lines.
    Tracks the current English headword for parent_concept linkage.
    Tracks the last dialect code seen for region attribution.
    """
    sentences = []
    current_headword = None
    current_dialect  = None
    current_state    = 'Warrap State'
    seen             = set()   # deduplicate by Dinka sentence

    joined = join_continuation_lines(lines)

    for raw in joined:
        line = raw.strip()
        if not line or 'DRAFT' in line:
            continue

        # Update headword context
        if is_english_headword(line) and not has_dinka(line):
            current_headword = line.lower().strip()

        # Update dialect context from any entry line that has a dialect code
        tokens = line.split()
        for t in tokens[:6]:
            code = t.rstrip('.,;:/')
            if code in DIALECT_CODES:
                current_dialect = code
                current_state   = DIALECT_STATE[code]
                break

        # Search the line for Dinka–English sentence pairs
        for m in SENT_RE.finditer(line):
            dinka_part   = m.group(1).strip()
            english_part = m.group(2).strip()

            # Validate
            if not has_dinka(dinka_part):
                continue
            if has_dinka(english_part):
                continue
            if len(dinka_part) < 5 or len(english_part) < 6:
                continue
            # Skip glossary meta-text that leaks through
            if any(skip in english_part.lower() for skip in
                   ['see:', 'cf:', 'morph:', 'variant:', 'gospel', 'chapter']):
                continue
            # Skip if Dinka part starts with a grammatical reference marker
            META_PREFIXES = ('prs:', 'npr:', 'cf:', 'morph:', 'sbj:', 'loc:',
                             'vn:', 'va:', 'sg:', 'pl:', 'swr:', 'sca:', 'seb:',
                             'nwr:', 'ned:', 'nwr:', 'sw:', 'se:', 'sc:', 'ne:')
            if dinka_part.lower().startswith(META_PREFIXES):
                continue
            # Skip if English part looks like a definition note rather than a translation
            # (starts with a dialect code or abbreviation)
            if re.match(r'^[A-Z]{2,3}[a-z]?:', english_part):
                continue

            # Reconstruct full Dinka sentence with punctuation
            punct = line[m.end(1)] if m.end(1) < len(line) else '.'
            dinka_sentence = dinka_part + punct

            if dinka_sentence in seen:
                continue
            seen.add(dinka_sentence)

            sentences.append({
                'dinka':          dinka_sentence,
                'english':        english_part,
                'intent':         infer_intent(english_part),
                'parent_concept': current_headword,
                'dialect':        current_dialect,
                'region_state':   current_state,
            })

    return sentences

# --- Main ---------------------------------------------------------------------

def main():
    with open(INPUT, encoding='utf-8') as f:
        all_lines = f.readlines()

    dict_lines = all_lines[310:]

    left_lines  = []
    right_lines = []
    for line in dict_lines:
        left, right = split_columns(line)
        left_lines.append(left)
        right_lines.append(right)

    # ── Words ──────────────────────────────────────────────────────────────────
    left_data  = parse_column_lines(left_lines)
    right_data = parse_column_lines(right_lines)

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

    words_output = [
        {'english': eng, 'entries': entries}
        for eng, entries in sorted(merged.items())
        if entries
    ]

    with open(OUT_WORDS, 'w', encoding='utf-8') as f:
        json.dump(words_output, f, ensure_ascii=False, indent=2)

    print(f'Words  → {len(words_output)} concepts, '
          f'{sum(len(c["entries"]) for c in words_output)} entries')

    # ── Sentences ──────────────────────────────────────────────────────────────
    left_sents  = extract_sentences_from_column(left_lines)
    right_sents = extract_sentences_from_column(right_lines)

    # Merge, deduplicate by Dinka sentence
    all_sents = left_sents
    seen_dinka = {s['dinka'] for s in all_sents}
    for s in right_sents:
        if s['dinka'] not in seen_dinka:
            all_sents.append(s)
            seen_dinka.add(s['dinka'])

    with open(OUT_SENTS, 'w', encoding='utf-8') as f:
        json.dump(all_sents, f, ensure_ascii=False, indent=2)

    print(f'Sentences → {len(all_sents)} pairs')

    # Sample sentences
    intents = {}
    for s in all_sents:
        intents[s['intent']] = intents.get(s['intent'], 0) + 1
    print(f'  Intent breakdown: {intents}')
    print()
    for s in all_sents[:8]:
        print(f"  [{s['parent_concept']}] {s['intent']}")
        print(f"    DK: {s['dinka']}")
        print(f"    EN: {s['english']}")

if __name__ == '__main__':
    main()
