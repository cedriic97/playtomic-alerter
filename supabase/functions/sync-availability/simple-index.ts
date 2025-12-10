import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🚀 Starting simple sync...')
    
    // Test Playtomic API call
    const testResponse = await fetch(
      'https://playtomic.com/api/clubs/availability?tenant_id=5bb4ad71-dbd9-499e-88fb-c9a5e7df6db6&date=2025-12-10&sport_id=PADEL',
      { signal: AbortSignal.timeout(10000) }
    )
    
    if (!testResponse.ok) {
      throw new Error(`Playtomic API failed: ${testResponse.status}`)
    }
    
    const testData = await testResponse.json()
    console.log(`✅ Playtomic API working, found ${testData.length} resources`)
    
    // Count slots
    let totalSlots = 0
    for (const resource of testData) {
      totalSlots += resource.slots?.length || 0
    }
    
    const result = {
      success: true,
      message: "Simple sync test completed",
      timestamp: new Date().toISOString(),
      stats: {
        clubsTested: 1,
        resourcesFound: testData.length,
        slotsFound: totalSlots,
        testData: testData.slice(0, 2) // First 2 resources for debugging
      }
    }
    
    console.log('📊 Result:', JSON.stringify(result, null, 2))
    
    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('❌ Sync error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})