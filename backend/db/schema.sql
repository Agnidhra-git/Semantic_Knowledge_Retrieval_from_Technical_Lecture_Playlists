-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── Playlists ────────────────────────────────────────────────────────────────
create table playlists (
  id               uuid primary key default uuid_generate_v4(),
  youtube_id       text unique not null,        -- e.g. "PLbMkzneoL..."
  title            text not null,
  subject          text not null,               -- e.g. "Aerodynamics"
  description      text,                        -- LLM-generated from transcripts
  thumbnail_url    text,
  video_count      int default 0,
  processed        boolean default false,
  processing_error text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ─── Videos ───────────────────────────────────────────────────────────────────
create table videos (
  id               uuid primary key default uuid_generate_v4(),
  playlist_id      uuid references playlists(id) on delete cascade,
  youtube_id       text unique not null,
  title            text not null,
  position         int not null,               -- order in playlist
  duration_seconds int,
  thumbnail_url    text,
  published_at     timestamptz,
  processed        boolean default false,
  processing_error text,
  created_at       timestamptz default now()
);
create index on videos(playlist_id, position);

-- ─── Transcript chunks ────────────────────────────────────────────────────────
create table transcript_chunks (
  id               uuid primary key default uuid_generate_v4(),
  video_id         uuid references videos(id) on delete cascade,
  playlist_id      uuid references playlists(id) on delete cascade,
  chunk_index      int not null,
  text             text not null,
  start_time       float not null,             -- seconds
  end_time         float not null,
  -- Pedagogy classification
  pedagogy_role    text not null check (
    pedagogy_role in (
      'introduction','derivation','explanation',
      'application','comparison','tangential','example','summary'
    )
  ),
  -- Concept importance signals
  concept_depth_score   float default 0,       -- 0–1, LLM-assessed
  term_density_score    float default 0,       -- domain term density
  centrality_score      float default 0,       -- concept centrality
  -- Sentence-level boundaries for precise timestamp extraction
  sentence_boundaries   jsonb default '[]'::jsonb, -- [{text, start, end}, ...]
  -- Extracted equations (LaTeX format)
  equations            text[] default '{}',   -- Array of LaTeX equations
  -- Pinecone vector ID (for retrieval)
  pinecone_id      text unique,
  created_at       timestamptz default now()
);
create index on transcript_chunks(video_id);
create index on transcript_chunks(playlist_id);
create index on transcript_chunks(pedagogy_role);

-- ─── Keywords per video ───────────────────────────────────────────────────────
create table video_keywords (
  id               uuid primary key default uuid_generate_v4(),
  video_id         uuid references videos(id) on delete cascade,
  keyword          text not null,
  importance_score float default 0,            -- 0–1
  frequency        int default 1,
  pedagogy_context text,                       -- best role this keyword appears in
  created_at       timestamptz default now()
);
create unique index on video_keywords(video_id, keyword);
create index on video_keywords(keyword);

-- ─── Glossary ─────────────────────────────────────────────────────────────────
create table glossary (
  id                    uuid primary key default uuid_generate_v4(),
  playlist_id           uuid references playlists(id) on delete cascade,
  term                  text not null,
  definition            text,
  importance_score      float default 0,
  -- First occurrence
  first_video_id        uuid references videos(id),
  first_timestamp       float,
  -- Best segments (stored as chunk IDs)
  best_intro_chunk_id   uuid references transcript_chunks(id),
  best_deriv_chunk_id   uuid references transcript_chunks(id),
  best_expl_chunk_id    uuid references transcript_chunks(id),
  -- Relations stored as JSONB array of term strings
  related_terms         jsonb default '[]',
  -- Pinecone vector ID for glossary term embedding
  pinecone_id           text unique,
  created_at            timestamptz default now(),
  unique(playlist_id, term)
);
create index on glossary(playlist_id);

-- ─── Concept heatmaps ─────────────────────────────────────────────────────────
create table concept_heatmaps (
  id               uuid primary key default uuid_generate_v4(),
  playlist_id      uuid references playlists(id) on delete cascade,
  term             text not null,
  -- Array of {video_id, position, intensity} JSON objects
  heatmap_data     jsonb not null default '[]',
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique(playlist_id, term)
);

-- ─── QA pairs ─────────────────────────────────────────────────────────────────
create table qa_pairs (
  id               uuid primary key default uuid_generate_v4(),
  playlist_id      uuid references playlists(id) on delete cascade,
  question         text not null,
  answer           text not null,
  source_chunks    jsonb default '[]',         -- array of chunk IDs
  cross_video      boolean default false,      -- spans multiple videos
  difficulty       text check (difficulty in ('basic','intermediate','advanced')),
  created_at       timestamptz default now()
);
create index on qa_pairs(playlist_id);

-- ─── Search cache (avoid redundant LLM calls) ─────────────────────────────────
create table search_cache (
  id               uuid primary key default uuid_generate_v4(),
  query_hash       text unique not null,
  query_text       text not null,
  scope            text not null,             -- 'global' or playlist_id
  results          jsonb not null,
  expires_at       timestamptz default (now() + interval '7 days'),
  created_at       timestamptz default now()
);

-- ─── Concept dependencies (prerequisite discovery) ─────────────────────────────
create table concept_dependencies (
  id               uuid primary key default uuid_generate_v4(),
  playlist_id      uuid references playlists(id) on delete cascade,
  prerequisite_term text not null,
  dependent_term    text not null,
  confidence       float default 0.5,          -- 0–1 based on co-occurrence strength
  created_at       timestamptz default now(),
  unique(playlist_id, prerequisite_term, dependent_term)
);
create index on concept_dependencies(playlist_id);
create index on concept_dependencies(dependent_term);
