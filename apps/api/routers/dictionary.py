from fastapi import APIRouter, Header, HTTPException, Query
from typing import Optional

from lib.db import get_client
from lib.constants import SEED_BOT_IDS

router = APIRouter()

ENTRY_SELECT = (
    "id, native_word, concept_id, is_verified, contributor_id, "
    "audio_path_wav, audio_path_opus, audio_duration_sec, region_state, "
    "concepts!inner(english_gloss, concept_type)"
)

# Seed entries come from published dictionaries (SIL, Brisco) rather than
# community review, so they're dictionary-visible without being "verified".
_SEED_IDS_CSV = ",".join(SEED_BOT_IDS)


def _visibility_filter(contributor_id: str) -> str:
    return f"is_verified.eq.true,contributor_id.eq.{contributor_id},contributor_id.in.({_SEED_IDS_CSV})"


@router.get("/get-dictionary")
def get_dictionary(
    x_contributor_id: str = Header(...),
    concept_id: Optional[str] = Query(None),
    search:     Optional[str] = Query(None),
    limit:  int = Query(30, ge=1, le=100),
    offset: int = Query(0,  ge=0),
):
    sb   = get_client()
    term = search.strip() if search else None

    # ── Mode 1: concept detail — all entries for one word ────────────────────
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
               .select("id, native_word, contributor_id, region_state, is_verified, "
                       "confidence_score, audio_path_wav, audio_path_opus, audio_duration_sec")
               .eq("concept_id", concept_id)
               .eq("is_visible", True)
               .order("confidence_score", desc=True)
               .execute())

        entries = []
        for e in (r.data or []):
            audio_url = _signed_url(sb, e)
            entries.append({
                "entry_id":     e["id"],
                "concept_id":   concept_id,
                "native_word":  e["native_word"],
                "region_state": e.get("region_state") or "",
                "is_verified":  e.get("is_verified", False),
                "is_own":       e["contributor_id"] == x_contributor_id,
                "is_seed":      e["contributor_id"] in SEED_BOT_IDS,
                "duration_sec": e.get("audio_duration_sec"),
                "audio_url":    audio_url,
            })

        return {
            "concept_id":    concept["id"],
            "english_gloss": concept["english_gloss"],
            "concept_type":  concept["concept_type"] or "word",
            "context_text":  concept.get("prompt_context"),
            "entries":       entries,
            "entry_count":   len(entries),
        }

    # ── Mode 2: search ────────────────────────────────────────────────────────
    if term:
        # Dinka word search
        r_dinka = (sb.table("lexicon_entries")
                     .select(ENTRY_SELECT, count="exact")
                     .ilike("native_word", f"%{term}%")
                     .eq("is_visible", True)
                     .or_(_visibility_filter(x_contributor_id))
                     .order("confidence_score", desc=True)
                     .range(offset, offset + limit - 1)
                     .execute())

        # English gloss search — find matching concept IDs first
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
                       .order("confidence_score", desc=True)
                       .limit(limit)
                       .execute())
            english_entries = [e for e in (r_eng.data or []) if e["id"] not in dinka_ids]

        merged = list(r_dinka.data or []) + english_entries
        merged = merged[:limit]

        result = [_map_entry(e, x_contributor_id, sb) for e in merged]
        return {"entries": result, "total": len(result)}

    # ── Mode 3: browse — verified + contributor's own ─────────────────────────
    r = (sb.table("lexicon_entries")
           .select(ENTRY_SELECT, count="exact")
           .or_(_visibility_filter(x_contributor_id))
           .eq("is_visible", True)
           .order("confidence_score", desc=True)
           .range(offset, offset + limit - 1)
           .execute())

    result = [_map_entry(e, x_contributor_id, sb) for e in (r.data or [])]
    total  = r.count if r.count is not None else len(result)
    return {"entries": result, "total": total}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _signed_url(sb, e: dict) -> Optional[str]:
    path = e.get("audio_path_wav") or e.get("audio_path_opus")
    if not path:
        return None
    signed = sb.storage.from_("lexicon").create_signed_url(path, 600)
    return signed.get("signedURL")


def _map_entry(e: dict, contributor_id: str, sb) -> dict:
    concept = e.get("concepts") or {}
    return {
        "entry_id":      e["id"],
        "concept_id":    e.get("concept_id", ""),
        "native_word":   e["native_word"],
        "english_gloss": concept.get("english_gloss", ""),
        "concept_type":  concept.get("concept_type", "word"),
        "is_verified":   e.get("is_verified", False),
        "is_own":        e["contributor_id"] == contributor_id,
        "is_seed":       e["contributor_id"] in SEED_BOT_IDS,
        "region_state":  e.get("region_state") or "",
        "duration_sec":  e.get("audio_duration_sec"),
        "audio_url":     _signed_url(sb, e),
    }
