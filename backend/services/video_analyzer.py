"""
Single Gemini call per video that replaces classifier.py + keyword_extractor.py.

Sends all chunk texts in one prompt and receives back:
  - keywords: 8-15 technical terms with importance_score, frequency, pedagogy_context
  - chunks:   per-chunk role, concept_depth_score, centrality_score, main_concept

Model: gemini-2.5-flash  (1000 RPM on free tier)
Retry: 4 attempts, starting at 2s backoff (handles 429s gracefully).

Token budget per video:
  A 1-hour NPTEL lecture → ~20 chunks × ~400 words ≈ 8 000 input tokens
  (well within Gemini Flash's 1M-token context window)
"""

from __future__ import annotations

import json
import logging
import time

import google.generativeai as genai

from config import get_settings

logger = logging.getLogger(__name__)

_MODEL = "gemini-2.5-flash"

_VALID_ROLES = frozenset([
    "introduction", "derivation", "explanation", "application",
    "comparison", "tangential", "example", "summary",
])
_VALID_PEDAGOGY_CONTEXTS = frozenset([
    "introduction", "derivation", "explanation", "application",
    "comparison", "example", "summary", "tangential",
])

_PROMPT_TEMPLATE = """\
You are an expert in aerospace engineering education.
Analyse the following numbered transcript chunks from a single lecture video.

Return ONLY a single valid JSON object with exactly two keys: "keywords" and "chunks".
Do NOT include any prose, markdown fences, or explanation outside the JSON.

──────────────────────────────────────────────────────────────
"keywords" — array of 8-15 technical keyword objects:
  "keyword":          string  (normalised, lowercase technical term)
  "importance_score": float   (0–1; how central to this lecture's main content)
  "frequency":        integer (estimated occurrences across the full transcript)
  "pedagogy_context": string  (one of: introduction | derivation | explanation |
                               application | comparison | example | summary)

EXCLUDE: conversational filler, professor/university names, administrative terms.
INCLUDE ONLY: domain-specific concepts in aerospace or mechanical engineering.

──────────────────────────────────────────────────────────────
"chunks" — array with exactly {n_chunks} objects, one per chunk, in the same order:
  "chunk_index":        integer (0-based, must match the [CHUNK N] number minus 1)
  "role":               string  (one of: introduction | derivation | explanation |
                                 application | comparison | tangential | example | summary)
  "concept_depth_score":  float (0–1; 0=concept barely touched, 1=deep focused treatment)
  "centrality_score":     float (0–1; 0=peripheral, 1=entire chunk about one concept)
  "main_concept":         string (the single most important technical concept in this chunk)

Role definitions:
  introduction — concept formally named/defined for the first time
  derivation   — mathematical or logical derivation being performed
  explanation  — deep conceptual explanation with analogies or theory
  application  — concept applied to a specific problem or real example
  comparison   — concept explicitly compared with another concept
  tangential   — concept mentioned briefly; not the main focus
  example      — worked example demonstrating a concept
  summary      — recap or conclusion of previously covered material

──────────────────────────────────────────────────────────────
TRANSCRIPT CHUNKS:

{chunks_text}
"""


def _configure_gemini() -> None:
    genai.configure(api_key=get_settings().gemini_api_key)


def _call_gemini_with_retry(prompt: str, max_retries: int = 4) -> str:
    _configure_gemini()
    model = genai.GenerativeModel(_MODEL)
    delay = 2.0  # 1000 RPM allows faster retries
    for attempt in range(max_retries):
        try:
            response = model.generate_content(prompt)
            return response.text
        except Exception as exc:
            if attempt == max_retries - 1:
                raise
            logger.warning(
                "Gemini call failed (attempt %d/%d): %s — retrying in %.0fs",
                attempt + 1, max_retries, exc, delay,
            )
            time.sleep(delay)
            delay *= 2
    return ""


def _extract_json(raw: str) -> dict:
    """Strip markdown fences and parse the outermost JSON object."""
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    raw = raw.strip()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    # Try to locate the outermost { ... }
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            pass
    logger.error("Could not parse Gemini JSON response: %s", raw[:400])
    return {}


def _safe_chunk_meta(raw: dict | None, chunk_index: int) -> dict:
    if not isinstance(raw, dict):
        raw = {}
    role = raw.get("role", "explanation")
    if role not in _VALID_ROLES:
        role = "explanation"
    return {
        "chunk_index": chunk_index,
        "role": role,
        "concept_depth_score": round(min(1.0, max(0.0, float(raw.get("concept_depth_score", 0.5)))), 4),
        "centrality_score": round(min(1.0, max(0.0, float(raw.get("centrality_score", 0.5)))), 4),
        "main_concept": str(raw.get("main_concept", "")).strip(),
    }


def _safe_keyword(raw: dict) -> dict | None:
    keyword = str(raw.get("keyword", "")).strip().lower()
    if len(keyword) < 3:
        return None
    importance = float(raw.get("importance_score", 0.0))
    if importance < 0.15:
        return None
    ctx = raw.get("pedagogy_context", "explanation")
    if ctx not in _VALID_PEDAGOGY_CONTEXTS:
        ctx = "explanation"
    return {
        "keyword": keyword,
        "importance_score": round(min(1.0, max(0.0, importance)), 4),
        "frequency": max(1, int(raw.get("frequency", 1))),
        "pedagogy_context": ctx,
    }


def analyze_video(video_id: str, chunks: list[dict]) -> dict:
    """
    Single Gemini call that returns both chunk-level metadata and video-level keywords.

    Args:
        video_id: YouTube video ID (used only for logging).
        chunks:   List of chunk dicts, each with at least a "text" key and "chunk_index".

    Returns:
        {
          "keywords": [{"keyword", "importance_score", "frequency", "pedagogy_context"}, ...],
          "chunks":   [{"chunk_index", "role", "concept_depth_score",
                        "centrality_score", "main_concept"}, ...],
        }
        Falls back to safe defaults for any missing / malformed fields.
    """
    if not chunks:
        return {"keywords": [], "chunks": []}

    # Build numbered chunk block for the prompt
    chunks_text = "\n\n".join(
        f"[CHUNK {c['chunk_index'] + 1}]\n{c['text']}" for c in chunks
    )
    prompt = _PROMPT_TEMPLATE.format(n_chunks=len(chunks), chunks_text=chunks_text)

    try:
        raw_response = _call_gemini_with_retry(prompt)
    except Exception as exc:
        logger.error("analyze_video failed for %s: %s — using defaults", video_id, exc)
        return {
            "keywords": [],
            "chunks": [_safe_chunk_meta(None, c["chunk_index"]) for c in chunks],
        }

    parsed = _extract_json(raw_response)

    # ── Validate / sanitise chunks ────────────────────────────────────────────
    raw_chunks = parsed.get("chunks", [])
    chunk_metas: list[dict] = []
    for i, chunk in enumerate(chunks):
        raw_item = raw_chunks[i] if i < len(raw_chunks) else None
        chunk_metas.append(_safe_chunk_meta(raw_item, chunk["chunk_index"]))

    # ── Validate / sanitise keywords ──────────────────────────────────────────
    raw_keywords = parsed.get("keywords", [])
    keywords: list[dict] = []
    for item in raw_keywords:
        kw = _safe_keyword(item)
        if kw:
            keywords.append(kw)

    logger.info(
        "analyze_video %s: %d chunks annotated, %d keywords extracted",
        video_id, len(chunk_metas), len(keywords),
    )
    return {"keywords": keywords, "chunks": chunk_metas}
