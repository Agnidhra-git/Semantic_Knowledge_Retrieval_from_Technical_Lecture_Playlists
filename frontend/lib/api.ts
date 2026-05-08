// ============================================================================
// API LAYER
// All network calls to the FastAPI backend
// ============================================================================

import type {
  Playlist,
  Video,
  SearchResult,
  GlossaryTerm,
  GlossaryTermDetail,
  HeatmapPoint,
  QAPair,
} from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => 'Unknown error');
    throw new Error(`API error ${res.status} on ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// Fetch all playlists (sorted by subject on backend)
export async function fetchPlaylists(): Promise<Playlist[]> {
  return apiFetch<Playlist[]>('/playlists', {
    next: { revalidate: 60 },
  } as RequestInit);
}

// Fetch a single playlist by its Supabase UUID
export async function fetchPlaylist(id: string): Promise<Playlist> {
  return apiFetch<Playlist>(`/playlists/${id}`, {
    next: { revalidate: 300 },
  } as RequestInit);
}

// Fetch all videos in a playlist, each with nested keywords array
export async function fetchPlaylistVideos(id: string): Promise<Video[]> {
  return apiFetch<Video[]>(`/playlists/${id}/videos`, {
    next: { revalidate: 300 },
  } as RequestInit);
}

// Run semantic search
// scope: 'global' to search all playlists, or a playlist UUID for scoped
// topK: number of results to return (default 5, backend max 20)
// filters: optional array of pedagogy roles to filter results (server-side)
export async function search(
  query: string,
  scope: 'global' | string = 'global',
  topK: number = 5,
  filters?: import('./types').PedagogyRole[]
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    scope,
    top_k: String(topK),
  });
  
  // Add pedagogy role filters as query params (server-side filtering)
  if (filters && filters.length > 0) {
    filters.forEach(role => params.append('pedagogy_roles', role));
  }
  
  return apiFetch<SearchResult[]>(`/search?${params}`);
}

// Fetch the full glossary for a playlist
export async function fetchGlossary(playlistId: string): Promise<GlossaryTerm[]> {
  return apiFetch<GlossaryTerm[]>(`/glossary/${playlistId}`, {
    next: { revalidate: 300 },
  } as RequestInit);
}

// Fetch detailed information for a single glossary term including chunk snippets
export async function fetchGlossaryTermDetail(
  playlistId: string,
  term: string
): Promise<GlossaryTermDetail> {
  return apiFetch<GlossaryTermDetail>(`/glossary/${playlistId}/${encodeURIComponent(term)}`);
}

// Fetch heatmap data for a specific term within a playlist
export async function fetchHeatmap(
  term: string,
  playlistId: string
): Promise<HeatmapPoint[]> {
  const params = new URLSearchParams({ term, playlist_id: playlistId });
  return apiFetch<HeatmapPoint[]>(`/search/heatmap?${params}`);
}

// Fetch QA pairs for a playlist
export async function fetchQAPairs(
  playlistId: string,
  difficulty?: 'basic' | 'intermediate' | 'advanced',
  limit: number = 50
): Promise<QAPair[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (difficulty) {
    params.set('difficulty', difficulty);
  }
  return apiFetch<QAPair[]>(`/qa/${playlistId}?${params}`);
}
