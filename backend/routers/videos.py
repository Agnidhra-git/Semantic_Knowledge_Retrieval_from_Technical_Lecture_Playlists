from fastapi import APIRouter, HTTPException
from db.supabase_client import get_supabase

router = APIRouter()


@router.get("/playlists/{playlist_id}/videos")
async def list_playlist_videos(playlist_id: str):
    """
    Return all videos in a playlist ordered by position.
    Each video includes its top 10 keywords.
    """
    supabase = get_supabase()

    # Verify playlist exists
    pl_resp = (
        supabase.table("playlists")
        .select("id")
        .eq("id", playlist_id)
        .maybe_single()
        .execute()
    )
    if not pl_resp.data:
        raise HTTPException(status_code=404, detail="Playlist not found")

    # Fetch videos
    videos_resp = (
        supabase.table("videos")
        .select(
            "id, youtube_id, title, position, duration_seconds,"
            " thumbnail_url, published_at, processed, processing_error"
        )
        .eq("playlist_id", playlist_id)
        .order("position")
        .execute()
    )
    videos = videos_resp.data or []

    if not videos:
        return []

    # Fetch top 10 keywords per video in one query
    video_ids = [v["id"] for v in videos]
    kw_resp = (
        supabase.table("video_keywords")
        .select("video_id, keyword, importance_score, frequency, pedagogy_context")
        .in_("video_id", video_ids)
        .order("importance_score", desc=True)
        .execute()
    )
    all_keywords = kw_resp.data or []

    # Group keywords by video_id, cap at 10
    kw_by_video: dict[str, list[dict]] = {}
    for kw in all_keywords:
        vid = kw["video_id"]
        if vid not in kw_by_video:
            kw_by_video[vid] = []
        if len(kw_by_video[vid]) < 10:
            kw_by_video[vid].append(
                {
                    "keyword": kw["keyword"],
                    "importance_score": kw["importance_score"],
                    "frequency": kw["frequency"],
                    "pedagogy_context": kw["pedagogy_context"],
                }
            )

    # Attach keywords to each video
    for video in videos:
        video["keywords"] = kw_by_video.get(video["id"], [])

    return videos
