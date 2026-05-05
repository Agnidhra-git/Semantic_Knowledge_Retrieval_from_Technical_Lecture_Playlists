from fastapi import APIRouter, HTTPException, Query
from db.supabase_client import get_supabase

router = APIRouter()


@router.get("/{playlist_id}")
async def list_qa_pairs(
    playlist_id: str,
    difficulty: str | None = Query(None, description="Filter by difficulty: basic, intermediate, or advanced"),
    limit: int = Query(50, ge=1, le=100, description="Number of QA pairs to return"),
):
    """
    Return QA pairs for a playlist.
    Optionally filter by difficulty level.
    """
    supabase = get_supabase()

    # Verify playlist exists
    pl = (
        supabase.table("playlists")
        .select("id")
        .eq("id", playlist_id)
        .maybe_single()
        .execute()
    )
    if not pl.data:
        raise HTTPException(status_code=404, detail="Playlist not found")

    # Build query
    query = (
        supabase.table("qa_pairs")
        .select("id, question, answer, difficulty, cross_video, source_chunks, created_at")
        .eq("playlist_id", playlist_id)
    )

    # Apply difficulty filter if specified
    if difficulty:
        if difficulty not in ["basic", "intermediate", "advanced"]:
            raise HTTPException(
                status_code=400,
                detail="Difficulty must be one of: basic, intermediate, advanced"
            )
        query = query.eq("difficulty", difficulty)

    # Execute with limit
    resp = query.order("created_at", desc=True).limit(limit).execute()

    return resp.data or []
