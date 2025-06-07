"""
Data Processor Service - Racing Analytics System
Elabora dati telemetrici e calcola analytics
"""

import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from uuid import UUID

import asyncpg
import redis

import numpy as np
import pandas as pd
import structlog
from scipy import signal

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


class DataProcessor:
    def __init__(self):
        self.db_pool: Optional[asyncpg.Pool] = None
        self.redis: Optional[aioredis.Redis] = None
        self.running = False

    async def initialize(self):
        """Inizializza connessioni"""
        logger.info("Inizializzazione Data Processor...")

        # Connessione database
        self.db_pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=1,
            max_size=10
        )

        # Connessione Redis
        self.redis = redis.from_url(
            settings.redis_url,
            decode_responses=True
        )

        logger.info("Data Processor inizializzato")

    async def start(self):
        """Avvia il processing loop"""
        self.running = True
        logger.info("Avvio Data Processor...")

        # Task paralleli per diversi tipi di processing
        tasks = [
            asyncio.create_task(self.session_processor_loop()),
            asyncio.create_task(self.analytics_processor_loop()),
            asyncio.create_task(self.cleanup_processor_loop())
        ]

        try:
            await asyncio.gather(*tasks)
        except Exception as e:
            logger.error("Errore nel processing loop", error=str(e))
        finally:
            self.running = False

    async def stop(self):
        """Ferma il processor"""
        self.running = False

        if self.db_pool:
            await self.db_pool.close()
        if self.redis:
            await self.redis.close()

        logger.info("Data Processor fermato")

    async def session_processor_loop(self):
        """Processa sessioni completate"""
        while self.running:
            try:
                # Trova sessioni completate non processate
                async with self.db_pool.acquire() as conn:
                    sessions = await conn.fetch("""
                                                SELECT id
                                                FROM sessions
                                                WHERE end_time IS NOT NULL
                                                  AND session_metadata ->>'processed' IS NULL
                                                ORDER BY end_time DESC
                                                    LIMIT 10
                                                """)

                for session in sessions:
                    await self.process_completed_session(session['id'])

                await asyncio.sleep(30)  # Controlla ogni 30 secondi

            except Exception as e:
                logger.error("Errore session processor loop", error=str(e))
                await asyncio.sleep(60)

    async def analytics_processor_loop(self):
        """Calcola analytics periodiche"""
        while self.running:
            try:
                await self.calculate_daily_analytics()
                await self.update_leaderboards()
                await self.calculate_vehicle_performance_stats()

                await asyncio.sleep(3600)  # Ogni ora

            except Exception as e:
                logger.error("Errore analytics processor loop", error=str(e))
                await asyncio.sleep(1800)  # Retry dopo 30 min

    async def cleanup_processor_loop(self):
        """Pulizia dati vecchi"""
        while self.running:
            try:
                await self.cleanup_old_telemetry()
                await self.cleanup_old_cache()

                await asyncio.sleep(86400)  # Ogni 24 ore

            except Exception as e:
                logger.error("Errore cleanup processor loop", error=str(e))
                await asyncio.sleep(3600)

    async def process_completed_session(self, session_id: UUID):
        """Processa una sessione completata"""
        logger.info("Processing sessione completata", session_id=str(session_id))

        try:
            async with self.db_pool.acquire() as conn:
                # Ottieni dati sessione
                session = await conn.fetchrow("""
                                              SELECT *
                                              FROM sessions
                                              WHERE id = $1
                                              """, session_id)

                if not session:
                    logger.warning("Sessione non trovata", session_id=str(session_id))
                    return

                # Calcola statistiche lap
                await self.calculate_lap_times(conn, session_id)

                # Calcola statistiche telemetria
                telemetry_stats = await self.calculate_telemetry_stats(conn, session_id)

                # Aggiorna sessione con statistiche
                metadata = json.loads(session['session_metadata'] or '{}')
                metadata.update({
                    'processed': True,
                    'processed_at': datetime.now(timezone.utc).isoformat(),
                    'telemetry_stats': telemetry_stats
                })

                await conn.execute("""
                                   UPDATE sessions
                                   SET session_metadata = $1,
                                       max_speed_kmh    = $2,
                                       avg_speed_kmh    = $3
                                   WHERE id = $4
                                   """, json.dumps(metadata),
                                   telemetry_stats.get('max_speed', 0),
                                   telemetry_stats.get('avg_speed', 0),
                                   session_id)

                logger.info("Sessione processata", session_id=str(session_id))

        except Exception as e:
            logger.error("Errore processing sessione", session_id=str(session_id), error=str(e))

    async def calculate_lap_times(self, conn, session_id: UUID):
        """Calcola tempi lap automaticamente dalla telemetria"""
        try:
            # Ottieni telemetria posizione per identificare settori
            telemetry = await conn.fetch("""
                                         SELECT time, position_x, position_y, position_z, speed_kmh
                                         FROM telemetry_data
                                         WHERE session_id = $1
                                         ORDER BY time
                                         """, session_id)

            if len(telemetry) < 100:  # Dati insufficienti
                return

            # Converti in DataFrame per analisi
            df = pd.DataFrame([dict(row) for row in telemetry])
            df['time'] = pd.to_datetime(df['time'])

            # Algoritmo semplice per identificare lap basato su posizione
            # (da raffinare con dati specifici del circuito)
            laps = self.detect_laps_from_position(df)

            # Salva lap identificati
            for i, lap in enumerate(laps):
                lap_time_ms = int((lap['end_time'] - lap['start_time']).total_seconds() * 1000)

                await conn.execute("""
                                   INSERT INTO laps (session_id, lap_number, lap_time_ms, start_time, end_time, is_valid)
                                   VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (session_id, lap_number) DO
                                   UPDATE SET
                                       lap_time_ms = EXCLUDED.lap_time_ms,
                                       start_time = EXCLUDED.start_time,
                                       end_time = EXCLUDED.end_time
                                   """, session_id, i + 1, lap_time_ms, lap['start_time'], lap['end_time'], True)

            # Identifica best lap
            if laps:
                best_lap = min(laps, key=lambda x: (x['end_time'] - x['start_time']).total_seconds())
                best_lap_number = laps.index(best_lap) + 1
                best_lap_time_ms = int((best_lap['end_time'] - best_lap['start_time']).total_seconds() * 1000)

                await conn.execute("""
                                   UPDATE laps
                                   SET is_best_lap = true
                                   WHERE session_id = $1
                                     AND lap_number = $2
                                   """, session_id, best_lap_number)

                await conn.execute("""
                                   UPDATE sessions
                                   SET best_lap_time_ms = $1,
                                       completed_laps   = $2
                                   WHERE id = $3
                                   """, best_lap_time_ms, len(laps), session_id)

        except Exception as e:
            logger.error("Errore calcolo lap times", error=str(e))

    def detect_laps_from_position(self, df: pd.DataFrame) -> List[Dict]:
        """Identifica lap dalla posizione (algoritmo semplificato)"""
        laps = []

        try:
            # Calcola distanza dal punto di partenza
            start_x, start_y = df.iloc[0]['position_x'], df.iloc[0]['position_y']
            df['distance_from_start'] = np.sqrt(
                (df['position_x'] - start_x) ** 2 + (df['position_y'] - start_y) ** 2
            )

            # Trova passaggi vicino al punto di partenza (< 50 metri)
            near_start = df[df['distance_from_start'] < 50].copy()

            if len(near_start) < 2:
                return laps

            # Identifica lap basandosi sui passaggi
            lap_starts = []
            for i in range(1, len(near_start)):
                time_diff = (near_start.iloc[i]['time'] - near_start.iloc[i - 1]['time']).total_seconds()
                if time_diff > 30:  # Almeno 30 secondi tra passaggi
                    lap_starts.append(near_start.iloc[i]['time'])

            # Crea oggetti lap
            if lap_starts:
                # Primo lap
                laps.append({
                    'start_time': df.iloc[0]['time'],
                    'end_time': lap_starts[0]
                })

                # Lap intermedi
                for i in range(len(lap_starts) - 1):
                    laps.append({
                        'start_time': lap_starts[i],
                        'end_time': lap_starts[i + 1]
                    })

                # Ultimo lap se non completato
                if (df.iloc[-1]['time'] - lap_starts[-1]).total_seconds() > 30:
                    laps.append({
                        'start_time': lap_starts[-1],
                        'end_time': df.iloc[-1]['time']
                    })

        except Exception as e:
            logger.error("Errore detect laps", error=str(e))

        return laps

    async def calculate_telemetry_stats(self, conn, session_id: UUID) -> Dict[str, Any]:
        """Calcola statistiche dalla telemetria"""
        try:
            stats = await conn.fetchrow("""
                                        SELECT MAX(speed_kmh)  as max_speed,
                                               AVG(speed_kmh)  as avg_speed,
                                               MAX(engine_rpm) as max_rpm,
                                               AVG(engine_rpm) as avg_rpm,
                                               AVG(throttle)   as avg_throttle,
                                               AVG(brake)      as avg_brake,
                                               COUNT(*)        as data_points
                                        FROM telemetry_data
                                        WHERE session_id = $1
                                        """, session_id)

            return {
                'max_speed': float(stats['max_speed'] or 0),
                'avg_speed': float(stats['avg_speed'] or 0),
                'max_rpm': float(stats['max_rpm'] or 0),
                'avg_rpm': float(stats['avg_rpm'] or 0),
                'avg_throttle': float(stats['avg_throttle'] or 0),
                'avg_brake': float(stats['avg_brake'] or 0),
                'data_points': int(stats['data_points'] or 0)
            }

        except Exception as e:
            logger.error("Errore calcolo telemetry stats", error=str(e))
            return {}

    async def calculate_daily_analytics(self):
        """Calcola analytics giornaliere"""
        logger.info("Calcolo analytics giornaliere")

        try:
            async with self.db_pool.acquire() as conn:
                # Statistiche ultime 24 ore
                yesterday = datetime.now(timezone.utc) - timedelta(days=1)

                daily_stats = await conn.fetchrow("""
                                                  SELECT COUNT(*)                   as sessions_count,
                                                         COUNT(DISTINCT vehicle_id) as vehicles_used,
                                                         COUNT(DISTINCT circuit_id) as circuits_used,
                                                         AVG(duration_seconds)      as avg_session_duration
                                                  FROM sessions
                                                  WHERE start_time >= $1
                                                  """, yesterday)

                # Salva in Redis
                await self.redis.setex(
                    "daily_analytics",
                    86400,  # 24 ore TTL
                    json.dumps({
                        'date': datetime.now(timezone.utc).date().isoformat(),
                        'stats': dict(daily_stats)
                    })
                )

        except Exception as e:
            logger.error("Errore calcolo daily analytics", error=str(e))

    async def update_leaderboards(self):
        """Aggiorna leaderboard per circuiti"""
        logger.info("Aggiornamento leaderboards")

        try:
            async with self.db_pool.acquire() as conn:
                circuits = await conn.fetch("SELECT id, name FROM circuits")

                for circuit in circuits:
                    # Top 10 per circuito
                    leaderboard = await conn.fetch("""
                                                   SELECT s.id,
                                                          v.name as vehicle_name,
                                                          s.best_lap_time_ms,
                                                          s.start_time,
                                                          s.max_speed_kmh
                                                   FROM sessions s
                                                            JOIN vehicles v ON s.vehicle_id = v.id
                                                   WHERE s.circuit_id = $1
                                                     AND s.best_lap_time_ms IS NOT NULL
                                                   ORDER BY s.best_lap_time_ms ASC LIMIT 10
                                                   """, circuit['id'])

                    # Salva in Redis
                    await self.redis.setex(
                        f"leaderboard:circuit:{circuit['id']}",
                        3600,  # 1 ora TTL
                        json.dumps([dict(row) for row in leaderboard], default=str)
                    )

        except Exception as e:
            logger.error("Errore aggiornamento leaderboards", error=str(e))

    async def calculate_vehicle_performance_stats(self):
        """Calcola statistiche performance veicoli"""
        logger.info("Calcolo statistiche performance veicoli")

        try:
            async with self.db_pool.acquire() as conn:
                vehicles = await conn.fetch("SELECT id, name FROM vehicles")

                for vehicle in vehicles:
                    stats = await conn.fetchrow("""
                                                SELECT COUNT(*)              as total_sessions,
                                                       AVG(best_lap_time_ms) as avg_best_lap,
                                                       MIN(best_lap_time_ms) as best_lap_ever,
                                                       AVG(max_speed_kmh)    as avg_max_speed,
                                                       MAX(max_speed_kmh)    as top_speed
                                                FROM sessions
                                                WHERE vehicle_id = $1
                                                  AND best_lap_time_ms IS NOT NULL
                                                """, vehicle['id'])

                    # Salva in Redis
                    await self.redis.setex(
                        f"vehicle_stats:{vehicle['id']}",
                        3600,  # 1 ora TTL
                        json.dumps(dict(stats), default=str)
                    )

        except Exception as e:
            logger.error("Errore calcolo vehicle stats", error=str(e))

    async def cleanup_old_telemetry(self):
        """Pulisce telemetria vecchia (> 30 giorni)"""
        logger.info("Cleanup telemetria vecchia")

        try:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=30)

            async with self.db_pool.acquire() as conn:
                result = await conn.execute("""
                                            DELETE
                                            FROM telemetry_data
                                            WHERE time < $1
                                            """, cutoff_date)

                logger.info("Telemetria pulita", deleted_rows=result)

        except Exception as e:
            logger.error("Errore cleanup telemetria", error=str(e))

    async def cleanup_old_cache(self):
        """Pulisce cache Redis vecchia"""
        logger.info("Cleanup cache Redis")

        try:
            # Redis gestisce TTL automaticamente, ma possiamo fare pulizia manuale
            keys = await self.redis.keys("temp:*")
            if keys:
                await self.redis.delete(*keys)
                logger.info("Cache pulita", deleted_keys=len(keys))

        except Exception as e:
            logger.error("Errore cleanup cache", error=str(e))


async def main():
    """Main function"""
    processor = DataProcessor()

    try:
        await processor.initialize()
        await processor.start()
    except KeyboardInterrupt:
        logger.info("Interruzione da utente")
    finally:
        await processor.stop()


if __name__ == "__main__":
    asyncio.run(main())