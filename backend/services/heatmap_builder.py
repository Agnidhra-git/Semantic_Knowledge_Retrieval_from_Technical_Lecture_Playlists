"""
Concept heatmap intensity computation.

For each glossary term in a playlist, computes per-video intensity
values and stores them in the concept_heatmaps table.
"""

from __future__ import annotations

import re
import logging
from db.supabase_client import get_supabase

logger = logging.getLogger(__name__)

_ROLE_WEIGHTS: dict[str, float] = {
    "introduction": 1.0,
    "derivation": 0.9,
    "explanation": 0.8,
    "application": 0.7,
    "comparison": 0.6,
    "example": 0.5,
    "summary": 0.4,
    "tangential": 0.1,
}

# ~200 common aerospace technical terms used for term_density calculation
_AEROSPACE_TERMS = frozenset(
    """lift drag thrust weight pressure velocity acceleration force moment
    torque stress strain reynolds mach bernoulli navier stokes turbulence
    laminar boundary layer viscosity density compressibility supersonic
    subsonic transonic hypersonic shock wave expansion fan oblique normal
    pitot static dynamic stagnation total entropy enthalpy temperature
    altitude atmosphere troposphere stratosphere mesosphere thermosphere
    chord span aspect ratio camber thickness airfoil naca profile
    angle attack incidence stall separation wake vortex circulation
    kutta joukowski potential flow streamline streamtube continuity
    momentum energy euler bernoulli incompressible compressible adiabatic
    isentropic polytropic isothermal isochoric isobaric cycle
    flutter divergence aeroelastic eigenvalue frequency modal damping
    bending torsion shear tension compression buckling fatigue creep
    yield ultimate fracture plastic elastic modulus poisson
    fuselage wing tail empennage nacelle fairing spar rib stringer
    skin panel bulkhead frame longeron stringers composite laminate
    carbon fibre fiberglass epoxy matrix resin cure autoclave
    aileron elevator rudder flap slat spoiler trim tab control surface
    stability static dynamic lateral longitudinal directional phugoid
    dutch roll spiral mode roll subsidence pilot handling quality
    orbit periapsis apoapsis eccentricity inclination raan argument
    perigee apogee transfer hohmann bi-elliptic gravitational
    rocket propellant oxidiser fuel combustion chamber nozzle throat
    exit specific impulse thrust mass flow rate exhaust velocity
    turbofan turbojet turboprop ramjet scramjet afterburner bypass ratio
    compressor turbine stage pressure ratio temperature ratio efficiency
    blade cascade solidity chord camber deviation incidence angle
    fan booster lpc hpc hpt lpt combustor diffuser plenum igniter
    reynolds number mach number strouhal number prandtl number
    nusselt number grashof rayleigh weber froude knudsen schmidt
    heat transfer convection conduction radiation coefficient flux
    thermal conductivity specific heat capacity latent enthalpy
    computational fluid dynamics finite element finite volume difference
    mesh grid convergence residual iteration solver turbulence model
    rans les dns sst k-epsilon k-omega spalart allmaras wall function""".split()
)


def _term_density(text: str) -> float:
    """Ratio of aerospace technical terms to total word count."""
    words = re.findall(r"[a-z]+", text.lower())
    if not words:
        return 0.0
    hits = sum(1 for w in words if w in _AEROSPACE_TERMS)
    return hits / len(words)


def build_heatmap_entry(term: str, chunk: dict, scores: dict) -> float:
    """
    Compute heatmap intensity for a (term, chunk) pair.

    intensity = 0.35×depth_score + 0.25×term_density
              + 0.25×role_weight + 0.15×centrality_score
    """
    role = chunk.get("pedagogy_role", "tangential")
    role_weight = _ROLE_WEIGHTS.get(role, 0.1)
    depth = float(scores.get("depth_score", chunk.get("concept_depth_score", 0.0)))
    centrality = float(scores.get("centrality_score", chunk.get("centrality_score", 0.0)))
    density = _term_density(chunk.get("text", ""))

    intensity = (
        0.35 * depth
        + 0.25 * density
        + 0.25 * role_weight
        + 0.15 * centrality
    )
    return round(min(1.0, max(0.0, intensity)), 4)


def build_playlist_heatmap(playlist_id: str) -> None:
    """
    For every term in the glossary of a playlist, compute per-video intensity
    values and upsert into concept_heatmaps.
    """
    supabase = get_supabase()

    # Fetch all glossary terms for the playlist
    glossary_resp = (
        supabase.table("glossary")
        .select("term, importance_score")
        .eq("playlist_id", playlist_id)
        .execute()
    )
    terms = [row["term"] for row in (glossary_resp.data or [])]
    if not terms:
        logger.info("No glossary terms found for playlist %s", playlist_id)
        return

    # Fetch all videos ordered by position
    videos_resp = (
        supabase.table("videos")
        .select("id, position")
        .eq("playlist_id", playlist_id)
        .order("position")
        .execute()
    )
    videos = videos_resp.data or []
    video_position_map = {v["id"]: v["position"] for v in videos}

    # Fetch all chunks for this playlist
    chunks_resp = (
        supabase.table("transcript_chunks")
        .select(
            "id, video_id, text, start_time, pedagogy_role,"
            " concept_depth_score, term_density_score, centrality_score"
        )
        .eq("playlist_id", playlist_id)
        .execute()
    )
    all_chunks = chunks_resp.data or []

    for term in terms:
        term_lower = term.lower()
        heatmap_entries: list[dict] = []

        for chunk in all_chunks:
            chunk_text = chunk.get("text", "").lower()
            if term_lower not in chunk_text:
                continue

            vid_id = chunk["video_id"]
            position = video_position_map.get(vid_id, 0)
            intensity = build_heatmap_entry(
                term,
                chunk,
                {
                    "depth_score": chunk.get("concept_depth_score", 0.0),
                    "centrality_score": chunk.get("centrality_score", 0.0),
                },
            )
            heatmap_entries.append(
                {
                    "video_id": vid_id,
                    "position": position,
                    "intensity": intensity,
                    "timestamp": chunk.get("start_time", 0.0),
                }
            )

        if not heatmap_entries:
            continue

        try:
            supabase.table("concept_heatmaps").upsert(
                {
                    "playlist_id": playlist_id,
                    "term": term,
                    "heatmap_data": heatmap_entries,
                },
                on_conflict="playlist_id,term",
            ).execute()
        except Exception as exc:
            logger.error("Heatmap upsert failed for term '%s': %s", term, exc)

    logger.info("Heatmap built for playlist %s (%d terms)", playlist_id, len(terms))
