#!/usr/bin/env python3
"""
Filename: parse_sil_dictionary.py
Project:  Thok — Indigenous Language Preservation PWA

Description:
    Parses the SIL/Duerksen Dinka-English Dictionary PDF and produces a JSON
    seed file in the same format used by parse_dinka_glossary.py:

        sil_seed.json — [{english, entries: [{dinka_word, dialect, region_state}]}]

    This dictionary is the primary source from which the Brisco/SIL 2006 glossary
    was derived. It is organised in the opposite direction (Dinka → English), so
    parsing logic is inverted: the Dinka headword comes first, then the English
    definition is extracted from the entry body.

Source:
    Duerksen, J. & SIL International. Dinka-English Dictionary.
    Unicode conversion by Roger Blench, 17 December 2005.
    PDF: /Users/biormadolkhombior/Downloads/Comparative Dinka lexicon converted.pdf

Approach:
    pdfplumber's extract_text() collapses both columns onto each line with no
    detectable gap, so column splitting via whitespace is not possible. Instead,
    extract_words() is used to obtain every word's bounding box. Words with
    x0 < COL_SPLIT (300 pt) belong to the left column; words at x0 >= COL_SPLIT
    belong to the right column. Words within ROW_BUCKET (10 pt) vertically are
    treated as being on the same line.

Usage:
    python3 scripts/parse_sil_dictionary.py
"""

import re
import json
from collections import defaultdict
import pdfplumber

PDF_PATH   = '/Users/biormadolkhombior/Downloads/Comparative Dinka lexicon converted.pdf'
OUTPUT     = '/Users/biormadolkhombior/Downloads/thok/scripts/sil_seed.json'

# x-coordinate (in PDF points) dividing the left and right dictionary columns.
# Inspection of word bounding boxes shows left-column content ends at ~270 pt
# and right-column content starts at ~335 pt, so 300 pt sits cleanly in the gap.
COL_SPLIT  = 300

# Words within this many vertical points are considered to be on the same row.
# Line spacing in this PDF is ~17 pt, so 10 pt safely groups same-line words
# (which differ by at most 2 pt) without merging adjacent lines.
ROW_BUCKET = 10

# ---------------------------------------------------------------------------
# Dialect code → South Sudan administrative state (same mapping as glossary parser)
# ---------------------------------------------------------------------------

DIALECT_STATE = {
    'SWr': 'Warrap State',            'SWt': 'Warrap State',
    'SWm': 'Northern Bahr el Ghazal', 'SWj': 'Warrap State',   'SW':  'Warrap State',
    'SCa': 'Lakes State',             'SC':  'Lakes State',     'SA':  'Lakes State',
    'SEb': 'Jonglei State',           'SE':  'Jonglei State',
    'NWr': 'Unity State',             'NWn': 'Other / Outside South Sudan',
    'NWE': 'Unity State',             'NW':  'Unity State',
    'NEd': 'Upper Nile State',        'NEb': 'Upper Nile State', 'NE': 'Upper Nile State',
}
DIALECT_CODES = set(DIALECT_STATE.keys())

# Part-of-speech tags used in this dictionary.
POS_SET = frozenset({
    'n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'num.',
    'post.', 'pron.', 'interj.', 'part.', 'aux.', 'excl.', 'n.pref.', 'n.pr.',
})

# Lowercase tokens that introduce cross-reference lines, not new headwords.
META_TOKENS = frozenset({
    'see', 'cf', 'lit', 'morph', 'prs', 'npr', 'sbj', 'loc',
    'vn', 'va', 'sg', 'pl', 'gram', 'syn', 'variant', 'draft',
})

# Structural keywords that may appear as the second token of a valid entry line
# (e.g. "abur See: bïl." or "abɛr Pl: abar.").
STRUCTURAL = frozenset({
    'See', 'Pl', 'Sg', 'Morph', 'Variant',
    'See:', 'Pl:', 'Sg:', 'Morph:', 'Variant:',
})

# Characters unique to Dinka orthography; their presence identifies Dinka text.
DINKA_RE = re.compile(r'[äëïöɔɛɣŋÄËÏÖ]', re.UNICODE)

# Pre-built alternation string of all dialect codes, longest first so that longer
# codes (e.g. 'NWr', 'SWm') are preferred over shorter prefixes ('NW', 'SW').
_DIAL_ALT = '|'.join(re.escape(d) for d in sorted(DIALECT_CODES, key=len, reverse=True))


def has_dinka(text: str) -> bool:
    """
    Return True if text contains at least one Dinka-specific Unicode character.

    Parameters:
        text (str): Any string to inspect.

    Returns:
        bool: True if a Dinka character is present, False otherwise.
    """
    return bool(DINKA_RE.search(text))


# ---------------------------------------------------------------------------
# PDF column extraction
# ---------------------------------------------------------------------------

def extract_page_columns(page):
    """
    Split one PDF page into left and right column line lists using word bboxes.

    Each word's horizontal position (x0) determines its column. Words are then
    grouped by vertical position into rows using ROW_BUCKET-sized buckets, sorted
    left-to-right within each row, and joined into text strings.

    Parameters:
        page (pdfplumber.Page): A single page object from the open PDF.

    Returns:
        tuple[list[str], list[str]]:
            (left_lines, right_lines) — one string per visual row in each column.
            Both lists are parallel: left_lines[i] and right_lines[i] share the
            same vertical position on the page.
    """
    words = page.extract_words(keep_blank_chars=False, x_tolerance=3, y_tolerance=3)
    if not words:
        return [], []

    # Group words by row using 10-pt vertical buckets.
    rows = defaultdict(lambda: {'L': [], 'R': []})
    for w in words:
        bucket = round(w['top'] / ROW_BUCKET) * ROW_BUCKET
        rows[bucket]['L' if w['x0'] < COL_SPLIT else 'R'].append(w)

    left_lines, right_lines = [], []
    for bucket in sorted(rows.keys()):
        row = rows[bucket]
        # Sort each column's words by x-position to reconstruct reading order.
        L = sorted(row['L'], key=lambda w: w['x0'])
        R = sorted(row['R'], key=lambda w: w['x0'])
        left_lines.append(' '.join(w['text'] for w in L))
        right_lines.append(' '.join(w['text'] for w in R))

    return left_lines, right_lines


# ---------------------------------------------------------------------------
# Entry headword detection
# ---------------------------------------------------------------------------

def is_entry_start(text: str):
    """
    Determine whether a line of column text begins a new dictionary entry.

    An entry line starts with a Dinka headword followed by a valid second token.
    Valid second tokens are: a dialect code, a part-of-speech marker, or a
    structural keyword (Pl, Sg, See, Morph, Variant). Some entries list two
    dialect codes before the POS; a three-token look-ahead handles those.

    Two special cases are rejected even though they might otherwise look valid:
      - Lines starting with a known meta-token (cf, see, sg, pl, …) are
        cross-reference or morphological annotations, not headwords.
      - Lines starting with a dialect code are inline variant cross-references
        (e.g. "NWr: akaciga."), not headwords.

    Parameters:
        text (str): A single line from a column stream.

    Returns:
        tuple[str, str | None]:
            (dinka_word, primary_dialect) if the line opens a new entry.
            (None, None) if the line is a continuation or meta-annotation.
    """
    s = text.strip()
    if not s:
        return None, None
    tokens = s.split()
    if len(tokens) < 2:
        return None, None

    first  = tokens[0].rstrip('.,;:/')
    second = tokens[1].rstrip('.,;:/')

    if first.lower() in META_TOKENS:
        return None, None
    # A dialect code as the first token signals a cross-reference, not a headword.
    if first in DIALECT_CODES:
        return None, None
    if re.match(r'^\d', first):
        return None, None

    is_valid = (
        second in DIALECT_CODES or
        second in POS_SET or
        (second + '.') in POS_SET or   # handles "n" stripped to "n" from "n."
        second in STRUCTURAL
    )

    # Handle entries with multiple dialect codes before the POS: "bur SWr SC n. …"
    if not is_valid and len(tokens) >= 3:
        third = tokens[2].rstrip('.,;:/')
        if second in DIALECT_CODES and (
            third in DIALECT_CODES or third in POS_SET or (third + '.') in POS_SET
        ):
            is_valid = True

    if not is_valid:
        return None, None

    # Take the first dialect code found within the opening tokens as the primary.
    dialect = None
    for tok in tokens[1:6]:
        code = tok.rstrip('.,;:/')
        if code in DIALECT_CODES:
            dialect = code
            break

    return first, dialect


# ---------------------------------------------------------------------------
# English gloss extraction
# ---------------------------------------------------------------------------

# Compiled patterns applied in sequence to clean the raw post-POS text.
_POS_RE = re.compile(
    r'\b(n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|aux\.|excl\.|interj\.|'
    r'part\.|num\.|n\.pref\.|n\.pr\.)\s',
    re.IGNORECASE
)
_META_CUT_RE = re.compile(
    r'\b(cf|see|read|morph|prs|npr|sbj|loc|vn|va|sg|pl|syn|variant|gram|dictionary)\s*[:\d]',
    re.IGNORECASE
)
_SEMICOLON_RE    = re.compile(r'\s*;\s*')
_GRAM_BLOCK_RE   = re.compile(r'\[Gram:[^\]]*\]', re.DOTALL)
_NUMBERED_RE     = re.compile(r'^1\)\s*(.+?)(?=\s+2\))', re.DOTALL)
_DIAL_CUT_RE     = re.compile(
    r'(?:^|[\s.,;])(?:' + _DIAL_ALT + r')(?:\s+(?:' + _DIAL_ALT + r'))*\s*:'
)
# Residual embedded-entry guard: "SWr n." or "SCa v." appearing mid-gloss means
# right-column content leaked in despite bbox splitting.
_EMBEDDED_ENTRY_RE = re.compile(
    r'\b(?:' + _DIAL_ALT + r')\s+(?:n|v|adj|adv|pron|aux|excl|interj|part|num)\.'
)


def extract_english_gloss(entry_text: str):
    """
    Extract the primary English definition from an entry's full text string.

    Applies a pipeline of sequential cuts to isolate just the core English gloss:
      1. Locate the part-of-speech marker; everything before it is discarded.
      2. Remove [Gram: …] grammatical annotation blocks.
      3. For numbered senses ("1) eunuch. 2) coward."), keep only the first.
      4. Cut at the first cross-reference meta-token (cf:, see:, morph:, …).
      5. Cut at the first inline dialect variant cross-reference ("NWr: word").
      6. Cut at any residual embedded entry fragment ("SWr n." mid-text).
      7. Discard segments containing Dinka characters (embedded example sentences).
      8. Keep only the text before the first semicolon (primary meaning only).
      9. Truncate to 120 characters at a word boundary.

    Parameters:
        entry_text (str): The full text of a dictionary entry after the headword,
                          e.g. "SWr n. pumpkin, squash. Variant: abudo. NW SWj: abuth."

    Returns:
        str | None: The extracted English gloss, or None if no valid gloss
                    could be found (e.g. entry has only cross-references or
                    Dinka-only content).
    """
    s = entry_text.strip()

    m = _POS_RE.search(s)
    if not m:
        return None
    after = s[m.end():].strip()
    if not after:
        return None

    after = _GRAM_BLOCK_RE.sub('', after).strip()

    nm = _NUMBERED_RE.match(after)
    if nm:
        # Numbered entry: take the first sense and discard the rest.
        after = nm.group(1).strip().rstrip('.,;')
    else:
        cut = _META_CUT_RE.search(after)
        if cut:
            after = after[:cut.start()].strip()

        dcut = _DIAL_CUT_RE.search(after)
        if dcut:
            after = after[:dcut.start()].strip()

    ecut = _EMBEDDED_ENTRY_RE.search(after)
    if ecut:
        after = after[:ecut.start()].strip()

    # Split on ". " and discard everything from the first Dinka-containing segment
    # onward — those segments are embedded Dinka example sentences, not English.
    parts = after.split('. ')
    clean = []
    for p in parts:
        if has_dinka(p):
            break
        clean.append(p)
    if clean:
        after = '. '.join(clean).strip()

    if has_dinka(after):
        return None

    # A semicolon separates primary from secondary meanings; keep only the first.
    semi = _SEMICOLON_RE.search(after)
    if semi:
        after = after[:semi.start()]

    after = after.rstrip('.,;: ')
    after = re.sub(r'\s+', ' ', after).strip()

    if len(after) > 120:
        # Truncate at a word boundary to avoid cutting mid-word.
        after = after[:120].rsplit(' ', 1)[0].rstrip('.,;: ')

    return after if len(after) >= 2 else None


# ---------------------------------------------------------------------------
# Dialect variant extraction
# ---------------------------------------------------------------------------

_VARIANT_RE = re.compile(
    r'(?<![A-Za-z:])(' + _DIAL_ALT + r')'   # first dialect code (not preceded by letter/colon)
    r'(?:\s+(?:' + _DIAL_ALT + r'))*'        # optional additional dialect codes
    r'\s*:\s*(\S+)',                           # colon then the variant Dinka word
    re.UNICODE
)


def extract_dialect_variants(entry_text: str):
    """
    Scan an entry's text for inline dialect cross-references and return each as
    a (dinka_word, dialect, region_state) tuple.

    Cross-references take the form "DIALECT_CODE: word" or "DIAL1 DIAL2: word",
    indicating that a different Dinka form is used in those dialects for the same
    concept. When multiple dialect codes precede the colon, a separate tuple is
    produced for each.

    The prefix preceding the colon is inspected to collect all dialect codes,
    because re groups only capture the last repetition of a repeated pattern.

    Example: "NW SWj: abuth." → [('abuth', 'NW', 'Unity State'),
                                   ('abuth', 'SWj', 'Warrap State')]

    Parameters:
        entry_text (str): The full text of a dictionary entry after the headword.

    Returns:
        list[tuple[str, str, str]]:
            Each tuple is (dinka_word, dialect_code, region_state).
            Words with fewer than 2 characters are discarded.
    """
    results = []
    seen = set()

    for m in _VARIANT_RE.finditer(entry_text):
        # Take the first spelling if a tilde lists alternates (e.g. "akaciga~kacigo").
        word = m.group(2).split('~')[0].rstrip('.,;:()')
        if not word or len(word) < 2:
            continue

        # Extract all dialect codes between the match start and the colon.
        prefix = entry_text[m.start():m.end()]
        colon_pos = prefix.index(':')
        for dial in re.findall(_DIAL_ALT, prefix[:colon_pos]):
            if dial in DIALECT_CODES and (word, dial) not in seen:
                seen.add((word, dial))
                results.append((word, dial, DIALECT_STATE[dial]))

    return results


# ---------------------------------------------------------------------------
# Column stream processor
# ---------------------------------------------------------------------------

# Lines matching this pattern are page artefacts (page numbers, date headers,
# running title "Dinka — English Dictionary") and should be ignored.
_SKIP_RE = re.compile(r'^\d+$|^\d+/\d+/\d+|^Dinka\s+[—\-]', re.UNICODE)


def process_column(lines):
    """
    Process one column's line list as a stream and return parsed dictionary entries.

    Iterates through lines in order. When is_entry_start identifies a new headword,
    any previously accumulated entry is flushed and a new one begins. Lines that
    are not entry starts are appended to the current entry's text buffer as
    continuation content (morphological notes, example sentences, cross-refs).

    The inner flush() function finalises an entry: it joins the buffer, extracts
    the English gloss and dialect variants, and appends the result if a valid
    gloss was found.

    Parameters:
        lines (list[str]): Text lines from one column across all pages,
                           concatenated in page order.

    Returns:
        list[tuple[str, str | None, str, list]]:
            Each tuple is (dinka_word, primary_dialect, english_gloss, variants),
            where variants is a list of (word, dialect, state) tuples from inline
            cross-references within this entry.
    """
    results = []
    cur_word = cur_dial = None
    cur_parts = []

    def flush():
        """
        Finalise the current entry and append it to results if it has a valid gloss.

        Joins all accumulated text parts, extracts the English gloss and any dialect
        variant cross-references, then resets the current-entry state.
        """
        nonlocal cur_word, cur_dial, cur_parts
        if cur_word and cur_parts:
            entry_text = ' '.join(cur_parts)
            gloss    = extract_english_gloss(entry_text)
            variants = extract_dialect_variants(entry_text)
            if gloss:
                results.append((cur_word, cur_dial, gloss, variants))
        cur_word = cur_dial = None
        cur_parts = []

    for line in lines:
        s = line.strip() if isinstance(line, str) else line
        if not s:
            flush()
            continue
        if 'DRAFT' in s or _SKIP_RE.match(s):
            continue

        word, dial = is_entry_start(s)
        if word:
            flush()
            cur_word, cur_dial = word, dial
            # Store everything after the headword as the first part of the entry body.
            rest = s[len(word):].strip()
            cur_parts = [rest] if rest else []
        elif cur_word is not None:
            cur_parts.append(s)

    flush()
    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    """
    Orchestrate parsing of the SIL/Duerksen Dinka-English Dictionary PDF.

    Steps:
      1. Extract left and right column lines from every page using word bboxes.
      2. Process each column stream independently to detect headwords and accumulate
         entry text.
      3. Group all entries by their extracted English gloss (lower-cased key).
      4. Add inline dialect variant forms as additional entries for the same concept.
      5. Sort concepts alphabetically by English gloss and write sil_seed.json.
      6. Print a summary and sample output for verification.
    """
    print('Extracting PDF columns via word bboxes…')
    all_left, all_right = [], []

    with pdfplumber.open(PDF_PATH) as pdf:
        print(f'  {len(pdf.pages)} pages')
        for i, page in enumerate(pdf.pages):
            L, R = extract_page_columns(page)
            all_left.extend(L)
            all_right.extend(R)
            if (i + 1) % 50 == 0:
                print(f'  page {i + 1}…')

    print(f'  {len(all_left)} rows per column')

    print('Parsing left column…')
    left_entries = process_column(all_left)
    print(f'  {len(left_entries)} entries')

    print('Parsing right column…')
    right_entries = process_column(all_right)
    print(f'  {len(right_entries)} entries')

    print('Grouping by English concept…')
    concept_map = {}

    def add(english, dinka_word, dialect, state):
        """
        Add one Dinka word entry under an English concept, deduplicating by
        (dinka_word, dialect) pair.

        Parameters:
            english    (str): The English gloss string (used as concept identity).
            dinka_word (str): The Dinka word form.
            dialect    (str | None): Dialect code, or None if unattributed.
            state      (str): South Sudan state for the dialect.
        """
        key = english.lower().strip()
        if key not in concept_map:
            concept_map[key] = {'english': english, 'entries': [], 'seen': set()}
        wkey = (dinka_word, dialect)
        if wkey not in concept_map[key]['seen']:
            concept_map[key]['seen'].add(wkey)
            concept_map[key]['entries'].append({
                'dinka_word':   dinka_word,
                'dialect':      dialect,
                'region_state': state or 'Warrap State',
            })

    for word, dial, gloss, variants in left_entries + right_entries:
        state = DIALECT_STATE.get(dial, 'Warrap State') if dial else 'Warrap State'
        add(gloss, word, dial, state)
        for v_word, v_dial, v_state in variants:
            # Skip variants that are the same word as the headword (alternate spellings).
            if v_word.lower() != word.lower():
                add(gloss, v_word, v_dial, v_state)

    output = [
        {'english': v['english'], 'entries': v['entries']}
        for v in sorted(concept_map.values(), key=lambda x: x['english'].lower())
        if v['entries']
    ]

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    total_entries = sum(len(c['entries']) for c in output)
    print(f'\n── Complete ──────────────────────────────────────')
    print(f'  Concepts : {len(output)}')
    print(f'  Entries  : {total_entries}')

    print('\nSample (first 20):')
    for c in output[:20]:
        words = [f'{e["dinka_word"]}({e["dialect"]})' for e in c['entries'][:3]]
        print(f'  "{c["english"]}" → {words}')

    by_count = sorted(output, key=lambda x: len(x['entries']), reverse=True)
    print('\nTop 10 by dialect coverage:')
    for c in by_count[:10]:
        print(f'  "{c["english"]}" — {len(c["entries"])} entries')


if __name__ == '__main__':
    main()
