"""
Semantic chunking — NOT fixed-length splitting.

Algorithm:
1. Join adjacent transcript segments into pseudo-sentences of 30–60 s each.
2. Slide over the sentences; if consecutive sentences share >30% common
   non-stopwords keep them in the same chunk, else start a new chunk.
3. Target chunk duration: 90–180 s.  Hard max: 300 s.
4. Never split a sentence mid-way — always break at segment boundaries.
"""

from __future__ import annotations

import re
from typing import Sequence

_STOPWORDS = frozenset(
    """a an the and or but if in on at to for of with by from is are was were
    be been being have has had do does did will would could should may might
    shall can this that these those it its i we you he she they them their
    our your his her its what which who whom how when where why while
    then also just so yet both either neither not no nor only very
    well even still already often all any few more most other some such
    no nor not only so than too very s t can will just don should now""".split()
)

_SENTENCE_TARGET_MIN = 30.0   # seconds
_SENTENCE_TARGET_MAX = 60.0   # seconds
_CHUNK_MIN = 90.0             # seconds
_CHUNK_MAX = 300.0            # seconds (hard cap)
_OVERLAP_THRESHOLD = 0.30     # 30% shared non-stopwords triggers merge


def _tokenise(text: str) -> set[str]:
    words = re.findall(r"[a-z]+", text.lower())
    return {w for w in words if w not in _STOPWORDS and len(w) > 2}


def _overlap_ratio(a: str, b: str) -> float:
    ta, tb = _tokenise(a), _tokenise(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / min(len(ta), len(tb))


def _build_sentences(segments: list[dict]) -> list[dict]:
    """
    Group transcript segments into pseudo-sentences of 30–60 s.
    Each sentence: {text, start_time, end_time, duration}
    """
    sentences: list[dict] = []
    if not segments:
        return sentences

    buf_text = segments[0]["text"]
    buf_start = float(segments[0]["start"])
    buf_dur = float(segments[0]["duration"])

    for seg in segments[1:]:
        seg_dur = float(seg["duration"])
        new_dur = buf_dur + seg_dur
        if buf_dur < _SENTENCE_TARGET_MIN:
            buf_text += " " + seg["text"]
            buf_dur = new_dur
        elif buf_dur >= _SENTENCE_TARGET_MAX:
            sentences.append(
                {
                    "text": buf_text.strip(),
                    "start_time": buf_start,
                    "end_time": buf_start + buf_dur,
                    "duration": buf_dur,
                }
            )
            buf_text = seg["text"]
            buf_start = float(seg["start"])
            buf_dur = seg_dur
        else:
            # within target window — close sentence
            sentences.append(
                {
                    "text": buf_text.strip(),
                    "start_time": buf_start,
                    "end_time": buf_start + buf_dur,
                    "duration": buf_dur,
                }
            )
            buf_text = seg["text"]
            buf_start = float(seg["start"])
            buf_dur = seg_dur

    if buf_text.strip():
        sentences.append(
            {
                "text": buf_text.strip(),
                "start_time": buf_start,
                "end_time": buf_start + buf_dur,
                "duration": buf_dur,
            }
        )
    return sentences


def chunk_transcript(segments: list[dict], video_id: str) -> list[dict]:
    """
    Semantically chunk a list of transcript segments.
    Returns list of chunks:
      {text, start_time, end_time, chunk_index, video_id}
    """
    sentences = _build_sentences(segments)
    if not sentences:
        return []

    chunks: list[dict] = []
    chunk_idx = 0

    # Seed the first chunk with the first sentence
    cur_texts: list[str] = [sentences[0]["text"]]
    cur_start: float = sentences[0]["start_time"]
    cur_end: float = sentences[0]["end_time"]
    cur_dur: float = sentences[0]["duration"]

    def _flush(texts: list[str], start: float, end: float, idx: int) -> dict:
        return {
            "text": " ".join(texts),
            "start_time": start,
            "end_time": end,
            "chunk_index": idx,
            "video_id": video_id,
        }

    for sent in sentences[1:]:
        new_dur = cur_dur + sent["duration"]
        overlap = _overlap_ratio(" ".join(cur_texts), sent["text"])
        high_overlap = overlap > _OVERLAP_THRESHOLD

        # Force flush at hard max regardless of overlap
        if new_dur > _CHUNK_MAX:
            chunks.append(_flush(cur_texts, cur_start, cur_end, chunk_idx))
            chunk_idx += 1
            cur_texts = [sent["text"]]
            cur_start = sent["start_time"]
            cur_end = sent["end_time"]
            cur_dur = sent["duration"]
            continue

        if cur_dur >= _CHUNK_MIN and not high_overlap:
            # Sufficient size and low overlap → start new chunk
            chunks.append(_flush(cur_texts, cur_start, cur_end, chunk_idx))
            chunk_idx += 1
            cur_texts = [sent["text"]]
            cur_start = sent["start_time"]
            cur_end = sent["end_time"]
            cur_dur = sent["duration"]
        else:
            # Keep extending current chunk
            cur_texts.append(sent["text"])
            cur_end = sent["end_time"]
            cur_dur = new_dur

    # Flush remaining
    if cur_texts:
        chunks.append(_flush(cur_texts, cur_start, cur_end, chunk_idx))

    return chunks
