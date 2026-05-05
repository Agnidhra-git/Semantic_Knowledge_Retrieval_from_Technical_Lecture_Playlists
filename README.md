# Aerospace Knowledge Explorer

A semantic search platform for NPTEL aerospace engineering lecture playlists, built with Next.js 14 and FastAPI.

## 🚀 Features

- **Semantic Search**: Natural language search across video transcripts with RAG-based retrieval
- **Smart Video Navigation**: Browse lectures with keyword extraction and pedagogy classification
- **Interactive Glossary**: Auto-generated terminology database with cross-references and heatmaps
- **Concept Heatmaps**: Visual representation of concept density across video timelines
- **QA Pair Generation**: Automatically generated practice questions from lecture content

## 📁 Project Structure

```
BTP/
├── backend/                    # FastAPI backend
│   ├── main.py                # Application entry point
│   ├── routers/               # API endpoints
│   │   ├── playlists.py      # Playlist management
│   │   ├── videos.py         # Video metadata
│   │   ├── search.py         # Semantic search & heatmaps
│   │   ├── glossary.py       # Glossary terms
│   │   ├── qa.py             # QA pair retrieval
│   │   └── ingest.py         # Data ingestion
│   ├── services/             # Business logic
│   │   ├── embedder.py       # Text embedding (OpenAI)
│   │   ├── search_engine.py  # RAG search implementation
│   │   ├── glossary_builder.py
│   │   ├── qa_generator.py
│   │   └── ...
│   └── db/                   # Database clients
│       ├── supabase_client.py # PostgreSQL (metadata)
│       └── pinecone_client.py # Vector DB (embeddings)
│
└── frontend/                  # Next.js 14 frontend
    ├── app/                  # App Router pages
    │   ├── page.tsx         # Home (playlist grid + search)
    │   ├── playlist/[id]/   # Playlist detail view
    │   └── glossary/[id]/   # Full glossary page
    ├── components/           # React components
    │   ├── SearchBar.tsx
    │   ├── SearchResults.tsx
    │   ├── PlaylistCard.tsx
    │   ├── VideoRow.tsx
    │   ├── KeywordDropdown.tsx
    │   ├── GlossaryPanel.tsx
    │   ├── ConceptHeatmapChart.tsx
    │   └── PedagogyBadge.tsx
    ├── lib/                 # Core utilities
    │   ├── api.ts          # Backend API client
    │   ├── types.ts        # TypeScript interfaces
    │   └── utils.ts        # Helper functions
    └── hooks/              # React hooks
        └── useSearch.ts    # Debounced search logic
```

## 🛠️ Tech Stack

### Backend
- **FastAPI**: High-performance async Python web framework
- **Supabase**: PostgreSQL for structured data (playlists, videos, keywords)
- **Pinecone**: Vector database for semantic embeddings
- **OpenAI**: `text-embedding-3-small` for text embeddings
- **Gemini 2.0**: LLM for glossary/QA generation

### Frontend
- **Next.js 14**: React framework with App Router & SSR
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: Radix UI component library
- **Framer Motion**: Animation library
- **Lucide React**: Icon library

## 📦 Installation

### Prerequisites
- Python 3.10+
- Node.js 18+
- Supabase account (or PostgreSQL)
- Pinecone account
- OpenAI API key
- Google Gemini API key

### Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment variables**
   Create a `.env` file in the `backend` directory:
   ```env
   # Supabase
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_service_key

   # Pinecone
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_INDEX_NAME=your_index_name

   # OpenAI
   OPENAI_API_KEY=your_openai_api_key

   # Gemini (for glossary/QA generation)
   GEMINI_API_KEY=your_gemini_api_key
   ```

4. **Set up database schema**
   Run the SQL schema from `backend/db/schema.sql` in your Supabase dashboard

5. **Start the backend server**
   ```bash
   uvicorn main:app --reload
   ```
   Backend will run on `http://localhost:8000`

### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create a `.env.local` file in the `frontend` directory:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```
   Frontend will run on `http://localhost:3000`

## 🎯 Usage

### Data Ingestion

1. **Add playlists to the database**
   Use the `/api/ingest/playlist` endpoint to add YouTube playlists

2. **Process videos**
   The backend will automatically:
   - Download transcripts via YouTube API
   - Extract keywords and classify pedagogy roles
   - Generate embeddings for semantic search
   - Build glossary terms and QA pairs

### Search

- **Global search**: Search across all playlists from the home page
- **Scoped search**: Search within a specific playlist from the detail view
- **Inline keyword search**: Click keywords in the video row to search related content

### Glossary

- View auto-generated terminology with definitions
- See concept heatmaps showing where terms appear in videos
- Explore related terms and cross-references

## 🔧 API Endpoints

### Playlists
- `GET /api/playlists` - List all playlists
- `GET /api/playlists/{id}` - Get playlist details

### Videos
- `GET /api/videos/playlist/{playlist_id}` - Get videos in a playlist

### Search
- `GET /api/search?q={query}&scope={scope}&limit={limit}` - Semantic search
- `GET /api/search/heatmap?term={term}&playlist_id={id}` - Concept heatmap

### Glossary
- `GET /api/glossary/{playlist_id}` - Get glossary terms

### QA Pairs
- `GET /api/qa/{playlist_id}?difficulty={level}&limit={n}` - Get practice questions

## 🎨 Component Architecture

### Client Components (`'use client'`)
- **SearchBar**: Input with 400ms debounce
- **SearchResults**: Displays loading/success/error states
- **PlaylistCard**: Animated card with Framer Motion
- **VideoRow**: Highlighted on heatmap click
- **KeywordDropdown**: Expandable keyword list with inline search
- **GlossaryPanel**: Sticky sidebar with lazy-loaded heatmaps

### Server Components
- **page.tsx**: SSR with `fetchPlaylists()` and ISR (revalidate: 60s)
- **playlist/[id]/page.tsx**: SSR with playlist + videos data
- **glossary/[id]/page.tsx**: SSR with terms + video metadata

## 📊 Data Flow

1. **Video Ingestion**
   ```
   YouTube Playlist → Transcript Download → Chunking → Embedding → Pinecone
   ```

2. **Search Query**
   ```
   User Query → Embedding → Pinecone Similarity Search → Ranked Results
   ```

3. **Glossary Generation**
   ```
   Video Transcripts → Gemini LLM → Structured JSON → Supabase
   ```

## 🚦 Environment-Specific Configuration

### Development
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`
- Hot reload enabled

### Production
- Update `NEXT_PUBLIC_API_URL` in frontend `.env.local`
- Use production database credentials
- Enable Vercel/Railway deployments

## 📝 Key Features Implementation

### Semantic Search
- Uses OpenAI embeddings (`text-embedding-3-small`)
- Cosine similarity via Pinecone vector search
- Metadata filtering for scoped search

### Pedagogy Classification
8 role types: Introduction, Derivation, Explanation, Application, Comparison, Tangential, Example, Summary

### Heatmap Visualization
- Normalized intensity (0-1) mapped to HSL colors
- Green (120°) for high intensity → Red (0°) for low

### Keyword Importance
- Scored 0-1 based on term frequency and context
- Displayed as star ratings (1-5 stars)

## 🐛 Troubleshooting

### Backend won't start
- Check `.env` file exists with all required keys
- Verify Python version: `python --version` (should be 3.10+)
- Check port 8000 is not in use

### Frontend build errors
- Delete `.next` folder and rebuild: `rm -rf .next && npm run dev`
- Check Node version: `node --version` (should be 18+)
- Verify API URL in `.env.local`

### Search returns no results
- Check backend logs for embedding errors
- Verify Pinecone index has data: check dashboard
- Ensure OpenAI API key has credits

## 📄 License

This project is part of academic research and is intended for educational purposes.

## 👥 Contributors

- Built as part of BTP (Bachelor's Thesis Project)

## 🔮 Future Enhancements

- [ ] Multi-modal search (images, equations)
- [ ] User authentication and saved searches
- [ ] Collaborative annotations
- [ ] Offline mode with IndexedDB
- [ ] Mobile app (React Native)
