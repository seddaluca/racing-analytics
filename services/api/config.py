"""
Configurazione API Service
"""

import os
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://racing_user:racing_password@localhost:5432/racing_analytics"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Authentication
    jwt_secret: str = "your-jwt-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24

    # Logging
    log_level: str = "INFO"

    # Service
    service_name: str = "api-service"
    service_port: int = 8000

    # CORS
    cors_origins: list = ["*"]

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()