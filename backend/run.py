"""
BTP Pipeline CLI
================

Commands
--------
  clear                    Wipe ALL data from Supabase and Pinecone
  process-playlist <YT_PLAYLIST_ID> [--subject TEXT]
                           Create + fully process a YouTube playlist
  process-video <YT_VIDEO_ID> --playlist-id <DB_UUID>
                           Re-process (or process) a single video
  status [PLAYLIST_ID]     Show processing status (all or one playlist)

Usage examples
--------------
  python run.py clear
  python run.py process-playlist PLbMVogVj5nJSCWZNo0sUSxanAp4TN2G-x --subject "Jet and Rocket Propulsion"
  python run.py process-video Hlj2eVt1Vbk --playlist-id <uuid>
  python run.py status
  python run.py status <uuid>
"""

from __future__ import annotations

import sys
import os

# ── Ensure backend root is on the path ────────────────────────────────────────
sys.path.insert(0, os.path.dirname(__file__))

import logging
import uuid as _uuid
from typing import Optional

import typer
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("cli")

app = typer.Typer(
    name="btp",
    help="BTP Pipeline CLI — process playlists and videos into Supabase + Pinecone",
    add_completion=False,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_supabase():
    from db.supabase_client import get_supabase
    return get_supabase()


def _get_pinecone_index():
    from db.pinecone_client import get_index
    return get_index()


# ══════════════════════════════════════════════════════════════════════════════
# clear
# ══════════════════════════════════════════════════════════════════════════════

@app.command()
def clear(
    yes: bool = typer.Option(False, "--yes", "-y", help="Skip confirmation prompt"),
):
    """Wipe ALL data from every Supabase table and the Pinecone index."""
    if not yes:
        typer.confirm(
            "This will DELETE ALL data (playlists, videos, chunks, keywords, "
            "glossary, heatmaps, QA pairs, search cache) from Supabase AND Pinecone. "
            "Continue?",
            abort=True,
        )

    supabase = _get_supabase()

    # Tables must be deleted in FK order (children before parents)
    tables = [
        "search_cache",
        "concept_heatmaps",
        "qa_pairs",
        "glossary",
        "video_keywords",
        "transcript_chunks",
        "videos",
        "playlists",
    ]

    typer.echo("\nClearing Supabase tables...")
    for table in tables:
        try:
            # Delete all rows by filtering on a column that is always non-null
            supabase.table(table).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            typer.echo(f"  [OK] {table}")
        except Exception as exc:
            typer.echo(f"  [FAIL] {table}: {exc}")

    typer.echo("\nClearing Pinecone index...")
    try:
        index = _get_pinecone_index()
        index.delete(delete_all=True)
        typer.echo("  [OK] Pinecone index cleared")
    except Exception as exc:
        typer.echo(f"  [FAIL] Pinecone: {exc}")

    typer.echo("\nDone. Database is empty.\n")


# ══════════════════════════════════════════════════════════════════════════════
# process-playlist
# ══════════════════════════════════════════════════════════════════════════════

@app.command("process-playlist")
def process_playlist_cmd(
    youtube_playlist_id: str = typer.Argument(..., help="YouTube playlist ID, e.g. PLxxxxx"),
    subject: str = typer.Option("Aerospace Engineering", "--subject", "-s", help="Subject / course name"),
    reset: bool = typer.Option(False, "--reset", help="Clear processed flag so pipeline re-runs"),
):
    """
    Create a playlist record (if needed) and run the full ingestion pipeline.

    The pipeline runs synchronously in this process — tail the log output to
    monitor per-video progress. Typical runtime: ~30-45 sec per video (1000 RPM).
    """
    supabase = _get_supabase()

    # ── Find or create the playlist DB record ─────────────────────────────────
    existing_resp = (
        supabase.table("playlists")
        .select("id, youtube_id, processed, title")
        .eq("youtube_id", youtube_playlist_id)
        .limit(1)
        .execute()
    )
    existing = (existing_resp.data or [None])[0]

    if existing:
        playlist_id = existing["id"]
        typer.echo(f"Playlist already in DB: {existing['title']!r}  (id={playlist_id})")
        if existing.get("processed") and not reset:
            typer.echo("Already processed. Use --reset to re-run the pipeline.")
            return
        if reset:
            supabase.table("playlists").update(
                {"processed": False, "processing_error": None}
            ).eq("id", playlist_id).execute()
            typer.echo("Reset processed flag — will re-run pipeline.")
    else:
        resp = (
            supabase.table("playlists")
            .insert({"youtube_id": youtube_playlist_id, "subject": subject, "title": youtube_playlist_id})
            .execute()
        )
        if not resp.data:
            typer.echo("ERROR: Failed to insert playlist row.", err=True)
            raise typer.Exit(1)
        playlist_id = resp.data[0]["id"]
        typer.echo(f"Created playlist record  id={playlist_id}  subject={subject!r}")

    typer.echo(f"\nStarting pipeline for playlist {youtube_playlist_id} ...\n")

    from tasks.pipeline import process_playlist
    process_playlist(playlist_id)

    typer.echo("\nPipeline finished. Run `python run.py status` to see results.\n")


# ══════════════════════════════════════════════════════════════════════════════
# process-video
# ══════════════════════════════════════════════════════════════════════════════

@app.command("process-video")
def process_video_cmd(
    youtube_video_id: str = typer.Argument(..., help="YouTube video ID, e.g. Hlj2eVt1Vbk"),
    playlist_id: Optional[str] = typer.Option(None, "--playlist-id", "-p",
        help="DB UUID of the parent playlist. Required if the video is not yet in the DB."),
    reset: bool = typer.Option(False, "--reset", help="Re-process even if already done"),
):
    """
    Process (or re-process) a single video.

    The video must already belong to a playlist in the database.
    If the video row doesn't exist yet, --playlist-id is required so the
    pipeline can insert it first.
    """
    supabase = _get_supabase()

    # ── Look up existing video row ─────────────────────────────────────────────
    vid_resp = (
        supabase.table("videos")
        .select("id, youtube_id, title, playlist_id, processed, processing_error")
        .eq("youtube_id", youtube_video_id)
        .limit(1)
        .execute()
    )
    video_row = (vid_resp.data or [None])[0]

    if video_row:
        video = video_row
        resolved_playlist_id = video["playlist_id"]
        typer.echo(f"Found video: {video['title']!r}  (id={video['id']})")

        if video.get("processed") and not reset:
            typer.echo("Already processed. Use --reset to re-run.")
            return
        if reset or video.get("processing_error"):
            supabase.table("videos").update(
                {"processed": False, "processing_error": None}
            ).eq("id", video["id"]).execute()
            typer.echo("Reset video flags — will re-process.")
    else:
        # Video not in DB yet — need playlist_id to create it
        if not playlist_id:
            typer.echo(
                f"Video {youtube_video_id} not found in DB. "
                "Provide --playlist-id so we can insert it.",
                err=True,
            )
            raise typer.Exit(1)

        # Verify playlist exists
        pl_resp = (
            supabase.table("playlists")
            .select("id, youtube_id, subject")
            .eq("id", playlist_id)
            .limit(1)
            .execute()
        )
        if not (pl_resp.data or []):
            typer.echo(f"Playlist {playlist_id} not found in DB.", err=True)
            raise typer.Exit(1)

        resolved_playlist_id = playlist_id

        # Fetch video metadata via yt-dlp and insert
        from services.youtube_service import get_playlist_videos
        import yt_dlp as _yt
        opts = {"quiet": True, "no_warnings": True, "extract_flat": True}
        with _yt.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={youtube_video_id}", download=False)

        row = {
            "playlist_id": resolved_playlist_id,
            "youtube_id": youtube_video_id,
            "title": info.get("title", youtube_video_id),
            "position": 0,
            "duration_seconds": info.get("duration"),
            "thumbnail_url": (info.get("thumbnails") or [{}])[-1].get("url"),
            "published_at": None,
        }
        resp = supabase.table("videos").upsert(row, on_conflict="youtube_id").execute()
        if not resp.data:
            typer.echo("ERROR: Failed to insert video row.", err=True)
            raise typer.Exit(1)
        video = resp.data[0]
        typer.echo(f"Inserted video: {video['title']!r}  (id={video['id']})")

    typer.echo(f"\nProcessing video {youtube_video_id} ...\n")

    from tasks.pipeline import _process_single_video
    _process_single_video(video, resolved_playlist_id)

    typer.echo(f"\nDone processing {youtube_video_id}.\n")


# ══════════════════════════════════════════════════════════════════════════════
# status
# ══════════════════════════════════════════════════════════════════════════════

@app.command()
def status(
    playlist_id: Optional[str] = typer.Argument(None, help="DB UUID of a specific playlist"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Show per-video detail"),
):
    """Show pipeline status for all playlists, or one specific playlist."""
    supabase = _get_supabase()

    if playlist_id:
        resp = (
            supabase.table("playlists")
            .select("id, youtube_id, title, subject, processed, processing_error, video_count")
            .eq("id", playlist_id)
            .limit(1)
            .execute()
        )
        playlists = resp.data or []
        if not playlists:
            typer.echo(f"Playlist {playlist_id} not found.")
            return
    else:
        playlists = (
            supabase.table("playlists")
            .select("id, youtube_id, title, subject, processed, processing_error, video_count")
            .order("created_at", desc=True)
            .execute()
            .data or []
        )

    if not playlists:
        typer.echo("No playlists in the database.")
        return

    for pl in playlists:
        pid = pl["id"]
        videos = (
            supabase.table("videos")
            .select("id, youtube_id, title, position, processed, processing_error")
            .eq("playlist_id", pid)
            .order("position")
            .execute()
            .data or []
        )
        total = len(videos)
        done  = sum(1 for v in videos if v.get("processed"))
        errs  = [v for v in videos if v.get("processing_error")]
        pct   = f"{done/total*100:.0f}%" if total else "—"

        status_icon = "DONE" if pl.get("processed") else ("ERR" if pl.get("processing_error") else "...")
        typer.echo(
            f"\n[{status_icon}] {pl.get('title', pl['youtube_id'])}"
            f"\n    id       : {pid}"
            f"\n    subject  : {pl.get('subject', '—')}"
            f"\n    progress : {done}/{total} videos  ({pct})"
        )
        if pl.get("processing_error"):
            typer.echo(f"    error    : {pl['processing_error']}")
        if errs:
            typer.echo(f"    failed   : {len(errs)} video(s) with errors")

        if verbose:
            for v in videos:
                icon = "ok" if v.get("processed") else ("!" if v.get("processing_error") else "-")
                label = v.get("title", v["youtube_id"])[:60]
                err_note = f"  ← {v['processing_error'][:60]}" if v.get("processing_error") else ""
                typer.echo(f"      [{icon}] {v['position']:>2}. {label}{err_note}")

    typer.echo()


# ══════════════════════════════════════════════════════════════════════════════
# entry point
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    app()
