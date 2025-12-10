#!/bin/bash

# Load environment variables
source .env

echo "🗑️ Resetting Playtomic Shadow Database..."
echo "This will clear all available_slots data and sync_runs for a fresh start."

read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Reset cancelled."
    exit 1
fi

echo "🧹 Clearing available_slots table..."
curl -X DELETE \
  "${SUPABASE_URL}/rest/v1/available_slots?tenant_id=neq.dummy" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Prefer: count=exact"

echo "🧹 Clearing sync_runs table..."
curl -X DELETE \
  "${SUPABASE_URL}/rest/v1/sync_runs?status=neq.dummy" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Prefer: count=exact"

echo
echo "✅ Database reset complete!"
echo "📋 You can now run ./sync.sh for a fresh initial sync."
echo "🎯 All slots will be marked as AVAILABLE (not cancelled) in the first sync."