"""
Configurazione Telemetry Service
"""

import os
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://racing_user:racing_password@localhost:5432/racing_analytics"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # PlayStation
    playstation_ip: str = "192.168.1.100"

    # Logging
    log_level: str = "INFO"

    # Service
    service_name: str = "telemetry-service"
    service_port: int = 8000

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()