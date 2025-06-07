"""
API Service - Racing Analytics System
Fornisce REST API per il frontend
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from uuid import UUID

import asyncpg
import redis

import pandas as pd
import structlog
from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import get_settings

# Setup logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Configurazione
settings = get_settings()
app = FastAPI(title="Racing Analytics - API Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Modelli Pydantic
class Circuit(BaseModel):
    id: int
    name: str
    country: Optional[str]
    length_meters: Optional[float]
    turns_count: Optional[int]


class Vehicle(BaseModel):
    id: int
    game_car_id: Optional[int]
    name: str
    manufacturer: Optional[str]
    category: Optional[str]
    power_hp: Optional[int]
    weight_kg: Optional[int]
    drivetrain: Optional[str]


class SessionSummary(BaseModel):
    id: str
    circuit_name: str
    vehicle_name: str
    start_time: datetime
    end_time: Optional[datetime]
    duration_seconds: Optional[int]
    game_mode: str
    completed_laps: Optional[int]
    best_lap_time_ms: Optional[int]
    max_speed_kmh: Optional[float]


class TelemetryPoint(BaseModel):
    timestamp: datetime
    speed_kmh: float
    engine_rpm: float
    current_gear: Optional[int]
    throttle: float
    brake: float
    position_x: float
    position_y: float
    position_z: float


class LapData(BaseModel):
    lap_number: int
    lap_time_ms: Optional[int]
    sector_1_ms: Optional[int]
    sector_2_ms: Optional[int]
    sector_3_ms: Optional[int]
    is_valid: bool
    is_best_lap: bool


class ComparisonData(BaseModel):
    session_id: str
    vehicle_name: str
    circuit_name: str
    best_lap_time: Optional[int]
    avg_speed: Optional[float]
    max_speed: Optional[float]


# Global state
class APIManager:
    def __init__(self):
        self.db_pool: Optional[asyncpg.Pool] = None
        self.redis: Optional[aioredis.Redis] = None


api_manager = APIManager()


@app.on_event("startup")
async def startup_event():
    """Inizializzazione servizio"""
    logger.info("Avvio API Service...")

    # Connessione database
    api_manager.db_pool = await asyncpg.create_pool(
        settings.database_url,
        min_size=1,
        max_size=20
    )

    # Connessione Redis
    api_manager.redis = redis.from_url(
        settings.redis_url,
        decode_responses=True
    )

    logger.info("API Service avviato")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup alla chiusura"""
    logger.info("Shutdown API Service...")

    if api_manager.db_pool:
        await api_manager.db_pool.close()

    if api_manager.redis:
        await api_manager.redis.close()


# Dependency per database
async def get_db():
    async with api_manager.db_pool.acquire() as conn:
        yield conn


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "api",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


# === CIRCUITS ENDPOINTS ===

@app.get("/circuits", response_model=List[Circuit])
async def get_circuits(db=Depends(get_db)):
    """Ottieni lista circuiti"""
    rows = await db.fetch("SELECT * FROM circuits ORDER BY name")
    return [Circuit(**dict(row)) for row in rows]


@app.get("/circuits/{circuit_id}", response_model=Circuit)
async def get_circuit(circuit_id: int, db=Depends(get_db)):
    """Ottieni dettagli circuito"""
    row = await db.fetchrow("SELECT * FROM circuits WHERE id = $1", circuit_id)
    if not row:
        raise HTTPException(status_code=404, detail="Circuito non trovato")
    return Circuit(**dict(row))


# === VEHICLES ENDPOINTS ===

@app.get("/vehicles", response_model=List[Vehicle])
async def get_vehicles(db=Depends(get_db)):
    """Ottieni lista veicoli"""
    rows = await db.fetch("SELECT * FROM vehicles ORDER BY manufacturer, name")
    return [Vehicle(**dict(row)) for row in rows]


@app.get("/vehicles/{vehicle_id}", response_model=Vehicle)
async def get_vehicle(vehicle_id: int, db=Depends(get_db)):
    """Ottieni dettagli veicolo"""
    row = await db.fetchrow("SELECT * FROM vehicles WHERE id = $1", vehicle_id)
    if not row:
        raise HTTPException(status_code=404, detail="Veicolo non trovato")
    return Vehicle(**dict(row))


# === SESSIONS ENDPOINTS ===

@app.get("/sessions", response_model=List[SessionSummary])
async def get_sessions(
        circuit_id: Optional[int] = None,
        vehicle_id: Optional[int] = None,
        limit: int = Query(50, le=200),
        offset: int = Query(0, ge=0),
        db=Depends(get_db)
):
    """Ottieni lista sessioni con filtri opzionali"""

    query = """
            SELECT s.*, c.name as circuit_name, v.name as vehicle_name
            FROM sessions s
                     LEFT JOIN circuits c ON s.circuit_id = c.id
                     LEFT JOIN vehicles v ON s.vehicle_id = v.id
            WHERE 1 = 1 \
            """
    params = []

    if circuit_id:
        query += f" AND s.circuit_id = ${len(params) + 1}"
        params.append(circuit_id)

    if vehicle_id:
        query += f" AND s.vehicle_id = ${len(params) + 1}"
        params.append(vehicle_id)

    query += f" ORDER BY s.start_time DESC LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}"
    params.extend([limit, offset])

    rows = await db.fetch(query, *params)

    return [SessionSummary(
        id=str(row['id']),
        circuit_name=row['circuit_name'],
        vehicle_name=row['vehicle_name'],
        start_time=row['start_time'],
        end_time=row['end_time'],
        duration_seconds=row['duration_seconds'],
        game_mode=row['game_mode'],
        completed_laps=row['completed_laps'],
        best_lap_time_ms=row['best_lap_time_ms'],
        max_speed_kmh=row['max_speed_kmh']
    ) for row in rows]


@app.get("/sessions/{session_id}", response_model=SessionSummary)
async def get_session(session_id: str, db=Depends(get_db)):
    """Ottieni dettagli sessione"""
    row = await db.fetchrow("""
                            SELECT s.*, c.name as circuit_name, v.name as vehicle_name
                            FROM sessions s
                                     LEFT JOIN circuits c ON s.circuit_id = c.id
                                     LEFT JOIN vehicles v ON s.vehicle_id = v.id
                            WHERE s.id = $1
                            """, UUID(session_id))

    if not row:
        raise HTTPException(status_code=404, detail="Sessione non trovata")

    return SessionSummary(
        id=str(row['id']),
        circuit_name=row['circuit_name'],
        vehicle_name=row['vehicle_name'],
        start_time=row['start_time'],
        end_time=row['end_time'],
        duration_seconds=row['duration_seconds'],
        game_mode=row['game_mode'],
        completed_laps=row['completed_laps'],
        best_lap_time_ms=row['best_lap_time_ms'],
        max_speed_kmh=row['max_speed_kmh']
    )


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str, db=Depends(get_db)):
    """Elimina sessione"""
    result = await db.execute("DELETE FROM sessions WHERE id = $1", UUID(session_id))
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Sessione non trovata")
    return {"message": "Sessione eliminata"}


# === TELEMETRY ENDPOINTS ===

@app.get("/sessions/{session_id}/telemetry", response_model=List[TelemetryPoint])
async def get_session_telemetry(
        session_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        sample_rate: int = Query(1, ge=1, le=100),
        db=Depends(get_db)
):
    """Ottieni dati telemetrici per una sessione"""

    query = """
            SELECT time, speed_kmh, engine_rpm, current_gear, throttle, brake, position_x, position_y, position_z
            FROM telemetry_data
            WHERE session_id = $1 \
            """
    params = [UUID(session_id)]

    if start_time:
        query += f" AND time >= ${len(params) + 1}"
        params.append(start_time)

    if end_time:
        query += f" AND time <= ${len(params) + 1}"
        params.append(end_time)

    # Sampling per ridurre dati
    if sample_rate > 1:
        query += f" AND MOD(EXTRACT(EPOCH FROM time)::int, {sample_rate}) = 0"

    query += " ORDER BY time LIMIT 10000"  # Limite sicurezza

    rows = await db.fetch(query, *params)

    return [TelemetryPoint(
        timestamp=row['time'],
        speed_kmh=row['speed_kmh'] or 0,
        engine_rpm=row['engine_rpm'] or 0,
        current_gear=row['current_gear'],
        throttle=row['throttle'] or 0,
        brake=row['brake'] or 0,
        position_x=row['position_x'] or 0,
        position_y=row['position_y'] or 0,
        position_z=row['position_z'] or 0
    ) for row in rows]


# === LAPS ENDPOINTS ===

@app.get("/sessions/{session_id}/laps", response_model=List[LapData])
async def get_session_laps(session_id: str, db=Depends(get_db)):
    """Ottieni dati lap per una sessione"""
    rows = await db.fetch("""
                          SELECT lap_number,
                                 lap_time_ms,
                                 sector_1_ms,
                                 sector_2_ms,
                                 sector_3_ms,
                                 is_valid,
                                 is_best_lap
                          FROM laps
                          WHERE session_id = $1
                          ORDER BY lap_number
                          """, UUID(session_id))

    return [LapData(**dict(row)) for row in rows]


# === ANALYTICS ENDPOINTS ===

@app.get("/analytics/circuit/{circuit_id}/leaderboard")
async def get_circuit_leaderboard(circuit_id: int, db=Depends(get_db)):
    """Ottieni leaderboard per un circuito"""
    rows = await db.fetch("""
                          SELECT v.name as vehicle_name,
                                 s.best_lap_time_ms,
                                 s.max_speed_kmh,
                                 s.start_time,
                                 s.id   as session_id
                          FROM sessions s
                                   JOIN vehicles v ON s.vehicle_id = v.id
                          WHERE s.circuit_id = $1
                            AND s.best_lap_time_ms IS NOT NULL
                          ORDER BY s.best_lap_time_ms ASC LIMIT 100
                          """, circuit_id)

    return [dict(row) for row in rows]


@app.get("/analytics/vehicle/{vehicle_id}/performance")
async def get_vehicle_performance(vehicle_id: int, db=Depends(get_db)):
    """Ottieni statistiche performance per un veicolo"""
    rows = await db.fetch("""
                          SELECT c.name                  as circuit_name,
                                 MIN(s.best_lap_time_ms) as best_time,
                                 AVG(s.max_speed_kmh)    as avg_max_speed,
                                 COUNT(*)                as sessions_count
                          FROM sessions s
                                   JOIN circuits c ON s.circuit_id = c.id
                          WHERE s.vehicle_id = $1
                            AND s.best_lap_time_ms IS NOT NULL
                          GROUP BY c.id, c.name
                          ORDER BY best_time ASC
                          """, vehicle_id)

    return [dict(row) for row in rows]


@app.post("/analytics/compare")
async def compare_sessions(session_ids: List[str], db=Depends(get_db)):
    """Confronta multiple sessioni"""
    try:
        uuid_sessions = [UUID(sid) for sid in session_ids]
    except ValueError:
        raise HTTPException(status_code=400, detail="ID sessione non valido")

    rows = await db.fetch("""
                          SELECT s.id,
                                 v.name as vehicle_name,
                                 c.name as circuit_name,
                                 s.best_lap_time_ms,
                                 s.max_speed_kmh,
                                 s.avg_speed_kmh
                          FROM sessions s
                                   JOIN vehicles v ON s.vehicle_id = v.id
                                   JOIN circuits c ON s.circuit_id = c.id
                          WHERE s.id = ANY ($1)
                          """, uuid_sessions)

    return [ComparisonData(
        session_id=str(row['id']),
        vehicle_name=row['vehicle_name'],
        circuit_name=row['circuit_name'],
        best_lap_time=row['best_lap_time_ms'],
        avg_speed=row['avg_speed_kmh'],
        max_speed=row['max_speed_kmh']
    ) for row in rows]


@app.get("/analytics/stats/overview")
async def get_overview_stats(db=Depends(get_db)):
    """Ottieni statistiche generali"""
    stats = {}

    # Conteggi totali
    stats['total_sessions'] = await db.fetchval("SELECT COUNT(*) FROM sessions")
    stats['total_circuits'] = await db.fetchval("SELECT COUNT(*) FROM circuits")
    stats['total_vehicles'] = await db.fetchval("SELECT COUNT(*) FROM vehicles")

    # Statistiche telemetria
    telemetry_stats = await db.fetchrow("""
                                        SELECT COUNT(*)  as total_points,
                                               MIN(time) as first_record,
                                               MAX(time) as last_record
                                        FROM telemetry_data
                                        """)
    stats['telemetry'] = dict(telemetry_stats) if telemetry_stats else {}

    # Top veicoli per performance
    top_vehicles = await db.fetch("""
                                  SELECT v.name,
                                         COUNT(s.id)             as sessions_count,
                                         MIN(s.best_lap_time_ms) as best_time
                                  FROM vehicles v
                                           LEFT JOIN sessions s ON v.id = s.vehicle_id
                                  GROUP BY v.id, v.name
                                  ORDER BY sessions_count DESC LIMIT 5
                                  """)
    stats['top_vehicles'] = [dict(row) for row in top_vehicles]

    return stats


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=False
    )