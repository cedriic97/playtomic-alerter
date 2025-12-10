# GitHub Actions Setup für Playtomic Sync

## 🔧 Setup Anleitung

### 1. Repository auf GitHub erstellen/pushen
```bash
# Falls noch nicht gemacht:
git init
git add .
git commit -m "Initial commit with Playtomic shadow database"
git branch -M main
git remote add origin https://github.com/DEIN_USERNAME/playtomic-alerter.git
git push -u origin main
```

### 2. GitHub Secrets einrichten
Gehe zu deinem Repository auf GitHub → Settings → Secrets and variables → Actions

Füge diese Secrets hinzu:
- `SUPABASE_URL`: `https://xevqmfidankskdoystbd.supabase.co`
- `SUPABASE_ANON_KEY`: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhldnFtZmlkYW5rc2tkb3lzdGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMzE5MDEsImV4cCI6MjA4MDgwNzkwMX0.zupXcpTMNjUvrVjFXp46QwB2zDZy-sbGeyBVErveTs0`

### 3. Workflows aktivieren
Nach dem Push werden automatisch 2 Workflows erstellt:

## 📋 Verfügbare Workflows

### 1. **Peak Hours Sync** (`sync-peak-hours.yml`)
- **Zeitplan**: Alle 5 Minuten von 9:00-21:00 UTC (Prime Time!)
- **Funktionalität**: 
  - Aggressive Cancellation Detection
  - Detaillierte Stats und Alerts
  - Optimiert für Buchungszeiten
  - Sofortige Benachrichtigung bei Cancellations

### 2. **Off-Peak Hours Sync** (`sync-off-peak.yml`)
- **Zeitplan**: Stündlich von 21:00-09:00 UTC (Maintenance Mode)
- **Funktionalität**: 
  - Wartungsmodus mit reduzierten Logs
  - Kompakte Berichte
  - Nur wichtige Events werden hervorgehoben

### 3. **Manueller Sync** (`sync-manual.yml`)
- **Trigger**: Nur manuell über GitHub UI
- **Funktionalität**:
  - Sofortiger Sync auf Knopfdruck
  - Mit optionalem Grund
  - Detaillierte Ausgabe

## 🎮 Verwendung

### Manueller Trigger:
1. Gehe zu GitHub → Actions Tab
2. Wähle "Manual Sync (On-Demand)"
3. Klicke "Run workflow"
4. Optional: Gib einen Grund ein
5. Klicke "Run workflow"

### Automatischen Sync überwachen:
1. Gehe zu GitHub → Actions Tab
2. Wähle "Sync Court Availability"
3. Sieh dir die letzten Runs an

## ⚙️ Konfiguration anpassen

### Zeitplan anpassen:
**Peak Hours** (`sync-peak-hours.yml`):
```yaml
schedule:
  - cron: '*/5 9-20 * * *'   # Alle 5 Min von 9-21 Uhr
  - cron: '*/10 9-20 * * *'  # Alle 10 Min (weniger aggressiv)  
  - cron: '*/3 9-20 * * *'   # Alle 3 Min (sehr aggressiv)
```

**Off-Peak Hours** (`sync-off-peak.yml`):
```yaml
schedule:
  - cron: '0 21-23,0-8 * * *'  # Stündlich nachts
  - cron: '*/30 21-23,0-8 * * *' # Alle 30 Min nachts
```

### Notifications hinzufügen:
Du könntest Discord/Slack Webhooks hinzufügen für Cancellation Alerts:
```yaml
- name: Notify Discord
  if: contains(steps.sync.outputs.response, '"cancellationsDetected"')
  run: |
    # Discord webhook call
```

## 📊 Monitoring

### Logs ansehen:
- GitHub Actions zeigt detaillierte Logs
- Sync Stats werden angezeigt
- Fehler werden hervorgehoben

### Datenbank überwachen:
```sql
-- Letzte Sync Runs
SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 10;

-- Aktuelle Cancellations
SELECT COUNT(*) as cancellations 
FROM available_slots 
WHERE availability_status = 'AVAILABLE_DUE_TO_CANCELLATION' 
AND is_available = true;
```

## 🚨 Troubleshooting

### Häufige Probleme:
1. **Missing Secrets**: Überprüfe GitHub Secrets
2. **Rate Limiting**: Playtomic könnte rate limiting haben
3. **Network Issues**: Temporäre Verbindungsprobleme

### Debug:
- Workflow Logs in GitHub Actions ansehen
- Manuellen Sync für Testing verwenden
- Lokales `./sync.sh` zum Vergleich

## 💡 Vorteile

- ✅ **Automatisiert**: Läuft ohne manuellen Eingriff
- ✅ **Zuverlässig**: GitHub Actions sind sehr stabil
- ✅ **Kostenlos**: GitHub Actions sind für öffentliche Repos kostenlos
- ✅ **Überwachung**: Detaillierte Logs und Fehlermeldungen
- ✅ **Flexibel**: Einfach anzupassen und zu erweitern