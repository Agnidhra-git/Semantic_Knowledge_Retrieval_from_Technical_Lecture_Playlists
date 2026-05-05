"""
Concept Journey Service - Extract structured learning paths for concepts.

Generates a timeline of how a concept progresses across videos:
  1. Introduction → 2. Derivation → 3. Explanation → 4. Application → 5. Examples

Also identifies prerequisites and related concepts from glossary.
"""

from __future__ import annotations

import logging
from typing import List, Dict, Any

from db.supabase_client import get_supabase
from services.search_engine import semantic_search

logger = logging.getLogger(__name__)


def extract_concept_journey(
    concept: str,
    playlist_id: str,
    max_stages: int = 6,
) -> Dict[str, Any]:
    """
    Extract a structured learning path for a concept within a playlist.
    
    Args:
        concept: The concept to trace (e.g., "boundary layer theory")
        playlist_id: Playlist UUID to search within
        max_stages: Maximum number of stages to return
    
    Returns:
        Dictionary with stages, prerequisites, and related concepts
    """
    supabase = get_supabase()
    
    # 1. Semantic search for concept (top 20 results)
    search_results = semantic_search(
        query=concept,
        scope=playlist_id,
        top_k=20,
        use_cache=False,
    )
    
    if not search_results:
        return {
            "concept": concept,
            "stages": [],
            "prerequisites": [],
            "related_concepts": [],
        }
    
    # 2. Group results by pedagogy role and video
    role_priority = {
        "introduction": 1,
        "derivation": 2,
        "explanation": 3,
        "comparison": 4,
        "application": 5,
        "example": 6,
        "summary": 7,
        "tangential": 8,
    }
    
    # Group by role, keeping best per role
    stages_by_role: Dict[str, Dict[str, Any]] = {}
    
    for result in search_results:
        role = result["pedagogy_role"]
        
        # Skip tangential unless it's the only result
        if role == "tangential" and len(search_results) > 1:
            continue
        
        # Keep highest confidence per role
        if role not in stages_by_role:
            stages_by_role[role] = result
        elif result["confidence_score"] > stages_by_role[role]["confidence_score"]:
            stages_by_role[role] = result
    
    # 3. Build ordered stages
    stages: List[Dict[str, Any]] = []
    for role in sorted(stages_by_role.keys(), key=lambda r: role_priority.get(r, 99)):
        result = stages_by_role[role]
        
        # Fetch video position for ordering
        try:
            video_resp = (
                supabase.table("videos")
                .select("position")
                .eq("id", result["video_id"])
                .single()
                .execute()
            )
            position = video_resp.data.get("position", 999) if video_resp.data else 999
        except Exception:
            position = 999
        
        # Calculate duration from chunk (estimate 120s average)
        duration = 120
        
        stages.append({
            "stage": role,
            "video_id": result["video_id"],
            "video_title": result["video_title"],
            "timestamp": result["timestamp_seconds"],
            "youtube_url": result["youtube_url"],
            "snippet": result["snippet_text"][:200] + "..." if len(result["snippet_text"]) > 200 else result["snippet_text"],
            "confidence": result["confidence_score"],
            "duration": duration,
            "video_position": position,
        })
    
    # Sort by video position, then timestamp
    stages.sort(key=lambda s: (s["video_position"], s["timestamp"]))
    
    # Limit to max_stages
    stages = stages[:max_stages]
    
    # 4. Get glossary info for prerequisites and related concepts
    prerequisites: List[Dict[str, Any]] = []
    related_concepts: List[str] = []
    
    try:
        # Check if concept exists in glossary
        glossary_resp = (
            supabase.table("glossary")
            .select("term, related_terms, first_video_id, first_timestamp, importance_score")
            .eq("playlist_id", playlist_id)
            .ilike("term", f"%{concept}%")
            .limit(1)
            .execute()
        )
        
        if glossary_resp.data:
            glossary_entry = glossary_resp.data[0]
            related_terms = glossary_entry.get("related_terms", [])
            
            # Related concepts are co-occurring terms
            related_concepts = [t for t in related_terms if t.lower() != concept.lower()][:5]
            
            # Prerequisites: terms that appear earlier in the playlist
            if related_terms:
                prereq_resp = (
                    supabase.table("glossary")
                    .select("term, first_video_id, first_timestamp, importance_score")
                    .eq("playlist_id", playlist_id)
                    .in_("term", related_terms)
                    .execute()
                )
                
                for term_data in (prereq_resp.data or []):
                    # Consider it a prerequisite if introduced earlier
                    term_first_ts = term_data.get("first_timestamp", float("inf"))
                    concept_first_ts = glossary_entry.get("first_timestamp", 0)
                    
                    if term_first_ts < concept_first_ts:
                        prerequisites.append({
                            "term": term_data["term"],
                            "first_video_id": term_data["first_video_id"],
                            "first_timestamp": term_data["first_timestamp"],
                            "importance": term_data.get("importance_score", 0.5),
                        })
                
                # Sort by importance
                prerequisites.sort(key=lambda p: p["importance"], reverse=True)
                prerequisites = prerequisites[:3]
    
    except Exception as exc:
        logger.warning("Glossary lookup failed for journey: %s", exc)
    
    return {
        "concept": concept,
        "stages": stages,
        "prerequisites": prerequisites,
        "related_concepts": related_concepts,
    }
