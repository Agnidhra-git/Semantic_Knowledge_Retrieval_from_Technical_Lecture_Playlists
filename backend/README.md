# Backend - Aerospace Lecture Search API

FastAPI-based backend service for semantic search, content analysis, and metadata generation of aerospace engineering lecture videos.

## 🏗️ Architecture

The backend is structured as a modular FastAPI application:

```
backend/
├── main.py              # Application entry point
├── config.py            # Configuration management
├── requirements.txt     # Python dependencies
├── db/                  # Database clients
│   ├── supabase_client.py
│   └── pinecone_client.py
├── routers/             # API endpoints
│   ├── playlists.py
│   ├── videos.py
│   ├── search.py
│   ├── glossary.py
│   ├── ingest.py
│   ├── qa.py
│   ├── concept_journey.py
│   └── prerequisites.py
├── services/            # Business logic
│   ├── chunker.py
│   ├── classifier.py
│   ├── concept_graph.py
│   ├── embedder.py
│   ├── glossary_builder.py
│   ├── qa_generator.py
│   ├── search_engine.py
│   ├── transcript_service.py
│   └── youtube_service.py
└── tasks/               # Background tasks
    └── pipeline.py
```

## 🚀 Setup & Installation

### 1. Create Virtual Environment

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Unix/MacOS:
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Environment Configuration

Create a `.env` file in the backend directory:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key

# Pinecone Configuration
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_ENVIRONMENT=your_pinecone_environment
PINECONE_INDEX_NAME=your_index_name

# Google AI Configuration
GOOGLE_API_KEY=your_google_gemini_api_key

# CORS Settings
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Application Settings
ENVIRONMENT=development
LOG_LEVEL=INFO
```

### 4. Database Setup

Run the database schema:

```bash
# Execute schema.sql in your Supabase project
# The schema file is located at: db/schema.sql
```

### 5. Run the Server

```bash
# Development mode with auto-reload
python main.py

# Or using uvicorn directly
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

## 📡 API Endpoints

### Playlists
- `GET /playlists` - List all playlists
- `GET /playlists/{id}` - Get playlist details
- `POST /playlists` - Create new playlist

### Videos
- `GET /videos` - List all videos
- `GET /videos/{id}` - Get video details

### Search
- `POST /search` - Semantic search across transcripts
- `POST /search/equation` - Search for equations

### Glossary
- `GET /glossary` - List all terms
- `GET /glossary/{id}` - Get term definition

### Ingestion
- `POST /ingest/playlist` - Ingest YouTube playlist
- `POST /ingest/video` - Ingest single video

### Q&A
- `GET /qa/video/{video_id}` - Get generated questions

### Concept Journey
- `GET /concept-journey/{concept}` - Get learning path
- `GET /prerequisites/{video_id}` - Get prerequisite concepts

## 🔧 Key Services

### Transcript Service
Extracts and processes YouTube video transcripts with timestamp alignment.

### Embedder Service
Generates vector embeddings using Google's Gemini embedding models.

### Search Engine
Performs hybrid semantic search combining vector similarity and metadata filtering.

### Glossary Builder
Automatically extracts and defines technical terminology from transcripts.

### Q&A Generator
Creates educational questions and answers from video content.

### Concept Graph
Builds prerequisite relationships between educational concepts.

## 🧪 Testing

```bash
# Test API health
curl http://localhost:8000/

# Test search endpoint
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "aerodynamics", "limit": 5}'
```

## 📊 API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## 🐛 Troubleshooting

### Windows Event Loop Issues
The application automatically configures the Windows event loop for compatibility with Python 3.12+.

### Cookie Extraction
The `browser-cookie3` library extracts YouTube cookies to bypass IP-based restrictions. Ensure Chrome or Firefox is installed.

### Database Connection
Verify Supabase credentials and ensure the database schema is properly set up.

### Vector Search
Confirm Pinecone index is created with the correct dimensions (e.g., 768 for Gemini embeddings).

## 📝 Development Notes

- The API uses async/await patterns for optimal performance
- All external API calls are properly error-handled
- Logging is configured via the LOG_LEVEL environment variable
- CORS is configured to allow frontend requests

## 🔒 Security

- API keys are managed via environment variables
- Supabase Row Level Security (RLS) policies should be configured
- CORS origins should be restricted in production

## 📦 Deployment

For production deployment:
1. Set `ENVIRONMENT=production` in `.env`
2. Use a production WSGI server (uvicorn workers)
3. Configure proper CORS origins
4. Enable HTTPS
5. Set up monitoring and logging

```bash
# Production start command
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```
