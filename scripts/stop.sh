#!/bin/bash

# Script per fermare Racing Analytics System
set -e

echo "🛑 Arresto Racing Analytics System..."

# Ferma tutti i servizi
echo "⏹️  Fermando servizi..."
docker-compose down

# Opzione per pulire anche volumi e reti
if [ "$1" = "--clean" ] || [ "$1" = "-c" ]; then
    echo "🧹 Pulizia volumi e reti..."
    docker-compose down -v --remove-orphans

    # Rimuovi immagini se richiesto
    if [ "$2" = "--images" ] || [ "$2" = "-i" ]; then
        echo "🗑️  Rimozione immagini..."
        docker-compose down --rmi all
    fi

    echo "✅ Sistema pulito completamente"
else
    echo "✅ Sistema fermato"
    echo ""
    echo "💡 Per una pulizia completa usa:"
    echo "   ./scripts/stop.sh --clean"
    echo "   ./scripts/stop.sh --clean --images  (rimuove anche le immagini)"
fi

echo ""
echo "🔄 Per riavviare il sistema:"
echo "   ./scripts/start.sh"