// ============================================================================
// TYPE DEFINITIONS
// All TypeScript interfaces matching backend API response schemas
// ============================================================================

// Represents one YouTube playlist (course)
export interface Playlist {
  id: string;
  youtube_id: string;
  title: string;
  subject: string;
  description: string;
  thumbnail_url: string;
  video_count: number;
  processed: boolean;
  processing_error?: string | null;
  created_at: string;
  updated_at: string;
}

// Keyword associated with a video
export interface VideoKeyword {
  keyword: string;
  importance_score: number;
  frequency: number;
  pedagogy_context: string;
}

// One lecture video inside a playlist
export interface Video {
  id: string;
  youtube_id: string;
  title: string;
  position: number;
  duration_seconds: number;
  thumbnail_url: string;
  published_at?: string;
  processed: boolean;
  processing_error?: string | null;
  keywords: VideoKeyword[];
}

// The 8 pedagogical roles a transcript chunk can be classified as
export type PedagogyRole =
  | 'introduction'
  | 'derivation'
  | 'explanation'
  | 'application'
  | 'comparison'
  | 'tangential'
  | 'example'
  | 'summary';

// One semantic search result
export interface SearchResult {
  video_id: string;
  video_title: string;
  playlist_id: string;
  timestamp_seconds: number;
  youtube_url: string;
  snippet_text: string;
  pedagogy_role: PedagogyRole;
  confidence_score: number;
  relevance_reason: string;
}

// One term in the playlist glossary
export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  importance_score: number;
  first_video_id: string;
  first_timestamp: number;
  related_terms: string[];
  created_at: string;
}

// Chunk snippet with video information for glossary term details
export interface ChunkSnippet {
  text: string;
  start_time: number;
  end_time: number;
  pedagogy_role: PedagogyRole;
  video_id: string;
  video_youtube_id: string;
  video_title: string;
}

// Detailed glossary term with chunk snippets
export interface GlossaryTermDetail extends GlossaryTerm {
  best_intro_chunk: ChunkSnippet | null;
  best_deriv_chunk: ChunkSnippet | null;
  best_expl_chunk: ChunkSnippet | null;
  first_video: { title: string; youtube_id: string } | null;
}

// One point in the concept intensity heatmap
export interface HeatmapPoint {
  video_id: string;
  position: number;
  intensity: number;
  timestamp: number;
}

// Internal UI state type used in useSearch hook
export type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; results: SearchResult[]; query: string }
  | { status: 'error'; message: string };

// QA pair from backend
export interface QAPair {
  id: string;
  question: string;
  answer: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
  cross_video: boolean;
  source_chunks: string[];
  created_at: string;
}
