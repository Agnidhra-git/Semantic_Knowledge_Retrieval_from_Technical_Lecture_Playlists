"""
Concept Graph Service - Build dependency graphs from temporal co-occurrence.

Analyzes which concepts appear before others in a playlist to infer prerequisite
relationships. Uses chunk-level temporal proximity and glossary co-occurrence.
"""

from __future__ import annotations

import logging
from typing import List, Dict, Tuple
from collections import defaultdict

from db.supabase_client import get_supabase

logger = logging.getLogger(__name__)


def build_concept_dependencies(playlist_id: str) -> int:
    """
    Build concept dependency graph for a playlist.
    
    Algorithm:
    1. Get all glossary terms with their first_timestamp
    2. For each term, find co-occurring terms in nearby chunks (±2 chunks)
    3. If term A consistently appears before term B, create A → B edge
    4. Store in concept_dependencies table
    
    Args:
        playlist_id: Playlist UUID
    
    Returns:
        Number of dependency edges created
    """
    supabase = get_supabase()
    
    # 1. Fetch all glossary terms with first occurrence timestamps
    glossary_resp = (
        supabase.table("glossary")
        .select("term, first_video_id, first_timestamp, related_terms")
        .eq("playlist_id", playlist_id)
        .execute()
    )
    
    glossary_terms = glossary_resp.data or []
    if len(glossary_terms) < 2:
        logger.warning("Not enough glossary terms to build dependencies for playlist %s", playlist_id)
        return 0
    
    # Build term→timestamp mapping
    term_timestamps: Dict[str, float] = {}
    for entry in glossary_terms:
        term = entry["term"].lower()
        ts = entry.get("first_timestamp", float("inf"))
        term_timestamps[term] = ts
    
    # 2. Analyze co-occurrence patterns
    # For each term, check its related_terms and see which appear earlier
    dependencies: List[Tuple[str, str, float]] = []
    
    for entry in glossary_terms:
        term = entry["term"].lower()
        related = entry.get("related_terms", [])
        term_ts = term_timestamps.get(term, float("inf"))
        
        if not related:
            continue
        
        # Count how many related terms appear before this one
        earlier_terms = []
        for related_term in related:
            related_term_lower = related_term.lower()
            if related_term_lower in term_timestamps:
                related_ts = term_timestamps[related_term_lower]
                # If related term appears more than 30s earlier, likely a prerequisite
                if related_ts < term_ts - 30:
                    time_gap = term_ts - related_ts
                    # Confidence based on time gap (larger gap = higher confidence)
                    confidence = min(0.9, 0.5 + (time_gap / 1800))  # Max at 30min gap
                    earlier_terms.append((related_term_lower, confidence))
        
        # Add dependency edges
        for prereq_term, conf in earlier_terms:
            dependencies.append((prereq_term, term, conf))
    
    # 3. Deduplicate and store
    if not dependencies:
        logger.info("No dependencies found for playlist %s", playlist_id)
        return 0
    
    # Remove duplicates (keep highest confidence)
    dependency_map: Dict[Tuple[str, str], float] = {}
    for prereq, dep, conf in dependencies:
        key = (prereq, dep)
        if key not in dependency_map or conf > dependency_map[key]:
            dependency_map[key] = conf
    
    # 4. Bulk insert
    rows = [
        {
            "playlist_id": playlist_id,
            "prerequisite_term": prereq,
            "dependent_term": dep,
            "confidence": conf,
        }
        for (prereq, dep), conf in dependency_map.items()
    ]
    
    try:
        # Delete existing dependencies for this playlist
        supabase.table("concept_dependencies").delete().eq("playlist_id", playlist_id).execute()
        
        # Insert new dependencies
        if rows:
            supabase.table("concept_dependencies").insert(rows).execute()
            logger.info("Created %d concept dependencies for playlist %s", len(rows), playlist_id)
        
        return len(rows)
    
    except Exception as exc:
        logger.error("Failed to store concept dependencies: %s", exc)
        return 0


def get_prerequisites(
    concept: str,
    playlist_id: str,
    max_depth: int = 2,
) -> List[Dict[str, any]]:
    """
    Get prerequisite concepts for a given concept.
    
    Args:
        concept: The target concept
        playlist_id: Playlist UUID
        max_depth: Maximum depth of prerequisite chain to traverse
    
    Returns:
        List of prerequisite dicts with {term, confidence, first_video_id, first_timestamp}
    """
    supabase = get_supabase()
    
    # Find direct prerequisites
    prereq_resp = (
        supabase.table("concept_dependencies")
        .select("prerequisite_term, confidence")
        .eq("playlist_id", playlist_id)
        .eq("dependent_term", concept.lower())
        .order("confidence", desc=True)
        .execute()
    )
    
    prereqs = []
    seen_terms = set()
    
    for row in (prereq_resp.data or []):
        term = row["prerequisite_term"]
        if term in seen_terms:
            continue
        seen_terms.add(term)
        
        # Get glossary info for this term
        glossary_resp = (
            supabase.table("glossary")
            .select("first_video_id, first_timestamp, importance_score")
            .eq("playlist_id", playlist_id)
            .eq("term", term)
            .maybe_single()
            .execute()
        )
        
        if glossary_resp.data:
            prereqs.append({
                "term": term,
                "confidence": row["confidence"],
                "first_video_id": glossary_resp.data.get("first_video_id"),
                "first_timestamp": glossary_resp.data.get("first_timestamp"),
                "importance": glossary_resp.data.get("importance_score", 0.5),
            })
    
    # Sort by confidence × importance
    prereqs.sort(key=lambda p: p["confidence"] * p["importance"], reverse=True)
    
    return prereqs[:5]  # Return top 5 prerequisites
