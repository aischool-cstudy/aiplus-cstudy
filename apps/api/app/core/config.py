from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # API 공급자 선택(기본: gemini, 필요 시 openai로 전환)
    env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000"]
    ai_provider: Literal["gemini", "openai"] = "gemini"
    ai_request_timeout_sec: int = 30
    ai_max_concurrency: int = 4
    ai_backpressure_acquire_timeout_ms: int = 200
    assessment_analysis_mode: Literal["rule", "llm"] = "rule"

    # 키 이름 하위호환: GEMINI_API_KEY 또는 GOOGLE_GENERATIVE_AI_API_KEY 둘 다 허용
    gemini_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"),
    )
    gemini_model: str = "gemini-2.0-flash"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"

    model_config = SettingsConfigDict(env_file="../../.env", extra="ignore")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
