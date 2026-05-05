"""
YouTube metadata via yt-dlp (no API key required).

Replaces the previous google.googleapis.com/youtube/v3 calls.

yt-dlp is used in metadata-only mode (download=False, extract_flat='in_playlist')
so it never downloads video files — it just scrapes the YouTube page.

Public API (unchanged from previous version):
    get_playlist_metadata(playlist_id) -> dict
    get_playlist_videos(playlist_id)   -> list[dict]
"""

from __future__ import annotations

import datetime
import logging
from typing import Any

import yt_dlp

logger = logging.getLogger(__name__)

# Suppress yt-dlp's own console output; we use our logger instead.
_YDL_QUIET_OPTS: dict[str, Any] = {
    "quiet": True,
    "no_warnings": True,
    "ignoreerrors": False,
}


def _best_thumbnail(thumbnails: list[dict] | None) -> str | None:
    """Return the URL of the highest-resolution thumbnail available."""
    if not thumbnails:
        return None
    # Sort by area (width * height) descending; fall back to list order.
    def area(t: dict) -> int:
        return (t.get("width") or 0) * (t.get("height") or 0)
    return max(thumbnails, key=area).get("url")


def _ts_to_iso(ts: int | float | None) -> str | None:
    """Convert a Unix timestamp to an ISO-8601 string (UTC), or None."""
    if ts is None:
        return None
    try:
        return datetime.datetime.fromtimestamp(
            float(ts), tz=datetime.timezone.utc
        ).isoformat()
    except Exception:
        return None


def get_playlist_metadata(playlist_id: str) -> dict:
    """
    Fetch title, description, thumbnail_url, and video_count for a playlist.

    Returns:
        {title, description, thumbnail_url, video_count}
    """
    url = f"https://www.youtube.com/playlist?list={playlist_id}"
    opts = {**_YDL_QUIET_OPTS, "extract_flat": "in_playlist"}

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    if not info:
        raise ValueError(f"Playlist {playlist_id} not found on YouTube")

    entries = info.get("entries") or []
    return {
        "title": info.get("title") or playlist_id,
        "description": info.get("description") or "",
        "thumbnail_url": _best_thumbnail(info.get("thumbnails")),
        "video_count": info.get("playlist_count") or len(entries),
    }


def get_playlist_videos(playlist_id: str) -> list[dict]:
    """
    Return all videos in a playlist ordered by position.

    Each entry:
        {youtube_id, title, position, duration_seconds, thumbnail_url, published_at}

    Uses extract_flat='in_playlist' so only playlist-page scraping is done —
    no per-video page fetches, fast and equivalent to the old Data API call.
    """
    url = f"https://www.youtube.com/playlist?list={playlist_id}"
    opts = {**_YDL_QUIET_OPTS, "extract_flat": "in_playlist"}

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    if not info:
        raise ValueError(f"Playlist {playlist_id} not found on YouTube")

    entries = info.get("entries") or []
    videos: list[dict] = []

    for position, entry in enumerate(entries):
        if not entry:
            continue

        video_id = entry.get("id") or entry.get("url", "").split("v=")[-1]
        if not video_id:
            logger.warning("Skipping playlist entry with no video ID at position %d", position)
            continue

        # release_timestamp is set for published videos; timestamp is upload epoch
        ts = entry.get("release_timestamp") or entry.get("timestamp")

        thumbnails = entry.get("thumbnails") or []
        thumbnail_url = _best_thumbnail(thumbnails)
        # Fallback: construct the standard hqdefault URL if yt-dlp gives nothing
        if not thumbnail_url:
            thumbnail_url = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

        videos.append(
            {
                "youtube_id": video_id,
                "title": entry.get("title") or video_id,
                "position": position,
                "duration_seconds": entry.get("duration"),
                "thumbnail_url": thumbnail_url,
                "published_at": _ts_to_iso(ts),
            }
        )

    logger.info("Fetched %d videos from playlist %s via yt-dlp", len(videos), playlist_id)
    return videos
