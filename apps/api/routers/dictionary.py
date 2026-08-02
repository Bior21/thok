from fastapi import APIRouter, Header, HTTPException, Query
from typing import Callable, Optional

from lib.db import get_client
from lib.constants import SEED_BOT_IDS

router = APIRouter()

ENTRY_SELECT = (
    "id, native_word, concept_id, is_verified, contributor_id, dialect_id, "
    "audio_path_wav, audio_path_opus, audio_duration_sec, region_state, "
    "dialects(code, name), concepts!inner(english_gloss, concept_type)"
)

# Seed entries come from published dictionaries (SIL, Brisco) rather than
# community review, so they're dictionary-visible without being "verified".
_SEED_IDS_CSV = ",".join(SEED_BOT_IDS)

_PAGE = 1000  # PostgREST's per-request row cap on this project


def _visibility_filter(contributor_id: str) -> str:
    return f"is_verified.eq.true,contributor_id.eq.{contributor_id},contributor_id.in.({_SEED_IDS_CSV})"


def _fetch_all(build_page: Callable[[int, int], object], cap: int = 20000) -> list:
    """Runs build_page(start, end) repeatedly to page past PostgREST's per-request
    row cap, until a short page comes back or cap is hit."""
    rows: list = []
    start = 0
    while start < cap:
        r = build_page(start, start + _PAGE - 1)
        page = r.data or []
        rows.extend(page)
        if len(page) < _PAGE:
            break
        start += _PAGE
    return rows


@router.get("/get-dictionary/index")
def get_dictionary_index(x_contributor_id: str = Header(...)):
    sb = get_client()

    def build(start, end):
        return (sb.table("lexicon_entries")
                  .select("native_word, concepts!inner(concept_type)")
                  .eq("is_visible", True)
                  .or_(_visibility_filter(x_contributor_id))
                  .range(start, end)
                  .execute())

    words_by_letter: dict[str, set] = {}
    for e in _fetch_all(build):
        word = e.get("native_word") or ""
        if not word or not word[0].isalpha():
            continue
        if (e.get("concepts") or {}).get("concept_type") == "sentence":
            continue
        words_by_letter.setdefault(word[0], set()).add(word)

    index = [{"letter": letter, "count": len(words)} for letter, words in words_by_letter.items()]
    index.sort(key=lambda x: x["letter"])
    return index


@router.get("/get-dictionary")
def get_dictionary(
    x_contributor_id: str = Header(...),
    concept_id: Optional[str] = Query(None),
    headword:   Optional[str] = Query(None),
    search:     Optional[str] = Query(None),
    letter:     Optional[str] = Query(None),
    own_only:   bool = Query(False),
    limit:  int = Query(30, ge=1, le=100),
    offset: int = Query(0,  ge=0),
):
    sb   = get_client()
    term = search.strip() if search else None

    # ── Mode 0: caller's own words — flat list for the home-screen widget ────
    if own_only:
        r = (sb.table("lexicon_entries")
               .select("id, native_word, is_verified, audio_path_wav, audio_path_opus, "
                       "concepts!inner(english_gloss)")
               .eq("contributor_id", x_contributor_id)
               .eq("is_visible", True)
               .order("created_at", desc=True)
               .limit(limit)
               .execute())
        entries = [{
            "entry_id":      e["id"],
            "native_word":   e["native_word"],
            "english_gloss": (e.get("concepts") or {}).get("english_gloss", ""),
            "is_verified":   e.get("is_verified", False),
            "audio_url":     _signed_url(sb, e),
        } for e in (r.data or [])]
        return {"entries": entries}

    # ── Mode 1: sense detail — all entries for one concept ───────────────────
    if concept_id:
        r = (sb.table("concepts")
               .select("id, english_gloss, concept_type, prompt_context")
               .eq("id", concept_id)
               .maybe_single()
               .execute())
        concept = r.data if r else None
        if not concept:
            raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Concept not found."})

        r = (sb.table("lexicon_entries")
               .select("id, native_word, contributor_id, region_state, is_verified, dialect_id, "
                       "confidence_score, audio_path_wav, audio_path_opus, audio_duration_sec, "
                       "dialects(code, name)")
               .eq("concept_id", concept_id)
               .eq("is_visible", True)
               .order("confidence_score", desc=True)
               .execute())

        entries = [_map_entry(e, x_contributor_id, sb) for e in (r.data or [])]

        return {
            "concept_id":    concept["id"],
            "english_gloss": concept["english_gloss"],
            "concept_type":  concept["concept_type"] or "word",
            "context_text":  concept.get("prompt_context"),
            "entries":       entries,
            "entry_count":   len(entries),
        }

    # ── Mode 2: headword detail — every sense of one Dinka word ──────────────
    if headword:
        r = (sb.table("lexicon_entries")
               .select(ENTRY_SELECT)
               .eq("native_word", headword)
               .eq("is_visible", True)
               .or_(_visibility_filter(x_contributor_id))
               .order("confidence_score", desc=True)
               .execute())
        rows = r.data or []
        if not rows:
            raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Word not found."})

        senses: dict[str, dict] = {}
        order: list[str] = []
        for e in rows:
            cid = e.get("concept_id") or ""
            if cid not in senses:
                concept = e.get("concepts") or {}
                senses[cid] = {
                    "concept_id":    cid,
                    "english_gloss": concept.get("english_gloss", ""),
                    "concept_type":  concept.get("concept_type") or "word",
                    "entries":       [],
                }
                order.append(cid)
            senses[cid]["entries"].append(_map_entry(e, x_contributor_id, sb))

        sense_list = [senses[cid] for cid in order]
        return {
            "native_word": headword,
            "sense_count": len(sense_list),
            "senses":      sense_list,
        }

    # ── Mode 3: search — grouped by headword ──────────────────────────────────
    if term:
        raw_cap = max(200, limit * 6)

        r_dinka = (sb.table("lexicon_entries")
                     .select(ENTRY_SELECT)
                     .ilike("native_word", f"%{term}%")
                     .eq("is_visible", True)
                     .or_(_visibility_filter(x_contributor_id))
                     .order("native_word")
                     .limit(raw_cap)
                     .execute())

        r_concepts = (sb.table("concepts")
                        .select("id")
                        .ilike("english_gloss", f"%{term}%")
                        .limit(200)
                        .execute())
        concept_ids = [c["id"] for c in (r_concepts.data or [])]

        dinka_ids = {e["id"] for e in (r_dinka.data or [])}
        english_entries = []
        if concept_ids:
            r_eng = (sb.table("lexicon_entries")
                       .select(ENTRY_SELECT)
                       .in_("concept_id", concept_ids)
                       .eq("is_visible", True)
                       .or_(_visibility_filter(x_contributor_id))
                       .order("native_word")
                       .limit(raw_cap)
                       .execute())
            english_entries = [e for e in (r_eng.data or []) if e["id"] not in dinka_ids]

        merged = sorted(list(r_dinka.data or []) + english_entries, key=lambda e: e["native_word"])
        headwords = _group_by_headword(merged, x_contributor_id)
        page = headwords[offset:offset + limit]
        return {"headwords": page, "total": len(headwords)}

    # ── Mode 4: browse — grouped by headword, optionally scoped to a letter ───
    prefix = letter.strip() if letter else None

    def build(start, end):
        q = (sb.table("lexicon_entries")
               .select(ENTRY_SELECT)
               .eq("is_visible", True)
               .or_(_visibility_filter(x_contributor_id))
               .order("native_word"))
        if prefix:
            q = q.ilike("native_word", f"{prefix}%")
        return q.range(start, end).execute()

    rows = _fetch_all(build, cap=20000 if prefix else 3000)
    headwords = _group_by_headword(rows, x_contributor_id)
    page = headwords[offset:offset + limit]
    return {"headwords": page, "total": len(headwords)}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _signed_url(sb, e: dict) -> Optional[str]:
    path = e.get("audio_path_wav") or e.get("audio_path_opus")
    if not path:
        return None
    signed = sb.storage.from_("lexicon").create_signed_url(path, 600)
    return signed.get("signedURL")


def _map_entry(e: dict, contributor_id: str, sb) -> dict:
    dialect = e.get("dialects") or {}
    return {
        "entry_id":      e["id"],
        "native_word":   e["native_word"],
        "is_verified":   e.get("is_verified", False),
        "is_own":        e["contributor_id"] == contributor_id,
        "is_seed":       e["contributor_id"] in SEED_BOT_IDS,
        "region_state":  e.get("region_state") or "",
        "dialect":       dialect.get("name"),
        "duration_sec":  e.get("audio_duration_sec"),
        "audio_url":     _signed_url(sb, e),
    }


def _group_by_headword(rows: list[dict], contributor_id: str) -> list[dict]:
    """Groups flat lexicon_entries rows (ENTRY_SELECT shape) into one summary
    per distinct native_word, preserving the input's ordering."""
    groups: dict[str, dict] = {}
    order: list[str] = []
    for e in rows:
        word = e["native_word"]
        # A handful of seed entries carry PDF-parsing leftovers (a stray
        # leading "(", "-", footnote marker, etc.) instead of a real word —
        # skip them rather than surface junk headword sections. Sentences
        # (concept_type='sentence') are a separate prompt type in this app;
        # a dictionary headword list should only contain words.
        if not word or not word[0].isalpha():
            continue
        if (e.get("concepts") or {}).get("concept_type") == "sentence":
            continue
        if word not in groups:
            groups[word] = {"glosses": [], "concept_ids": set(),
                             "is_verified": False, "is_seed": False, "is_own": False}
            order.append(word)
        g = groups[word]

        cid = e.get("concept_id")
        if cid not in g["concept_ids"]:
            g["concept_ids"].add(cid)
            gloss = (e.get("concepts") or {}).get("english_gloss", "")
            if gloss and gloss not in g["glosses"]:
                g["glosses"].append(gloss)

        g["is_verified"] = g["is_verified"] or e.get("is_verified", False)
        g["is_seed"]     = g["is_seed"]     or (e["contributor_id"] in SEED_BOT_IDS)
        g["is_own"]      = g["is_own"]      or (e["contributor_id"] == contributor_id)

    result = []
    for word in order:
        g = groups[word]
        result.append({
            "native_word":    word,
            "sense_count":    len(g["concept_ids"]),
            "is_verified":    g["is_verified"],
            "is_seed":        g["is_seed"],
            "is_own":         g["is_own"],
            "gloss_preview":  ", ".join(g["glosses"][:2]),
        })
    return result
