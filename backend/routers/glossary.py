from fastapi import APIRouter, HTTPException
from db.supabase_client import get_supabase

router = APIRouter()


@router.get("/{playlist_id}")
async def list_glossary(playlist_id: str):
    """Return all glossary terms for a playlist (summary view)."""
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

    resp = (
        supabase.table("glossary")
        .select(
            "id, term, definition, importance_score,"
            " first_video_id, first_timestamp, related_terms, created_at"
        )
        .eq("playlist_id", playlist_id)
        .gte("importance_score", 0.3)
        .order("importance_score", desc=True)
        .execute()
    )
    return resp.data or []


@router.get("/{playlist_id}/{term}")
async def get_term(playlist_id: str, term: str):
    """
    Return full detail for a single glossary term including best chunk snippets.
    """
    supabase = get_supabase()

    resp = (
        supabase.table("glossary")
        .select("*")
        .eq("playlist_id", playlist_id)
        .eq("term", term.lower().strip())
        .maybe_single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(
            status_code=404,
            detail=f"Term '{term}' not found in playlist {playlist_id}",
        )

    data = resp.data

    # Enrich with snippet texts for the three best chunks
    def _fetch_snippet(chunk_id: str | None) -> dict | None:
        if not chunk_id:
            return None
        chunk_resp = (
            supabase.table("transcript_chunks")
            .select("text, start_time, end_time, pedagogy_role, video_id")
            .eq("id", chunk_id)
            .maybe_single()
            .execute()
        )
        if not chunk_resp.data:
            return None
        
        chunk_data = chunk_resp.data
        
        # Fetch video data to get youtube_id and title
        if chunk_data.get("video_id"):
            vid_resp = (
                supabase.table("videos")
                .select("youtube_id, title")
                .eq("id", chunk_data["video_id"])
                .maybe_single()
                .execute()
            )
            if vid_resp.data:
                chunk_data["video_youtube_id"] = vid_resp.data["youtube_id"]
                chunk_data["video_title"] = vid_resp.data["title"]
        
        return chunk_data

    data["best_intro_chunk"] = _fetch_snippet(data.get("best_intro_chunk_id"))
    data["best_deriv_chunk"] = _fetch_snippet(data.get("best_deriv_chunk_id"))
    data["best_expl_chunk"] = _fetch_snippet(data.get("best_expl_chunk_id"))

    # Fetch first video title
    if data.get("first_video_id"):
        vid_resp = (
            supabase.table("videos")
            .select("title, youtube_id")
            .eq("id", data["first_video_id"])
            .maybe_single()
            .execute()
        )
        data["first_video"] = vid_resp.data if vid_resp.data else None

    return data
