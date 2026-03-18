CREATE OR REPLACE FUNCTION merge_contacts(
  p_survivor_id UUID,
  p_loser_id UUID,
  p_field_overrides JSONB DEFAULT '{}',
  p_merged_by TEXT DEFAULT 'unknown'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_survivor RECORD;
  v_loser RECORD;
  v_repointed JSONB := '[]'::jsonb;
  v_fields_copied JSONB := '{}'::jsonb;
  v_count INT;
  v_table_exists BOOLEAN;
BEGIN
  SELECT * INTO v_survivor FROM neon_accounts WHERE id = p_survivor_id FOR UPDATE;
  SELECT * INTO v_loser FROM neon_accounts WHERE id = p_loser_id FOR UPDATE;

  IF v_survivor IS NULL THEN
    RAISE EXCEPTION 'Survivor record % not found', p_survivor_id;
  END IF;
  IF v_loser IS NULL THEN
    RAISE EXCEPTION 'Loser record % not found', p_loser_id;
  END IF;

  -- Step 2: Re-point UUID-based FKs
  UPDATE children SET caregiver_id = p_survivor_id WHERE caregiver_id = p_loser_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_repointed := v_repointed || jsonb_build_object(
      'table', 'children', 'column', 'caregiver_id',
      'old_value', p_loser_id::text, 'new_value', p_survivor_id::text, 'count', v_count);
  END IF;

  UPDATE children SET social_worker_id = p_survivor_id WHERE social_worker_id = p_loser_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_repointed := v_repointed || jsonb_build_object(
      'table', 'children', 'column', 'social_worker_id',
      'old_value', p_loser_id::text, 'new_value', p_survivor_id::text, 'count', v_count);
  END IF;

  UPDATE donor_email_links SET donor_id = p_survivor_id::text WHERE donor_id = p_loser_id::text;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_repointed := v_repointed || jsonb_build_object(
      'table', 'donor_email_links', 'column', 'donor_id',
      'old_value', p_loser_id::text, 'new_value', p_survivor_id::text, 'count', v_count);
  END IF;

  -- Step 3: Re-point neon_id-based FKs
  UPDATE submissions SET neon_caregiver_id = v_survivor.neon_id WHERE neon_caregiver_id = v_loser.neon_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_repointed := v_repointed || jsonb_build_object(
      'table', 'submissions', 'column', 'neon_caregiver_id',
      'old_value', v_loser.neon_id, 'new_value', v_survivor.neon_id, 'count', v_count);
  END IF;

  UPDATE submissions SET neon_social_worker_id = v_survivor.neon_id WHERE neon_social_worker_id = v_loser.neon_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_repointed := v_repointed || jsonb_build_object(
      'table', 'submissions', 'column', 'neon_social_worker_id',
      'old_value', v_loser.neon_id, 'new_value', v_survivor.neon_id, 'count', v_count);
  END IF;

  UPDATE submissions SET neon_service_id = v_survivor.neon_id WHERE neon_service_id = v_loser.neon_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_repointed := v_repointed || jsonb_build_object(
      'table', 'submissions', 'column', 'neon_service_id',
      'old_value', v_loser.neon_id, 'new_value', v_survivor.neon_id, 'count', v_count);
  END IF;

  UPDATE neon_donations SET account_neon_id = v_survivor.neon_id WHERE account_neon_id = v_loser.neon_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_repointed := v_repointed || jsonb_build_object(
      'table', 'neon_donations', 'column', 'account_neon_id',
      'old_value', v_loser.neon_id, 'new_value', v_survivor.neon_id, 'count', v_count);
  END IF;

  UPDATE neon_event_registrations SET account_neon_id = v_survivor.neon_id WHERE account_neon_id = v_loser.neon_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_repointed := v_repointed || jsonb_build_object(
      'table', 'neon_event_registrations', 'column', 'account_neon_id',
      'old_value', v_loser.neon_id, 'new_value', v_survivor.neon_id, 'count', v_count);
  END IF;

  UPDATE soft_credits SET credited_account_neon_id = v_survivor.neon_id WHERE credited_account_neon_id = v_loser.neon_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_repointed := v_repointed || jsonb_build_object(
      'table', 'soft_credits', 'column', 'credited_account_neon_id',
      'old_value', v_loser.neon_id, 'new_value', v_survivor.neon_id, 'count', v_count);
  END IF;

  UPDATE donor_notes SET account_neon_id = v_survivor.neon_id WHERE account_neon_id = v_loser.neon_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_repointed := v_repointed || jsonb_build_object(
      'table', 'donor_notes', 'column', 'account_neon_id',
      'old_value', v_loser.neon_id, 'new_value', v_survivor.neon_id, 'count', v_count);
  END IF;

  -- Conditionally re-point tables that may not exist yet
  SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'household_members') INTO v_table_exists;
  IF v_table_exists THEN
    UPDATE household_members SET member_neon_id = v_survivor.neon_id WHERE member_neon_id = v_loser.neon_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_repointed := v_repointed || jsonb_build_object('table', 'household_members', 'column', 'member_neon_id', 'old_value', v_loser.neon_id, 'new_value', v_survivor.neon_id, 'count', v_count);
    END IF;
  END IF;

  SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'account_affiliations') INTO v_table_exists;
  IF v_table_exists THEN
    UPDATE account_affiliations SET individual_account_id = v_survivor.neon_id WHERE individual_account_id = v_loser.neon_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_repointed := v_repointed || jsonb_build_object('table', 'account_affiliations', 'column', 'individual_account_id', 'old_value', v_loser.neon_id, 'new_value', v_survivor.neon_id, 'count', v_count);
    END IF;
    UPDATE account_affiliations SET company_account_id = v_survivor.neon_id WHERE company_account_id = v_loser.neon_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_repointed := v_repointed || jsonb_build_object('table', 'account_affiliations', 'column', 'company_account_id', 'old_value', v_loser.neon_id, 'new_value', v_survivor.neon_id, 'count', v_count);
    END IF;
  END IF;

  SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'donation_boxes') INTO v_table_exists;
  IF v_table_exists THEN
    UPDATE donation_boxes SET host_neon_id = v_survivor.neon_id WHERE host_neon_id = v_loser.neon_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_repointed := v_repointed || jsonb_build_object('table', 'donation_boxes', 'column', 'host_neon_id', 'old_value', v_loser.neon_id, 'new_value', v_survivor.neon_id, 'count', v_count);
    END IF;
  END IF;

  SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'donor_touchpoints') INTO v_table_exists;
  IF v_table_exists THEN
    UPDATE donor_touchpoints SET account_neon_id = v_survivor.neon_id WHERE account_neon_id = v_loser.neon_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_repointed := v_repointed || jsonb_build_object('table', 'donor_touchpoints', 'column', 'account_neon_id', 'old_value', v_loser.neon_id, 'new_value', v_survivor.neon_id, 'count', v_count);
    END IF;
  END IF;

  -- Step 4: Deduplicate (only if tables exist)
  SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'household_members') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM household_members a USING household_members b
      WHERE a.id > b.id AND a.household_id = b.household_id AND a.member_neon_id = b.member_neon_id;
  END IF;

  SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'account_affiliations') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM account_affiliations a USING account_affiliations b
      WHERE a.id > b.id AND a.individual_account_id = b.individual_account_id AND a.company_account_id = b.company_account_id;
  END IF;

  DELETE FROM soft_credits a USING soft_credits b
    WHERE a.id > b.id AND a.donation_neon_id = b.donation_neon_id AND a.credited_account_neon_id = b.credited_account_neon_id;

  -- Step 5: Merge field gaps
  IF p_field_overrides != '{}'::jsonb THEN
    UPDATE neon_accounts SET
      first_name = COALESCE(p_field_overrides->>'first_name', first_name),
      last_name = COALESCE(p_field_overrides->>'last_name', last_name),
      email = COALESCE(p_field_overrides->>'email', email),
      phone = COALESCE(p_field_overrides->>'phone', phone),
      company_name = COALESCE(p_field_overrides->>'company_name', company_name),
      address_line1 = COALESCE(p_field_overrides->>'address_line1', address_line1),
      city = COALESCE(p_field_overrides->>'city', city),
      state = COALESCE(p_field_overrides->>'state', state),
      zip_code = COALESCE(p_field_overrides->>'zip_code', zip_code),
      source = COALESCE(p_field_overrides->>'source', source)
    WHERE id = p_survivor_id;
    v_fields_copied := p_field_overrides;
  END IF;

  -- Step 6: Hard delete
  DELETE FROM neon_accounts WHERE id = p_loser_id;

  -- Step 7: Audit log
  INSERT INTO merge_audit_log (entity_type, survivor_id, survivor_neon_id, deleted_id, deleted_neon_id, deleted_record, fields_copied, fks_repointed, merged_by)
  VALUES ('neon_account', p_survivor_id, v_survivor.neon_id, p_loser_id, v_loser.neon_id, to_jsonb(v_loser), v_fields_copied, v_repointed, p_merged_by);

  RETURN jsonb_build_object('success', true, 'survivor_id', p_survivor_id, 'deleted_id', p_loser_id, 'fks_repointed', v_repointed);
END;
$$;
