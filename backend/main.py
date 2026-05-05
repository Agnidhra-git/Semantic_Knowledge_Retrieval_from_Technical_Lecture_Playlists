import asyncio
import sys

# On Windows, Python 3.12+ defaults to ProactorEventLoop which breaks
# uvicorn's HTTP server. Force SelectorEventLoop for compatibility.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from routers import playlists, videos, search, glossary, ingest, qa

settings = get_settings()

app = FastAPI(
    title="Aerospace Lecture Search API",
    description="Backend for semantic search and exploration of aerospace engineering lecture playlists.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(playlists.router, prefix="/playlists", tags=["playlists"])
app.include_router(videos.router, tags=["videos"])
app.include_router(search.router, prefix="/search", tags=["search"])
app.include_router(glossary.router, prefix="/glossary", tags=["glossary"])
app.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
app.include_router(qa.router, prefix="/qa", tags=["qa"])


@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "ok"}
