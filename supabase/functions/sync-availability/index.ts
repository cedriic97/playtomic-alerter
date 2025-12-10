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
    console.log(`🏢 Starting sync for ${tenant.tenant_name}...`)
    
    // Get existing slots for the next 7 days for this tenant
    const endDate = new Date(today)
    endDate.setDate(today.getDate() + 6)
    const startDateStr = today.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]
    
    const { data: existingSlots, error: fetchError } = await supabaseClient
      .from('available_slots')
      .select('tenant_id, court_id, date, start_time, duration, price, is_available, availability_status')
      .eq('tenant_id', tenant.tenant_id)
      .gte('date', startDateStr)
      .lte('date', endDateStr)
    
    if (fetchError) {
      stats.errors.push(`Failed to fetch existing slots for ${tenant.tenant_name}: ${fetchError.message}`)
      continue
    }

    // Create a Map for fast lookups of existing slots
    const existingSlotsMap = new Map<string, any>()
    for (const slot of existingSlots || []) {
      const key = `${slot.court_id}|${slot.date}|${slot.start_time}|${slot.duration}`
      existingSlotsMap.set(key, slot)
    }

    // Track which slots we've seen in this sync (for cancellation detection)
    const seenSlotsInSync = new Set<string>()

    for (let day = 0; day < 7; day++) {
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

          // Process each slot with intelligent diffing
          for (const slot of resource.slots) {
            try {
              const startTime = slot.start_time
              const endTime = addMinutesToTime(slot.start_time, slot.duration)
              const price = parseFloat(slot.price.replace(' EUR', ''))
              const slotKey = `${resource.resource_id}|${dateStr}|${startTime}|${slot.duration}`
              
              // Mark this slot as seen in current sync
              seenSlotsInSync.add(slotKey)
              
              const existingSlot = existingSlotsMap.get(slotKey)
              const now = new Date().toISOString()

              if (!existingSlot) {
                // NEW SLOT: Check if this is initial load (empty table) or a cancellation
                const daysFromNow = Math.floor((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                
                let availabilityStatus = 'AVAILABLE'
                if (existingSlots.length > 0 && daysFromNow < 7) {
                  // Table is NOT empty, so this is a normal sync - new slot = cancellation
                  availabilityStatus = 'AVAILABLE_DUE_TO_CANCELLATION'
                  console.log(`🚨 New cancellation detected: ${courtMetadata.court_name} ${dateStr} ${startTime}`)
                  stats.cancellationsDetected++
                } else {
                  // Table is empty (initial load) or slot is far in future
                  console.log(`➕ New slot: ${courtMetadata.court_name} ${dateStr} ${startTime}`)
                }
                
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
                  stats.errors.push(`Insert error: ${insertError.message}`)
                } else {
                  stats.slotsFound++
                }
              } else if (!existingSlot.is_available && existingSlot.availability_status === 'NOT_AVAILABLE') {
                // SLOT CAME BACK: This is a real cancellation (slot was previously marked as NOT_AVAILABLE)!
                const daysFromNow = Math.floor((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                const availabilityStatus = daysFromNow < 7 ? 'AVAILABLE_DUE_TO_CANCELLATION' : 'AVAILABLE'
                
                if (availabilityStatus === 'AVAILABLE_DUE_TO_CANCELLATION') {
                  console.log(`🚨 Cancellation detected: ${courtMetadata.court_name} ${dateStr} ${startTime}`)
                  stats.cancellationsDetected++
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
                  .eq('tenant_id', tenant.tenant_id)
                  .eq('court_id', resource.resource_id)
                  .eq('date', dateStr)
                  .eq('start_time', startTime)
                  .eq('duration', slot.duration)

                if (updateError) {
                  stats.errors.push(`Cancellation update error: ${updateError.message}`)
                } else {
                  stats.slotsFound++
                }
              } else if (!existingSlot.is_available && existingSlot.availability_status === 'AVAILABLE_DUE_TO_CANCELLATION') {
                // SLOT WAS ALREADY A CANCELLATION: Keep it as cancellation, just update metadata
                const { error: updateError } = await supabaseClient
                  .from('available_slots')
                  .update({
                    price: price,
                    is_available: true,
                    last_seen_at: now,
                    sync_run_id: syncRunId
                  })
                  .eq('tenant_id', tenant.tenant_id)
                  .eq('court_id', resource.resource_id)
                  .eq('date', dateStr)
                  .eq('start_time', startTime)
                  .eq('duration', slot.duration)

                if (updateError) {
                  stats.errors.push(`Existing cancellation update error: ${updateError.message}`)
                } else {
                  stats.slotsFound++
                }
              } else if (existingSlot.price !== price) {
                // PRICE CHANGED: Update price and last_seen_at
                console.log(`💰 Price change: ${courtMetadata.court_name} ${dateStr} ${startTime}: ${existingSlot.price} → ${price}`)
                const { error: updateError } = await supabaseClient
                  .from('available_slots')
                  .update({
                    price: price,
                    last_seen_at: now,
                    sync_run_id: syncRunId
                  })
                  .eq('tenant_id', tenant.tenant_id)
                  .eq('court_id', resource.resource_id)
                  .eq('date', dateStr)
                  .eq('start_time', startTime)
                  .eq('duration', slot.duration)

                if (updateError) {
                  stats.errors.push(`Price update error: ${updateError.message}`)
                } else {
                  stats.slotsFound++
                }
              } else {
                // UNCHANGED SLOT: Will be bulk updated at the end
                stats.slotsFound++
              }
            } catch (error) {
              stats.errors.push(`Slot processing error: ${error.message}`)
            }
          }
        }

        // Minimal delay since we're doing much less work per slot
        await new Promise(resolve => setTimeout(resolve, 50))

      } catch (error) {
        stats.errors.push(`Failed to sync ${tenant.tenant_name} on ${dateStr}: ${error.message}`)
      }
    }

    // Bulk update: Set sync_run_id for ALL slots of this tenant that we've "seen" in current sync
    console.log(`⚡ Bulk updating sync_run_id for all seen slots of ${tenant.tenant_name}`)
    
    try {
      const endDate = new Date(today)
      endDate.setDate(today.getDate() + 6)
      const startDateStr = today.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]
      
      // Update all slots for this tenant in our date range that are available
      const { error: bulkUpdateError } = await supabaseClient
        .from('available_slots')
        .update({ sync_run_id: syncRunId })
        .eq('tenant_id', tenant.tenant_id)
        .eq('is_available', true)
        .gte('date', startDateStr)
        .lte('date', endDateStr)

      if (bulkUpdateError) {
        stats.errors.push(`Bulk sync_run_id update error: ${bulkUpdateError.message}`)
      }
    } catch (error) {
      stats.errors.push(`Bulk sync_run_id update error: ${error.message}`)
    }

    // Mark slots that weren't seen in this sync as no longer available
    const slotsToMarkUnavailable = []
    for (const [slotKey, slot] of existingSlotsMap.entries()) {
      if (!seenSlotsInSync.has(slotKey) && slot.is_available) {
        slotsToMarkUnavailable.push({
          tenant_id: slot.tenant_id,
          court_id: slot.court_id,
          date: slot.date,
          start_time: slot.start_time,
          duration: slot.duration
        })
      }
    }

    // Batch update unavailable slots using a more efficient approach
    if (slotsToMarkUnavailable.length > 0) {
      console.log(`📝 Marking ${slotsToMarkUnavailable.length} slots as unavailable for ${tenant.tenant_name}`)
      
      // Process in batches of 50 for better performance
      const batchSize = 50
      for (let i = 0; i < slotsToMarkUnavailable.length; i += batchSize) {
        const batch = slotsToMarkUnavailable.slice(i, i + batchSize)
        
        for (const slot of batch) {
          const { error: updateError } = await supabaseClient
            .from('available_slots')
            .update({ 
              is_available: false,
              availability_status: 'NOT_AVAILABLE'
            })
            .eq('tenant_id', slot.tenant_id)
            .eq('court_id', slot.court_id)
            .eq('date', slot.date)
            .eq('start_time', slot.start_time)
            .eq('duration', slot.duration)

          if (!updateError) {
            stats.slotsUpdated++
          }
        }
        
        // Small delay between batches
        if (i + batchSize < slotsToMarkUnavailable.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
    }
    
    console.log(`✅ Completed sync for ${tenant.tenant_name}: ${stats.slotsFound} slots processed`)
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