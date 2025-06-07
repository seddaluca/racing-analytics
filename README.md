# 🏎️ Racing Analytics System

Sistema avanzato di analisi telemetrica per racing games (Gran Turismo 7) con architettura microservizi, real-time data processing e interfaccia web moderna.

## 📋 Panoramica

Racing Analytics è una soluzione completa per raccogliere, analizzare e confrontare dati telemetrici da Gran Turismo 7. Il sistema offre:

- **Cattura telemetria real-time** dalla PlayStation
- **Analisi performance** avanzate per veicoli e circuiti  
- **Confronti comparativi** tra sessioni diverse
- **Dashboard interattiva** con grafici e statistiche
- **Storico sessioni** persistente con ricerca e filtri

## 🏗️ Architettura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PlayStation   │───▶│ Telemetry       │───▶│   Database      │
│   Gran Turismo  │    │ Service         │    │ PostgreSQL +    │
└─────────────────┘    └─────────────────┘    │ TimescaleDB     │
                                              └─────────────────┘
                                                       │
┌─────────────────┐    ┌─────────────────┐           │
│   Frontend      │◀───│ API Service     │◀──────────┤
│   React         │    │ FastAPI         │           │
└─────────────────┘    └─────────────────┘           │
                                                      │
                       ┌─────────────────┐           │
                       │ Data Processor  │◀──────────┤
                       │ Analytics       │           │
                       └─────────────────┘           │
                                                      │
                       ┌─────────────────┐◀──────────┘
                       │     Redis       │
                       │ Cache & Queue   │
                       └─────────────────┘
```

### Componenti

- **Telemetry Service**: Riceve dati UDP da Gran Turismo 7, li decripta e salva
- **API Service**: REST API per frontend con endpoints per sessioni, circuiti, veicoli
- **Data Processor**: Elaborazione batch, calcolo analytics e pulizia dati
- **Frontend**: Interfaccia React con dashboard, grafici real-time e confronti
- **Database**: PostgreSQL con TimescaleDB per dati time-series ottimizzati
- **Redis**: Cache e message queue tra servizi

## 🚀 Quick Start

### Prerequisiti

- Docker & Docker Compose
- PlayStation 5 con Gran Turismo 7
- Network locale (PlayStation e server sulla stessa rete)

### 1. Clone del Repository

```bash
git clone https://github.com/yourusername/racing-analytics.git
cd racing-analytics
```

### 2. Setup Struttura Progetto

```bash
chmod +x scripts/*.sh
./scripts/setup-project.sh
```

### 3. Configurazione

```bash
# Copia e modifica configurazione
cp .env.example .env
nano .env
```

Configura l'IP della tua PlayStation:

```env
PLAYSTATION_IP=192.168.1.100  # IP della tua PS5
```

### 4. Integrazione Codice Granturismo

Copia il tuo codice esistente nella struttura:

```bash
# Copia i tuoi file granturismo in:
cp -r /percorso/al/tuo/codice/* services/telemetry/granturismo/
```

### 5. Avvio Sistema

```bash
./scripts/start.sh
```

### 6. Configurazione Gran Turismo 7

1. Apri GT7 → Impostazioni → Connessione
2. Imposta IP del server (es. 192.168.1.50)
3. Porta: 33740
4. Abilita invio dati telemetria

### 7. Accesso Interfacce

- **Frontend**: http://localhost:3000
- **API Documentation**: http://localhost:8002/docs
- **Nginx (Prod)**: http://localhost

## 📖 Utilizzo

### Avvio Sessione

1. Accedi al frontend
2. Vai su "Live Telemetry"
3. Clicca "Avvia Sessione"
4. Seleziona circuito e veicolo
5. Inizia a guidare in GT7

### Analisi Dati

1. **Dashboard**: Overview generale e statistiche
2. **Sessioni**: Lista completa con filtri e ricerca
3. **Analytics**: Grafici performance e tendenze
4. **Comparison**: Confronto tra sessioni multiple

### Esportazione Dati

```bash
# Export sessione in CSV
curl "http://localhost:8002/sessions/{session_id}/telemetry" > session_data.csv
```

## 🛠️ Sviluppo

### Struttura Progetto

```
racing-analytics/
├── services/
│   ├── telemetry/          # Servizio raccolta telemetria
│   │   ├── granturismo/    # Il tuo codice esistente
│   │   ├── app.py          # FastAPI application
│   │   └── Dockerfile
│   ├── api/                # REST API service
│   │   ├── routes/         # Endpoint API
│   │   ├── models/         # Database models
│   │   └── app.py
│   └── processor/          # Data processing service
├── frontend/               # React application
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Route pages
│   │   └── services/       # API & WebSocket
├── scripts/                # Utility scripts
├── docs/                   # Documentation
└── docker-compose.yml
```

### Comandi Utili

```bash
# Logs servizi
docker-compose logs -f telemetry-service
docker-compose logs -f api-service

# Reset database
./scripts/reset-db.sh

# Stop completo
./scripts/stop.sh --clean

# Rebuild singolo servizio
docker-compose build telemetry-service
docker-compose up -d telemetry-service
```

### Database

```bash
# Accesso PostgreSQL
docker-compose exec postgres psql -U racing_user -d racing_analytics

# Backup
docker-compose exec postgres pg_dump -U racing_user racing_analytics > backup.sql

# Restore
docker-compose exec -T postgres psql -U racing_user racing_analytics < backup.sql
```

## 📊 Schema Database

### Tabelle Principali

- **circuits**: Circuiti/piste di gara
- **vehicles**: Veicoli con specifiche
- **sessions**: Sessioni di gioco
- **laps**: Singoli giri cronometrati
- **telemetry_data**: Dati telemetrici time-series (TimescaleDB)

### API Endpoints

- `GET /circuits` - Lista circuiti
- `GET /vehicles` - Lista veicoli  
- `GET /sessions` - Lista sessioni
- `GET /sessions/{id}/telemetry` - Dati telemetria
- `POST /analytics/compare` - Confronto sessioni

Documentazione completa: http://localhost:8002/docs

## 🔧 Configurazione Avanzata

### Variabili Ambiente

```env
# Database
POSTGRES_USER=racing_user
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=racing_analytics

# Services
TELEMETRY_PORT=33740
API_PORT=8002
FRONTEND_PORT=3000

# PlayStation
PLAYSTATION_IP=192.168.1.100

# Performance
LOG_LEVEL=INFO
TELEMETRY_BUFFER_SIZE=1000
```

### Performance Tuning

- **Database**: Aumenta `shared_buffers` per PostgreSQL
- **Redis**: Configura `maxmemory` per cache ottimale
- **Telemetry**: Regola `sample_rate` per ridurre carico

## 🧪 Testing

```bash
# Test API
curl http://localhost:8002/health

# Test Telemetry Service  
curl http://localhost:8001/health

# Test WebSocket
wscat -c ws://localhost:8001/ws/telemetry
```

## 📈 Monitoring

### Logs

```bash
# Tutti i servizi
docker-compose logs -f

# Servizio specifico
docker-compose logs -f api-service

# Errori only
docker-compose logs -f | grep ERROR
```

### Health Checks

```bash
# Script di monitoring
./scripts/health-check.sh
```

## 🤝 Contribuire

1. Fork del repository
2. Crea branch feature (`git checkout -b feature/amazing-feature`)
3. Commit modifiche (`git commit -m 'Add amazing feature'`)
4. Push branch (`git push origin feature/amazing-feature`)
5. Apri Pull Request

## 📝 Troubleshooting

### Problemi Comuni

**Connessione PlayStation fallita:**
- Verifica IP PlayStation nell `.env`
- Controlla firewall/NAT
- Assicurati che GT7 stia inviando dati

**Database non si avvia:**
- Verifica porte libere (5432)
- Controlla logs: `docker-compose logs postgres`
- Reset completo: `./scripts/reset-db.sh`

**Frontend non carica:**
- Verifica che API service sia attivo
- Controlla proxy configuration
- Rebuild: `docker-compose build frontend`

### Logs Debug

```bash
# Debug telemetria
docker-compose exec telemetry-service python -c "
from granturismo.intake.feed import Feed
with Feed('192.168.1.100') as feed:
    packet = feed.get()
    print(packet)
"
```

## 📄 Licenza

MIT License - vedi [LICENSE](LICENSE) per dettagli.

## 🙏 Riconoscimenti

- **Gran Turismo 7** - Polyphony Digital
- **Libreria granturismo** - Il tuo lavoro precedente
- **TimescaleDB** - Time-series optimization
- **FastAPI** - Moderne API Python
- **React** - Frontend framework

---

**Sviluppato per appassionati di racing games** 🏁

Per supporto: [GitHub Issues](https://github.com/yourusername/racing-analytics/issues)