-- Enable RLS for all tables  
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE available_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

-- Allow anon role to read and write all data for Edge Function operations
CREATE POLICY "Allow anon access to clubs" ON clubs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access to courts" ON courts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access to available_slots" ON available_slots FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access to sync_runs" ON sync_runs FOR ALL TO anon USING (true) WITH CHECK (true);

-- Also allow authenticated users to read data
CREATE POLICY "Allow authenticated read clubs" ON clubs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read courts" ON courts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read available_slots" ON available_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read sync_runs" ON sync_runs FOR SELECT TO authenticated USING (true);