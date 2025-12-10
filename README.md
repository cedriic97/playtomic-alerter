# Playtomic Shadow Database

A real-time shadow database system that maintains court availability data from the Playtomic API.

## Quick Start

1. **Deploy the system:**
   ```bash
   ./deploy.sh
   ```

2. **Test the sync function:**
   ```bash
   curl -X POST $SUPABASE_URL/functions/v1/sync-availability \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
   ```

## System Overview

- **Database**: 4 tables tracking clubs, courts, available slots, and sync runs
- **Edge Function**: `sync-availability` processes 14 days of court data
- **Data Source**: Playtomic API + known_tenants.json metadata
- **Updates**: Upserts prevent duplicates, tracks availability changes

## Database Schema

- `clubs` - Tennis/padel club information
- `courts` - Individual courts with metadata  
- `available_slots` - Time slots with availability status
- `sync_runs` - Synchronization batch tracking

## Monitoring

Check sync status in the `sync_runs` table:
```sql
SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 10;
```

## Files

- `supabase/migrations/001_create_schema.sql` - Database schema
- `supabase/functions/sync-availability/index.ts` - Sync Edge Function
- `deploy.sh` - Deployment automation script