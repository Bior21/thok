import os
import json
import urllib.request
import urllib.error
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from lib.db import get_client

router = APIRouter()

NOTIFY_EMAIL = "biormadol@gmail.com"


class LanguageRequestBody(BaseModel):
    language_name:  str
    region:         str
    est_speakers:   Optional[str] = None
    contact_name:   str
    contact_email:  str
    message:        Optional[str] = None


@router.post("/request-language", status_code=201)
def request_language(body: LanguageRequestBody):
    if not body.language_name.strip():
        raise HTTPException(400, detail={"code": "MISSING_FIELD", "message": "language_name is required."})
    if not body.region.strip():
        raise HTTPException(400, detail={"code": "MISSING_FIELD", "message": "region is required."})
    if not body.contact_name.strip():
        raise HTTPException(400, detail={"code": "MISSING_FIELD", "message": "contact_name is required."})
    if not body.contact_email.strip():
        raise HTTPException(400, detail={"code": "MISSING_FIELD", "message": "contact_email is required."})

    sb = get_client()

    r = (sb.table("language_requests")
           .insert({
               "language_name":  body.language_name.strip(),
               "region":         body.region.strip(),
               "est_speakers":   body.est_speakers.strip() if body.est_speakers else None,
               "contact_name":   body.contact_name.strip(),
               "contact_email":  body.contact_email.strip(),
               "message":        body.message.strip() if body.message else None,
           })
           .execute())

    if not r.data:
        raise HTTPException(500, detail={"code": "INSERT_FAILED", "message": "Failed to save your request."})

    request_id = r.data[0]["id"]

    resend_key = os.environ.get("RESEND_API_KEY")
    if resend_key:
        _send_email(resend_key, body, request_id)

    return {"success": True, "request_id": request_id}


def _send_email(api_key: str, body: LanguageRequestBody, request_id: str) -> None:
    payload = json.dumps({
        "from":    "Thok <onboarding@resend.dev>",
        "to":      [NOTIFY_EMAIL],
        "subject": f"New language request: {body.language_name.strip()}",
        "html": (
            "<h2>New Language Request on Thok</h2>"
            "<table cellpadding='6'>"
            f"<tr><td><strong>Language</strong></td><td>{body.language_name.strip()}</td></tr>"
            f"<tr><td><strong>Region</strong></td><td>{body.region.strip()}</td></tr>"
            f"<tr><td><strong>Est. Speakers</strong></td><td>{body.est_speakers or '—'}</td></tr>"
            f"<tr><td><strong>Contact</strong></td><td>{body.contact_name.strip()} &lt;{body.contact_email.strip()}&gt;</td></tr>"
            f"<tr><td><strong>Message</strong></td><td>{body.message or '—'}</td></tr>"
            "</table>"
            f"<p style='color:#888;font-size:12px'>Request ID: {request_id}</p>"
        ),
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type":  "application/json",
            },
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"[request-language] email send failed (non-fatal): {e}")
