from fastapi import APIRouter, Header, HTTPException, Query
from typing import Optional

from lib.db import get_client

router = APIRouter()


@router.get("/dictionary")
def get_dictionary(
    x_contributor_id: str = Header(...),
    search: Optional[str] = Query(None, description="Search Dinka or English words"),
    limit:  int = Query(30, ge=1, le=100),
    offset: int = Query(0,  ge=0),
):
    sb = get_client()
    term = search.strip() if search else None

    if term:
        # Search both the Dinka word and the English gloss.
        # ilike = case-insensitive LIKE. We search concepts for English and
        # lexicon_entries for Dinka, then combine.
        r = (sb.table("lexicon_entries")
               .select("id, native_word, concept_id, is_verified, contributor_id, audio_path_wav, audio_path_opus, concepts!inner(english_gloss, concept_type)")
               .or_(f"native_word.ilike.%{term}%,concepts.english_gloss.ilike.%{term}%")
               .eq("is_visible", True)
               .order("confidence_score", desc=True)
               .range(offset, offset + limit - 1)
               .execute())
    else:
        # Browse mode: verified entries first, then recent entries from this contributor.
        r = (sb.table("lexicon_entries")
               .select("id, native_word, concept_id, is_verified, contributor_id, audio_path_wav, audio_path_opus, concepts!inner(english_gloss, concept_type)", count="exact")
               .or_(f"is_verified.eq.true,contributor_id.eq.{x_contributor_id}")
               .eq("is_visible", True)
               .order("confidence_score", desc=True)
               .range(offset, offset + limit - 1)
               .execute())

    entries = r.data or []
    total   = r.count if hasattr(r, "count") else len(entries)

    result = []
    for e in entries:
        audio_path = e.get("audio_path_wav") or e.get("audio_path_opus")
        audio_url  = None
        if audio_path:
            signed = sb.storage.from_("lexicon").create_signed_url(audio_path, 600)
            audio_url = signed.get("signedURL")

        concept = e.get("concepts") or {}
        result.append({
            "entry_id":      e["id"],
            "native_word":   e["native_word"],
            "english_gloss": concept.get("english_gloss", ""),
            "concept_type":  concept.get("concept_type", "word"),
            "is_verified":   e.get("is_verified", False),
            "is_own":        e["contributor_id"] == x_contributor_id,
            "audio_url":     audio_url,
        })

    return {"entries": result, "total": total}


@router.get("/dictionary/concept/{concept_id}")
def get_concept(concept_id: str, x_contributor_id: str = Header(...)):
    """
    Returns a single concept with all its lexicon entries and audio URLs.
    Used by the dictionary detail screen.
    """
    sb = get_client()

    r = (sb.table("concepts")
           .select("id, english_gloss, concept_type, prompt_context, image_path")
           .eq("id", concept_id)
           .single()
           .execute())
    concept = r.data
    if not concept:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Concept not found."})

    image_url = None
    if concept["image_path"]:
        signed    = sb.storage.from_("concepts").create_signed_url(concept["image_path"], 600)
        image_url = signed.get("signedURL")

    r = (sb.table("lexicon_entries")
           .select("id, native_word, contributor_id, region_state, is_verified, confidence_score, audio_path_wav, audio_path_opus, audio_duration_sec")
           .eq("concept_id", concept_id)
           .eq("is_visible", True)
           .order("confidence_score", desc=True)
           .execute())

    entries = []
    for e in (r.data or []):
        audio_path = e.get("audio_path_wav") or e.get("audio_path_opus")
        audio_url  = None
        if audio_path:
            signed    = sb.storage.from_("lexicon").create_signed_url(audio_path, 600)
            audio_url = signed.get("signedURL")

        entries.append({
            "entry_id":      e["id"],
            "native_word":   e["native_word"],
            "region_state":  e.get("region_state", ""),
            "is_verified":   e.get("is_verified", False),
            "is_own":        e["contributor_id"] == x_contributor_id,
            "confidence":    e.get("confidence_score", 0),
            "audio_url":     audio_url,
            "duration_sec":  e.get("audio_duration_sec"),
        })

    return {
        "concept_id":    concept["id"],
        "english_gloss": concept["english_gloss"],
        "concept_type":  concept["concept_type"],
        "context_text":  concept.get("prompt_context"),
        "image_url":     image_url,
        "entries":       entries,
        "entry_count":   len(entries),
    }
