"""
Keyword extraction + importance scoring via Gemini 1.5 Flash.
"""

from __future__ import annotations

import json
import time
import logging
import google.generativeai as genai
from config import get_settings

logger = logging.getLogger(__name__)

_KEYWORD_PROMPT = """Extract 8–15 technical keywords from these aerospace \
engineering lecture transcripts. For each keyword return exactly:
  "keyword": the technical term (normalised, lowercase)
  "importance_score": 0–1 based on how central this concept is to the
                      lecture's main content
  "frequency": approximate count of occurrences across the transcript
  "pedagogy_context": the primary role in which this keyword appears most
                      meaningfully — one of: introduction, derivation,
                      explanation, application, comparison, example, summary

EXCLUDE: conversational filler words, professor names, university names,
administrative terms.
INCLUDE ONLY: domain-specific technical concepts in aerospace or
mechanical engineering.

Respond ONLY with a JSON array. No prose, no markdown fences.

TRANSCRIPT:
{transcript}"""


def _configure_gemini() -> None:
    genai.configure(api_key=get_settings().gemini_api_key)


def _call_gemini_with_retry(prompt: str, max_retries: int = 4) -> str:
    _configure_gemini()
    model = genai.GenerativeModel("gemini-2.5-flash")
    delay = 2.0  # 1000 RPM allows faster retries
    for attempt in range(max_retries):
        try:
            response = model.generate_content(prompt)
            return response.text
        except Exception as exc:
            if attempt == max_retries - 1:
                raise
            logger.warning("Gemini call failed (attempt %d): %s — retrying in %.0fs", attempt + 1, exc, delay)
            time.sleep(delay)
            delay *= 2
    return ""


def _parse_keywords(raw: str) -> list[dict]:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            pass
    logger.error("Could not parse keyword JSON: %s", raw[:300])
    return []


_VALID_PEDAGOGY_CONTEXTS = frozenset(
    ["introduction", "derivation", "explanation", "application",
     "comparison", "example", "summary", "tangential"]
)


def _sanitise_keyword(item: dict) -> dict | None:
    keyword = str(item.get("keyword", "")).strip().lower()
    if len(keyword) < 3:
        return None
    importance = float(item.get("importance_score", 0.0))
    if importance < 0.15:
        return None
    ctx = item.get("pedagogy_context", "explanation")
    if ctx not in _VALID_PEDAGOGY_CONTEXTS:
        ctx = "explanation"
    return {
        "keyword": keyword,
        "importance_score": min(1.0, max(0.0, importance)),
        "frequency": max(1, int(item.get("frequency", 1))),
        "pedagogy_context": ctx,
    }


def extract_video_keywords(video_id: str, all_chunks: list[dict]) -> list[dict]:
    """
    Extract 8–15 technical keywords from all chunks of a single video.
    Returns list of {keyword, importance_score, frequency, pedagogy_context}.
    """
    if not all_chunks:
        return []

    combined_transcript = " ".join(c.get("text", "") for c in all_chunks)
    # Truncate to avoid hitting token limits (~8000 words ≈ 48000 chars)
    if len(combined_transcript) > 48_000:
        combined_transcript = combined_transcript[:48_000]

    prompt = _KEYWORD_PROMPT.format(transcript=combined_transcript)
    try:
        raw = _call_gemini_with_retry(prompt)
        items = _parse_keywords(raw)
    except Exception as exc:
        logger.error("Keyword extraction failed for video %s: %s", video_id, exc)
        return []

    keywords: list[dict] = []
    for item in items:
        sanitised = _sanitise_keyword(item)
        if sanitised:
            keywords.append(sanitised)

    return keywords
