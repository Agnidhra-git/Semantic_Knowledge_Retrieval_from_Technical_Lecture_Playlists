"""
Transcript fetching — yt-dlp primary, youtube-transcript-api fallback.

Fetch priority
--------------
1. yt-dlp  (primary — handles cookies, PoToken, and anti-bot natively)
   a. Manual English transcript  (info['subtitles']['en'])
   b. Auto-generated English     (info['automatic_captions']['en'])
   c. Any language available     → Gemini translation to English
2. youtube-transcript-api  (fallback if yt-dlp fails entirely)
   a. Manual English
   b. Auto-generated English
   c. Any language              → Gemini translation to English

Cookie support
--------------
Set YOUTUBE_COOKIES_FILE env var to a Netscape-format cookies.txt path,
or place youtube_cookies.txt in the backend root folder.
yt-dlp receives the path via its native `cookiefile` option.
youtube-transcript-api receives it via a requests.Session.

Translation fallback
--------------------
When only a non-English transcript is available (e.g. Hindi auto-captions),
segments are translated to English in batches using Gemini (GEMINI_API_KEY).
"""

from __future__ import annotations

import http.cookiejar
import logging
import os
import random
import re
import time
from pathlib import Path
from typing import Optional

import requests
from youtube_transcript_api import (
    YouTubeTranscriptApi,
    NoTranscriptFound,
    TranscriptsDisabled,
)
from youtube_transcript_api._errors import IpBlocked, YouTubeRequestFailed

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

_TRANSLATE_BATCH_CHARS = 3000
_TRANSLATE_MODEL       = "gemini-2.5-flash"

_MAX_RETRIES   = 4
_RETRY_DELAYS  = [10, 20, 40, 80]   # seconds — for transient 503/429

_FETCH_BASE_DELAY = 4.0   # polite delay between fetches
_FETCH_JITTER     = 3.0


class YouTubeIpBlockedError(RuntimeError):
    """YouTube has blocked this IP. All pending videos should be skipped."""


# ── Cookie helpers ────────────────────────────────────────────────────────────

def _cookie_file_path() -> Optional[str]:
    """Return the path to a Netscape cookies file, or None if not found."""
    path = os.environ.get("YOUTUBE_COOKIES_FILE", "").strip()
    if path and Path(path).exists():
        return path
    default = Path(__file__).parent.parent / "youtube_cookies.txt"
    if default.exists():
        return str(default)
    return None


def _build_requests_session() -> Optional[requests.Session]:
    """Build a requests.Session with YouTube cookies, or None."""
    cookie_path = _cookie_file_path()
    if not cookie_path:
        logger.warning(
            "No YouTube cookies found. Transcript fetches are unauthenticated — "
            "YouTube may block the IP. Set YOUTUBE_COOKIES_FILE or place "
            "youtube_cookies.txt in the backend folder."
        )
        return None
    try:
        jar = http.cookiejar.MozillaCookieJar(cookie_path)
        jar.load(ignore_discard=True, ignore_expires=True)
        session = requests.Session()
        session.cookies = jar  # type: ignore[assignment]
        logger.info("Loaded %d cookies from %s", len(jar), cookie_path)
        return session
    except Exception as exc:
        logger.warning("Failed to load cookie file %s: %s", cookie_path, exc)
        return None


# ── Lazy youtube-transcript-api instance ─────────────────────────────────────

_api_instance: Optional[YouTubeTranscriptApi] = None


def _get_api() -> YouTubeTranscriptApi:
    """Return (creating if needed) the module-level YouTubeTranscriptApi instance."""
    global _api_instance
    if _api_instance is None:
        session = _build_requests_session()
        _api_instance = (
            YouTubeTranscriptApi(http_client=session)
            if session is not None
            else YouTubeTranscriptApi()
        )
    return _api_instance


def reload_api_with_cookies() -> None:
    """Re-create the api instance. Call after dropping a new cookie file."""
    global _api_instance
    _api_instance = None
    _get_api()
    logger.info("YouTube API instance reloaded (cookie refresh)")


# ══════════════════════════════════════════════════════════════════════════════
# PRIMARY: yt-dlp
# ══════════════════════════════════════════════════════════════════════════════

def _parse_json3(data: dict) -> list[dict]:
    """
    Parse YouTube's JSON3 caption format into {text, start, duration} dicts.

    JSON3 structure:
      {"events": [{"tStartMs": 0, "dDurationMs": 3000,
                   "segs": [{"utf8": "Hello"}, {"utf8": " world"}]}, ...]}
    """
    segments: list[dict] = []
    for event in data.get("events", []):
        segs = event.get("segs")
        if not segs:
            continue
        text = "".join(s.get("utf8", "") for s in segs).strip()
        text = text.replace("\n", " ").strip()
        if not text:
            continue
        start_ms = event.get("tStartMs", 0)
        dur_ms   = event.get("dDurationMs", 0)
        segments.append({
            "text":     text,
            "start":    start_ms / 1000.0,
            "duration": dur_ms   / 1000.0,
        })
    return segments


def _vtt_time_to_seconds(ts: str) -> float:
    """Convert 'HH:MM:SS.mmm' or 'MM:SS.mmm' to seconds."""
    parts = ts.strip().split(":")
    if len(parts) == 3:
        h, m, s = parts
    else:
        h, m, s = "0", parts[0], parts[1]
    return int(h) * 3600 + int(m) * 60 + float(s)


def _parse_vtt(content: str) -> list[dict]:
    """
    Parse WebVTT text into {text, start, duration} dicts.
    Strips HTML tags from cue text.
    """
    segments: list[dict] = []
    # Each cue: optional ID line, timestamp line, one or more text lines, blank line
    cue_pattern = re.compile(
        r"(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})[^\n]*\n"
        r"((?:.+\n?)+)",
        re.MULTILINE,
    )
    for m in cue_pattern.finditer(content):
        start = _vtt_time_to_seconds(m.group(1).replace(",", "."))
        end   = _vtt_time_to_seconds(m.group(2).replace(",", "."))
        raw   = m.group(3).strip()
        # Strip VTT tags (<c>, <b>, timestamp tags, etc.)
        text  = re.sub(r"<[^>]+>", "", raw).strip().replace("\n", " ")
        if text:
            segments.append({
                "text":     text,
                "start":    start,
                "duration": max(0.0, end - start),
            })
    return segments


def _download_subtitle_url(url: str) -> tuple[str, str]:
    """
    Fetch a subtitle URL and return (content, format).
    Detects json3 vs vtt from the URL or response content.
    """
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    fmt = "json3" if "fmt=json3" in url or url.endswith(".json3") else "vtt"
    return resp.text, fmt


def _fetch_via_ytdlp(video_id: str) -> tuple[list[dict], str]:
    """
    Use yt-dlp to extract subtitle URLs and download+parse them.

    Returns (segments, language_code).
    Raises RuntimeError if no subtitles found at all.
    """
    import yt_dlp

    cookie_path = _cookie_file_path()
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "no_check_formats": True,    # skip format resolution — we only need subtitle URLs
        "ignore_no_formats_error": True,
    }
    if cookie_path:
        opts["cookiefile"] = cookie_path
        logger.info("yt-dlp using cookie file: %s", cookie_path)

    url = f"https://www.youtube.com/watch?v={video_id}"
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    if not info:
        raise RuntimeError(f"yt-dlp returned no info for video {video_id}")

    manual = info.get("subtitles") or {}
    auto   = info.get("automatic_captions") or {}

    # Build priority list: manual EN → auto EN → other manual → other auto
    candidates: list[tuple[str, list]] = []
    if "en" in manual:
        candidates.append(("en", manual["en"]))
    if "en" in auto:
        candidates.append(("en", auto["en"]))
    for lang, tracks in manual.items():
        if lang != "en":
            candidates.append((lang, tracks))
    for lang, tracks in auto.items():
        if lang != "en":
            candidates.append((lang, tracks))

    for lang, tracks in candidates:
        # Prefer json3 (structured), fall back to vtt
        for preferred_fmt in ("json3", "vtt"):
            track = next(
                (t for t in tracks if t.get("ext") == preferred_fmt),
                None,
            )
            if not track:
                continue
            try:
                raw_content, fmt = _download_subtitle_url(track["url"])
                if fmt == "json3":
                    import json as _json
                    segs = _parse_json3(_json.loads(raw_content))
                else:
                    segs = _parse_vtt(raw_content)
                if segs:
                    logger.info(
                        "yt-dlp fetched %s transcript for %s via %s (%d segs)",
                        lang, video_id, fmt, len(segs),
                    )
                    return segs, lang
            except Exception as exc:
                logger.debug("yt-dlp track %s/%s failed: %s", lang, preferred_fmt, exc)
                continue

    raise RuntimeError(f"yt-dlp: no usable subtitles found for video {video_id}")


# ══════════════════════════════════════════════════════════════════════════════
# FALLBACK: youtube-transcript-api
# ══════════════════════════════════════════════════════════════════════════════

def _segs_to_dicts(fetched) -> list[dict]:
    return [{"text": s.text, "start": s.start, "duration": s.duration} for s in fetched]


def _list_with_retry(video_id: str):
    api = _get_api()
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            return api.list(video_id)
        except IpBlocked as exc:
            raise YouTubeIpBlockedError(
                f"YouTube has blocked this IP address. "
                f"Provide authenticated cookies (set YOUTUBE_COOKIES_FILE or place "
                f"youtube_cookies.txt in the backend folder) then re-trigger. "
                f"Triggered on video {video_id}."
            ) from exc
        except TranscriptsDisabled:
            raise
        except YouTubeRequestFailed as exc:
            last_exc = exc
            delay = _RETRY_DELAYS[min(attempt, len(_RETRY_DELAYS) - 1)]
            logger.warning(
                "youtube-transcript-api request failed for %s (attempt %d/%d), "
                "retrying in %ds: %s",
                video_id, attempt + 1, _MAX_RETRIES, delay, exc,
            )
            time.sleep(delay)
        except Exception:
            raise
    raise RuntimeError(
        f"Could not list transcripts for {video_id} after {_MAX_RETRIES} retries: {last_exc}"
    )


def _fetch_with_ip_guard(transcript_obj) -> list[dict]:
    try:
        return _segs_to_dicts(transcript_obj.fetch())
    except IpBlocked as exc:
        raise YouTubeIpBlockedError(
            "YouTube IP block detected during transcript fetch. "
            "Provide authenticated cookies to resume."
        ) from exc


def _fetch_via_ytapi(video_id: str) -> tuple[list[dict], str]:
    """
    Fetch transcript using youtube-transcript-api.
    Returns (segments, language_code).
    Raises YouTubeIpBlockedError or RuntimeError.
    """
    try:
        transcript_list = _list_with_retry(video_id)
    except YouTubeIpBlockedError:
        raise
    except TranscriptsDisabled:
        raise RuntimeError(f"Transcripts are disabled for video {video_id}")
    except Exception as exc:
        raise RuntimeError(f"Could not list transcripts for video {video_id}: {exc}")

    # Manual English
    try:
        t = transcript_list.find_manually_created_transcript(["en"])
        segs = _fetch_with_ip_guard(t)
        if segs:
            return segs, "en"
    except YouTubeIpBlockedError:
        raise
    except (NoTranscriptFound, Exception):
        pass

    # Auto-generated English
    try:
        t = transcript_list.find_generated_transcript(["en"])
        segs = _fetch_with_ip_guard(t)
        if segs:
            return segs, "en"
    except YouTubeIpBlockedError:
        raise
    except (NoTranscriptFound, Exception):
        pass

    # Any language
    for t in transcript_list:
        try:
            segs = _fetch_with_ip_guard(t)
            if segs:
                return segs, t.language_code
        except YouTubeIpBlockedError:
            raise
        except Exception:
            continue

    raise RuntimeError(f"No usable transcript found via youtube-transcript-api for {video_id}")


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════════════

def fetch_transcript(video_id: str) -> list[dict]:
    """
    Fetch transcript for a YouTube video.
    Returns list of {text: str, start: float, duration: float}.

    Strategy:
      1. yt-dlp (primary) — handles cookies + anti-bot natively
      2. youtube-transcript-api (fallback)
      In both cases, non-English results are translated via Gemini.

    Raises:
        YouTubeIpBlockedError — IP blocked; pipeline should abort remaining videos
        RuntimeError          — all methods exhausted / transcripts disabled
    """
    delay = _FETCH_BASE_DELAY + random.uniform(0, _FETCH_JITTER)
    time.sleep(delay)

    # ── Primary: yt-dlp ───────────────────────────────────────────────────────
    ytdlp_exc: Exception | None = None
    try:
        segs, lang = _fetch_via_ytdlp(video_id)
        if lang.startswith("en"):
            return segs
        logger.warning(
            "yt-dlp: only %s transcript available for %s — translating via Gemini",
            lang, video_id,
        )
        return _maybe_translate(segs, lang, video_id)
    except YouTubeIpBlockedError:
        # yt-dlp shouldn't raise this, but propagate if it somehow does
        raise
    except Exception as exc:
        ytdlp_exc = exc
        logger.warning(
            "yt-dlp failed for %s (%s) — trying youtube-transcript-api fallback",
            video_id, ytdlp_exc,
        )

    # ── Fallback: youtube-transcript-api ─────────────────────────────────────
    try:
        segs, lang = _fetch_via_ytapi(video_id)
        if lang.startswith("en"):
            return segs
        logger.warning(
            "youtube-transcript-api: only %s transcript for %s — translating via Gemini",
            lang, video_id,
        )
        return _maybe_translate(segs, lang, video_id)
    except YouTubeIpBlockedError:
        raise
    except Exception as ytapi_exc:
        raise RuntimeError(
            f"All transcript methods failed for {video_id}. "
            f"yt-dlp: {ytdlp_exc}; youtube-transcript-api: {ytapi_exc}"
        ) from ytapi_exc


def _maybe_translate(segs: list[dict], lang: str, video_id: str) -> list[dict]:
    """Translate non-English segments via Gemini; return raw segs on failure."""
    try:
        translated = _translate_segments_with_gemini(segs, source_lang=lang)
        logger.info("Gemini translation done for %s (%s→en, %d segs)", video_id, lang, len(translated))
        return translated
    except RuntimeError as exc:
        logger.error(
            "Gemini translation failed for %s: %s — returning raw %s transcript",
            video_id, exc, lang,
        )
        return segs


# ══════════════════════════════════════════════════════════════════════════════
# Gemini translation
# ══════════════════════════════════════════════════════════════════════════════

def _translate_segments_with_gemini(
    segments: list[dict], source_lang: str
) -> list[dict]:
    """
    Translate segment text from source_lang to English using Gemini.
    Batches by character count; preserves start/duration timestamps.
    Raises RuntimeError if GEMINI_API_KEY is not set or all retries fail.
    """
    import google.generativeai as genai

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set — cannot translate transcript.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(_TRANSLATE_MODEL)

    # Split into batches
    batches: list[list[dict]] = []
    current_batch: list[dict] = []
    current_chars = 0
    for seg in segments:
        n = len(seg["text"])
        if current_chars + n > _TRANSLATE_BATCH_CHARS and current_batch:
            batches.append(current_batch)
            current_batch = []
            current_chars = 0
        current_batch.append(seg)
        current_chars += n
    if current_batch:
        batches.append(current_batch)

    logger.info(
        "Translating %d segments (%s→en) in %d batch(es) via Gemini",
        len(segments), source_lang, len(batches),
    )

    translated_segments: list[dict] = []

    for batch_idx, batch in enumerate(batches):
        lines = "\n".join(f"{i+1}. {seg['text']}" for i, seg in enumerate(batch))
        prompt = (
            f"Translate the following {source_lang} transcript lines to English. "
            "Return ONLY the translated lines, one per line, numbered the same way. "
            f"Do not add any extra text or explanation.\n\n{lines}"
        )

        raw = None
        for attempt in range(4):
            try:
                response = model.generate_content(prompt)
                raw = response.text.strip()
                break
            except Exception as exc:
                err_str = str(exc)
                m = re.search(r"retry_delay\s*\{\s*seconds:\s*(\d+)", err_str)
                wait = int(m.group(1)) + 2 if m else (15 * (2 ** attempt))
                if "429" in err_str or "ResourceExhausted" in type(exc).__name__:
                    if attempt < 3:
                        logger.warning(
                            "Gemini rate-limited on batch %d (attempt %d/4), retrying in %ds",
                            batch_idx + 1, attempt + 1, wait,
                        )
                        time.sleep(wait)
                        continue
                raise RuntimeError(
                    f"Gemini translation failed on batch {batch_idx + 1}: {exc}"
                ) from exc

        if raw is None:
            raise RuntimeError(
                f"Gemini translation failed on batch {batch_idx + 1} after 4 retries"
            )

        translated_lines: list[str] = []
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            if line[0].isdigit():
                dot = line.find(".")
                if 0 < dot < 5:
                    line = line[dot + 1:].lstrip()
            translated_lines.append(line)

        for i, seg in enumerate(batch):
            text = translated_lines[i] if i < len(translated_lines) else seg["text"]
            translated_segments.append({
                "text":     text,
                "start":    seg["start"],
                "duration": seg["duration"],
            })

        if batch_idx < len(batches) - 1:
            time.sleep(0.5)

    logger.info("Translation complete: %d segments", len(translated_segments))
    return translated_segments


# ══════════════════════════════════════════════════════════════════════════════
# Segment merging
# ══════════════════════════════════════════════════════════════════════════════

def merge_short_segments(
    segments: list[dict], min_duration: float = 3.0
) -> list[dict]:
    """
    Merge adjacent segments shorter than min_duration into their neighbours.
    Preserves start time of the earliest segment and sums durations.
    """
    if not segments:
        return []

    merged: list[dict] = []
    buffer = dict(segments[0])

    for seg in segments[1:]:
        if buffer["duration"] < min_duration:
            buffer["text"]     = buffer["text"].rstrip() + " " + seg["text"].lstrip()
            buffer["duration"] += seg["duration"]
        else:
            merged.append(buffer)
            buffer = dict(seg)

    merged.append(buffer)
    return merged
