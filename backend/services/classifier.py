"""
Pedagogy role classification via Gemini 1.5 Flash.
Processes chunks in batches of 5 to reduce API calls.
Includes exponential backoff retry (max 3 attempts: 1s/2s/4s).
"""

from __future__ import annotations

import json
import time
import logging
import google.generativeai as genai
from config import get_settings

logger = logging.getLogger(__name__)

VALID_ROLES = frozenset(
    [
        "introduction",
        "derivation",
        "explanation",
        "application",
        "comparison",
        "tangential",
        "example",
        "summary",
    ]
)

_SYSTEM_PROMPT = """You are an expert in aerospace engineering education. \
Analyse these transcript chunks from a technical lecture. \
Respond ONLY with a valid JSON array — one object per chunk.

Each object must have exactly these keys:
  "role": one of [introduction, derivation, explanation, application,
                  comparison, tangential, example, summary]
  "concept_depth_score": float 0–1 (0=concept barely mentioned,
                         1=entire chunk is a rich deep-dive)
  "centrality_score": float 0–1 (0=peripheral, 1=chunk is entirely
                      about one concept)
  "main_concept": string — the single most important technical concept
                  in this chunk

Definitions:
- introduction: concept formally named and defined for the first time
- derivation: mathematical or logical derivation being performed
- explanation: deep conceptual explanation with analogies or theory
- application: concept applied to a specific problem or example
- comparison: concept being compared with another concept
- tangential: concept mentioned briefly, not the main focus
- example: worked example demonstrating a concept
- summary: recap or conclusion of previously covered material

Context (previous chunk summary): {context}"""


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
    return ""  # unreachable


def _parse_classification_response(raw: str, batch_size: int) -> list[dict]:
    """Extract JSON array from Gemini response, return list of classification dicts."""
    raw = raw.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            return [parsed]
    except json.JSONDecodeError:
        pass
    # Try to extract JSON array substring
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            pass
    logger.error("Could not parse classification JSON: %s", raw[:300])
    return []


def _safe_classification(raw_item: dict | None, chunk_text: str) -> dict:
    """Validate and sanitise a single classification result."""
    if not isinstance(raw_item, dict):
        raw_item = {}
    role = raw_item.get("role", "explanation")
    if role not in VALID_ROLES:
        role = "explanation"
    return {
        "role": role,
        "concept_depth_score": min(1.0, max(0.0, float(raw_item.get("concept_depth_score", 0.5)))),
        "centrality_score": min(1.0, max(0.0, float(raw_item.get("centrality_score", 0.5)))),
        "main_concept": str(raw_item.get("main_concept", "")),
    }


def classify_chunks(chunks: list[dict], context: str = "") -> list[dict]:
    """
    Classify a list of chunk dicts (each has at least "text").
    Returns a parallel list of classification dicts.
    Processes in batches of 5.
    """
    results: list[dict] = []
    batch_size = 5

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        numbered_texts = "\n\n".join(
            f"[CHUNK {j+1}]\n{c['text']}" for j, c in enumerate(batch)
        )
        prompt = _SYSTEM_PROMPT.format(context=context or "None") + f"\n\n{numbered_texts}"

        try:
            raw = _call_gemini_with_retry(prompt)
            parsed = _parse_classification_response(raw, len(batch))
        except Exception as exc:
            logger.error("Classification batch %d failed: %s", i // batch_size, exc)
            parsed = []

        # Pad to batch size if Gemini returned fewer items
        while len(parsed) < len(batch):
            parsed.append({})

        for j, chunk in enumerate(batch):
            results.append(_safe_classification(parsed[j] if j < len(parsed) else None, chunk["text"]))

        # Update rolling context from last chunk's main concept
        if results:
            context = results[-1].get("main_concept", context)

        # 1000 RPM allows minimal delays between batches
        if i + batch_size < len(chunks):
            time.sleep(0.1)

    return results


def classify_chunk(chunk_text: str, context: str = "") -> dict:
    """Classify a single chunk. Convenience wrapper around classify_chunks."""
    results = classify_chunks([{"text": chunk_text}], context=context)
    return results[0] if results else _safe_classification(None, chunk_text)
