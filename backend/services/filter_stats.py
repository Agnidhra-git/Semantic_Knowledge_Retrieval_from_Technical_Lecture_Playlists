"""
Helper functions for computing filter statistics and recommendations.
"""

from typing import Dict, List, Any
from collections import Counter


def compute_filter_stats(
    search_results: List[Dict[str, Any]],
    min_recommended_count: int = 5,
    min_recommended_score: float = 0.7,
) -> Dict[str, Dict[str, Any]]:
    """
    Compute statistics for pedagogy role filters based on search results.
    
    Args:
        search_results: List of search result dicts with pedagogy_role and confidence_score
        min_recommended_count: Minimum result count to recommend a filter
        min_recommended_score: Minimum average score to recommend a filter
    
    Returns:
        Dict mapping pedagogy_role to {count, avg_score, recommended}
    """
    if not search_results:
        return {}
    
    # Count occurrences and sum scores per role
    role_stats: Dict[str, Dict[str, Any]] = {}
    role_counts = Counter()
    role_score_sums: Dict[str, float] = {}
    
    for result in search_results:
        role = result.get("pedagogy_role", "explanation")
        score = result.get("confidence_score", 0.0)
        
        role_counts[role] += 1
        role_score_sums[role] = role_score_sums.get(role, 0.0) + score
    
    # Compute averages and recommendation status
    all_roles = [
        "introduction", "derivation", "explanation", "application",
        "comparison", "example", "summary", "tangential"
    ]
    
    for role in all_roles:
        count = role_counts.get(role, 0)
        if count > 0:
            avg_score = role_score_sums[role] / count
            recommended = count >= min_recommended_count and avg_score >= min_recommended_score
        else:
            avg_score = 0.0
            recommended = False
        
        role_stats[role] = {
            "count": count,
            "avg_score": round(avg_score, 4),
            "recommended": recommended,
        }
    
    return role_stats


def suggest_filters_for_query(query: str) -> List[str]:
    """
    Suggest appropriate pedagogy filters based on query patterns.
    
    Args:
        query: User search query
    
    Returns:
        List of recommended pedagogy roles
    """
    query_lower = query.lower()
    
    # Pattern-based suggestions
    suggestions = []
    
    # Definitional queries
    if any(pattern in query_lower for pattern in ["what is", "define", "definition", "explain"]):
        suggestions.extend(["introduction", "explanation"])
    
    # Mathematical derivations
    if any(pattern in query_lower for pattern in ["derive", "proof", "derivation", "show that"]):
        suggestions.append("derivation")
    
    # Practical applications
    if any(pattern in query_lower for pattern in ["example", "case", "application", "apply"]):
        suggestions.extend(["application", "example"])
    
    # Comparisons
    if any(pattern in query_lower for pattern in ["vs", "versus", "difference", "compare", "comparison"]):
        suggestions.append("comparison")
    
    # Default to broad search if no patterns match
    if not suggestions:
        suggestions = ["introduction", "explanation", "application"]
    
    # Remove duplicates while preserving order
    seen = set()
    return [s for s in suggestions if not (s in seen or seen.add(s))]
