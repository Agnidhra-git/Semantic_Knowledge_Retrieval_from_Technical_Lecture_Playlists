from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    gemini_api_key: str
    supabase_url: str
    supabase_service_role_key: str
    pinecone_api_key: str
    pinecone_index_name: str = "lecture-chunks"
    cors_origins: str = "http://localhost:3000"
    secret_admin_key: str = "change_me"
    youtube_cookies_file: str = ""  # Optional: path to cookies.txt for YouTube

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
