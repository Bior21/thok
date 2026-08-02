from fastapi import APIRouter, Header, HTTPException

from lib.db import get_client

router = APIRouter()


@router.get("/get-leaderboard")
def get_leaderboard(x_contributor_id: str = Header(...)):
    sb = get_client()

    r = (sb.table("contributors")
           .select("language_id, state")
           .eq("id", x_contributor_id)
           .maybe_single()
           .execute())
    contributor = r.data if r else None
    if not contributor:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Contributor not found."})

    r = (sb.table("lexicon_entries")
           .select("region_state")
           .eq("language_id", contributor["language_id"])
           .not_.is_("region_state", None)
           .neq("region_state", "")
           .neq("region_state", "Other / Outside South Sudan")
           .execute())

    counts: dict[str, int] = {}
    for row in (r.data or []):
        state = row.get("region_state") or ""
        if state:
            counts[state] = counts.get(state, 0) + 1

    sorted_states = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    leaderboard   = [{"state": s, "wordCount": n} for s, n in sorted_states[:5]]

    contributor_state = contributor.get("state")
    contributor_rank  = None
    if contributor_state:
        rank = next(
            (i + 1 for i, (s, _) in enumerate(sorted_states) if s == contributor_state),
            None,
        )
        contributor_rank = rank

    return {
        "leaderboard":      leaderboard,
        "contributorState": contributor_state,
        "contributorRank":  contributor_rank,
    }
