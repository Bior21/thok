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
# Runs on RAW lines (before column splitting) so that indentation is preserved
# and wrapped sentences can be rejoined correctly.

META_PREFIXES = ('prs:', 'npr:', 'cf:', 'morph:', 'sbj:', 'loc:',
                 'vn:', 'va:', 'sg:', 'pl:', 'swr:', 'sca:', 'seb:',
                 'nwr:', 'ned:', 'sw:', 'se:', 'sc:', 'ne:', 'nw:')

def extract_sentences_raw(raw_lines):
    """
    Extract Dinka–English sentence pairs by processing each column as a
    separate stream, preserving raw indentation for continuation detection.

    Left column:  continuation = raw line has 2-3 leading spaces
    Right column: continuation = raw line has 40+ leading spaces

    This prevents cross-column contamination (right-column text leaking
    into left-column sentences and vice-versa).
    """

    # ── Step 1: split raw lines into two per-column streams ──────────────────
    # Each stream entry: (text: str, is_continuation: bool)

    left_stream  = []
    right_stream = []

    for raw in raw_lines:
        text = raw.rstrip('\n')
        if not text.strip():
            left_stream.append(('', False))
            right_stream.append(('', False))
            continue

        leading = len(text) - len(text.lstrip(' '))

        if leading >= 40:
            # Right-column-only line (very deeply indented)
            left_stream.append(('', False))
            right_stream.append((text.strip(), True))
        else:
            m = re.search(r' {8,}', text[12:])
            if m:
                split_pos  = 12 + m.end()
                left_text  = text[:12 + m.start()].strip()
                right_text = text[split_pos:].strip()
                left_stream.append((left_text,  leading >= 2))
                right_stream.append((right_text, False) if right_text else ('', False))
            else:
                left_stream.append((text.strip(), leading >= 2))
                right_stream.append(('', False))

    # ── Step 2: join continuations within each stream ─────────────────────────

    def join_stream(stream):
        joined = []
        buffer = ''
        for text, is_cont in stream:
            if not text:
                if buffer:
                    joined.append(buffer)
                    buffer = ''
                continue
            if is_cont and buffer:
                buffer = buffer.rstrip() + ' ' + text
            else:
                if buffer:
                    joined.append(buffer)
                buffer = text
        if buffer:
            joined.append(buffer)
        return joined

    left_joined  = join_stream(left_stream)
    right_joined = join_stream(right_stream)

    # ── Step 3: extract sentence pairs from each column's joined lines ────────

    def extract_from_lines(lines):
        sents      = []
        seen       = set()
        current_hw = None
        current_dl = None
        current_st = 'Warrap State'

        for raw in lines:
            line = raw.strip()
            if not line or 'DRAFT' in line or re.match(r'^\d+$', line):
                continue

            if is_english_headword(line) and not has_dinka(line):
                current_hw = line.lower().strip()

            for tok in line.split()[:8]:
                code = tok.rstrip('.,;:/')
                if code in DIALECT_CODES:
                    current_dl = code
                    current_st = DIALECT_STATE[code]
                    break

            for m in SENT_RE.finditer(line):
                dinka_part   = m.group(1).strip()
                english_part = m.group(2).strip()

                if not has_dinka(dinka_part):               continue
                if has_dinka(english_part):                 continue
                if len(dinka_part) < 5:                     continue
                if len(english_part) < 6:                   continue
                if dinka_part.lower().startswith(META_PREFIXES): continue
                if re.match(r'^[A-Z]{2,3}[a-z]?:', english_part): continue
                if any(w in english_part.lower() for w in
                       ['see:', 'cf:', 'morph:', 'variant:', 'gospel', 'chapter']):
                    continue

                punct          = line[m.end(1)] if m.end(1) < len(line) else '.'
                dinka_sentence = dinka_part + punct

                if dinka_sentence in seen:
                    continue
                seen.add(dinka_sentence)

                sents.append({
                    'dinka':          dinka_sentence,
                    'english':        english_part,
                    'intent':         infer_intent(english_part),
                    'parent_concept': current_hw,
                    'dialect':        current_dl,
                    'region_state':   current_st,
                })

        return sents, seen

    left_sents,  left_seen  = extract_from_lines(left_joined)
    right_sents, right_seen = extract_from_lines(right_joined)

    # Merge, deduplicate by Dinka sentence
    all_sents = list(left_sents)
    for s in right_sents:
        if s['dinka'] not in left_seen:
            all_sents.append(s)

    return all_sents

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

    # ── Sentences (extracted from raw lines before column splitting) ───────────
    all_sents = extract_sentences_raw(dict_lines)

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
