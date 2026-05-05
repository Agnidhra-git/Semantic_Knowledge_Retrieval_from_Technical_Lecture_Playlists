"""
Prerequisites Router - API for prerequisite discovery and learning path planning.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional

from services.concept_graph import get_prerequisites
from db.supabase_client import get_supabase

router = APIRouter()


@router.get("/{playlist_id}")
async def get_concept_prerequisites(
    playlist_id: str,
    concept: str = Query(..., min_length=2, description="Concept to find prerequisites for"),
):
    """
    Get prerequisite concepts for a given concept within a playlist.
    
    Returns list of prerequisite terms ordered by confidence and importance,
    each with first occurrence video and timestamp.
    """
    try:
        prerequisites = get_prerequisites(
            concept=concept.strip(),
            playlist_id=playlist_id,
        )
        
        return {
            "concept": concept.strip(),
            "playlist_id": playlist_id,
            "prerequisites": prerequisites,
        }
    
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prerequisite lookup failed: {str(exc)}")


@router.post("/{playlist_id}/check")
async def check_learning_path(
    playlist_id: str,
    target_concept: str,
    known_concepts: Optional[List[str]] = None,
):
    """
    Check if user has sufficient prerequisites to learn a target concept.
    
    Request body:
        target_concept: Concept user wants to learn
        known_concepts: List of concepts user already knows (optional)
    
    Returns:
        - missing_prerequisites: Concepts user should learn first
        - ready: Boolean indicating if user is ready to learn target concept
        - suggested_path: Ordered list of concepts to learn
    """
    from services.concept_graph import get_prerequisites
    
    try:
        known_set = set(c.lower() for c in (known_concepts or []))
        
        # Get prerequisites for target concept
        prerequisites = get_prerequisites(target_concept, playlist_id)
        
        # Check which prerequisites are missing
        missing = [
            p for p in prerequisites
            if p["term"].lower() not in known_set
        ]
        
        ready = len(missing) == 0
        
        # Build suggested learning path
        suggested_path = []
        if missing:
            # Order missing prerequisites by their own dependencies
            for prereq in missing:
                prereq_of_prereq = get_prerequisites(prereq["term"], playlist_id)
                prereq["depth"] = len(prereq_of_prereq)
            
            # Sort by depth (learn foundational concepts first)
            missing.sort(key=lambda p: p.get("depth", 0))
            suggested_path = [p["term"] for p in missing]
            suggested_path.append(target_concept)
        
        return {
            "target_concept": target_concept,
            "ready": ready,
            "missing_prerequisites": [p["term"] for p in missing],
            "suggested_path": suggested_path,
            "details": missing,
        }
    
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Learning path check failed: {str(exc)}")
