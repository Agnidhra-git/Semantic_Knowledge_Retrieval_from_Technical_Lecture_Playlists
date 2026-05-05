"""
Core semantic search engine.

MODE 1 — Global semantic search (across all playlists).
MODE 2 — Scoped search (within a single playlist).

Re-ranking formula:
  final_score = 0.4×cosine_sim + 0.25×depth_score
              + 0.2×centrality_score + 0.15×role_weight
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import datetime, timezone

import google.generativeai as genai

from config import get_settings
from db.supabase_client import get_supabase
from db.pinecone_client import get_index
from services.embedder import embed_text

logger = logging.getLogger(__name__)

_ROLE_WEIGHTS: dict[str, float] = {
    "introduction": 1.0,
    "derivation": 0.9,
    "explanation": 0.8,
    "application": 0.7,
    "comparison": 0.6,
    "example": 0.5,
    "summary": 0.4,
    "tangential": 0.1,
}

# Pedagogy quality scores for learning optimization
_PEDAGOGY_QUALITY: dict[str, float] = {
    "introduction": 0.95,
    "derivation": 0.90,
    "explanation": 0.80,
    "comparison": 0.70,
    "application": 0.60,
    "example": 0.50,
    "summary": 0.40,
    "tangential": 0.10,
}


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


def generate_relevance_reason(query: str, chunk_text: str, role: str) -> str:
    """One-sentence explanation (≤15 words) of why this chunk matches the query."""
    prompt = (
        f"In 15 words or fewer, explain why this {role} passage answers the query:\n"
        f"Query: {query}\n"
        f"Passage (first 300 chars): {chunk_text[:300]}\n"
        "Reply with ONLY the explanation sentence."
    )
    try:
        return _call_gemini_with_retry(prompt).strip()
    except Exception as exc:
        logger.warning("relevance_reason call failed: %s", exc)
        return f"Relevant {role} passage about the queried concept."


def _rerank_score(
    cosine_sim: float,
    chunk_meta: dict,
    first_occurrence_bonus: float = 0.0,
    cross_video_bonus: float = 0.0,
) -> float:
    """Learning-optimized ranking formula.
    
    Args:
        cosine_sim: Vector similarity score (0-1)
        chunk_meta: Dict with pedagogy_role, concept_depth_score, centrality_score
        first_occurrence_bonus: Bonus if chunk is near first definition (0-1)
        cross_video_bonus: Bonus if concept spans multiple videos (0-1)
    
    Returns:
        Final score combining semantic relevance with pedagogical value
    """
    role = chunk_meta.get("pedagogy_role", "tangential")
    pedagogy_quality = _PEDAGOGY_QUALITY.get(role, 0.1)
    depth = float(chunk_meta.get("concept_depth_score", 0.0))
    
    # Learning-optimized formula
    return (
        0.30 * cosine_sim
        + 0.25 * pedagogy_quality
        + 0.20 * depth
        + 0.15 * first_occurrence_bonus
        + 0.10 * cross_video_bonus
    )


def _get_cached_results(
    query_text: str, scope: str, pedagogy_roles: list[str] | None = None
) -> list[dict] | None:
    """Get cached search results. Cache key includes filters."""
    cache_key = f"{query_text}::{scope}::{','.join(sorted(pedagogy_roles or []))}"
    qhash = hashlib.sha256(cache_key.encode()).hexdigest()
    supabase = get_supabase()
    try:
        row = (
            supabase.table("search_cache")
            .select("results, expires_at")
            .eq("query_hash", qhash)
            .maybe_single()
            .execute()
        )
        if row.data:
            expires_at = datetime.fromisoformat(row.data["expires_at"].replace("Z", "+00:00"))
            if expires_at > datetime.now(timezone.utc):
                return row.data["results"]
    except Exception:
        pass
    return None


def _set_cached_results(
    query_text: str, scope: str, results: list[dict], pedagogy_roles: list[str] | None = None
) -> None:
    """Set cached search results. Cache key includes filters."""
    cache_key = f"{query_text}::{scope}::{','.join(sorted(pedagogy_roles or []))}"
    qhash = hashlib.sha256(cache_key.encode()).hexdigest()
    supabase = get_supabase()
    try:
        supabase.table("search_cache").upsert(
            {
                "query_hash": qhash,
                "query_text": query_text,
                "scope": scope,
                "results": results,
            },
            on_conflict="query_hash",
        ).execute()
    except Exception as exc:
        logger.warning("Cache write failed: %s", exc)


def semantic_search(
    query: str,
    scope: str = "global",
    top_k: int = 5,
    use_cache: bool = True,
    pedagogy_roles: list[str] | None = None,
    min_depth_score: float | None = None,
) -> list[dict]:
    """
    Perform semantic search with optional filters.

    Args:
        query:   User search string.
        scope:   "global" or a playlist_id UUID string.
        top_k:   Number of final results to return.
        use_cache: Whether to check/write the search_cache table.
        pedagogy_roles: Optional list of pedagogy roles to filter by.
        min_depth_score: Optional minimum concept depth score (0-1).

    Returns list of result dicts with video metadata and deep-link URLs.
    """
    if use_cache:
        cached = _get_cached_results(query, scope, pedagogy_roles)
        if cached is not None:
            return cached[:top_k]

    # 1. Embed query
    query_vector = embed_text(query, task_type="retrieval_query")

    # 2. Build Pinecone filter
    pinecone_filter: dict = {}
    if scope != "global":
        pinecone_filter["playlist_id"] = {"$eq": scope}
    if pedagogy_roles:
        pinecone_filter["pedagogy_role"] = {"$in": pedagogy_roles}
    if min_depth_score is not None:
        pinecone_filter["depth_score"] = {"$gte": min_depth_score}
    
    # 3. Query Pinecone with increased top_k when filters applied
    index = get_index()
    retrieval_k = 50 if (pedagogy_roles or min_depth_score) else 20
    pinecone_kwargs: dict = {
        "vector": query_vector,
        "top_k": retrieval_k,
        "include_metadata": True
    }
    if pinecone_filter:
        pinecone_kwargs["filter"] = pinecone_filter

    pinecone_resp = index.query(**pinecone_kwargs)
    matches = pinecone_resp.get("matches", [])
    if not matches:
        return []

    # 3. Fetch full chunks from Supabase
    supabase = get_supabase()
    chunk_ids = [m["id"] for m in matches]
    chunks_resp = (
        supabase.table("transcript_chunks")
        .select(
            "id, video_id, playlist_id, text, start_time, end_time,"
            " pedagogy_role, concept_depth_score, centrality_score, pinecone_id"
        )
        .in_("pinecone_id", chunk_ids)
        .execute()
    )
    chunk_map = {c["pinecone_id"]: c for c in (chunks_resp.data or [])}

    # 4. Fetch video titles
    video_ids = list({c["video_id"] for c in chunk_map.values()})
    videos_resp = (
        supabase.table("videos")
        .select("id, title, youtube_id")
        .in_("id", video_ids)
        .execute()
    )
    video_map = {v["id"]: v for v in (videos_resp.data or [])}

    # 5. Detect first occurrences from glossary (for bonus scoring)
    first_occurrence_map: dict[str, dict] = {}
    try:
        # Extract potential glossary terms from query (simple word extraction)
        query_terms = [w.lower() for w in query.split() if len(w) > 3]
        if query_terms and scope != "global":
            glossary_resp = (
                supabase.table("glossary")
                .select("term, first_video_id, first_timestamp")
                .eq("playlist_id", scope)
                .in_("term", query_terms)
                .execute()
            )
            for g in (glossary_resp.data or []):
                first_occurrence_map[g["first_video_id"]] = {
                    "timestamp": g["first_timestamp"],
                    "term": g["term"],
                }
    except Exception as exc:
        logger.warning("First occurrence lookup failed: %s", exc)

    # 6. Detect cross-video concepts (concepts appearing in 3+ videos)
    cross_video_bonus_val = 0.0
    try:
        if scope != "global":
            # Count unique videos containing query keywords
            keyword_videos = (
                supabase.table("video_keywords")
                .select("video_id")
                .eq("playlist_id", scope)
                .ilike("keyword", f"%{query.split()[0] if query.split() else query}%")
                .execute()
            )
            unique_videos = len(set(k["video_id"] for k in (keyword_videos.data or [])))
            if unique_videos >= 3:
                cross_video_bonus_val = 1.0
    except Exception as exc:
        logger.warning("Cross-video detection failed: %s", exc)

    # 7. Re-rank with learning-optimized scoring
    scored: list[tuple[float, dict, dict]] = []
    for match in matches:
        pid = match["id"]
        chunk = chunk_map.get(pid)
        if not chunk:
            continue
        cosine_sim = float(match.get("score", 0.0))
        
        # Calculate first occurrence bonus
        first_occ_bonus = 0.0
        video_id = chunk.get("video_id")
        chunk_start = chunk.get("start_time", 0)
        if video_id in first_occurrence_map:
            first_ts = first_occurrence_map[video_id]["timestamp"]
            # Bonus if within ±60s of first occurrence
            if abs(chunk_start - first_ts) <= 60:
                first_occ_bonus = 1.0
        
        final_score = _rerank_score(
            cosine_sim, chunk, first_occ_bonus, cross_video_bonus_val
        )
        scored.append((final_score, chunk, match))

    scored.sort(key=lambda x: x[0], reverse=True)
    top_matches = scored[:top_k]

    # 6. Build results with relevance reasons (one Gemini call per result)
    results: list[dict] = []
    for final_score, chunk, _match in top_matches:
        video = video_map.get(chunk["video_id"], {})
        youtube_id = video.get("youtube_id", "")
        ts = int(chunk.get("start_time", 0))
        youtube_url = f"https://www.youtube.com/watch?v={youtube_id}&t={ts}s" if youtube_id else ""
        role = chunk.get("pedagogy_role", "explanation")
        reason = generate_relevance_reason(query, chunk.get("text", ""), role)

        results.append(
            {
                "video_id": chunk["video_id"],
                "video_title": video.get("title", ""),
                "playlist_id": chunk["playlist_id"],
                "timestamp_seconds": ts,
                "youtube_url": youtube_url,
                "snippet_text": chunk.get("text", "")[:500],
                "pedagogy_role": role,
                "confidence_score": round(final_score, 4),
                "relevance_reason": reason,
            }
        )

    if use_cache and results:
        _set_cached_results(query, scope, results, pedagogy_roles)

    return results
