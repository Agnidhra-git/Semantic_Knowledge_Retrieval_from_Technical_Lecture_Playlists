"""
Glossary construction:
  1. Collect all unique keywords across videos in the playlist.
  2. Find first occurrence, best chunk IDs per pedagogy role.
  3. Generate 2-sentence definitions via Gemini.
  4. Compute related_terms by co-occurrence across chunks.
  5. Embed term+definition → upsert to Pinecone.
  6. Upsert all to glossary table.
"""

from __future__ import annotations

import logging
import time
import json
from collections import defaultdict

import google.generativeai as genai

from config import get_settings
from db.supabase_client import get_supabase
from db.pinecone_client import get_index
from services.embedder import embed_text

logger = logging.getLogger(__name__)


def _configure_gemini() -> None:
    genai.configure(api_key=get_settings().gemini_api_key)


def _call_gemini_with_retry(prompt: str, max_retries: int = 4) -> str:
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


def _generate_definition(term: str, context_text: str) -> str:
    """Ask Gemini for a 2-sentence aerospace-engineering definition of term."""
    prompt = (
        f"Define the aerospace engineering term '{term}' in exactly 2 sentences. "
        f"Use this lecture excerpt as context:\n\n{context_text[:1500]}\n\n"
        "Reply with ONLY the 2-sentence definition. No bullet points, no markdown."
    )
    try:
        return _call_gemini_with_retry(prompt).strip()
    except Exception as exc:
        logger.warning("Definition generation failed for '%s': %s", term, exc)
        return ""


def build_glossary(playlist_id: str) -> None:
    """Full glossary build for a playlist. Safe to re-run (upsert-idempotent)."""
    supabase = get_supabase()
    index = get_index()

    # ── 1. Collect all video keywords for this playlist ──────────────────────
    videos_resp = (
        supabase.table("videos")
        .select("id, position")
        .eq("playlist_id", playlist_id)
        .order("position")
        .execute()
    )
    videos = videos_resp.data or []
    video_ids = [v["id"] for v in videos]
    video_position_map = {v["id"]: v["position"] for v in videos}

    if not video_ids:
        logger.warning("No videos found for playlist %s", playlist_id)
        return

    kw_resp = (
        supabase.table("video_keywords")
        .select("video_id, keyword, importance_score")
        .in_("video_id", video_ids)
        .execute()
    )
    all_keywords = kw_resp.data or []

    # Aggregate: term → {video_ids, max_importance}
    term_videos: dict[str, list[str]] = defaultdict(list)
    term_max_importance: dict[str, float] = {}
    for row in all_keywords:
        t = row["keyword"].strip().lower()
        vid = row["video_id"]
        imp = float(row.get("importance_score", 0.0))
        if vid not in term_videos[t]:
            term_videos[t].append(vid)
        term_max_importance[t] = max(term_max_importance.get(t, 0.0), imp)

    if not term_videos:
        logger.warning("No keywords found for playlist %s", playlist_id)
        return

    # ── 2. Fetch all transcript chunks for role-based lookups ─────────────────
    chunks_resp = (
        supabase.table("transcript_chunks")
        .select(
            "id, video_id, text, start_time, pedagogy_role,"
            " concept_depth_score"
        )
        .eq("playlist_id", playlist_id)
        .execute()
    )
    all_chunks = chunks_resp.data or []

    # Build co-occurrence index: chunk_id → set of keywords present
    chunk_term_map: dict[str, set[str]] = {}
    for chunk in all_chunks:
        text_lower = chunk.get("text", "").lower()
        present = {t for t in term_videos if t in text_lower}
        chunk_term_map[chunk["id"]] = present

    # Co-occurrence counts: (term_a, term_b) → count
    co_occur: dict[tuple[str, str], int] = defaultdict(int)
    for terms_in_chunk in chunk_term_map.values():
        terms_list = sorted(terms_in_chunk)
        for i, ta in enumerate(terms_list):
            for tb in terms_list[i + 1 :]:
                co_occur[(ta, tb)] += 1
                co_occur[(tb, ta)] += 1

    def _related_terms(term: str, n: int = 3) -> list[str]:
        candidates = [
            (count, other)
            for (t, other), count in co_occur.items()
            if t == term and count > 2
        ]
        candidates.sort(reverse=True)
        return [other for _, other in candidates[:n]]

    # ── 3. For each term, identify best chunks per role ────────────────────────
    def _best_chunk_for_role(term: str, role: str) -> dict | None:
        matches = [
            c for c in all_chunks
            if c.get("pedagogy_role") == role
            and term in c.get("text", "").lower()
        ]
        if not matches:
            return None
        return max(matches, key=lambda c: float(c.get("concept_depth_score", 0)))

    def _first_occurrence(term: str) -> tuple[str | None, float | None]:
        """Return (video_id, start_time) of earliest introduction chunk."""
        intro_chunks = [
            c for c in all_chunks
            if c.get("pedagogy_role") == "introduction"
            and term in c.get("text", "").lower()
        ]
        if not intro_chunks:
            # Fall back to any role
            intro_chunks = [
                c for c in all_chunks
                if term in c.get("text", "").lower()
            ]
        if not intro_chunks:
            return None, None
        # Sort by video position then start_time
        intro_chunks.sort(
            key=lambda c: (video_position_map.get(c["video_id"], 9999), c.get("start_time", 0))
        )
        first = intro_chunks[0]
        return first["video_id"], first.get("start_time")

    # ── 4. Build and upsert glossary entries ──────────────────────────────────
    for term, vids in term_videos.items():
        best_intro = _best_chunk_for_role(term, "introduction")
        best_deriv = _best_chunk_for_role(term, "derivation")
        best_expl = _best_chunk_for_role(term, "explanation")

        # Choose best context text for definition generation
        context_chunk = best_expl or best_intro or best_deriv
        context_text = context_chunk.get("text", "") if context_chunk else ""

        definition = _generate_definition(term, context_text) if context_text else ""
        first_vid_id, first_ts = _first_occurrence(term)
        related = _related_terms(term)
        importance = term_max_importance.get(term, 0.0)

        # Embed term+definition for Pinecone
        embed_text_str = f"{term}: {definition}" if definition else term
        try:
            vector = embed_text(embed_text_str, task_type="retrieval_document")
        except Exception as exc:
            logger.error("Embedding failed for glossary term '%s': %s", term, exc)
            vector = [0.0] * 768

        # Unique Pinecone vector ID for glossary
        pinecone_id = f"glossary::{playlist_id}::{term}"

        try:
            index.upsert(
                vectors=[
                    {
                        "id": pinecone_id,
                        "values": vector,
                        "metadata": {
                            "type": "glossary",
                            "playlist_id": playlist_id,
                            "term": term,
                        },
                    }
                ]
            )
        except Exception as exc:
            logger.error("Pinecone upsert failed for glossary term '%s': %s", term, exc)

        row: dict = {
            "playlist_id": playlist_id,
            "term": term,
            "definition": definition,
            "importance_score": importance,
            "related_terms": related,
            "pinecone_id": pinecone_id,
        }
        if first_vid_id:
            row["first_video_id"] = first_vid_id
        if first_ts is not None:
            row["first_timestamp"] = first_ts
        if best_intro:
            row["best_intro_chunk_id"] = best_intro["id"]
        if best_deriv:
            row["best_deriv_chunk_id"] = best_deriv["id"]
        if best_expl:
            row["best_expl_chunk_id"] = best_expl["id"]

        try:
            supabase.table("glossary").upsert(
                row, on_conflict="playlist_id,term"
            ).execute()
        except Exception as exc:
            logger.error("Glossary DB upsert failed for term '%s': %s", term, exc)

        # 1000 RPM allows minimal delays between definition calls
        time.sleep(0.1)

    logger.info("Glossary built for playlist %s (%d terms)", playlist_id, len(term_videos))
