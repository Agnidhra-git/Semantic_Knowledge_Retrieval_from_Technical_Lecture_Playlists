/**
 * ============================================================================
 * AEROSPACE LECTURE PLATFORM — COMPLETE BACKEND DOCUMENTATION
 * ============================================================================
 *
 * This file is a complete, end-to-end description of the backend system.
 * It is written as a JavaScript documentation file — every function,
 * pipeline stage, data structure, API route, and design decision is described
 * here in full detail with annotated pseudocode/real code patterns.
 *
 * Stack:
 *   Language        : Python 3.11
 *   Framework       : FastAPI
 *   LLM             : Google Gemini 1.5 Flash (free tier)
 *   Embeddings      : Gemini text-embedding-004 (768-dim)
 *   Relational DB   : Supabase (PostgreSQL, free tier)
 *   Vector DB       : Pinecone (serverless, free tier)
 *   Transcript      : youtube-transcript-api + yt-dlp fallback
 *   Metadata        : YouTube Data API v3
 *   Hosting         : Render (backend) + Vercel (frontend)
 *
 * ============================================================================
 */


// ============================================================================
// SECTION 1 — PROJECT STRUCTURE
// ============================================================================

/**
 * backend/
 * ├── main.py                        FastAPI app entry point
 * ├── config.py                      Pydantic settings from .env
 * ├── requirements.txt
 * ├── .env.example
 * │
 * ├── db/
 * │   ├── supabase_client.py         Singleton Supabase client
 * │   ├── pinecone_client.py         Singleton Pinecone index handle
 * │   └── schema.sql                 Full PostgreSQL schema
 * │
 * ├── services/
 * │   ├── youtube_service.py         Playlist + video metadata (YT Data API v3)
 * │   ├── transcript_service.py      Robust multi-strategy transcript fetcher
 * │   ├── chunker.py                 Semantic topic-aware chunking
 * │   ├── classifier.py              Gemini pedagogy role classifier
 * │   ├── keyword_extractor.py       Gemini keyword + importance scorer
 * │   ├── embedder.py                Gemini text-embedding-004 wrapper
 * │   ├── heatmap_builder.py         Concept intensity heatmap builder
 * │   ├── search_engine.py           Semantic search + re-ranker
 * │   ├── glossary_builder.py        Cross-video glossary constructor
 * │   └── qa_generator.py            QA pair generator (single + cross-video)
 * │
 * ├── routers/
 * │   ├── playlists.py
 * │   ├── videos.py
 * │   ├── search.py
 * │   ├── glossary.py
 * │   └── ingest.py
 * │
 * └── tasks/
 *     └── pipeline.py                Full per-video + per-playlist orchestrator
 */


// ============================================================================
// SECTION 2 — ENVIRONMENT VARIABLES (.env.example)
// ============================================================================

/**
 * # .env.example
 *
 * YOUTUBE_API_KEY=AIza...
 * GEMINI_API_KEY=AIza...
 * SUPABASE_URL=https://xxxx.supabase.co
 * SUPABASE_SERVICE_ROLE_KEY=eyJ...
 * PINECONE_API_KEY=pcsk_...
 * PINECONE_INDEX_NAME=lecture-chunks
 * SECRET_ADMIN_KEY=any-secret-string-you-choose
 * CORS_ORIGINS=http://localhost:3000
 *
 * config.py reads all of these via pydantic-settings:
 *
 *   from pydantic_settings import BaseSettings
 *   class Settings(BaseSettings):
 *       youtube_api_key: str
 *       gemini_api_key: str
 *       supabase_url: str
 *       supabase_service_role_key: str
 *       pinecone_api_key: str
 *       pinecone_index_name: str = "lecture-chunks"
 *       secret_admin_key: str
 *       cors_origins: str = "http://localhost:3000"
 *       class Config:
 *           env_file = ".env"
 *   settings = Settings()
 */


// ============================================================================
// SECTION 3 — DATABASE SCHEMA (db/schema.sql)
// ============================================================================

/**
 * Run this entire block in the Supabase SQL editor once to set up the schema.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * create extension if not exists "uuid-ossp";
 *
 * -- PLAYLISTS
 * -- One row per YouTube playlist. Created manually via POST /playlists.
 * -- pipeline.py sets processed=true only after ALL stages complete.
 * create table playlists (
 *   id                uuid primary key default uuid_generate_v4(),
 *   youtube_id        text unique not null,
 *   title             text not null,
 *   subject           text not null,
 *   description       text,          -- LLM-generated summary of whole course
 *   thumbnail_url     text,
 *   video_count       int default 0,
 *   processed         boolean default false,
 *   processing_error  text,
 *   created_at        timestamptz default now(),
 *   updated_at        timestamptz default now()
 * );
 *
 * -- VIDEOS
 * -- One row per lecture video inside a playlist.
 * create table videos (
 *   id                uuid primary key default uuid_generate_v4(),
 *   playlist_id       uuid references playlists(id) on delete cascade,
 *   youtube_id        text unique not null,
 *   title             text not null,
 *   position          int not null,          -- 1-indexed order in playlist
 *   duration_seconds  int,
 *   thumbnail_url     text,
 *   published_at      timestamptz,
 *   transcript_source text,                  -- 'manual'|'auto'|'ytdlp'|'none'
 *   processed         boolean default false,
 *   processing_error  text,
 *   created_at        timestamptz default now()
 * );
 * create index on videos(playlist_id, position);
 * create index on videos(youtube_id);
 *
 * -- TRANSCRIPT_CHUNKS
 * -- The core unit of knowledge. Each chunk is a semantically coherent
 * -- slice of a lecture (90–240 seconds), classified by its pedagogical role.
 * create table transcript_chunks (
 *   id                   uuid primary key default uuid_generate_v4(),
 *   video_id             uuid references videos(id) on delete cascade,
 *   playlist_id          uuid references playlists(id) on delete cascade,
 *   chunk_index          int not null,
 *   text                 text not null,
 *   start_time           float not null,
 *   end_time             float not null,
 *   word_count           int,
 *   -- Pedagogy classification (set by classifier.py)
 *   pedagogy_role        text not null default 'tangential' check (
 *                          pedagogy_role in (
 *                            'introduction','derivation','explanation',
 *                            'application','comparison','tangential',
 *                            'example','summary'
 *                          )
 *                        ),
 *   main_concept         text,               -- primary concept in this chunk
 *   -- Scoring signals (set by classifier + heatmap_builder)
 *   concept_depth_score  float default 0,    -- 0–1, how deeply explored
 *   term_density_score   float default 0,    -- domain term density 0–1
 *   centrality_score     float default 0,    -- is this the focus? 0–1
 *   -- Vector DB reference
 *   pinecone_id          text unique,
 *   created_at           timestamptz default now()
 * );
 * create index on transcript_chunks(video_id);
 * create index on transcript_chunks(playlist_id);
 * create index on transcript_chunks(pedagogy_role);
 * create index on transcript_chunks(main_concept);
 *
 * -- VIDEO_KEYWORDS
 * -- Top 8–15 domain keywords per video, extracted and scored by Gemini.
 * create table video_keywords (
 *   id                uuid primary key default uuid_generate_v4(),
 *   video_id          uuid references videos(id) on delete cascade,
 *   playlist_id       uuid references playlists(id) on delete cascade,
 *   keyword           text not null,
 *   importance_score  float default 0,       -- 0–1, how central to lecture
 *   frequency         int default 1,         -- approximate count
 *   pedagogy_context  text,                  -- best role for this keyword
 *   best_chunk_id     uuid references transcript_chunks(id),
 *   created_at        timestamptz default now()
 * );
 * create index on video_keywords(video_id);
 * create index on video_keywords(playlist_id);
 * create index on video_keywords(keyword);
 *
 * -- GLOSSARY
 * -- One row per unique technical term in a playlist.
 * -- Points to the best explanation, derivation, and introduction chunks.
 * create table glossary (
 *   id                   uuid primary key default uuid_generate_v4(),
 *   playlist_id          uuid references playlists(id) on delete cascade,
 *   term                 text not null,
 *   definition           text,
 *   importance_score     float default 0,
 *   first_video_id       uuid references videos(id),
 *   first_timestamp      float,
 *   best_intro_chunk_id  uuid references transcript_chunks(id),
 *   best_deriv_chunk_id  uuid references transcript_chunks(id),
 *   best_expl_chunk_id   uuid references transcript_chunks(id),
 *   related_terms        jsonb default '[]',  -- array of term strings
 *   pinecone_id          text unique,
 *   created_at           timestamptz default now(),
 *   unique(playlist_id, term)
 * );
 * create index on glossary(playlist_id);
 * create index on glossary(term);
 *
 * -- CONCEPT_HEATMAPS
 * -- Per-playlist heatmap for each term. Intensity per video stored as JSONB.
 * create table concept_heatmaps (
 *   id            uuid primary key default uuid_generate_v4(),
 *   playlist_id   uuid references playlists(id) on delete cascade,
 *   term          text not null,
 *   -- Array of {video_id, position, intensity, best_timestamp}
 *   heatmap_data  jsonb not null default '[]',
 *   updated_at    timestamptz default now(),
 *   unique(playlist_id, term)
 * );
 * create index on concept_heatmaps(playlist_id, term);
 *
 * -- QA_PAIRS
 * -- Generated question-answer pairs. Can span one or multiple videos.
 * create table qa_pairs (
 *   id             uuid primary key default uuid_generate_v4(),
 *   playlist_id    uuid references playlists(id) on delete cascade,
 *   question       text not null,
 *   answer         text not null,
 *   source_chunks  jsonb default '[]',   -- array of chunk UUIDs used
 *   cross_video    boolean default false,
 *   difficulty     text check (difficulty in ('basic','intermediate','advanced')),
 *   topic_tag      text,                 -- e.g. "combustion", "nozzle flow"
 *   created_at     timestamptz default now()
 * );
 * create index on qa_pairs(playlist_id);
 * create index on qa_pairs(topic_tag);
 *
 * -- SEARCH_CACHE
 * -- Caches semantic search results for 7 days to avoid redundant Gemini calls.
 * create table search_cache (
 *   id          uuid primary key default uuid_generate_v4(),
 *   query_hash  text unique not null,
 *   query_text  text not null,
 *   scope       text not null,           -- 'global' or playlist_id
 *   results     jsonb not null,
 *   expires_at  timestamptz default (now() + interval '7 days'),
 *   created_at  timestamptz default now()
 * );
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */


// ============================================================================
// SECTION 4 — TRANSCRIPT FETCHING (services/transcript_service.py)
// ============================================================================

/**
 * WHY THIS IS THE MOST FRAGILE PART OF THE SYSTEM
 * ─────────────────────────────────────────────────
 * YouTube transcripts fail for many reasons:
 *   1. Auto-captions disabled for the channel
 *   2. Language not available in English
 *   3. youtube-transcript-api rate-limited or IP-blocked
 *   4. Video has only auto-translated captions (wrong language code)
 *   5. AgeGate or regional restrictions blocking scraping
 *   6. Transcript exists but get_transcript() throws TooManyRequests
 *
 * The solution is a four-strategy waterfall with exponential backoff.
 * Only if ALL four fail does the video get marked transcript_source='none'.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STRATEGY WATERFALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Strategy 1 — Direct English fetch (fastest, works 90% of the time)
 * ────────────────────────────────────────────────────────────────────
 *   from youtube_transcript_api import YouTubeTranscriptApi
 *   segments = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
 *
 *   If this raises TranscriptsDisabled → move to strategy 2
 *   If this raises NoTranscriptFound   → move to strategy 2
 *   If this raises TooManyRequests     → wait 60s, retry once, then strategy 2
 *   If this raises any other exception → move to strategy 2
 *
 * Strategy 2 — List all available transcripts, pick best
 * ────────────────────────────────────────────────────────
 *   transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
 *
 *   Priority order:
 *     a. manually_created English ('en', 'en-US', 'en-GB', 'en-IN')
 *     b. auto-generated English ('en')
 *     c. manually_created any language → .translate('en')
 *     d. auto-generated any language  → .translate('en')
 *
 *   For each candidate call .fetch() and return segments.
 *   .translate('en') calls the YouTube translation API — it works
 *   for NPTEL Hindi lectures translated to English.
 *
 *   If all candidates fail → strategy 3
 *
 * Strategy 3 — yt-dlp subtitle extraction
 * ─────────────────────────────────────────
 *   yt-dlp can extract VTT subtitle files directly from YouTube.
 *   Install: pip install yt-dlp
 *
 *   import subprocess, json, tempfile, os
 *
 *   with tempfile.TemporaryDirectory() as tmpdir:
 *       result = subprocess.run([
 *           "yt-dlp",
 *           "--write-auto-sub",
 *           "--write-sub",
 *           "--sub-lang", "en",
 *           "--sub-format", "vtt",
 *           "--skip-download",
 *           "--output", f"{tmpdir}/%(id)s",
 *           f"https://www.youtube.com/watch?v={video_id}"
 *       ], capture_output=True, text=True, timeout=60)
 *
 *       # Find the .vtt file
 *       for fname in os.listdir(tmpdir):
 *           if fname.endswith('.vtt'):
 *               segments = parse_vtt(os.path.join(tmpdir, fname))
 *               return segments, 'ytdlp'
 *
 *   parse_vtt(path) converts VTT timestamps into the same
 *   [{text, start, duration}] format as youtube-transcript-api.
 *
 *   VTT timestamp format: "00:01:23.456 --> 00:01:26.789"
 *   Parse with regex: r'(\d{2}):(\d{2}):(\d{2})\.(\d{3})'
 *   Convert to seconds: h*3600 + m*60 + s + ms/1000
 *
 *   If yt-dlp not installed or fails → strategy 4
 *
 * Strategy 4 — YouTube Data API v3 captions (last resort)
 * ─────────────────────────────────────────────────────────
 *   This uses the official API to list captions and download them.
 *   Requires OAuth2 (not just API key) for private captions, but
 *   public auto-generated captions are accessible.
 *
 *   GET https://www.googleapis.com/youtube/v3/captions
 *       ?part=snippet&videoId={video_id}&key={YOUTUBE_API_KEY}
 *
 *   Find a caption track with snippet.language starting with 'en'.
 *   Then download:
 *   GET https://www.googleapis.com/youtube/v3/captions/{caption_id}
 *       ?tfmt=sbv&key={YOUTUBE_API_KEY}
 *
 *   Parse the SBV format into [{text, start, duration}].
 *   SBV format:
 *     0:00:01.234,0:00:04.567
 *     This is the transcript text.
 *
 *   If all 4 strategies fail: return [], source='none'
 *   Log a WARNING for the video so operators can check manually.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POST-FETCH CLEANING
 * ─────────────────────────────────────────────────────────────────────────────
 * After any strategy succeeds, clean the segments:
 *
 *   def clean_segments(segments):
 *       cleaned = []
 *       for seg in segments:
 *           text = seg['text']
 *           # Remove music/noise markers
 *           text = re.sub(r'\[.*?\]', '', text)
 *           text = re.sub(r'\(.*?\)', '', text)
 *           # Remove HTML entities
 *           text = html.unescape(text)
 *           # Collapse whitespace
 *           text = ' '.join(text.split())
 *           # Skip empty or single-character segments
 *           if len(text.strip()) < 2:
 *               continue
 *           # Skip segments that are just numbers (slide numbers)
 *           if re.match(r'^\d+\.?$', text.strip()):
 *               continue
 *           cleaned.append({
 *               'text': text.strip(),
 *               'start': float(seg['start']),
 *               'duration': float(seg.get('duration', 2.0))
 *           })
 *       return cleaned
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPONENTIAL BACKOFF WRAPPER
 * ─────────────────────────────────────────────────────────────────────────────
 *   def with_backoff(fn, max_retries=3, base_delay=2.0):
 *       for attempt in range(max_retries):
 *           try:
 *               return fn()
 *           except RateLimitError:
 *               if attempt == max_retries - 1:
 *                   raise
 *               delay = base_delay * (2 ** attempt)   # 2s, 4s, 8s
 *               time.sleep(delay)
 *       raise RuntimeError("Max retries exceeded")
 *
 * Apply this wrapper around every Gemini API call AND around
 * youtube-transcript-api calls that might hit TooManyRequests.
 */


// ============================================================================
// SECTION 5 — SEMANTIC CHUNKING (services/chunker.py)
// ============================================================================

/**
 * WHY NOT FIXED-SIZE CHUNKS?
 * ───────────────────────────
 * Fixed-size chunks (e.g. every 500 tokens) split concept explanations
 * mid-sentence and mix unrelated content. For lecture search, a chunk
 * should correspond to a coherent unit of teaching — one concept being
 * explained, one derivation being performed, one example being worked.
 *
 * THE ALGORITHM — Lexical Cohesion + Silence Gap Detection
 * ─────────────────────────────────────────────────────────
 *
 * Step 1 — Build sentence-level windows (30–60s each)
 * ────────────────────────────────────────────────────
 *   Group raw segments into "windows" where each window is ~30–60 seconds
 *   of speech. Preserve exact start_time and cumulative end_time.
 *
 *   window = {text: joined_text, start: first_seg.start,
 *             end: last_seg.start + last_seg.duration}
 *
 * Step 2 — Compute lexical overlap between adjacent windows
 * ──────────────────────────────────────────────────────────
 *   For adjacent windows W_i and W_{i+1}:
 *     tokens_i   = set of non-stopword words in W_i (lowercased, stemmed)
 *     tokens_i1  = set of non-stopword words in W_{i+1}
 *     overlap    = |tokens_i ∩ tokens_i1| / min(|tokens_i|, |tokens_i1|)
 *
 *   Use this stopword list (aerospace-aware — do NOT remove domain terms):
 *     english_stopwords = {
 *         'the','a','an','is','are','was','were','be','been','being',
 *         'have','has','had','do','does','did','will','would','could',
 *         'should','may','might','must','shall','can','need','dare',
 *         'ought','used','to','of','in','on','at','for','with','by',
 *         'from','up','about','into','through','during','before',
 *         'after','above','below','between','out','off','over','under',
 *         'this','that','these','those','it','its','we','our','you',
 *         'your','they','their','i','my','he','she','his','her','what',
 *         'which','who','whom','when','where','why','how','all','both',
 *         'each','few','more','most','other','some','such','no','nor',
 *         'not','only','own','same','so','than','too','very','just',
 *         'now','also','here','there','then','so','if','as','because',
 *         'while','since','although','though','unless','until','once',
 *         'let','say','see','said','says','okay','right','yes','no',
 *         'um','uh','well','actually','basically','simply','going','get'
 *     }
 *
 * Step 3 — Detect topic boundaries
 * ──────────────────────────────────
 *   A boundary exists between W_i and W_{i+1} if ANY of:
 *     a. overlap < 0.15  (low lexical continuity → new topic likely)
 *     b. gap between W_i.end and W_{i+1}.start > 3.0 seconds
 *        (physical pause → lecturer starting new section)
 *     c. W_i cumulative duration since last boundary > 240 seconds
 *        (hard cap to prevent oversized chunks)
 *
 * Step 4 — Merge windows into chunks
 * ────────────────────────────────────
 *   Join all windows between boundaries into one chunk.
 *   Enforce:
 *     min chunk duration: 60 seconds  (merge forward if below)
 *     max chunk duration: 300 seconds (force boundary if above)
 *
 *   Final chunk structure:
 *   {
 *     chunk_index : int,       # 0-based
 *     text        : str,       # full joined text of all windows
 *     start_time  : float,     # seconds from video start
 *     end_time    : float,     # seconds from video start
 *     word_count  : int
 *   }
 *
 * EXAMPLE OUTPUT for a 55-minute lecture (3300s):
 *   Typically produces 18–28 chunks of 90–200 seconds each.
 *   A derivation like "Isentropic flow relations" might occupy one
 *   chunk of 180s while a brief mention of history might be 65s.
 */


// ============================================================================
// SECTION 6 — PEDAGOGY CLASSIFIER (services/classifier.py)
// ============================================================================

/**
 * Each chunk is sent to Gemini 1.5 Flash with a structured prompt
 * that asks for classification + scoring in one API call.
 *
 * WHY ONE CALL PER CHUNK (not batching)?
 * ────────────────────────────────────────
 * Batching 5 chunks in one Gemini call saves tokens but degrades
 * classification accuracy — the model confuses context between chunks.
 * For quality glossary and QA generation, per-chunk accuracy is critical.
 * Rate limit mitigation: add 1.5s sleep between calls.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROMPT TEMPLATE (system message)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   SYSTEM:
 *   You are an expert in aerospace engineering education and pedagogy analysis.
 *   You analyse transcript chunks from technical university lectures.
 *   You always respond ONLY with a valid JSON object — no markdown, no prose,
 *   no code fences, just the raw JSON starting with { and ending with }.
 *
 *   USER:
 *   Analyse this transcript chunk from an aerospace engineering lecture.
 *
 *   === TRANSCRIPT CHUNK ===
 *   {chunk_text}
 *   ========================
 *
 *   Previous chunk summary (context): "{prev_summary}"
 *
 *   Return a JSON object with exactly these fields:
 *   {
 *     "role": <one of: introduction | derivation | explanation |
 *              application | comparison | tangential | example | summary>,
 *
 *     "concept_depth_score": <float 0.0–1.0
 *       0.0 = concept merely mentioned in passing
 *       0.5 = concept explained at moderate depth
 *       1.0 = entire chunk is a rich, detailed treatment of one concept>,
 *
 *     "centrality_score": <float 0.0–1.0
 *       0.0 = many topics present, none dominant
 *       1.0 = entire chunk is focused on exactly one concept>,
 *
 *     "main_concept": <string: the single most important technical concept
 *       discussed in this chunk — be specific, e.g. "isentropic efficiency
 *       of a compressor" not just "efficiency">,
 *
 *     "supporting_concepts": <array of up to 4 other technical concepts
 *       present in this chunk, as specific strings>,
 *
 *     "one_line_summary": <string: one sentence (max 20 words) summarising
 *       what is taught in this chunk — used as context for the next chunk>
 *   }
 *
 *   Definitions of pedagogy roles:
 *   - introduction : concept formally named and defined for the first time
 *   - derivation   : step-by-step mathematical or logical derivation
 *   - explanation  : deep conceptual explanation, intuition building, analogies
 *   - application  : concept applied to solve a specific problem or scenario
 *   - comparison   : two or more concepts explicitly compared or contrasted
 *   - example      : worked numerical or physical example demonstrating concept
 *   - summary      : recap or synthesis of previously covered material
 *   - tangential   : concept mentioned briefly without depth — not the focus
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RESPONSE PARSING (robust JSON extraction)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   def parse_gemini_json(response_text):
 *       text = response_text.strip()
 *       # Strip markdown fences if Gemini wraps them despite instructions
 *       text = re.sub(r'^```json\s*', '', text)
 *       text = re.sub(r'^```\s*', '', text)
 *       text = re.sub(r'\s*```$', '', text)
 *       text = text.strip()
 *       # Find JSON object boundaries
 *       start = text.find('{')
 *       end   = text.rfind('}')
 *       if start == -1 or end == -1:
 *           raise ValueError(f"No JSON object found in: {text[:200]}")
 *       return json.loads(text[start:end+1])
 *
 *   # Validate the parsed object
 *   def validate_classification(obj):
 *       valid_roles = {
 *           'introduction','derivation','explanation','application',
 *           'comparison','tangential','example','summary'
 *       }
 *       assert obj['role'] in valid_roles, f"Invalid role: {obj['role']}"
 *       assert 0.0 <= obj['concept_depth_score'] <= 1.0
 *       assert 0.0 <= obj['centrality_score']    <= 1.0
 *       assert isinstance(obj['main_concept'], str) and len(obj['main_concept']) > 2
 *       return obj
 *
 *   # Full call with retry
 *   def classify_chunk(chunk_text, prev_summary="", max_retries=3):
 *       for attempt in range(max_retries):
 *           try:
 *               response = model.generate_content(
 *                   build_classify_prompt(chunk_text, prev_summary),
 *                   generation_config=genai.types.GenerationConfig(
 *                       temperature=0.1,       # low temp for consistent JSON
 *                       max_output_tokens=400
 *                   )
 *               )
 *               obj = parse_gemini_json(response.text)
 *               return validate_classification(obj)
 *           except (json.JSONDecodeError, AssertionError, ValueError) as e:
 *               if attempt == max_retries - 1:
 *                   # Return safe defaults rather than crashing pipeline
 *                   return {
 *                       'role': 'tangential',
 *                       'concept_depth_score': 0.3,
 *                       'centrality_score': 0.3,
 *                       'main_concept': 'unknown',
 *                       'supporting_concepts': [],
 *                       'one_line_summary': ''
 *                   }
 *               time.sleep(2.0 * (2 ** attempt))
 */


// ============================================================================
// SECTION 7 — KEYWORD EXTRACTOR (services/keyword_extractor.py)
// ============================================================================

/**
 * Called once per video after all chunks are classified.
 * Takes ALL chunk texts + their classifications for that video.
 * Returns 8–15 domain-specific technical keywords with importance scores.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROMPT TEMPLATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   SYSTEM:
 *   You are an aerospace engineering professor reviewing lecture transcripts.
 *   You extract only technically meaningful keywords — never administrative
 *   or conversational words. Respond ONLY with a valid JSON array.
 *
 *   USER:
 *   Below is the full transcript of one aerospace engineering lecture video
 *   titled: "{video_title}"
 *
 *   The lecture has been divided into {n} chunks. For each chunk I provide
 *   the text and its classified pedagogy role.
 *
 *   {chunks_block}
 *   (format per chunk: "--- Chunk N [ROLE] ---\n{text}\n")
 *
 *   Extract 8 to 15 technical keywords that best represent what is TAUGHT
 *   in this lecture. For each keyword return:
 *
 *   [
 *     {
 *       "keyword": <specific technical term, lowercase, e.g.
 *                  "isentropic flow" not "flow">,
 *       "importance_score": <float 0–1: how central is this concept to
 *                           the lecture's main content>,
 *       "frequency": <approximate count of meaningful occurrences>,
 *       "pedagogy_context": <the role where this keyword is BEST taught:
 *                           one of introduction|derivation|explanation|
 *                           application|comparison|example|summary>,
 *       "best_chunk_index": <0-based index of the chunk where this keyword
 *                           is most deeply explained>
 *     }
 *   ]
 *
 *   STRICT RULES:
 *   - Exclude: professor names, university names, course codes, greetings,
 *     "we", "this", "today", "lecture", "students", "class", generic words
 *   - Include ONLY: aerospace/propulsion/thermodynamics domain concepts
 *   - Be SPECIFIC: "turbofan bypass ratio" is better than "bypass ratio"
 *   - Minimum importance_score to include: 0.15
 *   - Sort by importance_score descending
 *
 *   Respond ONLY with the JSON array. No prose, no code fences.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TERM DENSITY SCORE (computed locally, no LLM needed)
 * ─────────────────────────────────────────────────────────────────────────────
 *   Compute term_density_score for each chunk using a domain wordlist.
 *   This avoids an extra Gemini call per chunk.
 *
 *   AEROSPACE_DOMAIN_TERMS = {
 *     # Thermodynamics
 *     'entropy','enthalpy','isentropic','adiabatic','stagnation',
 *     'total temperature','total pressure','specific heat','mach',
 *     'compression ratio','expansion ratio','efficiency','work',
 *     # Compressible flow
 *     'normal shock','oblique shock','rayleigh flow','fanno flow',
 *     'nozzle','diffuser','choked flow','throat','area ratio',
 *     # Combustion
 *     'stoichiometric','equivalence ratio','adiabatic flame',
 *     'premixed','diffusion flame','fuel air ratio','droplet',
 *     'activation energy','arrhenius','reaction rate','species',
 *     # Jet engines
 *     'thrust','specific thrust','tsfc','bypass ratio','turbofan',
 *     'turbojet','turboprop','ramjet','scramjet','afterburner',
 *     'compressor','turbine','combustor','inlet','diffuser',
 *     'overall pressure ratio','turbine entry temperature',
 *     # Rocket propulsion
 *     'specific impulse','characteristic velocity','thrust coefficient',
 *     'solid propellant','liquid propellant','hybrid rocket',
 *     'oxidizer','fuel grain','burn rate','chamber pressure',
 *     'exit velocity','nozzle expansion','mass flow rate',
 *     # General aerospace
 *     'lift','drag','propulsive efficiency','thermal efficiency',
 *     'overall efficiency','mach number','reynolds number',
 *     'boundary layer','flow separation','pressure gradient'
 *   }
 *
 *   def compute_term_density(chunk_text):
 *       words = chunk_text.lower().split()
 *       total = len(words)
 *       if total == 0:
 *           return 0.0
 *       hit_count = sum(
 *           1 for term in AEROSPACE_DOMAIN_TERMS
 *           if term in chunk_text.lower()
 *       )
 *       # Normalise: a chunk with 15+ domain terms is max density
 *       return min(hit_count / 15.0, 1.0)
 */


// ============================================================================
// SECTION 8 — EMBEDDER (services/embedder.py)
// ============================================================================

/**
 * Uses Gemini text-embedding-004.
 * Returns 768-dimensional float vectors.
 * Free tier: 1500 requests/min (very generous).
 *
 *   import google.generativeai as genai
 *
 *   def embed_text(text: str, task_type: str = "retrieval_document") -> list[float]:
 *       """
 *       task_type options:
 *         "retrieval_document"  — for indexing chunks and glossary terms
 *         "retrieval_query"     — for embedding user search queries
 *         "semantic_similarity" — for cross-concept comparison
 *         "classification"      — for pedagogy role validation
 *       """
 *       result = genai.embed_content(
 *           model="models/text-embedding-004",
 *           content=text,
 *           task_type=task_type
 *       )
 *       return result["embedding"]
 *
 *   def embed_batch(texts: list[str], task_type="retrieval_document",
 *                   batch_size=20) -> list[list[float]]:
 *       """
 *       Process in batches of 20 with 0.3s delay between batches.
 *       Gemini embedding API handles 1500/min free — batching here
 *       is a courtesy to avoid burst errors.
 *       """
 *       all_embeddings = []
 *       for i in range(0, len(texts), batch_size):
 *           batch = texts[i:i+batch_size]
 *           for text in batch:
 *               emb = embed_text(text, task_type)
 *               all_embeddings.append(emb)
 *               time.sleep(0.05)
 *           if i + batch_size < len(texts):
 *               time.sleep(0.3)
 *       return all_embeddings
 *
 * WHAT GETS EMBEDDED:
 *   1. Every transcript_chunk.text              → stored in Pinecone
 *      metadata: {video_id, playlist_id, start_time, end_time,
 *                 pedagogy_role, depth_score, centrality_score,
 *                 main_concept}
 *
 *   2. Every glossary term+definition           → stored in Pinecone
 *      metadata: {type:"glossary", playlist_id, term}
 *
 *   3. User search queries (at query time)      → NOT stored
 *      Used only for similarity lookup, task_type="retrieval_query"
 *
 * PINECONE UPSERT FORMAT:
 *   index.upsert(vectors=[
 *       {
 *           "id": str(chunk.id),          # Supabase UUID as string
 *           "values": embedding,           # 768-dim list
 *           "metadata": {
 *               "video_id":        str(chunk.video_id),
 *               "playlist_id":     str(chunk.playlist_id),
 *               "start_time":      chunk.start_time,
 *               "end_time":        chunk.end_time,
 *               "pedagogy_role":   chunk.pedagogy_role,
 *               "depth_score":     chunk.concept_depth_score,
 *               "centrality":      chunk.centrality_score,
 *               "main_concept":    chunk.main_concept or "",
 *               "type":            "chunk"
 *           }
 *       }
 *   ])
 */


// ============================================================================
// SECTION 9 — HEATMAP BUILDER (services/heatmap_builder.py)
// ============================================================================

/**
 * Builds per-term intensity maps across the entire playlist.
 * Run AFTER all videos in a playlist are processed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTENSITY FORMULA
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   ROLE_WEIGHTS = {
 *       'introduction': 1.00,
 *       'derivation':   0.90,
 *       'explanation':  0.80,
 *       'application':  0.70,
 *       'comparison':   0.60,
 *       'example':      0.50,
 *       'summary':      0.40,
 *       'tangential':   0.10,
 *   }
 *
 *   intensity = (
 *       0.35 × concept_depth_score
 *     + 0.25 × term_density_score
 *     + 0.25 × ROLE_WEIGHTS[pedagogy_role]
 *     + 0.15 × centrality_score
 *   )
 *
 *   All inputs are 0–1, so intensity is always 0–1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ALGORITHM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   def build_playlist_heatmap(playlist_id):
 *       # 1. Collect all unique terms from glossary for this playlist
 *       terms = supabase.table("glossary")
 *           .select("term")
 *           .eq("playlist_id", playlist_id)
 *           .execute().data
 *
 *       # 2. Get all chunks for this playlist ordered by video position
 *       chunks = supabase.table("transcript_chunks")
 *           .select("*, videos(position, title)")
 *           .eq("playlist_id", playlist_id)
 *           .execute().data
 *
 *       # 3. For each term, find relevant chunks and compute intensity
 *       for term_row in terms:
 *           term = term_row['term']
 *           heatmap_points = []
 *
 *           # Group chunks by video
 *           by_video = defaultdict(list)
 *           for chunk in chunks:
 *               if term.lower() in chunk['text'].lower():
 *                   by_video[chunk['video_id']].append(chunk)
 *
 *           for video_id, video_chunks in by_video.items():
 *               # Pick the chunk with highest intensity for this term in this video
 *               best = max(video_chunks, key=lambda c: compute_intensity(c))
 *               intensity = compute_intensity(best)
 *               heatmap_points.append({
 *                   "video_id":       video_id,
 *                   "position":       best['videos']['position'],
 *                   "intensity":      round(intensity, 4),
 *                   "best_timestamp": best['start_time'],
 *                   "video_title":    best['videos']['title']
 *               })
 *
 *           # Sort by video position
 *           heatmap_points.sort(key=lambda x: x['position'])
 *
 *           # Upsert into concept_heatmaps
 *           supabase.table("concept_heatmaps").upsert({
 *               "playlist_id":  playlist_id,
 *               "term":         term,
 *               "heatmap_data": heatmap_points
 *           }, on_conflict="playlist_id,term").execute()
 */


// ============================================================================
// SECTION 10 — GLOSSARY BUILDER (services/glossary_builder.py)
// ============================================================================

/**
 * Constructs a rich glossary for a playlist from all processed chunks.
 * This is the highest-quality output of the system and requires careful
 * multi-step Gemini prompting.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STEP 1 — Collect candidate terms
 * ─────────────────────────────────────────────────────────────────────────────
 *   Gather all unique keywords from video_keywords table for this playlist.
 *   Deduplicate by normalising: lowercase, strip plurals naively
 *   (e.g. "turbines" → "turbine"), merge near-duplicates
 *   (e.g. "isentropic flow" and "isentropic process" stay separate —
 *    do NOT over-merge; specificity is valuable).
 *   Filter to terms with importance_score >= 0.2 from at least 2 videos
 *   OR importance_score >= 0.5 from 1 video.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STEP 2 — Find best chunks for each term
 * ─────────────────────────────────────────────────────────────────────────────
 *   For each candidate term:
 *     a. Find all transcript_chunks where term appears in text
 *     b. Among those, find:
 *          best_intro_chunk: role='introduction', max depth_score
 *          best_deriv_chunk: role='derivation',   max depth_score
 *          best_expl_chunk:  role='explanation',  max depth_score
 *          (any of these can be None if that role doesn't exist)
 *     c. First introduction: earliest video position where role='introduction'
 *        and term in text. Record video_id and start_time.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STEP 3 — Generate definition via Gemini (one call per term)
 * ─────────────────────────────────────────────────────────────────────────────
 *   Use the best_expl_chunk text as grounding context.
 *   If no explanation chunk, fall back to best_intro_chunk.
 *   If neither, use the highest depth_score chunk containing the term.
 *
 *   PROMPT:
 *   "You are an aerospace engineering professor writing a technical glossary.
 *    Below is a transcript excerpt from a lecture where the concept
 *    '{term}' is discussed:
 *
 *    === TRANSCRIPT EXCERPT ===
 *    {best_chunk_text}
 *    ==========================
 *
 *    Write a precise, self-contained 2–3 sentence definition of '{term}'
 *    as it applies in aerospace engineering. The definition should be
 *    accurate to the level of a final-year undergraduate course.
 *    Do NOT copy verbatim from the transcript. Do NOT say 'in this lecture'.
 *    Just write the definition directly.
 *    Respond with ONLY the definition text, no labels, no JSON."
 *
 *   Sleep 1.0s between definition calls (Gemini free tier: 15 RPM).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STEP 4 — Compute importance score
 * ─────────────────────────────────────────────────────────────────────────────
 *   importance_score = (
 *       0.4 × avg(importance_score from video_keywords across all videos)
 *     + 0.3 × (number of videos where term appears / total videos) [normalised]
 *     + 0.2 × max(concept_depth_score of chunks containing term)
 *     + 0.1 × (1.0 if best_intro_chunk exists else 0.0)
 *   )
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STEP 5 — Compute related terms
 * ─────────────────────────────────────────────────────────────────────────────
 *   For each term T, find the 5 most co-occurring other terms:
 *     co_occur(T, T2) = number of chunks where BOTH T and T2 appear
 *   Return top 5 by co_occur count, minimum co_occur >= 2.
 *   This gives the graph edges for the knowledge graph.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STEP 6 — Embed and upsert
 * ─────────────────────────────────────────────────────────────────────────────
 *   Embed each term's definition using embed_text(f"{term}: {definition}")
 *   Upsert to Pinecone with metadata={type:"glossary", playlist_id, term}
 *   Upsert all rows to glossary table.
 *
 * QUALITY NOTE:
 *   The glossary is only as good as the chunk classification.
 *   Chunks classified as 'introduction' for the FIRST occurrence of a term
 *   are the most valuable for generating accurate, textbook-quality definitions.
 *   The pedagogy classifier's accuracy directly determines glossary quality.
 */


// ============================================================================
// SECTION 11 — QA GENERATOR (services/qa_generator.py)
// ============================================================================

/**
 * Generates question-answer pairs for educational use.
 * Two types: single-video (from one chunk) and cross-video (from 2+ chunks).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TYPE A — SINGLE-CHUNK QA (80% of pairs)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   CHUNK SELECTION:
 *   Prefer chunks with:
 *     - role in [derivation, explanation, application, example]
 *     - concept_depth_score >= 0.5
 *     - word_count >= 100
 *   Select 1–2 per video, distributed across the playlist for variety.
 *   Aim for 1 pair per video, skipping videos with transcript_source='none'.
 *
 *   PROMPT:
 *   "You are an aerospace engineering professor creating exam-quality questions.
 *    Below is a transcript chunk (role: {role}) from Lecture {position}
 *    of the course '{playlist_title}':
 *
 *    === CHUNK ===
 *    {chunk_text}
 *    =============
 *
 *    Generate ONE question-answer pair at difficulty level '{difficulty}'.
 *    difficulty = 'basic'        if depth_score < 0.4
 *    difficulty = 'intermediate' if depth_score 0.4–0.7
 *    difficulty = 'advanced'     if depth_score > 0.7
 *
 *    Requirements:
 *    - The question should require understanding, not just memory retrieval
 *    - For derivation chunks: ask to explain steps or derive a sub-result
 *    - For explanation chunks: ask for intuition or analogy
 *    - For application chunks: ask to apply the concept to a scenario
 *    - The answer should be 3–6 sentences, technically precise
 *    - Do not ask questions whose answer is not derivable from the chunk
 *
 *    Respond ONLY with JSON:
 *    {
 *      \"question\": \"...\",
 *      \"answer\":   \"...\",
 *      \"topic_tag\": \"<the main concept from this chunk, 1–4 words>\"
 *    }"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TYPE B — CROSS-VIDEO QA (20% of pairs)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   CHUNK SELECTION:
 *   For each glossary term with importance_score >= 0.5:
 *     Find chunks from at least 2 different videos where:
 *       - the term appears in the chunk
 *       - roles are complementary (e.g. introduction + derivation,
 *         or explanation + application)
 *     Select the best 2 chunks (highest depth_score, different videos).
 *
 *   PROMPT:
 *   "You are an aerospace engineering professor creating integrative exam
 *    questions that test deep understanding across multiple lectures.
 *
 *    Below are two transcript segments from different lectures in the
 *    course '{playlist_title}':
 *
 *    === SEGMENT A (Lecture {pos_a}, role: {role_a}) ===
 *    {chunk_a_text}
 *    ===================================================
 *
 *    === SEGMENT B (Lecture {pos_b}, role: {role_b}) ===
 *    {chunk_b_text}
 *    ===================================================
 *
 *    These two segments are connected by the concept: '{term}'.
 *    Generate ONE integrative question that requires understanding from
 *    BOTH segments to answer fully.
 *
 *    The answer must synthesise material from both segments.
 *    Difficulty: advanced.
 *
 *    Respond ONLY with JSON:
 *    {
 *      \"question\": \"...\",
 *      \"answer\":   \"...\",
 *      \"topic_tag\": \"{term}\"
 *    }"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RATE LIMITING STRATEGY
 * ─────────────────────────────────────────────────────────────────────────────
 *   Gemini free tier: 15 requests/minute.
 *   QA generation for 40 videos = ~48 pairs = ~48 Gemini calls.
 *   Time: ~48/15 = 3.2 minutes for QA alone. Acceptable.
 *   Add time.sleep(4.0) between each QA generation call to stay
 *   safely under the limit (15 calls/min = 1 call per 4 seconds).
 */


// ============================================================================
// SECTION 12 — SEARCH ENGINE (services/search_engine.py)
// ============================================================================

/**
 * The core user-facing feature. Implements semantic search with re-ranking.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEARCH FLOW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   def search(query: str, scope: str, top_k: int = 5) -> list[SearchResult]:
 *
 *   Step 1 — Check search cache
 *     query_hash = sha256(f"{query}|{scope}".encode()).hexdigest()
 *     cached = supabase.table("search_cache")
 *         .select("results")
 *         .eq("query_hash", query_hash)
 *         .gt("expires_at", "now()")
 *         .execute()
 *     if cached.data:
 *         return cached.data[0]['results']
 *
 *   Step 2 — Embed the query
 *     query_vector = embed_text(query, task_type="retrieval_query")
 *
 *   Step 3 — Pinecone similarity search
 *     filter = {"playlist_id": scope} if scope != "global" else {}
 *     pinecone_results = index.query(
 *         vector=query_vector,
 *         top_k=20,          # fetch 20, re-rank to top_k
 *         filter=filter,
 *         include_metadata=True
 *     )
 *
 *   Step 4 — Fetch full chunk data from Supabase
 *     chunk_ids = [r.id for r in pinecone_results.matches]
 *     chunks = supabase.table("transcript_chunks")
 *         .select("*, videos(title, youtube_id, position, playlist_id)")
 *         .in_("id", chunk_ids)
 *         .execute().data
 *
 *   Step 5 — Re-rank using composite score
 *     ROLE_WEIGHTS = {introduction:1.0, derivation:0.9, explanation:0.8,
 *                     application:0.7, comparison:0.6, example:0.5,
 *                     summary:0.4, tangential:0.1}
 *
 *     for chunk in chunks:
 *         cosine_sim = pinecone_results.matches[chunk.id].score
 *         final_score = (
 *             0.40 × cosine_sim
 *           + 0.25 × chunk.concept_depth_score
 *           + 0.20 × chunk.centrality_score
 *           + 0.15 × ROLE_WEIGHTS[chunk.pedagogy_role]
 *         )
 *         chunk.final_score = final_score
 *
 *     Re-ranked = sorted by final_score descending, take top_k.
 *
 *   Step 6 — Generate relevance reasons (one Gemini call for all top_k)
 *     Send all top_k chunks to Gemini in ONE call:
 *
 *     PROMPT:
 *     "For the search query '{query}', here are {top_k} transcript chunks.
 *      For each chunk, write a single sentence (max 15 words) explaining
 *      exactly why this chunk is relevant to the query.
 *      Be specific — mention what concept or aspect connects the chunk
 *      to the query.
 *
 *      {for i, c in enumerate(top_k_chunks):
 *          f"Chunk {i}: [{c.pedagogy_role}] {c.text[:300]}..."}
 *
 *      Respond ONLY with a JSON array of {top_k} strings, one per chunk,
 *      in the same order."
 *
 *   Step 7 — Build response objects
 *     For each re-ranked chunk build a SearchResult:
 *     {
 *       video_id:          chunk.video_id,
 *       video_title:       chunk.videos.title,
 *       playlist_id:       chunk.playlist_id,
 *       timestamp_seconds: int(chunk.start_time),
 *       youtube_url:       f"https://youtube.com/watch?v={chunk.videos.youtube_id}&t={int(chunk.start_time)}",
 *       snippet_text:      chunk.text[:400],
 *       pedagogy_role:     chunk.pedagogy_role,
 *       confidence_score:  round(chunk.final_score, 3),
 *       relevance_reason:  reasons[i]
 *     }
 *
 *   Step 8 — Cache results
 *     supabase.table("search_cache").upsert({
 *         "query_hash": query_hash,
 *         "query_text": query,
 *         "scope":      scope,
 *         "results":    results_json
 *     }).execute()
 */


// ============================================================================
// SECTION 13 — PIPELINE ORCHESTRATOR (tasks/pipeline.py)
// ============================================================================

/**
 * This is the heart of the system. Called once per playlist.
 * Processes all videos sequentially to stay within API rate limits.
 * Designed to be IDEMPOTENT — safe to restart after failure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FULL PIPELINE — process_playlist(playlist_id: str)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   GUARD CLAUSE:
 *   if playlist.processed == True:
 *       return {"status": "already_processed"}
 *
 *   ── STAGE 1: Playlist metadata ─────────────────────────────────────────────
 *   metadata = youtube_service.get_playlist_metadata(playlist.youtube_id)
 *   supabase.table("playlists").update({
 *       "title":         metadata['title'],
 *       "thumbnail_url": metadata['thumbnail'],
 *       "video_count":   metadata['video_count']
 *   }).eq("id", playlist_id).execute()
 *
 *   ── STAGE 2: Fetch all video metadata ──────────────────────────────────────
 *   videos = youtube_service.get_playlist_videos(playlist.youtube_id)
 *   # Upsert all videos (safe to re-run — uses youtube_id as unique key)
 *   for video in videos:
 *       supabase.table("videos").upsert(video_row, on_conflict="youtube_id")
 *
 *   ── STAGE 3: Per-video processing loop ─────────────────────────────────────
 *   for video in videos_ordered_by_position:
 *       if video.processed:
 *           continue    # Skip already-processed videos (restart safety)
 *
 *       try:
 *           _process_single_video(video, playlist_id)
 *           supabase.table("videos")
 *               .update({"processed": True})
 *               .eq("id", video.id).execute()
 *
 *       except Exception as e:
 *           supabase.table("videos")
 *               .update({"processing_error": str(e)})
 *               .eq("id", video.id).execute()
 *           logger.error(f"Video {video.youtube_id} failed: {e}")
 *           continue     # Don't stop the playlist for one bad video
 *
 *       time.sleep(2.0)  # Courtesy delay between videos
 *
 *   ── STAGE 4: Post-processing (after all videos) ─────────────────────────────
 *   glossary_builder.build_glossary(playlist_id)
 *   heatmap_builder.build_playlist_heatmap(playlist_id)
 *   qa_generator.generate_qa_pairs(playlist_id)
 *
 *   ── STAGE 5: Playlist-level description ────────────────────────────────────
 *   top_terms = get_top_glossary_terms(playlist_id, n=10)
 *   video_titles = [v.title for v in videos[:5]]  # first 5 as representative
 *
 *   desc_prompt = f"""
 *   Write a 3-sentence academic description of this lecture course.
 *   Course title: '{playlist_title}'
 *   Key topics covered: {', '.join(top_terms)}
 *   Sample lecture titles: {'; '.join(video_titles)}
 *   Write in third person. Be specific about aerospace engineering content.
 *   Output only the description text.
 *   """
 *   description = model.generate_content(desc_prompt).text.strip()
 *
 *   supabase.table("playlists").update({
 *       "description": description,
 *       "processed": True
 *   }).eq("id", playlist_id).execute()
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PER-VIDEO PROCESSING (_process_single_video)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   This function contains the entire per-video AI pipeline.
 *   It is called once per video inside the loop above.
 *
 *   def _process_single_video(video, playlist_id):
 *
 *   ── 3a. Fetch transcript ────────────────────────────────────────────────────
 *       segments, source = transcript_service.fetch_transcript(video.youtube_id)
 *       if not segments:
 *           raise ValueError(f"No transcript available (all 4 strategies failed)")
 *       supabase.table("videos")
 *           .update({"transcript_source": source})
 *           .eq("id", video.id).execute()
 *
 *   ── 3b. Chunk the transcript ────────────────────────────────────────────────
 *       chunks = chunker.chunk_transcript(segments)
 *       # chunks = [{text, start_time, end_time, chunk_index, word_count}]
 *
 *   ── 3c. Classify each chunk with Gemini ────────────────────────────────────
 *       classified_chunks = []
 *       prev_summary = ""
 *       for chunk in chunks:
 *           result = classifier.classify_chunk(chunk['text'], prev_summary)
 *           chunk.update({
 *               'pedagogy_role':       result['role'],
 *               'main_concept':        result['main_concept'],
 *               'concept_depth_score': result['concept_depth_score'],
 *               'centrality_score':    result['centrality_score'],
 *               'supporting_concepts': result['supporting_concepts']
 *           })
 *           prev_summary = result.get('one_line_summary', '')
 *           classified_chunks.append(chunk)
 *           time.sleep(1.5)   # Gemini rate limit: 15 RPM = 1 per 4s; 1.5s is safe with some parallelism headroom
 *
 *   ── 3d. Compute term_density_score locally ──────────────────────────────────
 *       for chunk in classified_chunks:
 *           chunk['term_density_score'] = keyword_extractor.compute_term_density(
 *               chunk['text']
 *           )
 *
 *   ── 3e. Upsert chunks to Supabase ───────────────────────────────────────────
 *       chunk_rows = []
 *       for chunk in classified_chunks:
 *           row = {
 *               "id":                  str(uuid4()),
 *               "video_id":            str(video.id),
 *               "playlist_id":         str(playlist_id),
 *               "chunk_index":         chunk['chunk_index'],
 *               "text":                chunk['text'],
 *               "start_time":          chunk['start_time'],
 *               "end_time":            chunk['end_time'],
 *               "word_count":          chunk['word_count'],
 *               "pedagogy_role":       chunk['pedagogy_role'],
 *               "main_concept":        chunk['main_concept'],
 *               "concept_depth_score": chunk['concept_depth_score'],
 *               "term_density_score":  chunk['term_density_score'],
 *               "centrality_score":    chunk['centrality_score'],
 *           }
 *           chunk_rows.append(row)
 *       supabase.table("transcript_chunks").upsert(chunk_rows).execute()
 *
 *   ── 3f. Embed all chunks and upsert to Pinecone ─────────────────────────────
 *       texts = [c['text'] for c in classified_chunks]
 *       embeddings = embedder.embed_batch(texts)
 *       pinecone_vectors = []
 *       for i, (chunk_row, emb) in enumerate(zip(chunk_rows, embeddings)):
 *           chunk_row['pinecone_id'] = chunk_row['id']   # use same UUID
 *           pinecone_vectors.append({
 *               "id":     chunk_row['id'],
 *               "values": emb,
 *               "metadata": {
 *                   "video_id":      chunk_row['video_id'],
 *                   "playlist_id":   chunk_row['playlist_id'],
 *                   "start_time":    chunk_row['start_time'],
 *                   "end_time":      chunk_row['end_time'],
 *                   "pedagogy_role": chunk_row['pedagogy_role'],
 *                   "depth_score":   chunk_row['concept_depth_score'],
 *                   "centrality":    chunk_row['centrality_score'],
 *                   "main_concept":  chunk_row['main_concept'] or "",
 *                   "type":          "chunk"
 *               }
 *           })
 *       # Upsert in batches of 100
 *       for i in range(0, len(pinecone_vectors), 100):
 *           index.upsert(vectors=pinecone_vectors[i:i+100])
 *
 *       # Update pinecone_id back to Supabase
 *       for chunk_row in chunk_rows:
 *           supabase.table("transcript_chunks")
 *               .update({"pinecone_id": chunk_row['id']})
 *               .eq("id", chunk_row['id']).execute()
 *
 *   ── 3g. Extract video keywords via Gemini ───────────────────────────────────
 *       keywords = keyword_extractor.extract_video_keywords(
 *           video_id=video.id,
 *           video_title=video.title,
 *           chunks=classified_chunks
 *       )
 *       # Find best_chunk_id for each keyword
 *       for kw in keywords:
 *           best_idx = kw['best_chunk_index']
 *           if 0 <= best_idx < len(chunk_rows):
 *               kw['best_chunk_id'] = chunk_rows[best_idx]['id']
 *           else:
 *               kw['best_chunk_id'] = None
 *           kw['video_id']    = str(video.id)
 *           kw['playlist_id'] = str(playlist_id)
 *       supabase.table("video_keywords").upsert(keywords).execute()
 *
 *   Total Gemini calls per video:
 *     - 1 per chunk for classification (avg 20 chunks → 20 calls)
 *     - 1 for keyword extraction
 *     Total: ~21 calls per video
 *   At 1.5s sleep between classify calls: ~30s classify time per video
 *   For 40 videos: ~21 minutes classify time
 *   Add embedding + IO: total pipeline ≈ 30–40 minutes for 40 videos
 */


// ============================================================================
// SECTION 14 — API ROUTES
// ============================================================================

/**
 * All routes are defined in routers/. Mounted in main.py with prefixes.
 *
 * main.py:
 *   app = FastAPI(title="Aerospace Lecture Platform")
 *   app.add_middleware(CORSMiddleware,
 *       allow_origins=settings.cors_origins.split(","),
 *       allow_methods=["*"],
 *       allow_headers=["*"]
 *   )
 *   app.include_router(playlists_router, prefix="/playlists")
 *   app.include_router(videos_router)
 *   app.include_router(search_router,    prefix="/search")
 *   app.include_router(glossary_router,  prefix="/glossary")
 *   app.include_router(ingest_router,    prefix="/ingest")
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * routers/playlists.py
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   GET  /playlists
 *        Returns all playlists sorted by subject.
 *        Response: [{id, youtube_id, title, subject, description,
 *                    thumbnail_url, video_count, processed}]
 *
 *   GET  /playlists/{playlist_id}
 *        Returns single playlist detail.
 *
 *   POST /playlists
 *        Body: {youtube_id: str, subject: str}
 *        Creates a playlist record. Does NOT trigger ingestion.
 *        If youtube_id already exists → return 409 Conflict with existing record.
 *        Response: full playlist object.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * routers/videos.py
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   GET  /playlists/{playlist_id}/videos
 *        Returns all videos ordered by position.
 *        Each video includes its top 15 keywords (sorted by importance_score).
 *        Response: [{id, youtube_id, title, position, duration_seconds,
 *                    thumbnail_url, transcript_source, processed,
 *                    keywords: [{keyword, importance_score, pedagogy_context}]}]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * routers/search.py
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   GET  /search
 *        Query params:
 *          q       : str  — the search query (required)
 *          scope   : str  — 'global' or a playlist UUID (default 'global')
 *          top_k   : int  — number of results (default 5, max 10)
 *        Returns semantic search results with timestamps.
 *        Response: [{video_id, video_title, playlist_id, timestamp_seconds,
 *                    youtube_url, snippet_text, pedagogy_role,
 *                    confidence_score, relevance_reason}]
 *
 *   GET  /search/heatmap
 *        Query params:
 *          term        : str — the concept term
 *          playlist_id : str — playlist UUID (required)
 *        Returns heatmap data for the term across the playlist.
 *        Response: [{video_id, position, intensity, best_timestamp,
 *                    video_title}]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * routers/glossary.py
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   GET  /glossary/{playlist_id}
 *        Returns all glossary terms sorted by importance_score desc.
 *        Response: [{term, definition, importance_score, related_terms,
 *                    first_video_id, first_timestamp}]
 *
 *   GET  /glossary/{playlist_id}/{term}
 *        Returns full term detail including best chunk snippets.
 *        Fetches the text of best_intro_chunk, best_deriv_chunk,
 *        best_expl_chunk and includes them.
 *        Response: full glossary object + {
 *          intro_snippet: {text, start_time, video_title, youtube_url},
 *          deriv_snippet: {text, start_time, video_title, youtube_url},
 *          expl_snippet:  {text, start_time, video_title, youtube_url}
 *        }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * routers/ingest.py
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   POST /ingest/{playlist_id}
 *        Auth: Bearer token must match SECRET_ADMIN_KEY
 *              checked via: Depends(verify_admin_token)
 *        Triggers pipeline.process_playlist() as a BackgroundTask.
 *        Response: {status: "processing_started", playlist_id: "..."}
 *
 *   GET  /ingest/status/{playlist_id}
 *        Returns ingestion progress.
 *        Response: {
 *          playlist_id:       str,
 *          playlist_processed: bool,
 *          total_videos:      int,
 *          processed_videos:  int,  ← count where videos.processed=true
 *          failed_videos:     int,  ← count where processing_error is not null
 *          status:            'not_started' | 'processing' | 'complete' | 'error'
 *        }
 *
 *   verify_admin_token dependency:
 *   def verify_admin_token(authorization: str = Header(...)):
 *       if not authorization.startswith("Bearer "):
 *           raise HTTPException(401, "Missing Bearer token")
 *       token = authorization.split(" ")[1]
 *       if token != settings.secret_admin_key:
 *           raise HTTPException(403, "Invalid admin token")
 */


// ============================================================================
// SECTION 15 — REQUIREMENTS.TXT
// ============================================================================

/**
 * fastapi==0.111.0
 * uvicorn[standard]==0.29.0
 * python-dotenv==1.0.1
 * pydantic-settings==2.2.1
 * supabase==2.4.2
 * pinecone-client==3.2.2
 * google-generativeai==0.5.4
 * youtube-transcript-api==0.6.2
 * yt-dlp==2024.4.9
 * requests==2.31.0
 * httpx==0.27.0
 * python-multipart==0.0.9
 *
 * Notes:
 * - yt-dlp requires ffmpeg to be installed on the system for some operations
 *   but NOT for subtitle extraction (used here). No ffmpeg needed.
 * - On Render free tier, install yt-dlp via requirements.txt as above.
 *   It will be available as a command-line tool via subprocess.
 */


// ============================================================================
// SECTION 16 — HOSTING SETUP
// ============================================================================

/**
 * RENDER (backend FastAPI)
 * ─────────────────────────
 * 1. Push backend/ to a GitHub repo
 * 2. New Web Service on render.com → connect GitHub repo
 * 3. Build command: pip install -r requirements.txt
 * 4. Start command: uvicorn main:app --host 0.0.0.0 --port $PORT
 * 5. Add all env vars in Render dashboard (Environment tab)
 * 6. Free tier: 750 hrs/month, spins down after 15 min inactivity
 *    → first request after idle takes ~30s cold start
 *    → this is acceptable; the frontend shows a loading state
 *
 * SUPABASE (PostgreSQL)
 * ──────────────────────
 * 1. Create project at supabase.com
 * 2. Run schema.sql in SQL Editor (Settings → SQL Editor → New Query)
 * 3. Copy Project URL and service_role key from Settings → API
 * 4. Free tier: 500MB storage, 2 projects, no credit card required
 *
 * PINECONE (Vector DB)
 * ─────────────────────
 * 1. Sign up at pinecone.io
 * 2. Create Serverless index:
 *      Name:      lecture-chunks
 *      Dimension: 768
 *      Metric:    cosine
 *      Cloud:     AWS us-east-1 (free tier)
 * 3. Copy API key from dashboard
 * 4. Free tier: 1 index, 100k vectors, 2GB storage
 *    For 40 videos × 25 avg chunks = 1000 vectors — far within limits
 *    For 10 playlists × 40 videos × 25 chunks = 10,000 vectors — still fine
 *
 * VERCEL (frontend Next.js)
 * ──────────────────────────
 * 1. Push frontend/ to GitHub
 * 2. Import project on vercel.com
 * 3. Add env var: NEXT_PUBLIC_API_URL = https://your-render-app.onrender.com
 * 4. Deploy — automatic on every git push
 * 5. Free tier: unlimited hobby deployments
 */


// ============================================================================
// SECTION 17 — COMMON FAILURE MODES AND FIXES
// ============================================================================

/**
 * FAILURE: youtube-transcript-api returns TranscriptsDisabled
 * ─────────────────────────────────────────────────────────────
 * Cause: The YouTube channel has disabled auto-captions.
 * Fix: Falls through to yt-dlp strategy. If yt-dlp also fails,
 *      video is marked transcript_source='none' and skipped.
 *      Log it so the operator can check manually.
 *
 * FAILURE: Gemini returns non-JSON or partial JSON
 * ─────────────────────────────────────────────────
 * Cause: Model hallucination, context length exceeded, or temperature too high.
 * Fix:  parse_gemini_json() strips markdown fences and finds JSON boundaries.
 *       If still invalid: retry with temperature=0.0 (greedy decoding).
 *       After 3 retries: use safe defaults. Never crash the pipeline.
 *
 * FAILURE: Pinecone upsert succeeds but search returns 0 results
 * ──────────────────────────────────────────────────────────────
 * Cause: Metadata filter key mismatch (e.g. "playlistId" vs "playlist_id")
 * Fix:  Check index.describe_index_stats() for actual metadata keys.
 *       Ensure EXACT key names match between upsert metadata and query filter.
 *
 * FAILURE: Pipeline stalls at video N with no error log
 * ──────────────────────────────────────────────────────
 * Cause: Usually a silent Gemini timeout (>60s response time on free tier)
 * Fix:  Wrap all Gemini calls with a 30-second timeout:
 *       response = model.generate_content(..., request_options={"timeout": 30})
 *       If timeout: treat as retry-able error (3 retries then use defaults).
 *
 * FAILURE: Supabase upsert fails with "duplicate key" error
 * ──────────────────────────────────────────────────────────
 * Cause: Pipeline restarted mid-run, inserting rows that already exist.
 * Fix:  Always use .upsert() with on_conflict parameter, never .insert().
 *       For transcript_chunks: on_conflict="video_id,chunk_index"
 *       For video_keywords:    on_conflict="video_id,keyword"
 *       For glossary:          on_conflict="playlist_id,term"
 *
 * FAILURE: Render cold start causes first ingest request to time out
 * ──────────────────────────────────────────────────────────────────
 * Cause: Render free tier kills the process after 15min idle.
 *        The /ingest POST itself may return 502 if cold start > 30s.
 * Fix:  Set ingest as a BackgroundTask. The POST returns immediately (202).
 *       The pipeline runs in the background. Poll /ingest/status to track.
 */


// ============================================================================
// SECTION 18 — COMPLETE CURSOR PROMPT TO IMPLEMENT THIS BACKEND
// ============================================================================

/**
 * USE THIS PROMPT IN CURSOR TO BUILD THE ENTIRE BACKEND FROM SCRATCH.
 * Paste the entire prompt below as a single Cursor Agent prompt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Build the complete backend for an aerospace lecture search platform.
 * Follow EVERY specification below exactly. Do not skip any file.
 *
 * TECH STACK:
 *   Python 3.11, FastAPI, Supabase, Pinecone, Google Gemini 1.5 Flash,
 *   youtube-transcript-api, yt-dlp, requests
 *
 * ── FILE: requirements.txt ───────────────────────────────────────────────────
 * fastapi==0.111.0
 * uvicorn[standard]==0.29.0
 * python-dotenv==1.0.1
 * pydantic-settings==2.2.1
 * supabase==2.4.2
 * pinecone-client==3.2.2
 * google-generativeai==0.5.4
 * youtube-transcript-api==0.6.2
 * yt-dlp==2024.4.9
 * requests==2.31.0
 * httpx==0.27.0
 * python-multipart==0.0.9
 *
 * ── FILE: .env.example ───────────────────────────────────────────────────────
 * YOUTUBE_API_KEY=
 * GEMINI_API_KEY=
 * SUPABASE_URL=
 * SUPABASE_SERVICE_ROLE_KEY=
 * PINECONE_API_KEY=
 * PINECONE_INDEX_NAME=lecture-chunks
 * SECRET_ADMIN_KEY=
 * CORS_ORIGINS=http://localhost:3000
 *
 * ── FILE: config.py ──────────────────────────────────────────────────────────
 * Pydantic BaseSettings reading from .env. Fields: all env vars above.
 * Singleton: settings = Settings()
 *
 * ── FILE: db/supabase_client.py ──────────────────────────────────────────────
 * Singleton Supabase client using settings.supabase_url and
 * settings.supabase_service_role_key. Function: get_client() -> Client.
 * Cache the client instance at module level.
 *
 * ── FILE: db/pinecone_client.py ──────────────────────────────────────────────
 * Singleton Pinecone index handle.
 * from pinecone import Pinecone
 * pc = Pinecone(api_key=settings.pinecone_api_key)
 * _index = None
 * def get_index(): global _index; if not _index: _index = pc.Index(settings.pinecone_index_name); return _index
 *
 * ── FILE: services/transcript_service.py ─────────────────────────────────────
 * Implement the 4-strategy waterfall transcript fetcher described in
 * Section 4. Include:
 *   - fetch_transcript(video_id) -> (segments: list, source: str)
 *   - clean_segments(segments) -> list
 *   - _strategy_1_direct_english(video_id)
 *   - _strategy_2_list_transcripts(video_id)
 *   - _strategy_3_ytdlp(video_id)
 *   - _strategy_4_data_api(video_id)
 *   - parse_vtt(filepath) -> list  [parse VTT subtitle files]
 *   - parse_sbv(text) -> list      [parse SBV subtitle format]
 *   - with_backoff(fn, max_retries=3, base_delay=2.0)
 * Return (segments, source_string) where source is one of:
 *   'manual_en', 'auto_en', 'translated_en', 'ytdlp', 'data_api', 'none'
 *
 * ── FILE: services/chunker.py ────────────────────────────────────────────────
 * Implement semantic chunker from Section 5.
 *   - chunk_transcript(segments: list) -> list of chunks
 * Each chunk: {chunk_index, text, start_time, end_time, word_count}
 * Use the lexical overlap + silence gap algorithm.
 * Include the ENGLISH_STOPWORDS set.
 * Enforce: min 60s, max 300s per chunk.
 *
 * ── FILE: services/classifier.py ─────────────────────────────────────────────
 * Implement chunk pedagogy classifier from Section 6.
 *   - classify_chunk(chunk_text, prev_summary="") -> dict
 * Use the exact SYSTEM + USER prompt from Section 6.
 * Include parse_gemini_json() and validate_classification().
 * Use temperature=0.1, max_output_tokens=400.
 * Retry up to 3 times with exponential backoff.
 * Return safe defaults on persistent failure.
 * Sleep 1.5s after each successful call.
 *
 * ── FILE: services/keyword_extractor.py ──────────────────────────────────────
 * Implement keyword extraction from Section 7.
 *   - extract_video_keywords(video_id, video_title, chunks) -> list
 *   - compute_term_density(chunk_text) -> float
 * Include the AEROSPACE_DOMAIN_TERMS set.
 * Use the exact prompt from Section 7.
 * Filter: importance_score < 0.15 removed, keyword len < 3 removed.
 *
 * ── FILE: services/embedder.py ───────────────────────────────────────────────
 * Implement Gemini text-embedding-004 wrapper from Section 8.
 *   - embed_text(text, task_type="retrieval_document") -> list[float]
 *   - embed_batch(texts, task_type, batch_size=20) -> list[list[float]]
 * Add 0.05s sleep per embedding, 0.3s between batches.
 *
 * ── FILE: services/heatmap_builder.py ────────────────────────────────────────
 * Implement from Section 9.
 *   - build_playlist_heatmap(playlist_id) -> None (writes to Supabase)
 *   - compute_intensity(chunk) -> float
 * Use the exact intensity formula from Section 9.
 * Include ROLE_WEIGHTS dict.
 *
 * ── FILE: services/glossary_builder.py ───────────────────────────────────────
 * Implement 6-step glossary builder from Section 10.
 *   - build_glossary(playlist_id) -> None (writes to Supabase + Pinecone)
 * Use the exact Gemini prompt from Section 10 for definitions.
 * Sleep 1.0s between definition generation calls.
 * Compute importance_score using the exact formula from Section 10.
 * Compute related_terms using co-occurrence counting.
 * Embed term+definition and upsert to Pinecone with type="glossary".
 *
 * ── FILE: services/qa_generator.py ───────────────────────────────────────────
 * Implement QA generator from Section 11.
 *   - generate_qa_pairs(playlist_id, n_pairs=50) -> None (writes to Supabase)
 * 80% Type A (single-chunk), 20% Type B (cross-video).
 * Use exact prompts from Section 11.
 * Sleep 4.0s between each Gemini QA generation call.
 * Assign difficulty based on depth_score thresholds.
 * Parse response JSON robustly using parse_gemini_json().
 *
 * ── FILE: services/search_engine.py ──────────────────────────────────────────
 * Implement search engine from Section 12.
 *   - search(query, scope, top_k=5) -> list[dict]
 * Full 8-step flow: cache check → embed → Pinecone → fetch → re-rank
 *   → generate relevance reasons → build response → cache.
 * Cache results in search_cache table with 7-day expiry.
 * Use sha256 for query_hash.
 * For relevance reasons: ONE Gemini call for all top_k results together.
 *
 * ── FILE: services/youtube_service.py ────────────────────────────────────────
 * Implement YouTube Data API v3 calls.
 *   - get_playlist_metadata(playlist_id) -> dict
 *   - get_playlist_videos(playlist_id) -> list[dict]
 * Use requests.get() with proper error handling.
 * Handle pagination (nextPageToken) in get_playlist_videos.
 * Each video dict: {youtube_id, title, position, duration_seconds,
 *                   thumbnail_url, published_at}
 * Parse ISO 8601 duration (PT1H23M45S) to seconds.
 *
 * ── FILE: tasks/pipeline.py ──────────────────────────────────────────────────
 * Implement full pipeline from Section 13.
 *   - process_playlist(playlist_id: str) -> None
 *   - _process_single_video(video: dict, playlist_id: str) -> None
 * Exact stage order: metadata → video list → per-video loop →
 *   glossary → heatmap → QA → playlist description → mark processed.
 * Per-video: transcript → chunk → classify → term_density → upsert chunks
 *   → embed+pinecone → keywords. Sleep 2.0s between videos.
 * Idempotent: skip already-processed videos, use upsert everywhere.
 * Catch per-video exceptions: log error, continue to next video.
 *
 * ── FILE: routers/playlists.py ───────────────────────────────────────────────
 * Routes from Section 14:
 *   GET  /playlists          list all
 *   GET  /playlists/{id}     single detail
 *   POST /playlists          create (body: youtube_id, subject)
 *                            Return 409 if youtube_id already exists.
 *
 * ── FILE: routers/videos.py ──────────────────────────────────────────────────
 * Routes from Section 14:
 *   GET /playlists/{playlist_id}/videos
 *       Join with video_keywords, return keywords nested per video.
 *
 * ── FILE: routers/search.py ──────────────────────────────────────────────────
 * Routes from Section 14:
 *   GET /search              semantic search (q, scope, top_k params)
 *   GET /search/heatmap      heatmap data (term, playlist_id params)
 *
 * ── FILE: routers/glossary.py ────────────────────────────────────────────────
 * Routes from Section 14:
 *   GET /glossary/{playlist_id}           all terms
 *   GET /glossary/{playlist_id}/{term}    term detail with chunk snippets
 *
 * ── FILE: routers/ingest.py ──────────────────────────────────────────────────
 * Routes from Section 14:
 *   POST /ingest/{playlist_id}            trigger pipeline (admin only)
 *   GET  /ingest/status/{playlist_id}     progress report
 * Include verify_admin_token dependency.
 *
 * ── FILE: main.py ─────────────────────────────────────────────────────────────
 * FastAPI app with CORSMiddleware.
 * Mount all routers with correct prefixes.
 * Add GET /health endpoint returning {"status":"ok"}.
 * Configure uvicorn logging.
 *
 * ── CRITICAL IMPLEMENTATION RULES ────────────────────────────────────────────
 * 1. ALL Gemini calls must have try/except with 3-retry exponential backoff.
 * 2. ALL Supabase writes must use .upsert() not .insert().
 * 3. NEVER hardcode API keys — always use settings.xxx.
 * 4. ALL transcript strategy failures must be caught and waterfall to next.
 * 5. The per-video pipeline must NEVER crash the whole playlist pipeline —
 *    catch all exceptions per video, log, continue.
 * 6. Pinecone upserts must use the Supabase chunk UUID as the vector ID.
 * 7. All YouTube deep-link URLs: https://youtube.com/watch?v={yt_id}&t={seconds}
 * 8. JSON parsing from Gemini: always use parse_gemini_json() which strips
 *    markdown fences and finds {…} boundaries robustly.
 * 9. Sleep times: 1.5s after classify calls, 4.0s after QA calls,
 *    1.0s after definition calls, 2.0s between videos.
 * 10. All times/scores stored as Python float, not Decimal.
 */
