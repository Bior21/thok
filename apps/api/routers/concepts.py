from fastapi import APIRouter, Header

from lib.db import get_client

router = APIRouter()


@router.get("/get-concepts")
def get_concepts(x_contributor_id: str = Header(...)):
    sb = get_client()

    r = (sb.table("concepts")
           .select("id, english_gloss, image_path, prompt_context, concept_type")
           .order("id", desc=False)
           .execute())

    concepts = []
    for c in (r.data or []):
        concepts.append({
            "id":             c["id"],
            "english_gloss":  c["english_gloss"],
            "image_path":     c.get("image_path"),
            "prompt_context": c.get("prompt_context"),
            "concept_type":   c.get("concept_type") or "word",
        })

    return concepts
