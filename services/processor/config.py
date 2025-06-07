"""
Configurazione Data Processor Service
"""

import os
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://racing_user:racing_password@localhost:5432/racing_analytics"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Processing
    processing_interval_seconds: int = 30
    analytics_interval_seconds: int = 3600
    cleanup_interval_seconds: int = 86400

    # Data retention
    telemetry_retention_days: int = 30
    session_retention_days: int = 365

    # Performance
    max_concurrent_sessions: int = 10
    telemetry_batch_size: int = 1000

    # Logging
    log_level: str = "INFO"

    # Service
    service_name: str = "data-processor"

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()