"""
Full ingestion pipeline orchestration.

process_playlist(playlist_id) drives the entire pipeline:
  1.  Guard: skip if already processed.
  2.  Fetch playlist metadata → upsert to playlists.
  3.  Fetch all video metadata → upsert to videos.
  4.  For each video (ordered):
      a. Fetch transcript
      b. Chunk transcript
      c. Analyze video — ONE Gemini call → chunk metadata + keywords
      d. Compute term_density_score (regex, no Gemini)
      e. Embed chunks
      f. Upsert chunks to transcript_chunks
      g. Upsert vectors to Pinecone
      h. Upsert keywords to video_keywords
      i. Mark video processed=true
      j. Sleep 1s (1000 RPM allows fast processing)
  5.  Build glossary
  6.  Build heatmaps
  7.  Generate QA pairs
  8.  Generate playlist description (Gemini)
  9.  Mark playlist processed=true
"""

from __future__ import annotations

import logging
import re
import time
import uuid
import google.generativeai as genai

from config import get_settings
from db.supabase_client import get_supabase
from db.pinecone_client import get_index
from services.youtube_service import get_playlist_metadata, get_playlist_videos
from services.transcript_service import fetch_transcript, merge_short_segments, YouTubeIpBlockedError
from services.chunker import chunk_transcript
from services.video_analyzer import analyze_video
from services.embedder import embed_batch
from services.glossary_builder import build_glossary
from services.heatmap_builder import build_playlist_heatmap
from services.qa_generator import generate_qa_pairs

logger = logging.getLogger(__name__)

_AEROSPACE_TERMS_RE = re.compile(
    r"\b(lift|drag|thrust|pressure|velocity|reynolds|mach|bernoulli|navier|"
    r"turbulence|boundary|viscosity|compressib|supersonic|subsonic|transonic|"
    r"shock|airfoil|camber|stall|vortex|circulation|entropy|enthalpy|flutter|"
    r"aeroelast|bending|torsion|shear|fatigue|composite|laminate|aileron|"
    r"elevator|rudder|stability|phugoid|orbit|rocket|propellant|combustion|"
    r"nozzle|specific impulse|turbofan|compressor|turbine|finite element|"
    r"finite volume|computational fluid)\w*",
    re.IGNORECASE,
)


def _compute_term_density(text: str) -> float:
    words = text.split()
    if not words:
        return 0.0
    hits = len(_AEROSPACE_TERMS_RE.findall(text))
    return round(min(1.0, hits / len(words)), 4)


def _configure_gemini() -> None:
    genai.configure(api_key=get_settings().gemini_api_key)


def _gemini_with_retry(prompt: str, max_retries: int = 4) -> str:
    _configure_gemini()
    model = genai.GenerativeModel("gemini-2.5-flash")
    delay = 2.0  # 1000 RPM allows faster retries
    for attempt in range(max_retries):
        try:
            return model.generate_content(prompt).text
        except Exception as exc:
            if attempt == max_retries - 1:
                raise
            logger.warning("Gemini retry %d: %s", attempt + 1, exc)
            time.sleep(delay)
            delay *= 2
    return ""


def _upsert_playlist_metadata(playlist_id: str, youtube_id: str, subject: str) -> dict:
    """Fetch YouTube metadata and upsert the playlists row."""
    supabase = get_supabase()
    meta = get_playlist_metadata(youtube_id)
    row = {
        "id": playlist_id,
        "youtube_id": youtube_id,
        "title": meta["title"] or youtube_id,
        "subject": subject,
        "thumbnail_url": meta.get("thumbnail_url"),
        "video_count": meta.get("video_count", 0),
    }
    supabase.table("playlists").upsert(row, on_conflict="id").execute()
    return row


def _upsert_videos(playlist_id: str, youtube_id: str) -> list[dict]:
    """Fetch video list from YouTube and upsert all rows."""
    supabase = get_supabase()
    yt_videos = get_playlist_videos(youtube_id)

    db_videos: list[dict] = []
    for v in yt_videos:
        row = {
            "playlist_id": playlist_id,
            "youtube_id": v["youtube_id"],
            "title": v["title"],
            "position": v["position"],
            "duration_seconds": v.get("duration_seconds"),
            "thumbnail_url": v.get("thumbnail_url"),
            "published_at": v.get("published_at"),
        }
        resp = (
            supabase.table("videos")
            .upsert(row, on_conflict="youtube_id")
            .execute()
        )
        if resp.data:
            db_videos.append(resp.data[0])

    return db_videos


def _process_single_video(
    video: dict,
    playlist_id: str,
) -> None:
    """End-to-end processing for one video. Raises on hard failure."""
    supabase = get_supabase()
    index = get_index()
    video_id: str = video["id"]
    youtube_id: str = video["youtube_id"]

    logger.info("Processing video %s (%s)", video.get("title", youtube_id), youtube_id)

    # ── a. Fetch transcript ───────────────────────────────────────────────────
    raw_segments = fetch_transcript(youtube_id)
    segments = merge_short_segments(raw_segments)

    # ── b. Chunk transcript ───────────────────────────────────────────────────
    chunks = chunk_transcript(segments, video_id)
    if not chunks:
        logger.warning("No chunks produced for video %s", youtube_id)
        return

    # ── c. Single Gemini call: chunk metadata + keywords ─────────────────────
    analysis = analyze_video(video_id, chunks)
    chunk_metas = analysis["chunks"]   # one dict per chunk
    keywords = analysis["keywords"]    # 8-15 keyword dicts

    # ── d. Attach metadata + compute term_density (regex, no Gemini) ─────────
    enriched_chunks: list[dict] = []
    for chunk, meta in zip(chunks, chunk_metas):
        chunk["pedagogy_role"] = meta["role"]
        chunk["concept_depth_score"] = meta["concept_depth_score"]
        chunk["centrality_score"] = meta["centrality_score"]
        chunk["main_concept"] = meta.get("main_concept", "")
        chunk["term_density_score"] = _compute_term_density(chunk["text"])
        enriched_chunks.append(chunk)

    # ── f. Embed chunks ───────────────────────────────────────────────────────
    texts = [c["text"] for c in enriched_chunks]
    vectors = embed_batch(texts, task_type="retrieval_document")

    # ── g. Upsert chunks to transcript_chunks ─────────────────────────────────
    pinecone_records: list[dict] = []
    for chunk, vector in zip(enriched_chunks, vectors):
        # Deterministic ID so partial re-runs stay idempotent
        chunk_uuid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{video_id}:{chunk['chunk_index']}"))
        pinecone_id = chunk_uuid

        db_row = {
            "id": chunk_uuid,
            "video_id": video_id,
            "playlist_id": playlist_id,
            "chunk_index": chunk["chunk_index"],
            "text": chunk["text"],
            "start_time": chunk["start_time"],
            "end_time": chunk["end_time"],
            "pedagogy_role": chunk["pedagogy_role"],
            "concept_depth_score": chunk["concept_depth_score"],
            "term_density_score": chunk["term_density_score"],
            "centrality_score": chunk["centrality_score"],
            "pinecone_id": pinecone_id,
        }
        try:
            supabase.table("transcript_chunks").upsert(
                db_row,
                on_conflict="pinecone_id",
            ).execute()
        except Exception as exc:
            logger.error("Chunk DB upsert failed: %s", exc)
            continue

        # ── h. Build Pinecone record ──────────────────────────────────────────
        if any(v != 0.0 for v in vector):
            pinecone_records.append(
                {
                    "id": pinecone_id,
                    "values": vector,
                    "metadata": {
                        "video_id": video_id,
                        "playlist_id": playlist_id,
                        "start_time": chunk["start_time"],
                        "pedagogy_role": chunk["pedagogy_role"],
                        "depth_score": chunk["concept_depth_score"],
                        "centrality_score": chunk["centrality_score"],
                        "chunk_index": chunk["chunk_index"],
                        "video_title": video.get("title", ""),
                    },
                }
            )

    # ── h. Upsert to Pinecone in batches of 100 ───────────────────────────────
    batch_size = 100
    for i in range(0, len(pinecone_records), batch_size):
        try:
            index.upsert(vectors=pinecone_records[i : i + batch_size])
        except Exception as exc:
            logger.error("Pinecone batch upsert failed: %s", exc)

    # ── i. Upsert keywords ────────────────────────────────────────────────────
    for kw in keywords:
        try:
            supabase.table("video_keywords").upsert(
                {
                    "video_id": video_id,
                    "keyword": kw["keyword"],
                    "importance_score": kw["importance_score"],
                    "frequency": kw["frequency"],
                    "pedagogy_context": kw["pedagogy_context"],
                },
                on_conflict="video_id,keyword",
            ).execute()
        except Exception as exc:
            logger.warning("Keyword upsert failed for '%s': %s", kw["keyword"], exc)

    # ── j. Mark video as processed and clear any stale error ─────────────────
    supabase.table("videos").update(
        {"processed": True, "processing_error": None}
    ).eq("id", video_id).execute()
    logger.info("Video %s done — %d chunks, %d keywords", youtube_id, len(enriched_chunks), len(keywords))


def _generate_playlist_description(playlist_id: str, title: str, subject: str) -> str:
    """Summarise the playlist in 3 sentences using glossary terms + video titles."""
    supabase = get_supabase()

    terms_resp = (
        supabase.table("glossary")
        .select("term")
        .eq("playlist_id", playlist_id)
        .order("importance_score", desc=True)
        .limit(10)
        .execute()
    )
    top_terms = [r["term"] for r in (terms_resp.data or [])]

    titles_resp = (
        supabase.table("videos")
        .select("title")
        .eq("playlist_id", playlist_id)
        .order("position")
        .limit(5)
        .execute()
    )
    sample_titles = [r["title"] for r in (titles_resp.data or [])]

    prompt = (
        f"Write a 3-sentence academic description for an online playlist titled "
        f"'{title}' covering the subject '{subject}'.\n"
        f"Key concepts covered: {', '.join(top_terms)}.\n"
        f"Sample lecture titles: {'; '.join(sample_titles)}.\n"
        "Be concise and informative. Do NOT use bullet points."
    )
    try:
        return _gemini_with_retry(prompt).strip()
    except Exception as exc:
        logger.warning("Playlist description generation failed: %s", exc)
        return f"A comprehensive lecture series on {subject} covering {', '.join(top_terms[:3])}."


def process_playlist(playlist_id: str) -> None:
    """
    Main pipeline entry point. Called as a FastAPI background task.
    Safe to call: guard at step 1 prevents re-processing.
    """
    supabase = get_supabase()

    # ── 1. Guard ──────────────────────────────────────────────────────────────
    pl_resp = (
        supabase.table("playlists")
        .select("id, youtube_id, subject, title, processed")
        .eq("id", playlist_id)
        .maybe_single()
        .execute()
    )
    if not pl_resp.data:
        logger.error("Playlist %s not found in DB", playlist_id)
        return

    playlist = pl_resp.data
    if playlist.get("processed"):
        logger.info("Playlist %s already processed — skipping", playlist_id)
        return

    youtube_id: str = playlist["youtube_id"]
    subject: str = playlist.get("subject", "Aerospace Engineering")

    try:
        # ── 2. Playlist metadata ──────────────────────────────────────────────
        logger.info("Fetching playlist metadata for %s", youtube_id)
        pl_meta = _upsert_playlist_metadata(playlist_id, youtube_id, subject)
        title = pl_meta.get("title", youtube_id)

        # ── 3. Videos ─────────────────────────────────────────────────────────
        logger.info("Fetching video list for playlist %s", youtube_id)
        db_videos = _upsert_videos(playlist_id, youtube_id)

        # ── 4. Per-video processing ───────────────────────────────────────────
        failed_videos: list[str] = []
        ip_blocked = False

        for video in sorted(db_videos, key=lambda v: v.get("position", 0)):
            if video.get("processed"):
                logger.info("Video %s already processed — skipping", video.get("youtube_id"))
                continue

            vid_yt_id = video.get("youtube_id", video.get("id"))
            try:
                _process_single_video(video, playlist_id)
            except YouTubeIpBlockedError as exc:
                logger.error(
                    "YouTube IP block detected on video %s — "
                    "stopping all remaining videos to avoid wasted failures.",
                    vid_yt_id,
                )
                supabase.table("videos").update(
                    {"processing_error": str(exc)}
                ).eq("id", video["id"]).execute()
                failed_videos.append(vid_yt_id)
                ip_blocked = True
                break  # do not burn through remaining videos
            except Exception as exc:
                logger.error("Video %s failed: %s", vid_yt_id, exc, exc_info=True)
                supabase.table("videos").update(
                    {"processing_error": str(exc)}
                ).eq("id", video["id"]).execute()
                failed_videos.append(vid_yt_id)

            time.sleep(1.0)  # 1000 RPM allows fast processing + YouTube politeness

        if failed_videos:
            reason = (
                f"IP blocked by YouTube after video {failed_videos[0]}. "
                f"Wait a few hours then re-trigger to resume."
                if ip_blocked
                else f"Failed videos: {failed_videos}. Re-trigger to retry."
            )
            logger.warning(
                "Pipeline for playlist %s completed with %d failed video(s). %s",
                playlist_id, len(failed_videos), reason,
            )
            supabase.table("playlists").update(
                {"processing_error": reason}
            ).eq("id", playlist_id).execute()
            return

        # ── 5. Glossary ───────────────────────────────────────────────────────
        logger.info("Building glossary for playlist %s", playlist_id)
        build_glossary(playlist_id)

        # ── 6. Heatmaps ───────────────────────────────────────────────────────
        logger.info("Building heatmaps for playlist %s", playlist_id)
        build_playlist_heatmap(playlist_id)

        # ── 7. QA pairs ───────────────────────────────────────────────────────
        logger.info("Generating QA pairs for playlist %s", playlist_id)
        generate_qa_pairs(playlist_id, n_pairs=50)

        # ── 8. Playlist description ───────────────────────────────────────────
        logger.info("Generating playlist description for %s", playlist_id)
        description = _generate_playlist_description(playlist_id, title, subject)

        # ── 9. Mark processed ─────────────────────────────────────────────────
        supabase.table("playlists").update(
            {
                "processed": True,
                "description": description,
                "processing_error": None,
            }
        ).eq("id", playlist_id).execute()

        logger.info("Pipeline complete for playlist %s", playlist_id)

    except Exception as exc:
        logger.critical(
            "Pipeline failed for playlist %s: %s",
            playlist_id,
            exc,
            exc_info=True,
        )
        supabase.table("playlists").update(
            {"processing_error": str(exc)}
        ).eq("id", playlist_id).execute()
