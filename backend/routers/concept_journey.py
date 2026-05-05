"""
Concept Journey Router - API for structured learning paths.
"""

from fastapi import APIRouter, Query, HTTPException

from services.concept_journey import extract_concept_journey

router = APIRouter()


@router.get("/{playlist_id}")
async def get_concept_journey(
    playlist_id: str,
    concept: str = Query(..., min_length=2, description="Concept to trace through playlist"),
    max_stages: int = Query(6, ge=1, le=10, description="Maximum learning stages to return"),
):
    """
    Extract a structured learning journey for a concept within a playlist.
    
    Returns stages ordered chronologically across videos:
    - introduction → derivation → explanation → application → examples
    
    Also includes prerequisites (terms introduced earlier) and related concepts.
    """
    try:
        journey = extract_concept_journey(
            concept=concept.strip(),
            playlist_id=playlist_id,
            max_stages=max_stages,
        )
        
        if not journey["stages"]:
            raise HTTPException(
                status_code=404,
                detail=f"No learning path found for concept '{concept}' in this playlist",
            )
        
        return journey
    
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Journey extraction failed: {str(exc)}")
