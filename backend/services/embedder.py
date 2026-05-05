"""
Gemini gemini-embedding-001 embeddings via direct REST API (v1beta).

Model: gemini-embedding-001  (3072-dim vectors)
Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/
          gemini-embedding-001:embedContent?key=API_KEY
Batch:    batchEmbedContents (up to 20 per request)

Rate limits: 1000 RPM → 0.5s sleep between batch calls for safety.
Exponential backoff on 429/5xx (max 4 retries: 2s/4s/8s/16s).
"""

from __future__ import annotations

import time
import logging
import requests

from config import get_settings

logger = logging.getLogger(__name__)

_MODEL_ID = "gemini-embedding-001"
_EMBED_URL = (
    f"https://generativelanguage.googleapis.com/v1beta"
    f"/models/{_MODEL_ID}:embedContent"
)
_BATCH_URL = (
    f"https://generativelanguage.googleapis.com/v1beta"
    f"/models/{_MODEL_ID}:batchEmbedContents"
)

_TASK_TYPE_MAP = {
    "retrieval_document": "RETRIEVAL_DOCUMENT",
    "retrieval_query": "RETRIEVAL_QUERY",
    "semantic_similarity": "SEMANTIC_SIMILARITY",
    "classification": "CLASSIFICATION",
    "clustering": "CLUSTERING",
}
_DIM = 3072
_BATCH_SIZE = 20
_BATCH_DELAY = 0.5  # 1000 RPM allows faster batch processing


def _api_key() -> str:
    return get_settings().gemini_api_key


def _embed_single_with_retry(
    text: str, task_type: str, max_retries: int = 4
) -> list[float]:
    task = _TASK_TYPE_MAP.get(task_type.lower(), "RETRIEVAL_DOCUMENT")
    payload = {
        "model": f"models/{_MODEL_ID}",
        "content": {"parts": [{"text": text}]},
        "taskType": task,
    }
    delay = 2.0  # 1000 RPM allows faster retries
    for attempt in range(max_retries):
        try:
            resp = requests.post(
                _EMBED_URL,
                json=payload,
                params={"key": _api_key()},
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()["embedding"]["values"]
        except Exception as exc:
            if attempt == max_retries - 1:
                raise
            logger.warning(
                "Embedding call failed (attempt %d): %s — retrying in %.0fs",
                attempt + 1, exc, delay,
            )
            time.sleep(delay)
            delay *= 2
    return []


def _embed_batch_rest(
    texts: list[str], task_type: str
) -> list[list[float]]:
    """Use batchEmbedContents to embed up to 20 texts at once."""
    task = _TASK_TYPE_MAP.get(task_type.lower(), "RETRIEVAL_DOCUMENT")
    requests_payload = [
        {
            "model": f"models/{_MODEL_ID}",
            "content": {"parts": [{"text": t}]},
            "taskType": task,
        }
        for t in texts
    ]
    payload = {"requests": requests_payload}
    delay = 2.0  # 1000 RPM allows faster retries
    for attempt in range(4):
        try:
            resp = requests.post(
                _BATCH_URL,
                json=payload,
                params={"key": _api_key()},
                timeout=60,
            )
            resp.raise_for_status()
            embeddings_data = resp.json().get("embeddings", [])
            return [e["values"] for e in embeddings_data]
        except Exception as exc:
            if attempt == 3:
                raise
            logger.warning(
                "Batch embed attempt %d failed: %s — retrying in %.0fs",
                attempt + 1, exc, delay,
            )
            time.sleep(delay)
            delay *= 2
    return []


def embed_text(text: str, task_type: str = "retrieval_document") -> list[float]:
    """Embed a single text string. Returns a 3072-dim float list."""
    return _embed_single_with_retry(text, task_type)


def embed_batch(
    texts: list[str], task_type: str = "retrieval_document"
) -> list[list[float]]:
    """
    Embed a list of texts in batches of 20 with 12s delay between batches
    (1000 RPM budget).  Returns a list of 3072-dim float vectors.
    """
    embeddings: list[list[float]] = []

    for i in range(0, len(texts), _BATCH_SIZE):
        batch = texts[i : i + _BATCH_SIZE]
        try:
            batch_embeddings = _embed_batch_rest(batch, task_type)
            while len(batch_embeddings) < len(batch):
                logger.warning("Batch embed returned fewer results; padding with zeros")
                batch_embeddings.append([0.0] * _DIM)
            embeddings.extend(batch_embeddings)
        except Exception as exc:
            logger.error("Batch embed failed, falling back to individual calls: %s", exc)
            for text in batch:
                try:
                    embeddings.append(_embed_single_with_retry(text, task_type))
                except Exception as e2:
                    logger.error("Individual embed failed: %s", e2)
                    embeddings.append([0.0] * _DIM)

        if i + _BATCH_SIZE < len(texts):
            time.sleep(_BATCH_DELAY)

    return embeddings
