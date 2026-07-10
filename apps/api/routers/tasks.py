import random
from fastapi import APIRouter, Header, HTTPException

from lib.db import get_client

router = APIRouter()

SEED_BOT_IDS = [
    "00000000-0000-0000-0000-000000000002",
    "00000000-0000-0000-0000-000000000003",
]


@router.get("/next-task")
def next_task(x_contributor_id: str = Header(...)):
    sb = get_client()

    r = (sb.table("contributors")
           .select("id, dialect_id, state, language_id")
           .eq("id", x_contributor_id)
           .single()
           .execute())
    contributor = r.data
    if not contributor:
        raise HTTPException(404, detail={"code": "CONTRIBUTOR_NOT_FOUND", "message": "Contributor not found."})

    r = (sb.table("lexicon_entries")
           .select("id", count="exact")
           .eq("contributor_id", x_contributor_id)
           .limit(0)
           .execute())
    total_contributions = r.count or 0

    # Phase 1: always contribute until the user has 3 entries
    if total_contributions < 3:
        task = _build_contribute_task(sb, x_contributor_id)
        if not task:
            raise HTTPException(404, detail={"code": "NO_TASKS_AVAILABLE", "message": "No concepts available."})
        return {"task_type": "contribute", "prompt": task, "total_contributions": total_contributions}

    # Phase 2: weighted random based on review queue pressure
    r1 = sb.table("lexicon_entries").select("id", count="exact").limit(0).execute()
    r2 = (sb.table("lexicon_entries")
            .select("id", count="exact")
            .lt("confidence_score", 0.15)
            .neq("contributor_id", x_contributor_id)
            .limit(0)
            .execute())

    total_entries = r1.count or 0
    unreviewed    = r2.count or 0
    pressure      = unreviewed / max(total_entries, 1)
    p_review      = 0.5 if pressure > 0.4 else 0.3
    task_type     = "review" if random.random() < p_review else "contribute"

    if task_type == "review":
        prefer_seed = random.random() < 0.7
        review_task = _build_review_task(sb, contributor, prefer_seed)
        if not review_task:
            review_task = _build_review_task(sb, contributor, not prefer_seed)

        if not review_task:
            task = _build_contribute_task(sb, x_contributor_id)
            if not task:
                raise HTTPException(404, detail={"code": "NO_TASKS_AVAILABLE", "message": "No tasks available."})
            return {"task_type": "contribute", "prompt": task, "total_contributions": total_contributions}

        return {"task_type": "review", "entry": review_task, "total_contributions": total_contributions}

    task = _build_contribute_task(sb, x_contributor_id)
    if not task:
        raise HTTPException(404, detail={"code": "NO_TASKS_AVAILABLE", "message": "No prompts available."})
    return {"task_type": "contribute", "prompt": task, "total_contributions": total_contributions}


@router.post("/skip-concept")
def skip_concept(
    body: dict,
    x_contributor_id: str = Header(...),
):
    sb = get_client()
    concept_id = body.get("concept_id")
    if not concept_id:
        raise HTTPException(400, detail={"code": "MISSING_CONCEPT_ID", "message": "concept_id required."})

    sb.table("concept_skips").insert({
        "contributor_id": x_contributor_id,
        "concept_id":     concept_id,
    }).execute()

    return {"skipped": True}


# ── Task builders ─────────────────────────────────────────────────────────────

def _build_contribute_task(sb, contributor_id: str):
    # Find concepts this contributor has already submitted
    r = (sb.table("lexicon_entries")
           .select("concept_id")
           .eq("contributor_id", contributor_id)
           .execute())
    submitted_ids = [row["concept_id"] for row in (r.data or [])]

    # Find concepts this contributor has skipped
    r = (sb.table("concept_skips")
           .select("concept_id")
           .eq("contributor_id", contributor_id)
           .execute())
    skipped_ids = [row["concept_id"] for row in (r.data or [])]

    excluded_ids = list(set(submitted_ids + skipped_ids))

    query = sb.table("concepts").select("id")
    if excluded_ids:
        query = query.not_("id", "in", f"({','.join(excluded_ids)})")

    r = query.execute()
    available_ids = [row["id"] for row in (r.data or [])]

    if not available_ids:
        # Allow repeats if everything has been submitted
        r = sb.table("concepts").select("id").execute()
        available_ids = [row["id"] for row in (r.data or [])]
        if not available_ids:
            return None

    random_id = random.choice(available_ids)

    r = (sb.table("concepts")
           .select("id, english_gloss, image_path, prompt_context, concept_type")
           .eq("id", random_id)
           .single()
           .execute())
    concept = r.data
    if not concept:
        return None

    prompt_type = (
        "sentence" if concept["concept_type"] == "sentence"
        else "image"   if concept["image_path"]
        else "context" if concept["prompt_context"]
        else "word"
    )

    image_url = None
    if concept["image_path"]:
        r = sb.storage.from_("concepts").create_signed_url(concept["image_path"], 600)
        image_url = r.get("signedURL")

    import time
    return {
        "prompt_id":     f"p-{concept['id']}-{int(time.time() * 1000)}",
        "concept_id":    concept["id"],
        "english_gloss": concept["english_gloss"],
        "prompt_type":   prompt_type,
        "concept_type":  concept["concept_type"] or "word",
        "image_url":     image_url,
        "context_text":  concept["prompt_context"],
    }


def _build_review_task(sb, contributor: dict, prefer_seed: bool):
    r = (sb.table("review_verdicts")
           .select("entry_id")
           .eq("reviewer_id", contributor["id"])
           .execute())
    reviewed_ids = [row["entry_id"] for row in (r.data or [])]

    query = (sb.table("lexicon_entries")
               .select("id, concept_id, contributor_id, native_word, region_town, region_state, dialect_id, audio_path_opus, audio_path_wav, concepts!inner(english_gloss)")
               .neq("contributor_id", contributor["id"])
               .eq("language_id", contributor["language_id"])
               .order("confidence_score", desc=False)
               .limit(20))

    if prefer_seed:
        query = query.in_("contributor_id", SEED_BOT_IDS)
    else:
        query = (query
                 .or_("audio_path_wav.not.is.null,audio_path_opus.not.is.null")
                 .not_("contributor_id", "in", f"({','.join(SEED_BOT_IDS)})"))

    if reviewed_ids:
        query = query.not_("id", "in", f"({','.join(reviewed_ids)})")

    r = query.execute()
    candidates = r.data or []
    if not candidates:
        return None

    # Score by affinity tier (same dialect = 1, same state = 2, same language = 3)
    def tier(entry):
        if contributor["dialect_id"] and entry.get("dialect_id") == contributor["dialect_id"]:
            return 1
        if entry.get("region_state", "").lower() == (contributor.get("state") or "").lower():
            return 2
        return 3

    candidates.sort(key=tier)
    best = candidates[0]
    best_tier = tier(best)
    is_seed = best["contributor_id"] in SEED_BOT_IDS

    if is_seed:
        return {
            "entry_id":        best["id"],
            "concept_id":      best["concept_id"],
            "english_gloss":   best["concepts"]["english_gloss"],
            "native_word":     best["native_word"],
            "audio_url":       None,
            "submitter_town":  best.get("region_town", ""),
            "submitter_state": best.get("region_state", ""),
            "affinity_tier":   best_tier,
            "is_seed_entry":   True,
        }

    audio_path = best.get("audio_path_wav") or best.get("audio_path_opus")
    if not audio_path:
        return None

    r = sb.storage.from_("lexicon").create_signed_url(audio_path, 600)
    audio_url = r.get("signedURL")
    if not audio_url:
        return None

    return {
        "entry_id":        best["id"],
        "concept_id":      best["concept_id"],
        "english_gloss":   best["concepts"]["english_gloss"],
        "native_word":     best["native_word"],
        "audio_url":       audio_url,
        "submitter_town":  best.get("region_town", ""),
        "submitter_state": best.get("region_state", ""),
        "affinity_tier":   best_tier,
        "is_seed_entry":   False,
    }
