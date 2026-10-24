
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "Justice AI"
    database_url: str = "sqlite:///./justice_ai.db"
    jwt_secret: str = "CHANGE_ME_BEFORE_RUNNING"
    access_token_expire_minutes: int = 60
    max_upload_mb: int = 12
    upload_dir: str = "uploads"

    # Existing AI settings — preserve for document analysis
    ai_api_base_url: str = "https://api.openai.com/v1"
    ai_api_key: str = ""
    ai_model: str = ""
    tavily_api_key: str = ""
    # New OpenRouter settings — dedicated to the chatbot
    chat_api_base_url: str = "https://openrouter.ai/api/v1"
    chat_api_key: str = ""
    chat_model: str = "nvidia/nemotron-3-ultra-550b-a55b:free"

    # Existing blockchain settings
    blockchain_rpc_url: str = "http://127.0.0.1:8545"
    blockchain_private_key: str = ""
    evidence_contract_address: str = ""

    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
