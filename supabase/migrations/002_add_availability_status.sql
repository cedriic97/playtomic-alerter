-- Add availability status enum and update available_slots table

-- Create enum type for availability status
CREATE TYPE availability_status AS ENUM (
    'AVAILABLE',
    'NOT_AVAILABLE', 
    'AVAILABLE_DUE_TO_CANCELLATION'
);

-- Add the new status column to available_slots table
ALTER TABLE available_slots 
ADD COLUMN availability_status availability_status DEFAULT 'AVAILABLE';

-- Update existing records to have the new status
UPDATE available_slots 
SET availability_status = CASE 
    WHEN is_available = true THEN 'AVAILABLE'::availability_status
    ELSE 'NOT_AVAILABLE'::availability_status
END;

-- Add index for better query performance on the new status field
CREATE INDEX idx_available_slots_status ON available_slots(availability_status);

-- Add index for better performance on date queries (for cancellation detection)
CREATE INDEX idx_available_slots_date_detected ON available_slots(date, detected_at);

-- Add helpful comment
COMMENT ON COLUMN available_slots.availability_status IS 'Track slot status: AVAILABLE (new/normal), NOT_AVAILABLE (booked), AVAILABLE_DUE_TO_CANCELLATION (freed up slot)';