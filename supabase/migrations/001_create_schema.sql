-- Create the shadow database schema for Playtomic court availability

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Ensure the extension is available in the current session
SET search_path = public, extensions;

-- Clubs table
CREATE TABLE clubs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    city TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Courts table  
CREATE TABLE courts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    court_id TEXT UNIQUE NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES clubs(tenant_id) ON DELETE CASCADE,
    court_name TEXT NOT NULL,
    court_type TEXT NOT NULL CHECK (court_type IN ('indoor', 'outdoor', 'unknown')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Available slots table
CREATE TABLE available_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    court_id TEXT NOT NULL REFERENCES courts(court_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration INTEGER NOT NULL, -- duration in minutes
    price DECIMAL(10,2) NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    sync_run_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate slots
    UNIQUE (tenant_id, court_id, date, start_time, duration)
);

-- Sync runs table for tracking synchronization batches
CREATE TABLE sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    clubs_synced INTEGER DEFAULT 0,
    slots_found INTEGER DEFAULT 0,
    slots_updated INTEGER DEFAULT 0,
    errors TEXT[]
);

-- Create indexes for performance
CREATE INDEX idx_available_slots_tenant_date ON available_slots(tenant_id, date);
CREATE INDEX idx_available_slots_court_date ON available_slots(court_id, date);
CREATE INDEX idx_available_slots_is_available ON available_slots(is_available);
CREATE INDEX idx_available_slots_last_seen ON available_slots(last_seen_at);
CREATE INDEX idx_sync_runs_started_at ON sync_runs(started_at);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_clubs_updated_at BEFORE UPDATE ON clubs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courts_updated_at BEFORE UPDATE ON courts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_available_slots_updated_at BEFORE UPDATE ON available_slots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add helpful comments
COMMENT ON TABLE clubs IS 'Tennis/padel clubs from known_tenants.json';
COMMENT ON TABLE courts IS 'Individual courts within each club';
COMMENT ON TABLE available_slots IS 'Available time slots for court bookings';
COMMENT ON TABLE sync_runs IS 'Tracking table for synchronization batches';
COMMENT ON COLUMN available_slots.is_available IS 'Current availability status - false when slot is no longer available';
COMMENT ON COLUMN available_slots.last_seen_at IS 'Last time this slot was confirmed available from API';
COMMENT ON COLUMN available_slots.detected_at IS 'When this slot was first discovered';