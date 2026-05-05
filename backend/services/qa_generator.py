"""
QA pair generation from lecture chunks.

- 80% single-video QA from derivation/explanation chunks.
- 20% cross-video QA using pairs of chunks sharing a glossary term.
- Difficulty is derived from concept_depth_score.
- All pairs upserted idempotently to qa_pairs table.
"""

from __future__ import annotations

import json
import logging
import random
import time
from collections import defaultdict

import google.generativeai as genai

from config import get_settings
from db.supabase_client import get_supabase

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


def _parse_json_response(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            pass
    return {}


def _depth_to_difficulty(depth_score: float) -> str:
    if depth_score >= 0.7:
        return "advanced"
    if depth_score >= 0.4:
        return "intermediate"
    return "basic"


def _generate_single_qa(chunk: dict) -> dict | None:
    depth = float(chunk.get("concept_depth_score", 0.5))
    difficulty = _depth_to_difficulty(depth)
    prompt = (
        "Generate one technical question and a detailed answer from this "
        f"aerospace lecture transcript chunk.\n"
        f"Question should require understanding, not just recall.\n"
        f"Difficulty: {difficulty}\n\n"
        f"TRANSCRIPT CHUNK:\n{chunk.get('text', '')[:2000]}\n\n"
        'Return ONLY valid JSON in the form: {"question": "...", "answer": "...", "difficulty": "..."}'
    )
    try:
        raw = _call_gemini_with_retry(prompt)
        parsed = _parse_json_response(raw)
        if parsed.get("question") and parsed.get("answer"):
            return {
                "question": parsed["question"],
                "answer": parsed["answer"],
                "difficulty": parsed.get("difficulty", difficulty),
            }
    except Exception as exc:
        logger.warning("Single QA generation failed: %s", exc)
    return None


def _generate_cross_video_qa(chunk_a: dict, chunk_b: dict) -> dict | None:
    prompt = (
        "Generate a question that requires understanding from BOTH of these "
        "aerospace lecture segments, and write a synthesised answer.\n\n"
        f"SEGMENT 1:\n{chunk_a.get('text', '')[:1500]}\n\n"
        f"SEGMENT 2:\n{chunk_b.get('text', '')[:1500]}\n\n"
        'Return ONLY valid JSON: {"question": "...", "answer": "...", "difficulty": "..."}'
    )
    try:
        raw = _call_gemini_with_retry(prompt)
        parsed = _parse_json_response(raw)
        if parsed.get("question") and parsed.get("answer"):
            depth = (
                float(chunk_a.get("concept_depth_score", 0.5))
                + float(chunk_b.get("concept_depth_score", 0.5))
            ) / 2
            return {
                "question": parsed["question"],
                "answer": parsed["answer"],
                "difficulty": parsed.get("difficulty", _depth_to_difficulty(depth)),
            }
    except Exception as exc:
        logger.warning("Cross-video QA generation failed: %s", exc)
    return None


def generate_qa_pairs(playlist_id: str, n_pairs: int = 50) -> None:
    """Generate and upsert QA pairs for a playlist."""
    supabase = get_supabase()

    # Fetch all videos
    videos_resp = (
        supabase.table("videos")
        .select("id")
        .eq("playlist_id", playlist_id)
        .execute()
    )
    video_ids = [v["id"] for v in (videos_resp.data or [])]
    if not video_ids:
        return

    # Fetch chunks, prefer derivation/explanation roles
    chunks_resp = (
        supabase.table("transcript_chunks")
        .select("id, video_id, text, pedagogy_role, concept_depth_score")
        .eq("playlist_id", playlist_id)
        .in_("pedagogy_role", ["derivation", "explanation", "application"])
        .execute()
    )
    all_chunks = chunks_resp.data or []

    # Group by video_id
    by_video: dict[str, list[dict]] = defaultdict(list)
    for c in all_chunks:
        by_video[c["video_id"]].append(c)

    # Select 2 chunks per video (highest depth_score)
    selected_chunks: list[dict] = []
    for vid_id in video_ids:
        vid_chunks = sorted(
            by_video.get(vid_id, []),
            key=lambda c: float(c.get("concept_depth_score", 0)),
            reverse=True,
        )
        selected_chunks.extend(vid_chunks[:2])

    if not selected_chunks:
        logger.warning("No suitable chunks found for QA generation in playlist %s", playlist_id)
        return

    # ── Glossary term → chunk_ids for cross-video pairing ─────────────────────
    glossary_resp = (
        supabase.table("glossary")
        .select("term")
        .eq("playlist_id", playlist_id)
        .execute()
    )
    glossary_terms = [r["term"] for r in (glossary_resp.data or [])]

    # Build term → chunks mapping
    term_chunks: dict[str, list[dict]] = defaultdict(list)
    for chunk in selected_chunks:
        text_lower = chunk.get("text", "").lower()
        for term in glossary_terms:
            if term.lower() in text_lower:
                term_chunks[term].append(chunk)

    # Cross-video pairs: find terms that appear in chunks from ≥2 different videos
    cross_pairs: list[tuple[dict, dict]] = []
    for term, chunks in term_chunks.items():
        vid_chunk_map: dict[str, dict] = {}
        for c in chunks:
            vid_chunk_map[c["video_id"]] = c
        vids = list(vid_chunk_map.keys())
        if len(vids) >= 2:
            cross_pairs.append((vid_chunk_map[vids[0]], vid_chunk_map[vids[1]]))

    # Target counts
    n_cross = max(1, int(n_pairs * 0.2))
    n_single = n_pairs - n_cross

    random.shuffle(selected_chunks)
    random.shuffle(cross_pairs)

    qa_rows: list[dict] = []

    # ── Single-video QA ───────────────────────────────────────────────────────
    for chunk in selected_chunks[:n_single]:
        qa = _generate_single_qa(chunk)
        if qa:
            qa_rows.append(
                {
                    "playlist_id": playlist_id,
                    "question": qa["question"],
                    "answer": qa["answer"],
                    "source_chunks": [chunk["id"]],
                    "cross_video": False,
                    "difficulty": qa["difficulty"],
                }
            )
        time.sleep(0.1)  # 1000 RPM allows minimal delays

    # ── Cross-video QA ────────────────────────────────────────────────────────
    for ca, cb in cross_pairs[:n_cross]:
        qa = _generate_cross_video_qa(ca, cb)
        if qa:
            qa_rows.append(
                {
                    "playlist_id": playlist_id,
                    "question": qa["question"],
                    "answer": qa["answer"],
                    "source_chunks": [ca["id"], cb["id"]],
                    "cross_video": True,
                    "difficulty": qa["difficulty"],
                }
            )
        time.sleep(0.1)  # 1000 RPM allows minimal delays

    # ── Upsert ────────────────────────────────────────────────────────────────
    for row in qa_rows:
        try:
            supabase.table("qa_pairs").insert(row).execute()
        except Exception as exc:
            logger.error("QA upsert failed: %s", exc)

    logger.info(
        "Generated %d QA pairs for playlist %s (%d cross-video)",
        len(qa_rows), playlist_id, sum(1 for r in qa_rows if r["cross_video"]),
    )
