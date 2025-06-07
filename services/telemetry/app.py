"""
Telemetry Service - Racing Analytics System
Integra il codice granturismo esistente per ricezione e processing telemetria GT7
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any

import asyncpg
import redis
import structlog
import socketio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from granturismo.intake.feed import Feed
from granturismo.model.packet import Packet
from granturismo.model.common import GameState
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
app = FastAPI(title="Racing Analytics - Telemetry Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO setup
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins="*",
    logger=True
)

# Mount Socket.IO
socket_app = socketio.ASGIApp(sio, app)

# Modelli Pydantic
class SessionCreate(BaseModel):
    circuit_name: str
    vehicle_name: str
    game_mode: str = "TIME_TRIAL"

class SessionResponse(BaseModel):
    session_id: str
    status: str
    start_time: datetime

# Global state
class TelemetryManager:
    def __init__(self):
        self.db_pool: Optional[asyncpg.Pool] = None
        self.redis: Optional[redis.Redis] = None
        self.current_session: Optional[str] = None
        self.feed: Optional[Feed] = None
        self.telemetry_task: Optional[asyncio.Task] = None
        self.is_recording = False
        self.connected_clients = set()

telemetry_manager = TelemetryManager()

# Socket.IO events
@sio.event
async def connect(sid, environ):
    logger.info("Client connected", client_id=sid)
    telemetry_manager.connected_clients.add(sid)

    # Invia stato connessione
    await sio.emit('connection', {
        'status': 'connected',
        'server': 'telemetry'
    }, room=sid)

@sio.event
async def disconnect(sid):
    logger.info("Client disconnected", client_id=sid)
    telemetry_manager.connected_clients.discard(sid)

@sio.event
async def subscribe(sid, data):
    """Cliente si iscrive a un canale"""
    channel = data.get('channel')
    if channel:
        await sio.enter_room(sid, channel)
        logger.info("Client subscribed", client_id=sid, channel=channel)

@sio.event
async def unsubscribe(sid, data):
    """Cliente si disiscrive da un canale"""
    channel = data.get('channel')
    if channel:
        await sio.leave_room(sid, channel)
        logger.info("Client unsubscribed", client_id=sid, channel=channel)

@app.on_event("startup")
async def startup_event():
    """Inizializzazione servizio"""
    logger.info("Avvio Telemetry Service...")

    # Connessione database
    telemetry_manager.db_pool = await asyncpg.create_pool(
        settings.database_url,
        min_size=1,
        max_size=10
    )

    # Connessione Redis
    telemetry_manager.redis = redis.from_url(
        settings.redis_url,
        decode_responses=True
    )

    logger.info("Database e Redis connessi")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup alla chiusura"""
    logger.info("Shutdown Telemetry Service...")

    if telemetry_manager.telemetry_task:
        telemetry_manager.telemetry_task.cancel()

    if telemetry_manager.feed:
        telemetry_manager.feed.close()

    if telemetry_manager.db_pool:
        await telemetry_manager.db_pool.close()

    if telemetry_manager.redis:
        telemetry_manager.redis.close()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "telemetry",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "connected_clients": len(telemetry_manager.connected_clients)
    }

@app.post("/sessions/start", response_model=SessionResponse)
async def start_session(session_data: SessionCreate):
    """Avvia una nuova sessione di telemetria"""
    try:
        # Crea sessione nel database
        session_id = str(uuid.uuid4())

        async with telemetry_manager.db_pool.acquire() as conn:
            # Trova circuit_id
            circuit_row = await conn.fetchrow(
                "SELECT id FROM circuits WHERE name = $1",
                session_data.circuit_name
            )
            if not circuit_row:
                raise HTTPException(status_code=404, detail="Circuito non trovato")

            # Trova vehicle_id (usando nome per semplicità)
            vehicle_row = await conn.fetchrow(
                "SELECT id FROM vehicles WHERE name = $1",
                session_data.vehicle_name
            )
            if not vehicle_row:
                raise HTTPException(status_code=404, detail="Veicolo non trovato")

            # Inserisci sessione
            await conn.execute("""
                INSERT INTO sessions (id, circuit_id, vehicle_id, start_time, game_mode, session_metadata)
                VALUES ($1, $2, $3, $4, $5, $6)
            """, session_id, circuit_row['id'], vehicle_row['id'],
                datetime.now(timezone.utc), session_data.game_mode, json.dumps({}))

        telemetry_manager.current_session = session_id
        telemetry_manager.is_recording = True

        # Avvia ricezione telemetria se non già attiva
        if not telemetry_manager.telemetry_task or telemetry_manager.telemetry_task.done():
            telemetry_manager.telemetry_task = asyncio.create_task(start_telemetry_capture())

        # Notifica clients via Socket.IO
        await sio.emit('session_update', {
            'type': 'session_started',
            'session': {
                'session_id': session_id,
                'circuit_name': session_data.circuit_name,
                'vehicle_name': session_data.vehicle_name
            }
        })

        logger.info("Sessione avviata", session_id=session_id)

        return SessionResponse(
            session_id=session_id,
            status="started",
            start_time=datetime.now(timezone.utc)
        )

    except Exception as e:
        logger.error("Errore avvio sessione", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/sessions/{session_id}/stop")
async def stop_session(session_id: str):
    """Ferma la sessione corrente"""
    try:
        if telemetry_manager.current_session != session_id:
            raise HTTPException(status_code=404, detail="Sessione non trovata o non attiva")

        # Aggiorna sessione nel database
        async with telemetry_manager.db_pool.acquire() as conn:
            await conn.execute("""
                UPDATE sessions 
                SET end_time = $1, duration_seconds = EXTRACT(EPOCH FROM ($1 - start_time))
                WHERE id = $2
            """, datetime.now(timezone.utc), session_id)

        telemetry_manager.is_recording = False
        telemetry_manager.current_session = None

        # Notifica clients via Socket.IO
        await sio.emit('session_update', {
            'type': 'session_stopped',
            'session_id': session_id
        })

        logger.info("Sessione fermata", session_id=session_id)

        return {"status": "stopped", "session_id": session_id}

    except Exception as e:
        logger.error("Errore stop sessione", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

async def get_current_vehicle_info():
    """Ottieni informazioni del veicolo della sessione corrente"""
    if not telemetry_manager.current_session or not telemetry_manager.db_pool:
        return {"name": "Sconosciuto", "manufacturer": ""}

    try:
        async with telemetry_manager.db_pool.acquire() as conn:
            vehicle_data = await conn.fetchrow("""
                SELECT v.name, v.manufacturer, v.game_car_id
                FROM sessions s
                JOIN vehicles v ON s.vehicle_id = v.id
                WHERE s.id = $1
            """, telemetry_manager.current_session)

            if vehicle_data:
                return {
                    "name": vehicle_data["name"],
                    "manufacturer": vehicle_data["manufacturer"] or "",
                    "game_car_id": vehicle_data["game_car_id"]
                }
    except Exception as e:
        logger.error("Errore recupero info veicolo", error=str(e))

    return {"name": "Sconosciuto", "manufacturer": ""}

async def broadcast_telemetry(packet: Packet):
    """Invia telemetria via Socket.IO ai client connessi"""
    if not telemetry_manager.connected_clients:
        return

    # Ottieni informazioni veicolo dalla sessione corrente
    vehicle_info = await get_current_vehicle_info()

    # Se il gioco è in pausa o la macchina non è in pista, azzera i dati dinamici
    is_paused = packet.flags.paused or not packet.flags.car_on_track

    # Dati del veicolo (sempre disponibili anche in pausa)
    vehicle_data = {
        "oil_pressure": packet.oil_pressure,
        "oil_temperature": packet.oil_temperature,
        "water_temperature": packet.water_temperature,
        "fuel_level": packet.gas_level,
        "fuel_capacity": packet.gas_capacity,
        "fuel_percentage": (packet.gas_level / packet.gas_capacity * 100) if packet.gas_capacity > 0 else 0,
        "turbo_boost": packet.turbo_boost,
        "tire_temperatures": {
            "front_left": packet.wheels.front_left.temperature,
            "front_right": packet.wheels.front_right.temperature,
            "rear_left": packet.wheels.rear_left.temperature,
            "rear_right": packet.wheels.rear_right.temperature
        }
    }

    if is_paused:
        # Dati azzerati quando in pausa
        telemetry_data = {
            "timestamp": packet.received_time,
            "speed": 0,
            "rpm": 0,
            "gear": "N",  # Neutro quando fermo
            "throttle": 0,
            "brake": 0,
            "position": {
                "x": packet.position.x,  # Mantieni posizione attuale
                "y": packet.position.y,
                "z": packet.position.z
            },
            "vehicle": {
                "car_id": packet.car_id,  # ID del veicolo da GT7
                "name": vehicle_info.get("name", "Sconosciuto"),
                "manufacturer": vehicle_info.get("manufacturer", ""),
                **vehicle_data  # Aggiungi dati veicolo
            },
            "flags": {
                "on_track": packet.flags.car_on_track,
                "paused": packet.flags.paused
            },
            "status": "paused"  # Indicatore di stato
        }
    else:
        # Dati normali quando in movimento
        telemetry_data = {
            "timestamp": packet.received_time,
            "speed": packet.car_speed * 3.6,  # m/s to km/h
            "rpm": packet.engine_rpm,
            "gear": packet.current_gear if packet.current_gear is not None else "N",
            "throttle": packet.throttle / 255.0,
            "brake": packet.brake / 255.0,
            "position": {
                "x": packet.position.x,
                "y": packet.position.y,
                "z": packet.position.z
            },
            "vehicle": {
                "car_id": packet.car_id,  # ID del veicolo da GT7
                "name": vehicle_info.get("name", "Sconosciuto"),
                "manufacturer": vehicle_info.get("manufacturer", ""),
                **vehicle_data  # Aggiungi dati veicolo
            },
            "flags": {
                "on_track": packet.flags.car_on_track,
                "paused": packet.flags.paused
            },
            "status": "active"
        }

    # Invia a tutti i client connessi
    await sio.emit('telemetry_data', telemetry_data)

async def start_telemetry_capture():
    """Task asincrono per cattura telemetria dalla PlayStation"""
    logger.info("Avvio cattura telemetria", playstation_ip=settings.playstation_ip)

    try:
        # Inizializza Feed usando il tuo codice esistente
        with Feed(settings.playstation_ip) as telemetry_manager.feed:
            while telemetry_manager.is_recording:
                try:
                    # Ricevi packet usando la tua libreria
                    packet: Packet = telemetry_manager.feed.get()

                    if packet and telemetry_manager.current_session:
                        await process_telemetry_packet(packet)
                        await broadcast_telemetry(packet)

                except Exception as e:
                    logger.error("Errore ricezione packet", error=str(e))
                    await asyncio.sleep(0.1)

    except Exception as e:
        logger.error("Errore cattura telemetria", error=str(e))
        telemetry_manager.is_recording = False

async def process_telemetry_packet(packet: Packet):
    """Processa e salva packet telemetria nel database"""
    try:
        async with telemetry_manager.db_pool.acquire() as conn:
            # Inserisci telemetria
            await conn.execute("""
                INSERT INTO telemetry_data (
                    time, session_id, position_x, position_y, position_z,
                    velocity_x, velocity_y, velocity_z, rotation_pitch, rotation_yaw, rotation_roll,
                    angular_velocity_x, angular_velocity_y, angular_velocity_z,
                    speed_kmh, throttle, brake, steering, clutch,
                    engine_rpm, current_gear, suggested_gear,
                    fuel_level, fuel_capacity, oil_temperature, water_temperature, oil_pressure,
                    tire_fl_temp, tire_fr_temp, tire_rl_temp, tire_rr_temp,
                    tire_fl_suspension, tire_fr_suspension, tire_rl_suspension, tire_rr_suspension,
                    car_on_track, paused, in_gear, rev_limiter_active,
                    body_height, turbo_boost, time_of_day
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41)
            """,
                datetime.fromtimestamp(packet.received_time, tz=timezone.utc),
                telemetry_manager.current_session,
                packet.position.x, packet.position.y, packet.position.z,
                packet.velocity.x, packet.velocity.y, packet.velocity.z,
                packet.rotation.pitch, packet.rotation.yaw, packet.rotation.roll,
                packet.angular_velocity.x, packet.angular_velocity.y, packet.angular_velocity.z,
                packet.car_speed * 3.6,  # m/s to km/h
                packet.throttle / 255.0,  # Normalizza 0-1
                packet.brake / 255.0,    # Normalizza 0-1
                0.0,  # steering - da implementare se disponibile
                packet.clutch,
                packet.engine_rpm,
                packet.current_gear,
                packet.suggested_gear,
                packet.gas_level,
                packet.gas_capacity,
                packet.oil_temperature,
                packet.water_temperature,
                packet.oil_pressure,
                packet.wheels.front_left.temperature,
                packet.wheels.front_right.temperature,
                packet.wheels.rear_left.temperature,
                packet.wheels.rear_right.temperature,
                packet.wheels.front_left.suspension_height,
                packet.wheels.front_right.suspension_height,
                packet.wheels.rear_left.suspension_height,
                packet.wheels.rear_right.suspension_height,
                packet.flags.car_on_track,
                packet.flags.paused,
                packet.flags.in_gear,
                packet.flags.rev_limiter_alert_active,
                packet.body_height,
                packet.turbo_boost,
                packet.time_of_day
            )

        # Cache in Redis per accesso veloce
        telemetry_manager.redis.setex(
            f"latest_telemetry:{telemetry_manager.current_session}",
            60,  # TTL 60 secondi
            json.dumps({
                "speed": packet.car_speed * 3.6,
                "rpm": packet.engine_rpm,
                "gear": packet.current_gear,
                "throttle": packet.throttle / 255.0,
                "brake": packet.brake / 255.0,
                "timestamp": packet.received_time
            })
        )

    except Exception as e:
        logger.error("Errore salvataggio telemetria", error=str(e))

# Usa socket_app invece di app
app = socket_app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        socket_app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=False
    )