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

### 1. **Automatischer Sync** (`sync-courts.yml`)
- **Zeitplan**: Alle 30 Minuten (optimal für Cancellation Detection)
- **Funktionalität**: 
  - Läuft automatisch
  - Zeigt detaillierte Stats
  - Warnt bei gefundenen Cancellations
  - Schlägt fehl bei Fehlern

### 2. **Manueller Sync** (`sync-manual.yml`)
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

### Zeitplan ändern:
In `.github/workflows/sync-courts.yml` die cron Zeile anpassen:
```yaml
schedule:
  - cron: '*/15 * * * *'  # Alle 15 Minuten
  - cron: '0 * * * *'     # Jede Stunde
  - cron: '0 8,12,16,20 * * *'  # 4x täglich
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