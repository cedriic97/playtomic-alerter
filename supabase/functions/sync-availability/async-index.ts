import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // Return immediately with sync run ID, then continue processing in background
    const response = new Response(
      JSON.stringify({
        success: true,
        message: "Sync started",
        syncRunId,
        status: "running"
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

    // Start background processing (fire and forget)
    processSync(supabaseClient, syncRunId).catch(console.error)

    return response

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

async function processSync(supabaseClient: any, syncRunId: string) {
  const stats = {
    clubsSynced: 0,
    slotsFound: 0,
    slotsUpdated: 0,
    cancellationsDetected: 0,
    errors: [] as string[]
  }

  try {
    const knownTenants = [
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
    for (const tenant of knownTenants) {
      await supabaseClient
        .from('clubs')
        .upsert({
          tenant_id: tenant.tenant_id,
          name: tenant.tenant_name,
          city: "Mannheim"
        }, { onConflict: 'tenant_id' })

      for (const court of tenant.courts) {
        await supabaseClient
          .from('courts')
          .upsert({
            court_id: court.court_id,
            tenant_id: tenant.tenant_id,
            court_name: court.court_name,
            court_type: court.court_type
          }, { onConflict: 'court_id' })
      }
      stats.clubsSynced++
    }

    // Quick sync - just next 3 days to reduce time
    const today = new Date()
    for (const tenant of knownTenants) {
      for (let day = 0; day < 3; day++) {
        const targetDate = new Date(today)
        targetDate.setDate(today.getDate() + day)
        const dateStr = targetDate.toISOString().split('T')[0]

        try {
          const response = await fetch(
            `https://playtomic.com/api/clubs/availability?tenant_id=${tenant.tenant_id}&date=${dateStr}&sport_id=PADEL`,
            { signal: AbortSignal.timeout(10000) } // 10s timeout per request
          )
          
          if (!response.ok) continue
          
          const availability = await response.json()
          stats.slotsFound += availability.length || 0
          
          // Simple processing - just mark as available
          for (const resource of availability || []) {
            for (const slot of resource.slots || []) {
              await supabaseClient
                .from('available_slots')
                .upsert({
                  tenant_id: tenant.tenant_id,
                  court_id: resource.resource_id,
                  date: dateStr,
                  start_time: slot.start_time,
                  end_time: addMinutesToTime(slot.start_time, slot.duration),
                  duration: slot.duration,
                  price: parseFloat(slot.price.replace(' EUR', '')),
                  is_available: true,
                  availability_status: 'AVAILABLE',
                  last_seen_at: new Date().toISOString(),
                  sync_run_id: syncRunId
                }, {
                  onConflict: 'tenant_id,court_id,date,start_time,duration'
                })
            }
          }
        } catch (error) {
          stats.errors.push(`${tenant.tenant_name} ${dateStr}: ${error.message}`)
        }
        
        await new Promise(resolve => setTimeout(resolve, 200)) // Rate limiting
      }
    }

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

  } catch (error) {
    await supabaseClient
      .from('sync_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        errors: [...stats.errors, error.message]
      })
      .eq('id', syncRunId)
  }
}

function addMinutesToTime(timeStr: string, minutes: number): string {
  const [hours, mins] = timeStr.split(':').map(Number)
  const totalMinutes = hours * 60 + mins + minutes
  const newHours = Math.floor(totalMinutes / 60) % 24
  const newMins = totalMinutes % 60
  return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}:00`
}