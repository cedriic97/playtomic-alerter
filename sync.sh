#!/bin/bash

# Simple sync trigger script
source .env

echo "🔄 Starting Playtomic court availability sync..."

response=$(curl -s -X POST "$SUPABASE_URL/functions/v1/sync-availability" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json")

echo "📊 Sync response:"
echo $response | jq '.' 2>/dev/null || echo $response

echo "✅ Sync triggered successfully!"