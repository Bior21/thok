from datetime import datetime, timezone
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Optional

from lib.db import get_client

router = APIRouter()


class SpeakerMetadata(BaseModel):
    age_range: Optional[str] = None
    gender:    Optional[str] = None
    l1_status: Optional[str] = "L1"


class SubmitEntryBody(BaseModel):
    client_entry_id: str
    concept_id:      str
    native_word:     str
    prompt_id:       Optional[str] = None
    speaker_metadata: Optional[SpeakerMetadata] = None


@router.post("/submit-entry", status_code=201)
def submit_entry(body: SubmitEntryBody, x_contributor_id: str = Header(...)):
    sb = get_client()

    # Idempotency: return the existing entry if this client_entry_id was already submitted
    r = (sb.table("sync_queue")
           .select("entry_id, created_at")
           .eq("client_entry_id", body.client_entry_id)
           .eq("contributor_id", x_contributor_id)
           .single()
           .execute())
    if r.data and r.data.get("entry_id"):
        return {"entry_id": r.data["entry_id"], "synced_at": r.data["created_at"]}

    # Load contributor profile
    r = (sb.table("contributors")
           .select("id, town, state, dialect_id, language_id")
           .eq("id", x_contributor_id)
           .single()
           .execute())
    contributor = r.data
    if not contributor:
        raise HTTPException(404, detail={"code": "CONTRIBUTOR_NOT_FOUND", "message": "Contributor not registered."})

    # Get the active language
    r = (sb.table("languages")
           .select("id")
           .eq("is_mvp_active", True)
           .single()
           .execute())
    language = r.data
    if not language:
        raise HTTPException(503, detail={"code": "LANGUAGE_INACTIVE", "message": "No active language configured."})

    synced_at = datetime.now(timezone.utc).isoformat()
    meta = body.speaker_metadata

    r = (sb.table("lexicon_entries")
           .insert({
               "concept_id":        body.concept_id,
               "native_word":       body.native_word.strip(),
               "language_id":       language["id"],
               "dialect_id":        contributor["dialect_id"],
               "region_town":       contributor["town"],
               "region_state":      contributor["state"],
               "contributor_id":    x_contributor_id,
               "speaker_age_range": meta.age_range if meta else None,
               "speaker_gender":    meta.gender    if meta else None,
               "speaker_l1_status": meta.l1_status if meta else "L1",
               "synced_at":         synced_at,
               "is_visible":        True,
           })
           .select("id")
           .single()
           .execute())

    entry = r.data
    if not entry:
        raise HTTPException(500, detail={"code": "INSERT_FAILED", "message": "Failed to save entry."})

    sb.table("sync_queue").insert({
        "client_entry_id":   body.client_entry_id,
        "contributor_id":    x_contributor_id,
        "entry_id":          entry["id"],
        "metadata_uploaded": True,
        "audio_uploaded":    False,
        "resolved":          False,
        "payload_json":      {
            "concept_id":  body.concept_id,
            "native_word": body.native_word,
            "prompt_id":   body.prompt_id,
        },
    }).execute()

    return {"entry_id": entry["id"], "synced_at": synced_at}
