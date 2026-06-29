#!/usr/bin/env python3
"""
Filename: parse_dinka_glossary.py
Project:  Thok — Indigenous Language Preservation PWA

Description:
    Parses the Brisco/SIL 2006 English-to-Dinka glossary (plain-text, two-column
    Microsoft Word export) and produces two JSON seed files:

        dinka_seed.json      — English concepts with associated Dinka word entries
                               [{english, entries: [{dinka_word, dialect, region_state}]}]

        dinka_sentences.json — Dinka-English sentence pairs extracted from usage examples
                               [{dinka, english, intent, parent_concept, dialect, region_state}]

Source:
    Brisco, R. & SIL International (2006). Dinka English Glossary.
    Plain-text file: /Users/biormadolkhombior/Downloads/dinka_dict/dinka_glossary.txt

Approach:
    The source file is a two-column Word document exported as plain text. Column
    membership is determined by indentation: a line with 40+ leading spaces belongs
    exclusively to the right column; a gap of 8+ spaces after position 12 splits the
    line between both columns. Both columns are processed independently so that
    continuation lines in one column cannot contaminate sentences in the other.

Usage:
    python3 scripts/parse_dinka_glossary.py
"""

import re
import json

INPUT      = '/Users/biormadolkhombior/Downloads/dinka_dict/dinka_glossary.txt'
OUT_WORDS  = '/Users/biormadolkhombior/Downloads/thok/scripts/dinka_seed.json'
OUT_SENTS  = '/Users/biormadolkhombior/Downloads/thok/scripts/dinka_sentences.json'

# ---------------------------------------------------------------------------
# Dialect code → South Sudan administrative state
#
# Codes follow the SIL convention: SW = South-Western (Rek/Twic), SC = South-Central
# (Agar), SE = South-Eastern (Bor), NW = North-Western (Luo), NE = North-Eastern
# (Padang). Suffixes (r, t, m, j, a, b, d) distinguish sub-dialects.
# ---------------------------------------------------------------------------

DIALECT_STATE = {
    'SWr': 'Warrap State',
    'SWt': 'Warrap State',
    'SWm': 'Northern Bahr el Ghazal',
    'SWj': 'Warrap State',
    'SW':  'Warrap State',
    'SCa': 'Lakes State',
    'SC':  'Lakes State',
    'SA':  'Lakes State',
    'SEb': 'Jonglei State',
    'SE':  'Jonglei State',
    'NWr': 'Unity State',
    'NWn': 'Other / Outside South Sudan',
    'NWE': 'Unity State',
    'NW':  'Unity State',
    'NEd': 'Upper Nile State',
    'NEb': 'Upper Nile State',
    'NE':  'Upper Nile State',
}

DIALECT_CODES = set(DIALECT_STATE.keys())

# Dinka-specific Unicode characters not present in standard English text.
# Used to distinguish Dinka words from English definitions and meta-tokens.
DINKA_RE = re.compile(r'[äëïöɔɛɣŋÄËÏÖɔɛɣŋɛ̈ɔ̈]')

# Grammatical meta-tokens that appear as the first word of cross-reference lines
# rather than as genuine Dinka dictionary headwords.
SKIP_TOKENS = {
    'draft', 'see', 'cf', 'lit', 'var', 'morph', 'prs', 'npr', 'sbj',
    'loc', 'vn', 'va', 'sg', 'pl', 'mat', 'act', 'gen', 'hfi', 'mjb',
    'dlia', 'sil', 'ne', 'nw', 'sw', 'sc', 'se',
}

# Part-of-speech abbreviations used in the glossary.
POS = {'n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'num.',
       'post.', 'pron.', 'interj.', 'part.'}

# Dinka sentence particles that, when they appear as the second token of a line,
# indicate the line is a usage example rather than a standalone word entry.
SENTENCE_PARTICLES = {'acï', 'acaa', 'ee', 'ë', 'bï', 'cà', 'cï', 'ke', 'na', 'ku', 'ɣɛn'}

# Regex to find a Dinka-English sentence pair on a single line.
# Group 1: Dinka portion (must contain at least one Dinka character, ends at punctuation).
# Group 2: English portion (starts with a capital, contains no Dinka characters, ≥6 chars).
SENT_RE = re.compile(
    r'([^\n.]{4,}[äëïöɔɛɣŋ][^\n.]*)'   # Dinka clause
    r'[.!?]'                              # sentence-ending punctuation
    r'\s{1,4}'                            # narrow gap (not a paragraph break)
    r'([A-Z][^\näëïöɔɛɣŋ]{5,}[.!?])',   # English clause
    re.UNICODE
)


# ---------------------------------------------------------------------------
# Helper: Dinka character detection
# ---------------------------------------------------------------------------

def has_dinka(text):
    """
    Return True if text contains at least one Dinka-specific Unicode character.

    Parameters:
        text (str): Any string to inspect.

    Returns:
        bool: True if a Dinka character is found, False otherwise.
    """
    return bool(DINKA_RE.search(text))


# ---------------------------------------------------------------------------
# Helper: sentence intent classifier
# ---------------------------------------------------------------------------

def infer_intent(english):
    """
    Classify the grammatical intent of an English sentence.

    Detects questions by trailing '?', exclamations by trailing '!', and common
    imperative verbs by their infinitive form at the start of the sentence.
    All other sentences are labelled 'statement'.

    Parameters:
        english (str): An English sentence string.

    Returns:
        str: One of 'question', 'exclamation', 'command', or 'statement'.
    """
    if english.rstrip().endswith('?'):
        return 'question'
    if english.rstrip().endswith('!'):
        return 'exclamation'

    # Split on apostrophes and spaces to isolate the first word ("Don't" → "Don").
    first = re.split(r"['\s]", english)[0].lower()
    if first in {'don', "don't", 'come', 'go', 'take', 'give', 'bring', 'sit',
                 'stay', 'do', 'be', 'let', 'help', 'tell', 'look', 'stop',
                 'put', 'repent', 'pay', 'follow', 'listen', 'speak', 'stand',
                 'receive', 'try', 'hold', 'keep', 'wait', 'fear', 'leave',
                 'bring', 'use', 'drink', 'eat', 'walk', 'run', 'pray'}:
        return 'command'

    return 'statement'


# ---------------------------------------------------------------------------
# Helper: English headword detection
# ---------------------------------------------------------------------------

def is_english_headword(text):
    """
    Return True if text looks like a new English concept heading in the glossary.

    A valid headword is a short plain-English phrase (≤5 words) that does not
    contain Dinka characters, does not end with punctuation that would mark it
    as part of a definition, and does not begin with a glossary meta-token.

    Parameters:
        text (str): A stripped line of text from one column.

    Returns:
        bool: True if text qualifies as an English headword, False otherwise.
    """
    s = text.strip()
    if not s or not s[0].isalpha():
        return False
    if has_dinka(s):
        return False
    if 'DRAFT' in s or s.isdigit():
        return False
    # Headwords do not end with a trailing delimiter.
    if s.endswith('.') or s.endswith(',') or s.endswith(';'):
        return False

    words = s.split()
    if len(words) > 5:
        return False
    # Multi-word phrases containing function words are likely definitions, not headwords.
    if re.search(r'\b(the|a|an|of|in|on|at|to|for|and|or)\b', s, re.I) and len(words) > 3:
        return False
    if words[0].lower() in SKIP_TOKENS:
        return False

    return True


# ---------------------------------------------------------------------------
# Column splitting
# ---------------------------------------------------------------------------

def split_columns(line):
    """
    Split a raw line from the two-column Word export into (left_text, right_text).

    Two heuristics identify column membership:
      1. If the line has 40+ leading spaces it belongs entirely to the right column.
      2. If there is a gap of 8+ spaces starting after position 12, the text before
         the gap is the left column and the text after is the right column.
    Lines that do not match either heuristic are treated as left-column only.

    Parameters:
        line (str): A single raw line from the input file, preserving leading spaces.

    Returns:
        tuple[str, str]: (left_text, right_text), both stripped of whitespace.
    """
    leading = len(line) - len(line.lstrip(' '))

    if leading >= 40:
        # Deep indentation means this is right-column content only.
        return '', line.strip()

    m = re.search(r' {8,}', line[12:])
    if m:
        split_pos = 12 + m.end()
        return line[:12 + m.start()].strip(), line[split_pos:].strip()

    return line.strip(), ''


# ---------------------------------------------------------------------------
# Dialect extraction
# ---------------------------------------------------------------------------

def extract_dialects(tokens):
    """
    Return the first dialect code found in a token list and its mapped state.

    Scans tokens (with trailing punctuation stripped) and returns the first
    match against the known dialect code set. Falls back to SWr (Warrap State)
    when no code is found, since most unattributed entries in this glossary are
    from the South-Western Rek dialect.

    Parameters:
        tokens (list[str]): Tokens from a Dinka entry line, starting after the
                            headword itself (i.e. tokens[1:] of the split line).

    Returns:
        tuple[str | None, str]: (dialect_code, region_state).
    """
    for t in tokens:
        code = t.rstrip('.,;:/')
        if code in DIALECT_CODES:
            return code, DIALECT_STATE[code]
    return None, 'Warrap State'


# ---------------------------------------------------------------------------
# Dinka entry parsing
# ---------------------------------------------------------------------------

def parse_dinka_entry(text):
    """
    Extract a Dinka word and its dialect from a definition line.

    Applies several filters to reject non-entry lines:
      - Lines starting with a known meta-token ('see', 'cf', 'sg', etc.) are skipped.
      - Lines whose second token is a sentence particle (suggesting a usage example)
        are skipped.
      - Lines that start with an uppercase ASCII word not followed by a dialect code
        are likely English definitions, not Dinka entries, and are skipped.
    A two-word Dinka word is captured when the second token also contains Dinka
    characters and is not itself a dialect code or POS marker.

    Parameters:
        text (str): A stripped line of text from the Dinka-side column.

    Returns:
        tuple[str, str | None, str] | None:
            (dinka_word, dialect_code, region_state) on success, None if the line
            should be discarded.
    """
    s = text.strip()
    if not s:
        return None

    tokens = s.split()
    first = tokens[0].rstrip('.,;:/')

    if first.lower() in SKIP_TOKENS:
        return None

    dinka_word = first

    # Capture two-word Dinka entries (e.g. "dhil guɔ̈p" for a compound word).
    if len(tokens) > 1:
        second = tokens[1].rstrip('.,;:/')
        if has_dinka(second) and second not in DIALECT_CODES and second not in POS:
            dinka_word = first + ' ' + second

    # A Dinka sentence particle as the second token means this is a usage example.
    if len(tokens) >= 2 and tokens[1].rstrip('.,;') in SENTENCE_PARTICLES:
        return None

    # An uppercase non-Dinka word not followed by a dialect code is English text.
    if first and first[0].isupper() and not has_dinka(first):
        if len(tokens) < 2 or tokens[1].rstrip('.,;:/') not in DIALECT_CODES:
            return None

    dialect, state = extract_dialects(tokens[1:8])
    return dinka_word, dialect, state


# ---------------------------------------------------------------------------
# Word parser (per column)
# ---------------------------------------------------------------------------

def parse_column_lines(lines):
    """
    Build a concept→entries map from one column of the glossary.

    Iterates over pre-split column lines. When an English headword is detected,
    it becomes the current concept. Subsequent non-headword lines are parsed as
    Dinka entries and attached to that concept. Each Dinka entry must contain a
    Dinka character or a recognised dialect code to be accepted (this filters
    out pure-English definitions and meta-annotations).

    Parameters:
        lines (list[str]): Lines from one column (already split by split_columns).

    Returns:
        dict[str, list[dict]]:
            Maps each lower-cased English concept to a list of entry dicts, each
            with keys 'dinka_word', 'dialect', and 'region_state'.
    """
    results = {}
    current = None

    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if 'DRAFT' in line or re.match(r'^\d+$', line):
            continue

        # Two leading spaces (but not more) mark a continuation indent in the
        # original Word document; these are sub-entries, not new headwords.
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


# ---------------------------------------------------------------------------
# Sentence extractor (two-stream approach)
# ---------------------------------------------------------------------------

def extract_sentences_raw(raw_lines):
    """
    Extract Dinka-English sentence pairs from the raw (un-split) glossary lines.

    Processing each column as a separate stream prevents cross-column contamination:
    without this, a sentence that wraps across a line boundary could merge left-column
    Dinka text with right-column English text (or vice-versa) into a garbled pair.

    Left column continuation:  raw line has 2–3 leading spaces.
    Right column continuation: raw line has 40+ leading spaces.

    The function operates in three stages:
      1. Split each raw line into (text, is_continuation) tuples for the left and
         right column streams.
      2. Join continuation tuples within each stream into complete sentences.
      3. Apply the sentence regex to each stream independently, then merge and
         deduplicate by Dinka sentence.

    Parameters:
        raw_lines (list[str]): Unmodified lines from the input file, including
                               all leading whitespace (needed for indentation checks).

    Returns:
        list[dict]: Each dict has keys: 'dinka', 'english', 'intent',
                    'parent_concept', 'dialect', 'region_state'.
    """
    # Stage 1: split each raw line into left and right column streams.
    # Each stream entry is (text: str, is_continuation: bool).
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
            # Deep indent → right column only.
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

    # Stage 2: join continuation lines within each stream into complete sentences.
    def join_stream(stream):
        """
        Concatenate continuation tuples within a single column stream.

        A blank text entry acts as a hard sentence boundary. When is_continuation
        is True and there is an active buffer, the new text is appended with a
        space; otherwise the buffer is flushed and a new one begins.

        Parameters:
            stream (list[tuple[str, bool]]): (text, is_continuation) pairs for
                                             one column.

        Returns:
            list[str]: Complete joined lines, each representing one logical entry
                       or sentence in the column.
        """
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

    # Stage 3: apply sentence regex to joined lines from each column separately.
    META_PREFIXES = ('prs:', 'npr:', 'cf:', 'morph:', 'sbj:', 'loc:',
                     'vn:', 'va:', 'sg:', 'pl:', 'swr:', 'sca:', 'seb:',
                     'nwr:', 'ned:', 'sw:', 'se:', 'sc:', 'ne:', 'nw:')

    def extract_from_lines(lines):
        """
        Scan joined column lines for Dinka-English sentence pairs.

        Tracks the most recently seen English headword and dialect code so that
        each extracted sentence can be attributed to a parent concept and dialect.
        Duplicate Dinka sentences (by exact string) are suppressed.

        Parameters:
            lines (list[str]): Joined lines from one column.

        Returns:
            tuple[list[dict], set[str]]:
                (sentence_list, seen_dinka_sentences) — the seen set is returned
                so the caller can deduplicate across both columns.
        """
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

            # Update dialect context from any code seen in this line.
            for tok in line.split()[:8]:
                code = tok.rstrip('.,;:/')
                if code in DIALECT_CODES:
                    current_dl = code
                    current_st = DIALECT_STATE[code]
                    break

            for m in SENT_RE.finditer(line):
                dinka_part   = m.group(1).strip()
                english_part = m.group(2).strip()

                # Quality filters: both sides must be substantial and unambiguous.
                if not has_dinka(dinka_part):                               continue
                if has_dinka(english_part):                                 continue
                if len(dinka_part) < 5:                                     continue
                if len(english_part) < 6:                                   continue
                if dinka_part.lower().startswith(META_PREFIXES):            continue
                if re.match(r'^[A-Z]{2,3}[a-z]?:', english_part):          continue
                if any(w in english_part.lower() for w in
                       ['see:', 'cf:', 'morph:', 'variant:', 'gospel', 'chapter']):
                    continue

                # Reconstruct the Dinka sentence including its closing punctuation.
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

    # Merge both column results, suppressing duplicates by Dinka sentence.
    all_sents = list(left_sents)
    for s in right_sents:
        if s['dinka'] not in left_seen:
            all_sents.append(s)

    return all_sents


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    """
    Orchestrate parsing of the Brisco/SIL 2006 Dinka glossary.

    Reads the full input file, skips the preamble (first 310 lines), then:
      1. Splits each line into left/right columns.
      2. Parses each column independently for Dinka word entries.
      3. Merges both columns into a single concept map, deduplicating words.
      4. Extracts Dinka-English sentence pairs using the two-stream approach.
      5. Writes dinka_seed.json and dinka_sentences.json.
    """
    with open(INPUT, encoding='utf-8') as f:
        all_lines = f.readlines()

    # The first 310 lines are a title page and editorial notes, not glossary content.
    dict_lines = all_lines[310:]

    left_lines  = []
    right_lines = []
    for line in dict_lines:
        left, right = split_columns(line)
        left_lines.append(left)
        right_lines.append(right)

    # ── Words ─────────────────────────────────────────────────────────────────

    left_data  = parse_column_lines(left_lines)
    right_data = parse_column_lines(right_lines)

    # Merge right-column entries into left-column map, skipping word duplicates.
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
    # Raw lines are required so that indentation is intact for continuation detection.

    all_sents = extract_sentences_raw(dict_lines)

    with open(OUT_SENTS, 'w', encoding='utf-8') as f:
        json.dump(all_sents, f, ensure_ascii=False, indent=2)

    print(f'Sentences → {len(all_sents)} pairs')

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
