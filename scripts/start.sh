#!/bin/bash

# Script per avviare Racing Analytics System
set -e

echo "🏎️  Avvio Racing Analytics System..."

# Controlla se Docker è in esecuzione
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker non è in esecuzione. Avvia Docker e riprova."
    exit 1
fi

# Controlla se il file .env esiste
if [ ! -f .env ]; then
    echo "⚠️  File .env non trovato. Copio il template..."
    cp .env.example .env 2>/dev/null || echo "Crea il file .env con le tue configurazioni"
fi

# Controlla se la rete esiste
NETWORK_NAME="racing_network"
if ! docker network ls | grep -q $NETWORK_NAME; then
    echo "🔗 Creazione rete Docker..."
    docker network create $NETWORK_NAME
fi

# Build e avvio servizi
echo "🔨 Build delle immagini Docker..."
docker-compose build --parallel

echo "🚀 Avvio dei servizi..."
docker-compose up -d postgres redis

# Attendi che il database sia pronto
echo "⏳ Attesa avvio database..."
sleep 10

# Verifica che PostgreSQL sia pronto
until docker-compose exec postgres pg_isready -U racing_user; do
  echo "⏳ Attendendo PostgreSQL..."
  sleep 2
done

echo "✅ Database pronto!"

# Avvia gli altri servizi
echo "🚀 Avvio servizi applicazione..."
docker-compose up -d

# Attendi che tutti i servizi siano pronti
echo "⏳ Verifica stato servizi..."
sleep 15

# Controlla stato servizi
echo "📊 Stato servizi:"
docker-compose ps

# Controlla health dei servizi
echo "🔍 Verifica health check..."

# API Service
if curl -f http://localhost:8002/health >/dev/null 2>&1; then
    echo "✅ API Service: OK"
else
    echo "❌ API Service: NOK"
fi

# Telemetry Service
if curl -f http://localhost:8001/health >/dev/null 2>&1; then
    echo "✅ Telemetry Service: OK"
else
    echo "❌ Telemetry Service: NOK"
fi

# Frontend
if curl -f http://localhost:3000 >/dev/null 2>&1; then
    echo "✅ Frontend: OK"
else
    echo "❌ Frontend: NOK"
fi

echo ""
echo "🎉 Racing Analytics System avviato!"
echo ""
echo "📱 Interfacce disponibili:"
echo "   • Frontend:    http://localhost:3000"
echo "   • API:         http://localhost:8002"
echo "   • Telemetria:  http://localhost:8001"
echo "   • Nginx:       http://localhost:80"
echo ""
echo "📖 Per visualizzare i log:"
echo "   docker-compose logs -f [service-name]"
echo ""
echo "🛑 Per fermare il sistema:"
echo "   ./scripts/stop.sh"
echo ""

# Mostra logs in tempo reale (opzionale)
read -p "Vuoi visualizzare i logs in tempo reale? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker-compose logs -f
fi