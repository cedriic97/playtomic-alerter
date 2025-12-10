-- Add cancellations detected tracking to sync_runs table

ALTER TABLE sync_runs 
ADD COLUMN cancellations_detected INTEGER DEFAULT 0;

-- Add helpful comment
COMMENT ON COLUMN sync_runs.cancellations_detected IS 'Number of slots detected as available due to cancellation in this sync run';