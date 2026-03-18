CREATE OR REPLACE FUNCTION merge_children(
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
BEGIN
  SELECT * INTO v_survivor FROM children WHERE id = p_survivor_id FOR UPDATE;
  SELECT * INTO v_loser FROM children WHERE id = p_loser_id FOR UPDATE;

  IF v_survivor IS NULL THEN
    RAISE EXCEPTION 'Survivor child % not found', p_survivor_id;
  END IF;
  IF v_loser IS NULL THEN
    RAISE EXCEPTION 'Loser child % not found', p_loser_id;
  END IF;

  -- Re-point FKs
  UPDATE submissions SET child_id = p_survivor_id WHERE child_id = p_loser_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_repointed := v_repointed || jsonb_build_object(
      'table', 'submissions', 'column', 'child_id',
      'old_value', p_loser_id::text, 'new_value', p_survivor_id::text, 'count', v_count
    );
  END IF;

  UPDATE child_service_records SET child_id = p_survivor_id WHERE child_id = p_loser_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_repointed := v_repointed || jsonb_build_object(
      'table', 'child_service_records', 'column', 'child_id',
      'old_value', p_loser_id::text, 'new_value', p_survivor_id::text, 'count', v_count
    );
  END IF;

  -- Merge field gaps
  IF p_field_overrides != '{}'::jsonb THEN
    UPDATE children SET
      first_name = COALESCE(p_field_overrides->>'first_name', first_name),
      last_name = COALESCE(p_field_overrides->>'last_name', last_name),
      nickname = COALESCE(p_field_overrides->>'nickname', nickname),
      date_of_birth = COALESCE((p_field_overrides->>'date_of_birth')::date, date_of_birth),
      age = COALESCE(p_field_overrides->>'age', age),
      gender = COALESCE(p_field_overrides->>'gender', gender),
      ethnicity = COALESCE(p_field_overrides->>'ethnicity', ethnicity),
      placement_type = COALESCE(p_field_overrides->>'placement_type', placement_type),
      custody_county = COALESCE(p_field_overrides->>'custody_county', custody_county),
      grade_fall = COALESCE(p_field_overrides->>'grade_fall', grade_fall)
    WHERE id = p_survivor_id;

    v_fields_copied := p_field_overrides;
  END IF;

  -- Hard delete
  DELETE FROM children WHERE id = p_loser_id;

  -- Audit log
  INSERT INTO merge_audit_log (
    entity_type, survivor_id, deleted_id,
    deleted_record, fields_copied, fks_repointed, merged_by
  ) VALUES (
    'child', p_survivor_id, p_loser_id,
    to_jsonb(v_loser), v_fields_copied, v_repointed, p_merged_by
  );

  RETURN jsonb_build_object(
    'success', true,
    'survivor_id', p_survivor_id,
    'deleted_id', p_loser_id,
    'fks_repointed', v_repointed
  );
END;
$$;
