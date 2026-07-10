from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from lib.db import get_client

router = APIRouter()


class RegisterBody(BaseModel):
    town: Optional[str] = None
    state: Optional[str] = None
    age_range: Optional[str] = None
    gender: Optional[str] = None
    l1_status: Optional[str] = "L1"
    language_code: Optional[str] = None


class UpdateBody(BaseModel):
    name: Optional[str] = None
    town: Optional[str] = None
    state: Optional[str] = None
    age_range: Optional[str] = None
    gender: Optional[str] = None
    l1_status: Optional[str] = None
    location_deferred: Optional[bool] = None


@router.post("/register-contributor", status_code=201)
def register_contributor(body: RegisterBody):
    sb = get_client()

    town  = body.town.strip()  if body.town  else "Unknown"
    state = body.state.strip() if body.state else "Other / Outside South Sudan"

    language_id = None
    if body.language_code:
        r = (sb.table("languages")
               .select("id")
               .eq("code", body.language_code.strip().lower())
               .eq("is_mvp_active", True)
               .single()
               .execute())
        language_id = r.data["id"] if r.data else None

    r = (sb.table("contributors")
           .insert({
               "town":        town,
               "state":       state,
               "age_range":   body.age_range,
               "gender":      body.gender,
               "l1_status":   body.l1_status or "L1",
               "language_id": language_id,
               "is_reviewer": True,
           })
           .select("id, dialect_id, language_id")
           .single()
           .execute())

    contributor = r.data
    if not contributor:
        raise HTTPException(500, detail={"code": "INSERT_FAILED", "message": "Failed to register contributor."})

    dialect_code = None
    if contributor["dialect_id"]:
        r = (sb.table("dialects")
               .select("code")
               .eq("id", contributor["dialect_id"])
               .single()
               .execute())
        dialect_code = r.data["code"] if r.data else None

    r = (sb.table("languages")
           .select("code")
           .eq("id", contributor["language_id"])
           .single()
           .execute())
    language_code = r.data["code"] if r.data else "dinka"

    return {
        "contributor_id":   contributor["id"],
        "dialect_inferred": dialect_code,
        "language":         language_code,
    }


@router.patch("/contributor/{contributor_id}")
def update_contributor(contributor_id: str, body: UpdateBody):
    sb = get_client()

    patch = {k: v for k, v in {
        "name":              body.name.strip() if body.name else None,
        "town":              body.town.strip()  if body.town  else None,
        "state":             body.state.strip() if body.state else None,
        "age_range":         body.age_range,
        "gender":            body.gender,
        "l1_status":         body.l1_status,
        "location_deferred": body.location_deferred,
    }.items() if v is not None}

    if not patch:
        raise HTTPException(400, detail={"code": "EMPTY_PATCH", "message": "No fields to update."})

    r = (sb.table("contributors")
           .update(patch)
           .eq("id", contributor_id)
           .execute())

    return {"updated": True}
