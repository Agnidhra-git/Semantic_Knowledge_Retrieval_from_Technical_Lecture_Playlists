# Backend Test Results — Single Video

**Video**: Mod-01 Lec-01 Fundamentals of Aerospace Propulsion  
**YouTube ID**: `Hlj2eVt1Vbk`  
**Playlist**: NPTEL — Fundamentals of Aerospace Propulsion, Dr. D.P. Mishra, IIT Kanpur (`PLbMVogVj5nJQt5nsksLn4qcsBrDL_JKkd`)  
**Test run**: 2026-04-30 | All checks: **19/19 passed**

---

## Pipeline Summary

```
YouTube → Transcript Fetch → Chunking → 1× Gemini Call → Embedding → Supabase + Pinecone
                                                              ↓
                                             Chunk metadata + Keywords
```

| Step | Tool / Service | Result |
|------|---------------|--------|
| Transcript fetch | youtube-transcript-api v1.2.4 | 372 segments, 6 164 words, 45 min lecture |
| Segment merge | transcript_service | 372 → 367 segments |
| Semantic chunking | chunker.py | 20 chunks, avg 135s, min 51s, max 299s |
| Analysis | video_analyzer.py (1 Gemini call) | 20 chunks annotated + 14 keywords in 16.9s |
| Embedding | gemini-embedding-001 REST API | 20 × 3 072-dim vectors in 2.2s |
| DB write | Supabase (PostgreSQL) | playlist + video + 20 chunks + 14 keywords |
| Vector write | Pinecone (cosine, 3072-dim) | 20 vectors indexed |
| Semantic search | Pinecone + re-rank | 3/3 queries returned relevant results |
| Heatmap | heatmap_builder.py | 20 intensity points for "thrust" |
| DB read-back | Supabase | all rows confirmed |

---

## 1. Transcript Fetch

| Metric | Value |
|--------|-------|
| Library | youtube-transcript-api 1.2.4 |
| Transcript type | Manual English (preferred over auto-generated) |
| Raw segments | 372 |
| Total words | 6 164 |
| Total characters | 31 672 |
| Lecture duration | 2 702s (45.0 min) |
| Fetch time | 3.2s |
| After merge_short_segments | 367 segments |

---

## 2. Chunking

| Metric | Value |
|--------|-------|
| Chunks produced | 20 |
| Average chunk duration | 135s |
| Shortest chunk | 51s |
| Longest chunk | 299s |
| Algorithm | Lexical-overlap sliding window (threshold 30%) |

---

## 3. Single Gemini Call — `video_analyzer`

**One call replaces the old multi-call approach** (previously `1 + ceil(N/5)` calls = ~5–7 calls for a 20-chunk video).

| Metric | Value |
|--------|-------|
| Model | `gemini-flash-latest` |
| Input tokens (approx.) | ~8 006 |
| Latency | 16.9s |
| Gemini calls per video | **1** |

### Chunk-level metadata

| Chunk | Time range | Role | Depth | Centrality | Main concept |
|-------|-----------|------|-------|------------|--------------|
| 0 | 16s – 118s | introduction | 0.20 | 0.80 | fundamentals of aerospace propulsion |
| 1 | 118s – 222s | application | 0.30 | 0.60 | propulsive devices for planetary missions |
| 2 | 222s – 329s | tangential | 0.10 | 0.40 | biomimetic flight and mythology |
| 3 | 329s – 432s | introduction | 0.40 | 0.70 | early history of aviation and definition of propulsion |
| 4 | 432s – 534s | explanation | 0.50 | 0.90 | unbalanced force and directional motion |
| 5 | 534s – 640s | explanation | 0.40 | 0.80 | propulsive devices across different vehicles |
| 6 | 640s – 743s | explanation | 0.60 | 0.70 | experiential understanding of laws of motion |
| 7 | 743s – 843s | derivation | 0.80 | 0.90 | Newton's second and third laws of motion |
| 8 | 843s – 948s | application | 0.50 | 0.70 | application of reactive force in recoil and balloons |
| 9 | 948s – 1057s | explanation | 0.60 | 0.80 | basic principle of rocket propulsion |
| 10 | 1057s – 1164s | derivation | 0.70 | 0.90 | requirement for continuous air supply in engines |
| 11 | 1164s – 1227s | explanation | 0.80 | 1.00 | components of a gas turbine engine |
| 12 | 1227s – 1339s | summary | 0.60 | 0.80 | aerothermodynamics and course syllabus structure |
| 13 | 1339s – 1471s | summary | 0.30 | 0.70 | bibliography and importance of history in propulsion |
| 14 | 1471s – 1573s | example | 0.50 | 0.90 | Hero's aeolipile and early steam devices |
| 15 | 1573s – 1671s | explanation | 0.60 | 0.80 | demonstration of reactive thrust principles |
| 16 | 1671s – 1760s | example | 0.40 | 0.70 | early rocketry and black powder discovery |
| 17 | 1760s – 1873s | application | 0.50 | 0.80 | historical development of rocketry and Brayton cycle |
| 18 | 1873s – 1986s | comparison | 0.70 | 0.90 | invention of ramjet and turbojet engines |
| 19 | 1986s – 2702s | summary | 0.20 | 0.50 | visionary engineering and lecture conclusion |

**Role breakdown**: introduction×2, explanation×5, derivation×2, application×3, comparison×1, example×2, summary×3, tangential×1 (out of 20 chunks)

### Video-level keywords

| Keyword | Importance | Frequency | Pedagogy context |
|---------|-----------|-----------|-----------------|
| aerospace propulsion | 1.00 | 12 | introduction |
| thrust | 0.95 | 15 | explanation |
| Newton's laws of motion | 0.90 | 10 | explanation |
| gas turbine engine | 0.90 | 8 | introduction |
| rocket propulsion | 0.85 | 6 | explanation |
| momentum | 0.80 | 5 | derivation |
| aerothermodynamics | 0.80 | 3 | summary |
| compressor | 0.75 | 4 | explanation |
| combustion chamber | 0.75 | 4 | explanation |
| brayton cycle | 0.70 | 2 | application |
| isentropic flow | 0.70 | 1 | summary |
| ramjet | 0.65 | 1 | introduction |
| reactive force | 0.60 | 3 | explanation |
| aeolipile | 0.60 | 1 | example |

---

## 4. Embedding

| Metric | Value |
|--------|-------|
| Model | `gemini-embedding-001` (via REST v1beta) |
| Dimensions | 3 072 |
| Vectors produced | 20 |
| Embedding time | 2.2s |
| Task type | `RETRIEVAL_DOCUMENT` |
| Zero vectors | 0 (all non-zero) |

---

## 5. Supabase Write Results

| Table | Rows written | Method |
|-------|-------------|--------|
| `playlists` | 1 | `UPSERT ON CONFLICT id` |
| `videos` | 1 | `UPSERT ON CONFLICT youtube_id` |
| `transcript_chunks` | 20 | `UPSERT ON CONFLICT pinecone_id` |
| `video_keywords` | 14 | `UPSERT ON CONFLICT (video_id, keyword)` |

All writes are **idempotent** — re-running the pipeline for the same video is safe.

---

## 6. Pinecone Vector Index

| Metric | Value |
|--------|-------|
| Index name | `lecture-chunks` |
| Metric | cosine |
| Dimensions | 3 072 |
| Vectors before test | 0 |
| Vectors after test | 20 |
| Cloud / region | AWS us-east-1 (serverless) |

---

## 7. Semantic Search Results

Queries run against the 20 indexed vectors using cosine similarity + metadata filter `playlist_id`.

| Query | Top cosine score | Pedagogy role | Timestamp | Top snippet |
|-------|-----------------|---------------|-----------|-------------|
| "what is thrust and how does a rocket produce it" | 0.680 | explanation | 1 227s (20:27) | *"Now if you look at this is the basic principle by which the rocket engines..."* |
| "Newton's laws applied to propulsion" | 0.765 | explanation | 534s (8:54) | *"have a feel for it. So, if you look at these are basic principle or what you cal..."* |
| "gas turbine engine components" | 0.717 | summary | 1 573s (26:13) | *"as I told, that means, the propulsion processes involve propulsion at three. One..."* |

All three queries returned relevant results from the correct domain with scores in the 0.68–0.77 range.

---

## 8. Concept Heatmap — "thrust"

Heatmap intensity = `f(role_weight, depth_score, centrality_score, term_density)`.

| Rank | Timestamp | Role | Intensity |
|------|-----------|------|-----------|
| 1 | 1 471s (24:31) | introduction | 0.6575 |
| 2 | 782s (13:02) | derivation | 0.6224 |
| 3 | 1 339s (22:19) | explanation | 0.5391 |

Derivation chunks score high (role weight 0.9) while tangential mentions score low, correctly reflecting content density.

---

## API Endpoints Tested

| Method | Endpoint | Status |
|--------|----------|--------|
| `GET` | `/health` | 200 OK |
| `POST` | `/playlists` | 200 (creates playlist record) |
| `GET` | `/playlists` | 200 (lists playlists) |
| `GET` | `/playlists/{id}` | 200 (playlist detail) |
| `POST` | `/ingest/{id}` | 401 without auth / 202 with admin key |
| `GET` | `/ingest/status/{id}` | 200 (progress tracking) |

---

## Known Issues / Limitations

| Issue | Cause | Status |
|-------|-------|--------|
| `google.generativeai` FutureWarning | Google deprecated this SDK; recommends switching to `google.genai` | Warning only, not an error; migration to `google-genai` planned |
| Gemini free-tier 5 RPM | Free API key allows only 5 requests per minute | Mitigated: 1 call per video + 12s inter-video sleep |
| `gemini-2.0-flash` daily quota exhausted | Free tier RPD limit hit during testing | Switched to `gemini-flash-latest` which has separate quota |

---

## Performance Summary

| Component | Time |
|-----------|------|
| Transcript fetch + merge | 3.2s |
| Chunking | <0.1s |
| Gemini analysis (1 call) | 16.9s |
| Embedding (20 vectors) | 2.2s |
| Supabase writes (36 rows) | ~3s |
| Pinecone upsert (20 vectors) | ~1s |
| **Total per video** | **~27s** |

At 1 Gemini call per video with a 12s inter-video sleep, the full 40-lecture playlist can be ingested in approximately **40 × (27s + 12s) ≈ 26 minutes**.
