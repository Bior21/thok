from datetime import datetime, timezone
from fastapi import APIRouter, Header, HTTPException, File, Form, UploadFile

from lib.db import get_client

router = APIRouter()

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
MIN_DURATION   = 0.5                # seconds


@router.post("/upload-audio/{entry_id}")
async def upload_audio(
    entry_id:     str,
    audio_file:   UploadFile = File(...),
    duration_sec: float      = Form(...),
    x_contributor_id: str   = Header(...),
):
    sb = get_client()

    if duration_sec < MIN_DURATION:
        raise HTTPException(400, detail={"code": "TOO_SHORT", "message": f"Recording must be at least {MIN_DURATION}s."})

    audio_bytes = await audio_file.read()

    if len(audio_bytes) > MAX_FILE_BYTES:
        raise HTTPException(413, detail={"code": "FILE_TOO_LARGE", "message": "Audio file exceeds 10MB limit."})

    # Confirm the entry belongs to this contributor
    r = (sb.table("lexicon_entries")
           .select("id, contributor_id")
           .eq("id", entry_id)
           .eq("contributor_id", x_contributor_id)
           .single()
           .execute())
    if not r.data:
        raise HTTPException(404, detail={"code": "ENTRY_NOT_FOUND", "message": "Entry not found or access denied."})

    content_type = audio_file.content_type or ""
    filename     = audio_file.filename or ""
    is_wav       = content_type == "audio/wav" or filename.endswith(".wav")

    storage_path = f"audio/{entry_id}.wav" if is_wav else f"audio/{entry_id}.opus"
    mime         = "audio/wav" if is_wav else (content_type or "audio/webm")

    sb.storage.from_("lexicon").upload(
        path=storage_path,
        file=audio_bytes,
        file_options={"content-type": mime, "upsert": True},
    )

    snr_flag   = len(audio_bytes) < 5000
    path_col   = {"audio_path_wav": storage_path} if is_wav else {"audio_path_opus": storage_path}

    sb.table("lexicon_entries").update({
        **path_col,
        "audio_duration_sec": duration_sec,
        "audio_snr_flag":     snr_flag,
    }).eq("id", entry_id).execute()

    sb.table("sync_queue").update({
        "audio_uploaded": True,
        "resolved":       True,
        "resolved_at":    datetime.now(timezone.utc).isoformat(),
    }).eq("entry_id", entry_id).execute()

    return {
        "audio_path_wav":  storage_path if is_wav else None,
        "audio_path_opus": storage_path if not is_wav else None,
        "snr_flag":        snr_flag,
        "duration_sec":    duration_sec,
    }
