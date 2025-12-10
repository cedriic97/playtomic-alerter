#!/bin/bash

# Deployment script for Playtomic Shadow Database
set -e

echo "🚀 Deploying Playtomic Shadow Database..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create it with your Supabase credentials."
    echo "   SUPABASE_URL=https://your-project.supabase.co"
    echo "   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key"
    echo "   SUPABASE_ANON_KEY=your-anon-key"
    exit 1
fi

# Source environment variables
source .env

# Verify required environment variables
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Missing required environment variables in .env file"
    exit 1
fi

echo "✅ Environment variables loaded"

# Link to existing Supabase project
echo "🔗 Linking to Supabase project..."
if ! supabase status &> /dev/null; then
    # Extract project ID from URL
    PROJECT_ID=$(echo $SUPABASE_URL | sed 's/https:\/\/\([^.]*\)\.supabase\.co/\1/')
    supabase link --project-ref $PROJECT_ID
fi

# Apply database migrations
echo "📊 Applying database migrations..."
supabase db push

# Copy known_tenants.json to functions directory
echo "📋 Copying known_tenants.json to Edge Function..."
cp known_tenants.json supabase/functions/sync-availability/

# Deploy Edge Functions
echo "⚡ Deploying Edge Functions..."
supabase functions deploy sync-availability

# Set environment variables for Edge Function
echo "🔧 Setting Edge Function environment variables..."
supabase secrets set SUPABASE_URL="$SUPABASE_URL"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"

echo "✅ Deployment completed successfully!"
echo ""
echo "🎯 Next steps:"
echo "   1. Test the sync function:"
echo "      curl -X POST $SUPABASE_URL/functions/v1/sync-availability -H \"Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY\""
echo ""
echo "   2. Set up a cron job or scheduler to run the sync periodically"
echo ""
echo "   3. Monitor sync runs in the 'sync_runs' table"