#!/bin/bash

# Script per resettare il database Racing Analytics
set -e

echo "🗑️  Reset Database Racing Analytics..."
echo "⚠️  ATTENZIONE: Questa operazione eliminerà TUTTI i dati!"
echo ""

# Conferma dall'utente
read -p "Sei sicuro di voler procedere? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "❌ Operazione annullata"
    exit 1
fi

echo ""
echo "🛑 Fermando servizi che usano il database..."

# Ferma servizi che usano il database
docker-compose stop api-service telemetry-service data-processor

echo "🗄️  Backup database esistente (opzionale)..."
read -p "Vuoi fare un backup prima del reset? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
    echo "💾 Creazione backup: $BACKUP_FILE"

    docker-compose exec postgres pg_dump -U racing_user racing_analytics > "backups/$BACKUP_FILE"
    echo "✅ Backup salvato in backups/$BACKUP_FILE"
fi

echo "🗑️  Rimozione volume database..."
docker-compose down
docker volume rm racing-analytics_postgres_data 2>/dev/null || echo "Volume già rimosso"

echo "🔄 Ricreazione database..."
docker-compose up -d postgres

# Attendi che PostgreSQL sia pronto
echo "⏳ Attesa avvio PostgreSQL..."
sleep 10

until docker-compose exec postgres pg_isready -U racing_user >/dev/null 2>&1; do
  echo "⏳ Attendendo PostgreSQL..."
  sleep 2
done

echo "✅ Database ricreato con successo!"

echo "🚀 Riavvio servizi..."
docker-compose up -d

echo ""
echo "🎉 Database resettato con successo!"
echo ""
echo "📊 Il database ora contiene:"
echo "   • Schema aggiornato"
echo "   • Dati di esempio (circuiti e veicoli)"
echo "   • Nessuna sessione o telemetria"
echo ""
echo "🔍 Per verificare lo stato:"
echo "   docker-compose exec postgres psql -U racing_user -d racing_analytics -c '\\dt'"