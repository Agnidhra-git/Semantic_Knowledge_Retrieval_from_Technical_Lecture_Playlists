from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Header
from typing import Optional

from config import get_settings
from db.supabase_client import get_supabase
from tasks.pipeline import process_playlist

router = APIRouter()


def _verify_admin(authorization: Optional[str] = Header(None)) -> None:
    """Simple bearer token check for the admin secret key."""
    settings = get_settings()
    expected = f"Bearer {settings.secret_admin_key}"
    if not authorization or authorization != expected:
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header. "
                   "Expected: Bearer <SECRET_ADMIN_KEY>",
        )


@router.post("/{playlist_id}", status_code=202)
async def trigger_ingest(
    playlist_id: str,
    background_tasks: BackgroundTasks,
    _: None = Depends(_verify_admin),
):
    """
    Trigger ingestion for a playlist as a background task.
    The playlist record must already exist (created via POST /playlists).
    Returns immediately with 202 Accepted.
    """
    supabase = get_supabase()

    # Verify playlist exists
    pl_resp = (
        supabase.table("playlists")
        .select("id, youtube_id, processed")
        .eq("id", playlist_id)
        .maybe_single()
        .execute()
    )
    if not pl_resp.data:
        raise HTTPException(status_code=404, detail="Playlist not found. Create it first via POST /playlists.")

    if pl_resp.data.get("processed"):
        # Check if any videos have errors — if so, allow re-trigger to retry them
        failed_resp = (
            supabase.table("videos")
            .select("id", count="exact")
            .eq("playlist_id", playlist_id)
            .not_.is_("processing_error", "null")
            .execute()
        )
        has_failures = (failed_resp.count or 0) > 0
        if not has_failures:
            return {
                "status": "already_processed",
                "playlist_id": playlist_id,
                "message": "Playlist has already been fully processed. No re-processing.",
            }
        # Reset playlist processed flag so pipeline will run
        supabase.table("playlists").update(
            {"processed": False, "processing_error": None}
        ).eq("id", playlist_id).execute()

    background_tasks.add_task(process_playlist, playlist_id)
    return {
        "status": "accepted",
        "playlist_id": playlist_id,
        "message": "Ingestion started in background. Poll /ingest/status/{playlist_id} for progress.",
    }


@router.get("/status/{playlist_id}")
async def ingest_status(playlist_id: str):
    """
    Return processing status and per-video progress for a playlist.
    """
    supabase = get_supabase()

    pl_resp = (
        supabase.table("playlists")
        .select("id, title, processed, processing_error, video_count, updated_at")
        .eq("id", playlist_id)
        .maybe_single()
        .execute()
    )
    if not pl_resp.data:
        raise HTTPException(status_code=404, detail="Playlist not found")

    playlist = pl_resp.data

    # Fetch per-video status
    videos_resp = (
        supabase.table("videos")
        .select("id, youtube_id, title, position, processed, processing_error")
        .eq("playlist_id", playlist_id)
        .order("position")
        .execute()
    )
    videos = videos_resp.data or []

    total = len(videos)
    done = sum(1 for v in videos if v.get("processed"))

    return {
        "playlist_id": playlist_id,
        "title": playlist.get("title"),
        "processed": playlist.get("processed", False),
        "processing_error": playlist.get("processing_error"),
        "video_count": playlist.get("video_count", total),
        "videos_done": done,
        "videos_total": total,
        "progress_pct": round(done / total * 100, 1) if total else 0.0,
        "updated_at": playlist.get("updated_at"),
        "videos": videos,
    }
