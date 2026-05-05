from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from db.supabase_client import get_supabase
from services.search_engine import semantic_search
from services.filter_stats import compute_filter_stats, suggest_filters_for_query
from services.equation_search import search_equations

router = APIRouter()


@router.get("")
async def search(
    q: str = Query(..., min_length=2, description="Search query"),
    scope: str = Query("global", description="'global' or a playlist_id UUID"),
    top_k: int = Query(5, ge=1, le=20, description="Number of results to return"),
    pedagogy_roles: Optional[List[str]] = Query(
        None,
        description="Filter by pedagogy roles (introduction, derivation, explanation, etc.)"
    ),
    min_depth_score: Optional[float] = Query(
        None, ge=0.0, le=1.0, description="Minimum concept depth score (0-1)"
    ),
    include_filter_stats: bool = Query(
        False, description="Include filter statistics and recommendations"
    ),
):
    """
    Semantic search across lecture chunks with optional filters.
    
    Scope can be 'global' (all playlists) or a specific playlist UUID.
    
    Pedagogy roles: introduction, derivation, explanation, application,
                    comparison, example, summary, tangential
    
    Returns array of SearchResult objects, or {results, filter_stats, suggested_filters}
    if include_filter_stats=true.
    """
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query must not be empty")

    results = semantic_search(
        query=q.strip(),
        scope=scope,
        top_k=top_k,
        pedagogy_roles=pedagogy_roles,
        min_depth_score=min_depth_score,
    )
    
    if include_filter_stats:
        # Compute filter statistics for unfiltered results
        unfiltered_results = semantic_search(
            query=q.strip(),
            scope=scope,
            top_k=20,  # Get more results for stats
            pedagogy_roles=None,  # No filter
            min_depth_score=None,
        ) if pedagogy_roles else results
        
        filter_stats = compute_filter_stats(unfiltered_results)
        suggested_filters = suggest_filters_for_query(q.strip())
        
        return {
            "results": results,
            "filter_stats": filter_stats,
            "suggested_filters": suggested_filters,
        }
    
    return results


@router.get("/heatmap")
async def get_heatmap(
    term: str = Query(..., description="Concept term to visualise"),
    playlist_id: str = Query(..., description="Playlist UUID"),
):
    """
    Return heatmap data array for a concept term across a playlist.
    Returns array of {video_id, position, intensity, timestamp} objects.
    """
    supabase = get_supabase()
    resp = (
        supabase.table("concept_heatmaps")
        .select("heatmap_data")
        .eq("playlist_id", playlist_id)
        .eq("term", term.lower().strip())
        .maybe_single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(
            status_code=404,
            detail=f"No heatmap data for term '{term}' in playlist {playlist_id}",
        )
    return resp.data["heatmap_data"]


@router.get("/equations")
async def search_for_equations(
    q: str = Query(..., min_length=2, description="Equation or concept to search for"),
    playlist_id: Optional[str] = Query(None, description="Optional playlist UUID to scope search"),
    top_k: int = Query(10, ge=1, le=20, description="Number of results to return"),
):
    """
    Search for chunks containing equations matching the query.
    
    Supports:
    - Exact equation matching (e.g., "Re = ρUL/μ")
    - Partial matching (e.g., "Reynolds number")
    - LaTeX pattern matching
    
    Returns chunks with matching equations, including timestamps for video navigation.
    """
    try:
        results = search_equations(
            query=q.strip(),
            playlist_id=playlist_id,
            top_k=top_k,
        )
        
        if not results:
            raise HTTPException(
                status_code=404,
                detail=f"No equations found matching '{q}'",
            )
        
        return results
    
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Equation search failed: {str(exc)}")
