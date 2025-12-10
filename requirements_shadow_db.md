# Playtomic Shadow Database - Project Requirements

## Project Overview

Build a shadow database system that maintains real-time court availability data from Playtomic API. This system will serve as a centralized data source for current court availability across all configured tennis/padel clubs.

## Core Objectives

- **Shadow Database**: Maintain up-to-date court availability for the next 14 days
- **Real-time Sync**: Update availability status as courts get booked/released
- **Metadata Enrichment**: Include court details, club information, and location data
- **API Foundation**: Provide clean data foundation for future filtering and alert systems

## Technical Architecture

### Backend Stack
- **Supabase** (new project)
  - PostgreSQL database
  - Edge Functions for data synchronization
  - Environment variables configuration
- **No Frontend** - pure backend/API system

### Data Sources
- **Playtomic API** - court availability data
- **known_tenants.json** - club and court metadata

## Database Schema

### Tables Required

#### `clubs`
- `id` (UUID, primary key)
- `tenant_id` (TEXT, unique)
- `name` (TEXT)
- `city` (TEXT)
- `created_at`, `updated_at` (timestamps)

#### `courts`
- `id` (UUID, primary key)  
- `court_id` (TEXT, unique)
- `tenant_id` (TEXT, foreign key to clubs)
- `court_name` (TEXT)
- `court_type` (TEXT) - 'indoor' or 'outdoor'
- `created_at`, `updated_at` (timestamps)

#### `available_slots`
- `id` (UUID, primary key)
- `tenant_id` (TEXT)
- `court_id` (TEXT, foreign key to courts)
- `date` (DATE)
- `start_time` (TIME)
- `end_time` (TIME)
- `duration` (INTEGER) - minutes
- `price` (DECIMAL)
- `is_available` (BOOLEAN) - availability status
- `last_seen_at` (TIMESTAMPTZ) - when this slot was last confirmed available
- `detected_at` (TIMESTAMPTZ) - when first discovered
- `sync_run_id` (UUID) - track sync batches
- **Unique constraint**: `(tenant_id, court_id, date, start_time, duration)`

#### `sync_runs`
- `id` (UUID, primary key)
- `started_at`, `completed_at` (timestamps)
- `status` ('running', 'completed', 'failed')
- `clubs_synced` (INTEGER)
- `slots_found` (INTEGER)
- `slots_updated` (INTEGER)
- `errors` (TEXT[])

## Core Functionality

### Edge Function: `sync-availability`

**Purpose**: Fetch and sync all available court slots for next 14 days

**Process**:
1. **Data Collection**
   - Query Playtomic API for each club (from known_tenants.json)
   - Collect availability for next 14 days
   - Extract: court_id, date, time, duration, price

2. **Data Processing**
   - Enrich with metadata (court names, types from known_tenants.json)
   - Identify new slots vs. existing slots
   - Mark slots no longer available as `is_available = false`

3. **Database Updates**
   - Upsert available slots (prevent duplicates)
   - Update availability status for existing slots
   - Maintain sync run tracking

**Key Logic**:
```sql
-- Upsert logic example
INSERT INTO available_slots (...) 
VALUES (...) 
ON CONFLICT (tenant_id, court_id, date, start_time, duration) 
DO UPDATE SET 
  is_available = true,
  last_seen_at = NOW(),
  price = EXCLUDED.price
```

## User Requirements

### Functional Requirements

1. **Data Synchronization**
   - Sync all court availability for next 14 days
   - Update existing slots instead of creating duplicates
   - Track availability status changes (available → unavailable)
   - Handle API errors gracefully

2. **Data Quality**
   - Include court metadata (name, type, club info)
   - Maintain data consistency across sync runs
   - Clean up old/stale data (older than 14 days)

3. **Monitoring & Logging**
   - Track sync run statistics
   - Log API errors and data inconsistencies
   - Provide sync run history

### Non-Functional Requirements

1. **Performance**
   - Sync should complete within 5 minutes
   - Handle rate limits from Playtomic API
   - Efficient database queries

2. **Reliability**
   - Graceful error handling
   - Partial sync recovery
   - Data integrity maintenance

3. **Scalability**
   - Support adding new clubs/tenants
   - Handle increasing data volume

## API Documentation

### Playtomic API Integration

#### API Endpoint
```
GET https://playtomic.com/api/clubs/availability
```

#### Required Parameters
- `tenant_id` - Club identifier (from known_tenants.json)
- `date` - Date in YYYY-MM-DD format
- `sport_id` - Always "PADEL"

#### Example Request
```bash
curl "https://playtomic.com/api/clubs/availability?tenant_id=5bb4ad71-dbd9-499e-88fb-c9a5e7df6db6&date=2025-12-08&sport_id=PADEL"
```

#### API Response Structure
The API returns an array of resources (courts) with available slots:

```json
[
  {
    "resource_id": "64103cb0-6f0b-4d1c-84b1-cb59d61da7a8",
    "start_date": "2025-12-08",
    "slots": [
      {
        "start_time": "09:00:00",
        "duration": 60,
        "price": "24 EUR"
      },
      {
        "start_time": "10:00:00", 
        "duration": 90,
        "price": "36 EUR"
      }
    ]
  }
]
```

#### Key API Facts
- **All returned slots are available** (no `available` flag needed)
- **Price format**: Always "XX EUR" string
- **Duration**: In minutes (60, 90, 120 typical values)
- **Times**: 24-hour format "HH:MM:SS"
- **resource_id**: Maps to court_id in known_tenants.json

### known_tenants.json Structure

#### File Purpose
Contains club and court metadata that enriches API data with human-readable names and court types.

#### File Format
```json
[
  {
    "tenant_id": "5bb4ad71-dbd9-499e-88fb-c9a5e7df6db6",
    "tenant_name": "Maba! Padel Mannheim",
    "courts": [
      {
        "court_name": "Court 1",
        "court_type": "indoor",
        "court_id": "64103cb0-6f0b-4d1c-84b1-cb59d61da7a8"
      },
      {
        "court_name": "Court 2", 
        "court_type": "indoor",
        "court_id": "ce22c7e5-66aa-48d7-9abf-51630e3806c6"
      },
      {
        "court_name": "Court 10",
        "court_type": "outdoor", 
        "court_id": "c1110cfb-350d-48e6-8669-57e432fe27c9"
      }
    ]
  }
]
```

#### Data Mapping Logic
```javascript
// Map API resource_id to court metadata
const courtMetadata = knownTenants
  .find(tenant => tenant.tenant_id === tenantId)
  ?.courts.find(court => court.court_id === resource_id)

// Use metadata for enrichment
const courtName = courtMetadata?.court_name || `Court ${resource_id.substring(0, 8)}`
const courtType = courtMetadata?.court_type || 'unknown'
```

#### Implementation Notes
- **Graceful fallback**: If court_id not found in known_tenants, generate name from resource_id
- **Court types**: Only 'indoor' or 'outdoor'
- **tenant_id**: Must match exactly between API calls and known_tenants.json

## Files to Migrate

### From Current Project
- `known_tenants.json` - **CRITICAL**: Contains all club and court metadata
- Environment variables setup (`.env.example`)
- Playtomic API integration patterns

### New Files Needed
- Supabase migration files
- Edge Function implementation  
- Database schema definitions

### Example Edge Function Logic Flow

```typescript
// Pseudo-code for sync process
for (const tenant of knownTenants) {
  for (let day = 0; day < 14; day++) {
    const date = addDays(today, day)
    
    // Call Playtomic API
    const response = await fetch(`https://playtomic.com/api/clubs/availability?tenant_id=${tenant.tenant_id}&date=${date}&sport_id=PADEL`)
    const availability = await response.json()
    
    // Process each resource (court)
    for (const resource of availability) {
      const courtMetadata = tenant.courts.find(c => c.court_id === resource.resource_id)
      
      for (const slot of resource.slots) {
        // Calculate end_time from start_time + duration
        const endTime = addMinutes(slot.start_time, slot.duration)
        
        // Upsert slot with metadata
        await upsertSlot({
          tenant_id: tenant.tenant_id,
          court_id: resource.resource_id,
          court_name: courtMetadata?.court_name,
          court_type: courtMetadata?.court_type,
          date: date,
          start_time: slot.start_time,
          end_time: endTime,
          duration: slot.duration,
          price: parseFloat(slot.price.replace(' EUR', '')),
          is_available: true,
          last_seen_at: now()
        })
      }
    }
  }
}
```

## Environment Variables

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
```

## Success Criteria

1. **Complete Data Coverage**
   - All clubs from known_tenants.json are synced
   - 14-day availability window maintained
   - Court metadata properly enriched

2. **Data Accuracy** 
   - Real-time availability status
   - No duplicate slots
   - Consistent data across sync runs

3. **System Reliability**
   - Successful sync completion rate > 95%
   - Error recovery and logging
   - Performance within defined limits

## Future Considerations

This shadow database will serve as the foundation for:
- Alert systems based on availability changes
- Advanced filtering and search capabilities  
- Historical availability analytics
- API endpoints for external integrations

## Deployment Notes

- Create new Supabase project
- Configure environment variables
- Deploy Edge Function
- Initialize database schema
- Set up manual trigger for sync function (scheduling to be handled separately)