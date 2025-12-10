import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface KnownTenant {
  tenant_id: string;
  tenant_name: string;
  courts: {
    court_name: string;
    court_type: 'indoor' | 'outdoor';
    court_id: string;
  }[];
}

interface SyncStats {
  clubsSynced: number;
  slotsFound: number;
  slotsUpdated: number;
  cancellationsDetected: number;
  errors: string[];
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const syncRunId = crypto.randomUUID()
  
  try {
    // Extract token from Authorization header and use for database access
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '') || ''
    
    const supabaseClient = createClient(
      'https://xevqmfidankskdoystbd.supabase.co',
      token // Use the provided token for consistency
    )

    console.log(`🚀 Starting sync run: ${syncRunId}`)

    // Create sync run record
    const { error: syncError } = await supabaseClient
      .from('sync_runs')
      .insert({
        id: syncRunId,
        status: 'running',
        started_at: new Date().toISOString()
      })

    if (syncError) {
      console.error('Failed to create sync run:', syncError)
      throw new Error(`Failed to create sync run: ${syncError.message}`)
    }

    const stats: SyncStats = {
      clubsSynced: 0,
      slotsFound: 0,
      slotsUpdated: 0,
      cancellationsDetected: 0,
      errors: []
    }

    try {
      // Load known tenants
      const knownTenants: KnownTenant[] = [
        {
          "tenant_id": "5bb4ad71-dbd9-499e-88fb-c9a5e7df6db6",
          "tenant_name": "Maba! Padel Mannheim",
          "courts": [
            { "court_name": "Court 1", "court_type": "indoor", "court_id": "64103cb0-6f0b-4d1c-84b1-cb59d61da7a8"},
            { "court_name": "Court 2", "court_type": "indoor", "court_id": "ce22c7e5-66aa-48d7-9abf-51630e3806c6"},
            { "court_name": "Court 3", "court_type": "indoor", "court_id": "487a38b2-76a1-4ff5-a753-dd979ea30495"},
            { "court_name": "Court 4", "court_type": "indoor", "court_id": "290f7aaa-eed2-4e77-a66c-422c2c873f7f"},
            { "court_name": "Court 5", "court_type": "indoor", "court_id": "c7e016a0-45e6-4bd5-b11c-f7647f87082b"},
            { "court_name": "Court 6", "court_type": "indoor", "court_id": "dccc2f5d-472c-42c1-bc4b-1fdc8896c596"},
            { "court_name": "Court 7", "court_type": "indoor", "court_id": "fd18ae0f-2804-4f11-b248-3413b18fa5bd"},
            { "court_name": "Court 8", "court_type": "indoor", "court_id": "17968348-68e6-46dc-a15b-337035351135"},
            { "court_name": "Court 9", "court_type": "indoor", "court_id": "11589765-ce70-44e9-a7c1-d257f2c89c33"},
            { "court_name": "Court 10", "court_type": "outdoor", "court_id": "c1110cfb-350d-48e6-8669-57e432fe27c9"},
            { "court_name": "Court 11", "court_type": "outdoor", "court_id": "75318066-28dd-40a1-8936-acb5cb61f652"},
            { "court_name": "Court 12", "court_type": "outdoor", "court_id": "da5e34ea-c4e3-489d-8e99-a19de7933f10"}
          ]
        }
      ]

      // Initialize clubs and courts
      console.log('📋 Initializing clubs and courts...')
      await initializeClubsAndCourts(supabaseClient, knownTenants, stats)

      // Sync availability data for next 7 days (balanced approach)
      console.log('🔄 Syncing availability data...')
      await syncAvailabilityData(supabaseClient, knownTenants, syncRunId, stats)

      // Mark stale slots as unavailable
      console.log('🧹 Marking stale slots...')
      await markStaleSlots(supabaseClient, syncRunId, stats)

      // Update sync run as completed
      await supabaseClient
        .from('sync_runs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          clubs_synced: stats.clubsSynced,
          slots_found: stats.slotsFound,
          slots_updated: stats.slotsUpdated,
          cancellations_detected: stats.cancellationsDetected,
          errors: stats.errors
        })
        .eq('id', syncRunId)

      console.log('✅ Sync completed successfully:', stats)

      return new Response(
        JSON.stringify({
          success: true,
          syncRunId,
          message: "Sync completed successfully",
          stats,
          timestamp: new Date().toISOString()
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )

    } catch (error) {
      console.error('❌ Sync failed:', error)
      
      // Mark sync run as failed
      await supabaseClient
        .from('sync_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          clubs_synced: stats.clubsSynced,
          slots_found: stats.slotsFound,
          slots_updated: stats.slotsUpdated,
          cancellations_detected: stats.cancellationsDetected,
          errors: [...stats.errors, error.message]
        })
        .eq('id', syncRunId)

      throw error
    }

  } catch (error) {
    console.error('❌ Overall sync error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false,
        syncRunId,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})

async function initializeClubsAndCourts(
  supabaseClient: any,
  knownTenants: KnownTenant[],
  stats: SyncStats
) {
  for (const tenant of knownTenants) {
    try {
      // Upsert club
      const { error: clubError } = await supabaseClient
        .from('clubs')
        .upsert({
          tenant_id: tenant.tenant_id,
          name: tenant.tenant_name,
          city: extractCityFromName(tenant.tenant_name)
        }, {
          onConflict: 'tenant_id'
        })

      if (clubError) {
        stats.errors.push(`Club upsert error for ${tenant.tenant_name}: ${clubError.message}`)
        continue
      }

      // Upsert courts
      for (const court of tenant.courts) {
        const { error: courtError } = await supabaseClient
          .from('courts')
          .upsert({
            court_id: court.court_id,
            tenant_id: tenant.tenant_id,
            court_name: court.court_name,
            court_type: court.court_type
          }, {
            onConflict: 'court_id'
          })

        if (courtError) {
          stats.errors.push(`Court upsert error for ${court.court_name}: ${courtError.message}`)
        }
      }

      stats.clubsSynced++
    } catch (error) {
      stats.errors.push(`Failed to initialize ${tenant.tenant_name}: ${error.message}`)
    }
  }
}

async function syncAvailabilityData(
  supabaseClient: any,
  knownTenants: KnownTenant[],
  syncRunId: string,
  stats: SyncStats
) {
  const today = new Date()
  
  for (const tenant of knownTenants) {
    for (let day = 0; day < 7; day++) { // Reduced to 7 days for better performance
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() + day)
      const dateStr = targetDate.toISOString().split('T')[0]

      try {
        console.log(`📅 Fetching availability for ${tenant.tenant_name} on ${dateStr}`)
        
        // Call Playtomic API with timeout
        const response = await fetch(
          `https://playtomic.com/api/clubs/availability?tenant_id=${tenant.tenant_id}&date=${dateStr}&sport_id=PADEL`,
          { signal: AbortSignal.timeout(15000) }
        )
        
        if (!response.ok) {
          stats.errors.push(`API call failed for ${tenant.tenant_name} on ${dateStr}: ${response.status}`)
          continue
        }

        const availability = await response.json()
        console.log(`Found ${availability.length} resources for ${tenant.tenant_name} on ${dateStr}`)

        // Process each resource (court)
        for (const resource of availability) {
          const courtMetadata = tenant.courts.find(c => c.court_id === resource.resource_id)
          
          if (!courtMetadata) {
            stats.errors.push(`Court ${resource.resource_id} not found in known_tenants for ${tenant.tenant_name}`)
            continue
          }

          // Process each slot
          for (const slot of resource.slots) {
            try {
              const startTime = slot.start_time
              const endTime = addMinutesToTime(slot.start_time, slot.duration)
              const price = parseFloat(slot.price.replace(' EUR', ''))

              const { error: slotError } = await supabaseClient
                .from('available_slots')
                .upsert({
                  tenant_id: tenant.tenant_id,
                  court_id: resource.resource_id,
                  date: dateStr,
                  start_time: startTime,
                  end_time: endTime,
                  duration: slot.duration,
                  price: price,
                  is_available: true,
                  availability_status: 'AVAILABLE',
                  last_seen_at: new Date().toISOString(),
                  sync_run_id: syncRunId
                }, {
                  onConflict: 'tenant_id,court_id,date,start_time,duration'
                })

              if (slotError) {
                stats.errors.push(`Slot upsert error: ${slotError.message}`)
              } else {
                stats.slotsFound++
              }
            } catch (error) {
              stats.errors.push(`Slot processing error: ${error.message}`)
            }
          }
        }

        // Add delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 300))

      } catch (error) {
        stats.errors.push(`Failed to sync ${tenant.tenant_name} on ${dateStr}: ${error.message}`)
      }
    }
  }
}

async function markStaleSlots(
  supabaseClient: any,
  syncRunId: string,
  stats: SyncStats
) {
  try {
    const { data, error } = await supabaseClient
      .from('available_slots')
      .update({ 
        is_available: false,
        availability_status: 'NOT_AVAILABLE'
      })
      .neq('sync_run_id', syncRunId)
      .eq('is_available', true)
      .gte('date', new Date().toISOString().split('T')[0])
      .select('id')

    if (error) {
      stats.errors.push(`Failed to mark stale slots: ${error.message}`)
    } else {
      stats.slotsUpdated = data?.length || 0
      console.log(`Marked ${stats.slotsUpdated} stale slots as unavailable`)
    }
  } catch (error) {
    stats.errors.push(`Stale slots error: ${error.message}`)
  }
}

function extractCityFromName(tenantName: string): string {
  const parts = tenantName.split(' ')
  return parts[parts.length - 1] || ''
}

function addMinutesToTime(timeStr: string, minutes: number): string {
  const [hours, mins, secs] = timeStr.split(':').map(Number)
  const totalMinutes = hours * 60 + mins + minutes
  const newHours = Math.floor(totalMinutes / 60) % 24
  const newMins = totalMinutes % 60
  return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}:${secs ? secs.toString().padStart(2, '0') : '00'}`
}