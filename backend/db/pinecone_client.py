from functools import lru_cache
from pinecone import Pinecone, Index, ServerlessSpec
from config import get_settings

_EMBED_DIM = 3072   # gemini-embedding-001 output dimension


@lru_cache()
def get_pinecone() -> Pinecone:
    settings = get_settings()
    return Pinecone(api_key=settings.pinecone_api_key)


@lru_cache()
def get_index() -> Index:
    pc = get_pinecone()
    settings = get_settings()
    name = settings.pinecone_index_name

    existing = [idx.name for idx in pc.list_indexes()]
    if name not in existing:
        pc.create_index(
            name=name,
            dimension=_EMBED_DIM,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )

    return pc.Index(name)
