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

interface PlaytomicSlot {
  start_time: string;
  duration: number;
  price: string;
}

interface PlaytomicResource {
  resource_id: string;
  start_date: string;
  slots: PlaytomicSlot[];
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

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? 'https://xevqmfidankskdoystbd.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhldnFtZmlkYW5rc2tkb3lzdGJkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTIzMTkwMSwiZXhwIjoyMDgwODA3OTAxfQ.F_AvPvW3m3fAGmgbVfNPv33FKU7N5Y7ZPzDrlNLCWrY'
    )

    // Start sync run tracking
    const { data: syncRun, error: syncError } = await supabaseClient
      .from('sync_runs')
      .insert({ status: 'running' })
      .select('id')
      .single()

    if (syncError) {
      throw new Error(`Failed to create sync run: ${syncError.message}`)
    }

    const syncRunId = syncRun.id
    const stats: SyncStats = {
      clubsSynced: 0,
      slotsFound: 0,
      slotsUpdated: 0,
      cancellationsDetected: 0,
      errors: []
    }

    try {
      // Load known tenants - embedded data for now
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

      // Initialize clubs and courts from known_tenants.json
      await initializeClubsAndCourts(supabaseClient, knownTenants, stats)

      // Sync availability for next 14 days
      await syncAvailabilityData(supabaseClient, knownTenants, syncRunId, stats)

      // Mark old slots as unavailable
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

      return new Response(
        JSON.stringify({
          success: true,
          syncRunId,
          stats
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )

    } catch (error) {
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
    console.error('Sync error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
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
    for (let day = 0; day < 14; day++) {
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() + day)
      const dateStr = targetDate.toISOString().split('T')[0]

      try {
        // Call Playtomic API
        const apiUrl = `https://playtomic.com/api/clubs/availability?tenant_id=${tenant.tenant_id}&date=${dateStr}&sport_id=PADEL`
        const response = await fetch(apiUrl)
        
        if (!response.ok) {
          stats.errors.push(`API call failed for ${tenant.tenant_name} on ${dateStr}: ${response.status}`)
          continue
        }

        const availability: PlaytomicResource[] = await response.json()

        // Process each resource (court)
        for (const resource of availability) {
          const courtMetadata = tenant.courts.find(c => c.court_id === resource.resource_id)
          
          if (!courtMetadata) {
            stats.errors.push(`Court ${resource.resource_id} not found in known_tenants for ${tenant.tenant_name}`)
            continue
          }

          // Process each slot with cancellation detection logic
          for (const slot of resource.slots) {
            try {
              const startTime = slot.start_time
              const endTime = addMinutesToTime(slot.start_time, slot.duration)
              const price = parseFloat(slot.price.replace(' EUR', ''))
              const now = new Date().toISOString()
              const slotDate = new Date(dateStr)
              const today = new Date()
              const daysFromNow = Math.floor((slotDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              
              // Check if this slot already exists
              const { data: existingSlot } = await supabaseClient
                .from('available_slots')
                .select('*')
                .eq('tenant_id', tenant.tenant_id)
                .eq('court_id', resource.resource_id)
                .eq('date', dateStr)
                .eq('start_time', startTime)
                .eq('duration', slot.duration)
                .single()

              let availabilityStatus = 'AVAILABLE'
              
              if (existingSlot) {
                // Slot exists - update it
                if (existingSlot.is_available === false) {
                  // Slot was previously unavailable, now it's back - likely a cancellation!
                  // Only mark as cancellation if it's not day 14 (new slots opening)
                  if (daysFromNow < 14) {
                    availabilityStatus = 'AVAILABLE_DUE_TO_CANCELLATION'
                    stats.cancellationsDetected++
                  }
                }
                
                const { error: updateError } = await supabaseClient
                  .from('available_slots')
                  .update({
                    price: price,
                    is_available: true,
                    availability_status: availabilityStatus,
                    last_seen_at: now,
                    sync_run_id: syncRunId
                  })
                  .eq('id', existingSlot.id)

                if (updateError) {
                  stats.errors.push(`Slot update error: ${updateError.message}`)
                } else {
                  stats.slotsFound++
                }
              } else {
                // New slot - insert it
                const { error: insertError } = await supabaseClient
                  .from('available_slots')
                  .insert({
                    tenant_id: tenant.tenant_id,
                    court_id: resource.resource_id,
                    date: dateStr,
                    start_time: startTime,
                    end_time: endTime,
                    duration: slot.duration,
                    price: price,
                    is_available: true,
                    availability_status: availabilityStatus,
                    last_seen_at: now,
                    detected_at: now,
                    sync_run_id: syncRunId
                  })

                if (insertError) {
                  stats.errors.push(`Slot insert error: ${insertError.message}`)
                } else {
                  stats.slotsFound++
                }
              }
            } catch (error) {
              stats.errors.push(`Slot processing error: ${error.message}`)
            }
          }
        }

        // Add small delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 100))

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
  // Mark slots as unavailable if they weren't seen in this sync run
  // These are slots that were available but are no longer returned by the API (likely booked)
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
    stats.slotsUpdated += data?.length || 0
  }
}

function extractCityFromName(tenantName: string): string {
  // Simple extraction - assumes city is the last word
  const parts = tenantName.split(' ')
  return parts[parts.length - 1] || ''
}

function addMinutesToTime(timeStr: string, minutes: number): string {
  const [hours, mins, secs] = timeStr.split(':').map(Number)
  const totalMinutes = hours * 60 + mins + minutes
  const newHours = Math.floor(totalMinutes / 60) % 24
  const newMins = totalMinutes % 60
  return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}