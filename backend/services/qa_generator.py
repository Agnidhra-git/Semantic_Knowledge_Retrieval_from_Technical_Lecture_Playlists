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
    """Map concept depth score to difficulty level.
    
    - basic (< 0.4): Definitions, terminology, conceptual understanding
    - intermediate (0.4-0.7): Analysis, problem-solving, derivations
    - advanced (>= 0.7): Synthesis, design, complex multi-step problems
    """
    if depth_score >= 0.7:
        return "advanced"
    if depth_score >= 0.4:
        return "intermediate"
    return "basic"


def _get_playlist_context(playlist_id: str) -> dict:
    """Fetch playlist metadata and glossary terms for context-aware QA generation."""
    supabase = get_supabase()
    
    # Get playlist info
    playlist_resp = (
        supabase.table("playlists")
        .select("title, subject, description")
        .eq("id", playlist_id)
        .maybe_single()
        .execute()
    )
    
    if not playlist_resp.data:
        return {"title": "Engineering Course", "subject": "Engineering", "terms": []}
    
    playlist = playlist_resp.data
    
    # Get top glossary terms
    glossary_resp = (
        supabase.table("glossary")
        .select("term")
        .eq("playlist_id", playlist_id)
        .order("importance_score", desc=True)
        .limit(20)
        .execute()
    )
    
    terms = [g["term"] for g in (glossary_resp.data or [])]
    
    return {
        "title": playlist.get("title", "Engineering Course"),
        "subject": playlist.get("subject", "Engineering"),
        "description": playlist.get("description", ""),
        "terms": terms,
    }


def _get_chunk_glossary_terms(chunk_text: str, all_terms: list[str]) -> list[str]:
    """Find glossary terms that appear in this chunk."""
    text_lower = chunk_text.lower()
    return [term for term in all_terms if term.lower() in text_lower][:5]


def _generate_single_qa(chunk: dict, context: dict) -> dict | None:
    """Generate a detailed engineering question from a single transcript chunk."""
    depth = float(chunk.get("concept_depth_score", 0.5))
    difficulty = _depth_to_difficulty(depth)
    pedagogy_role = chunk.get("pedagogy_role", "explanation")
    
    # Get relevant glossary terms
    chunk_terms = _get_chunk_glossary_terms(chunk.get("text", ""), context.get("terms", []))
    terms_context = f"Key concepts: {', '.join(chunk_terms)}" if chunk_terms else ""
    
    # Difficulty-specific guidelines
    difficulty_guides = {
        "basic": (
            "- Focus on definitions, terminology, and fundamental concepts\n"
            "- Test conceptual understanding rather than calculations\n"
            "- Ask about physical meaning and significance\n"
            "- Example: 'Define [concept] and explain its importance in [context]'"
        ),
        "intermediate": (
            "- Require analysis, problem-solving, or quantitative reasoning\n"
            "- Connect multiple concepts or apply theory to scenarios\n"
            "- May involve calculations, comparisons, or derivations\n"
            "- Example: 'How does [parameter] affect [outcome]? Explain using relevant equations.'"
        ),
        "advanced": (
            "- Demand synthesis, design thinking, or multi-step problem-solving\n"
            "- Require critical evaluation or justification of approaches\n"
            "- May involve open-ended engineering design or optimization\n"
            "- Example: 'Design [system] considering [constraints]. Justify your choices.'"
        ),
    }
    
    prompt = (
        f"You are generating a practice question for an engineering course titled '{context['title']}' "
        f"(Subject: {context['subject']}).\n\n"
        f"DIFFICULTY LEVEL: {difficulty.upper()}\n"
        f"{difficulty_guides.get(difficulty, '')}\n\n"
        f"LECTURE CONTEXT:\n"
        f"This is a {pedagogy_role} segment from the course.\n"
        f"{terms_context}\n\n"
        f"TRANSCRIPT EXCERPT:\n{chunk.get('text', '')[:2000]}\n\n"
        f"TASK: Generate ONE engineering question that:\n"
        f"1. Tests deep understanding, not just memorization\n"
        f"2. Uses appropriate technical terminology from {context['subject']}\n"
        f"3. Is appropriate for {difficulty}-level engineering students\n"
        f"4. References specific concepts from the transcript\n\n"
        f"Provide a DETAILED answer that:\n"
        f"- Explains the reasoning step-by-step\n"
        f"- Includes relevant equations, principles, or derivations when appropriate\n"
        f"- Uses proper engineering notation and units\n"
        f"- Connects to broader course concepts\n"
        f"- Is 3-5 sentences for basic, 5-8 sentences for intermediate, 8-12 sentences for advanced\n\n"
        'Return ONLY valid JSON: {"question": "...", "answer": "...", "difficulty": "basic|intermediate|advanced"}'
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


def _generate_cross_video_qa(chunk_a: dict, chunk_b: dict, context: dict, shared_terms: list[str]) -> dict | None:
    """Generate a question that connects concepts across two lecture segments."""
    depth = (
        float(chunk_a.get("concept_depth_score", 0.5))
        + float(chunk_b.get("concept_depth_score", 0.5))
    ) / 2
    difficulty = _depth_to_difficulty(depth)
    
    terms_str = ", ".join(shared_terms[:3]) if shared_terms else "related concepts"
    
    prompt = (
        f"You are generating a SYNTHESIS question for '{context['title']}' ({context['subject']}).\n\n"
        f"This question must connect concepts from TWO different lecture segments.\n"
        f"Common concepts: {terms_str}\n"
        f"Difficulty: {difficulty}\n\n"
        f"SEGMENT 1:\n{chunk_a.get('text', '')[:1500]}\n\n"
        f"SEGMENT 2:\n{chunk_b.get('text', '')[:1500]}\n\n"
        f"TASK: Generate a question that:\n"
        f"1. REQUIRES understanding from BOTH segments to answer completely\n"
        f"2. Highlights relationships, connections, or contrasts between the concepts\n"
        f"3. Tests ability to synthesize information across topics\n"
        f"4. Is appropriate for {difficulty}-level engineering students\n\n"
        f"Examples of good cross-video questions:\n"
        f"- 'How does [concept from segment 1] relate to [concept from segment 2]? Explain their interaction.'\n"
        f"- 'Compare and contrast [approach 1] with [approach 2]. When would each be preferred?'\n"
        f"- 'Using principles from both [topic 1] and [topic 2], analyze [scenario].'\n\n"
        f"Provide a COMPREHENSIVE answer that:\n"
        f"- Explicitly references both segments\n"
        f"- Synthesizes information to show connections\n"
        f"- Explains the relationship between concepts\n"
        f"- Uses proper technical terminology\n"
        f"- Is 8-15 sentences with detailed reasoning\n\n"
        'Return ONLY valid JSON: {"question": "...", "answer": "...", "difficulty": "basic|intermediate|advanced"}'
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
        logger.warning("Cross-video QA generation failed: %s", exc)
    return None


def generate_qa_pairs(playlist_id: str, n_pairs: int = 50) -> None:
    """Generate and upsert QA pairs for a playlist."""
    supabase = get_supabase()
    
    # Fetch playlist context for enhanced prompts
    context = _get_playlist_context(playlist_id)
    logger.info("Generating QA for '%s' (%s)", context['title'], context['subject'])

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
    logger.info("Generating %d single-video questions...", n_single)
    for chunk in selected_chunks[:n_single]:
        qa = _generate_single_qa(chunk, context)
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
    logger.info("Generating %d cross-video questions...", n_cross)
    for ca, cb in cross_pairs[:n_cross]:
        # Find shared glossary terms
        text_a = ca.get("text", "").lower()
        text_b = cb.get("text", "").lower()
        shared_terms = [
            term for term in context.get("terms", [])
            if term.lower() in text_a and term.lower() in text_b
        ]
        
        qa = _generate_cross_video_qa(ca, cb, context, shared_terms)
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
