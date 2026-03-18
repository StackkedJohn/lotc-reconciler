-- merge_audit_log: stores full snapshot of deleted records
CREATE TABLE IF NOT EXISTS merge_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('neon_account', 'child')),
  survivor_id UUID NOT NULL,
  survivor_neon_id TEXT,
  deleted_id UUID NOT NULL,
  deleted_neon_id TEXT,
  deleted_record JSONB NOT NULL,
  fields_copied JSONB DEFAULT '{}',
  fks_repointed JSONB DEFAULT '[]',
  merged_by TEXT NOT NULL,
  merged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- dismissed_duplicates: pairs marked "not a duplicate"
CREATE TABLE IF NOT EXISTS dismissed_duplicates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('neon_account', 'child')),
  record_a_id UUID NOT NULL,
  record_b_id UUID NOT NULL,
  dismissed_by TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, record_a_id, record_b_id)
);

-- RLS: service role only (these tables are only accessed via RPC)
ALTER TABLE merge_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE dismissed_duplicates ENABLE ROW LEVEL SECURITY;

-- Allow anon to read dismissed_duplicates (needed for client-side filtering)
CREATE POLICY "anon_read_dismissed" ON dismissed_duplicates
  FOR SELECT USING (true);

-- Allow service role full access (via RPC)
CREATE POLICY "service_all_merge_audit" ON merge_audit_log
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_all_dismissed" ON dismissed_duplicates
  FOR ALL USING (auth.role() = 'service_role');
