from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Optional

from lib.db import get_client

router = APIRouter()

VALID_TEXT_VERDICTS  = {"correct", "valid_variant", "wrong_word"}
VALID_AUDIO_VERDICTS = {"correct", "valid_variant", "bad_audio", "no_audio"}
VALID_WRONG_TYPES    = {"wrong_spelling", "wrong_word"}


class ReviewBody(BaseModel):
    entry_id:         str
    affinity_tier:    int
    text_verdict:     str
    wrong_type:       Optional[str]  = None
    text_correction:  Optional[str]  = None
    audio_verdict:    Optional[str]  = None
    will_upload_audio: bool          = False


@router.post("/submit-review", status_code=201)
def submit_review(body: ReviewBody, x_reviewer_id: str = Header(..., alias="x-contributor-id")):
    sb = get_client()

    # Normalise missing audio verdict (seed entries have no audio)
    audio_verdict = body.audio_verdict or "no_audio"
    is_seed_review = not body.audio_verdict

    if body.text_verdict not in VALID_TEXT_VERDICTS:
        raise HTTPException(400, detail={"code": "INVALID_TEXT_VERDICT",
                                         "message": f"text_verdict must be one of: {', '.join(VALID_TEXT_VERDICTS)}"})
    if audio_verdict not in VALID_AUDIO_VERDICTS:
        raise HTTPException(400, detail={"code": "INVALID_AUDIO_VERDICT",
                                         "message": f"audio_verdict must be one of: {', '.join(VALID_AUDIO_VERDICTS)}"})
    if body.wrong_type and body.wrong_type not in VALID_WRONG_TYPES:
        raise HTTPException(400, detail={"code": "INVALID_WRONG_TYPE",
                                         "message": f"wrong_type must be one of: {', '.join(VALID_WRONG_TYPES)}"})
    if body.affinity_tier not in (1, 2, 3, 4):
        raise HTTPException(400, detail={"code": "INVALID_TIER", "message": "affinity_tier must be 1–4."})

    # Load entry and reviewer in one go
    r_entry    = (sb.table("lexicon_entries")
                    .select("id, contributor_id, concept_id, native_word, audio_path_opus, audio_path_wav, audio_duration_sec")
                    .eq("id", body.entry_id)
                    .maybe_single()
                    .execute())
    r_reviewer = (sb.table("contributors")
                    .select("id, town, state, age_range, gender, l1_status")
                    .eq("id", x_reviewer_id)
                    .maybe_single()
                    .execute())

    entry    = r_entry.data if r_entry else None
    reviewer = r_reviewer.data if r_reviewer else None

    if not entry:
        raise HTTPException(404, detail={"code": "ENTRY_NOT_FOUND", "message": "Entry not found."})
    if entry["contributor_id"] == x_reviewer_id:
        raise HTTPException(403, detail={"code": "SELF_REVIEW", "message": "Cannot review your own entry."})

    tier = body.affinity_tier

    # Look up score weights for both verdict dimensions
    r_text = (sb.table("affinity_score_weights")
                .select("score_delta")
                .eq("affinity_tier", tier)
                .eq("verdict", body.text_verdict)
                .eq("dimension", "text")
                .maybe_single()
                .execute())

    text_score_delta  = r_text.data["score_delta"]  if r_text and r_text.data  else 0
    audio_score_delta = 0

    if not is_seed_review:
        r_audio = (sb.table("affinity_score_weights")
                     .select("score_delta")
                     .eq("affinity_tier", tier)
                     .eq("verdict", audio_verdict)
                     .eq("dimension", "audio")
                     .maybe_single()
                     .execute())
        audio_score_delta = r_audio.data["score_delta"] if r_audio and r_audio.data else 0

    legacy_verdict = _derive_legacy_verdict(body.text_verdict, audio_verdict)

    r = (sb.table("review_verdicts")
           .insert({
               "entry_id":          body.entry_id,
               "reviewer_id":       x_reviewer_id,
               "affinity_tier":     tier,
               "verdict":           legacy_verdict,
               "score_delta":       0,
               "text_verdict":      body.text_verdict,
               "wrong_type":        body.wrong_type,
               "text_correction":   body.text_correction.strip() if body.text_correction else None,
               "audio_verdict":     audio_verdict,
               "text_score_delta":  text_score_delta,
               "audio_score_delta": audio_score_delta,
           })
           .execute())

    if not r.data:
        raise HTTPException(500, detail={"code": "INSERT_FAILED", "message": "Failed to save verdict."})

    inserted_id = r.data[0]["id"]

    # Create a correction entry if the reviewer is providing a better word or new audio
    has_text_correction = body.text_verdict == "wrong_word" and body.text_correction and body.text_correction.strip()
    should_create_correction = has_text_correction or body.will_upload_audio
    correction_entry_id = None

    if should_create_correction:
        corrected_word = (body.text_correction.strip() if body.text_correction else None) or entry["native_word"]
        inherit_audio  = audio_verdict in ("correct", "valid_variant")

        r_corr = (sb.table("lexicon_entries")
                    .insert({
                        "concept_id":              entry["concept_id"],
                        "native_word":             corrected_word,
                        "contributor_id":          x_reviewer_id,
                        "source":                  "correction",
                        "corrected_from_entry_id": body.entry_id,
                        "region_town":             reviewer["town"]      if reviewer else None,
                        "region_state":            reviewer["state"]     if reviewer else None,
                        "speaker_age_range":       reviewer["age_range"] if reviewer else None,
                        "speaker_gender":          reviewer["gender"]    if reviewer else None,
                        "speaker_l1_status":       reviewer["l1_status"] if reviewer else "L1",
                        "audio_path_opus":         entry["audio_path_opus"]    if inherit_audio else None,
                        "audio_path_wav":          entry["audio_path_wav"]     if inherit_audio else None,
                        "audio_duration_sec":      entry["audio_duration_sec"] if inherit_audio else None,
                    })
                    .execute())
        if r_corr.data:
            correction_entry_id = r_corr.data[0]["id"]

    # Read the updated scores (the DB trigger has already run)
    r_updated = (sb.table("lexicon_entries")
                   .select("confidence_score, is_verified, text_verified, audio_verified")
                   .eq("id", body.entry_id)
                   .maybe_single()
                   .execute())
    updated = (r_updated.data if r_updated else None) or {}

    return {
        "verdict_id":          inserted_id,
        "confidence_score":    updated.get("confidence_score", 0),
        "is_verified":         updated.get("is_verified",      False),
        "text_verified":       updated.get("text_verified",    False),
        "audio_verified":      updated.get("audio_verified",   False),
        "correction_entry_id": correction_entry_id,
    }


def _derive_legacy_verdict(text_verdict: str, audio_verdict: str) -> str:
    if text_verdict == "wrong_word":
        return "incorrect"
    if audio_verdict == "bad_audio":
        return "incorrect"
    if text_verdict == "correct" and audio_verdict in ("correct", "no_audio"):
        return "correct"
    if text_verdict == "valid_variant" or audio_verdict == "valid_variant":
        return "valid_variant"
    return "unsure"
