from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db.supabase_client import get_supabase

router = APIRouter()


class PlaylistCreate(BaseModel):
    youtube_id: str
    subject: str


@router.get("")
async def list_playlists():
    """List all playlists with summary fields."""
    supabase = get_supabase()
    resp = (
        supabase.table("playlists")
        .select(
            "id, youtube_id, title, subject, description,"
            " video_count, thumbnail_url, processed, processing_error,"
            " created_at, updated_at"
        )
        .order("created_at", desc=True)
        .execute()
    )
    return resp.data or []


@router.get("/{playlist_id}")
async def get_playlist(playlist_id: str):
    """Return full details for a single playlist."""
    supabase = get_supabase()
    resp = (
        supabase.table("playlists")
        .select("*")
        .eq("id", playlist_id)
        .maybe_single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return resp.data


@router.post("", status_code=201)
async def create_playlist(body: PlaylistCreate):
    """
    Create a playlist record. Does NOT trigger ingestion.
    Title is seeded as the youtube_id until ingestion fills it in.
    """
    supabase = get_supabase()

    # Check for duplicate
    existing = (
        supabase.table("playlists")
        .select("id")
        .eq("youtube_id", body.youtube_id)
        .maybe_single()
        .execute()
    )
    if existing and existing.data:
        raise HTTPException(status_code=409, detail="Playlist already exists")

    resp = (
        supabase.table("playlists")
        .insert(
            {
                "youtube_id": body.youtube_id,
                "subject": body.subject,
                "title": body.youtube_id,  # placeholder until ingest fills it
            }
        )
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to create playlist")
    return resp.data[0]
