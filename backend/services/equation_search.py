"""
Equation Search Service - Extract and search LaTeX equations from transcripts.

Provides equation normalization, indexing, and partial matching capabilities.
"""

from __future__ import annotations

import re
import logging
from typing import List, Dict, Any

from db.supabase_client import get_supabase

logger = logging.getLogger(__name__)


def normalize_equation(equation: str) -> str:
    """
    Normalize an equation for comparison.
    
    - Remove extra whitespace
    - Standardize common symbols
    - Convert to lowercase for symbols
    """
    # Remove whitespace
    eq = re.sub(r'\s+', '', equation)
    
    # Standardize common variations
    eq = eq.replace('\\cdot', '*')
    eq = eq.replace('\\times', '*')
    eq = eq.replace('\\div', '/')
    
    return eq


def extract_equations_from_text(text: str) -> List[str]:
    """
    Extract LaTeX-style equations from text.
    
    Looks for patterns like:
    - Standalone variables with symbols: Re = ...
    - Fractions: \\frac{...}{...}
    - Greek letters: \\alpha, \\beta, etc.
    """
    equations = []
    
    # Pattern 1: Equations with equals sign
    eq_pattern = r'([A-Z][a-z]?\s*=\s*[^.]+?)(?=[.;,]|\s+(?:where|and|or|if|$))'
    matches = re.findall(eq_pattern, text)
    equations.extend([m.strip() for m in matches])
    
    # Pattern 2: LaTeX fractions
    frac_pattern = r'\\frac\{[^}]+\}\{[^}]+\}'
    matches = re.findall(frac_pattern, text)
    equations.extend(matches)
    
    # Pattern 3: Mathematical expressions with Greek letters
    greek_pattern = r'\\(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|lambda|mu|nu|rho|sigma|tau|phi|psi|omega)[^a-zA-Z]'
    if re.search(greek_pattern, text):
        # Extract surrounding context (up to 50 chars before and after)
        for match in re.finditer(greek_pattern, text):
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 50)
            context = text[start:end].strip()
            if '=' in context:
                equations.append(context)
    
    # Deduplicate and clean
    unique_equations = list(set(equations))
    
    # Filter out very short or very long matches
    filtered = [eq for eq in unique_equations if 5 <= len(eq) <= 200]
    
    return filtered[:10]  # Max 10 equations per chunk


def search_equations(
    query: str,
    playlist_id: str | None = None,
    top_k: int = 10,
) -> List[Dict[str, Any]]:
    """
    Search for chunks containing equations matching the query.
    
    Args:
        query: Search query (can be equation text or concept name)
        playlist_id: Optional playlist to scope search
        top_k: Number of results to return
    
    Returns:
        List of chunks with matching equations
    """
    supabase = get_supabase()
    
    # Normalize query
    normalized_query = normalize_equation(query)
    
    # Build query
    query_builder = (
        supabase.table("transcript_chunks")
        .select(
            "id, video_id, playlist_id, text, start_time, end_time, "
            "pedagogy_role, equations"
        )
    )
    
    # Filter by playlist if specified
    if playlist_id:
        query_builder = query_builder.eq("playlist_id", playlist_id)
    
    # Filter chunks that have equations
    query_builder = query_builder.neq("equations", '{}')
    
    # Execute query
    try:
        resp = query_builder.limit(100).execute()
        chunks = resp.data or []
    except Exception as exc:
        logger.error("Equation search query failed: %s", exc)
        return []
    
    # Score and rank results
    scored_results = []
    
    for chunk in chunks:
        equations = chunk.get("equations", [])
        if not equations:
            continue
        
        # Calculate match score
        max_score = 0
        best_equation = None
        
        for eq in equations:
            normalized_eq = normalize_equation(eq)
            
            # Exact match
            if normalized_query in normalized_eq or normalized_eq in normalized_query:
                score = 1.0
            # Partial match on keywords
            elif any(word in normalized_eq for word in query.split() if len(word) > 2):
                score = 0.6
            else:
                score = 0.0
            
            if score > max_score:
                max_score = score
                best_equation = eq
        
        if max_score > 0:
            scored_results.append({
                "chunk_id": chunk["id"],
                "video_id": chunk["video_id"],
                "playlist_id": chunk["playlist_id"],
                "timestamp_seconds": int(chunk["start_time"]),
                "pedagogy_role": chunk["pedagogy_role"],
                "equation": best_equation,
                "snippet": chunk["text"][:300],
                "score": max_score,
            })
    
    # Sort by score and return top k
    scored_results.sort(key=lambda x: x["score"], reverse=True)
    
    return scored_results[:top_k]
