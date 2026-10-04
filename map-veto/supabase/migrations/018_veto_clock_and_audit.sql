-- Snapshots support transactional undo without deleting the audit history.
CREATE TABLE IF NOT EXISTS veto_snapshots (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
 state jsonb NOT NULL, match jsonb NOT NULL, undone boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS veto_snapshots_match_idx ON veto_snapshots(match_id,id DESC);
ALTER TABLE veto_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON veto_snapshots FROM anon,authenticated;
DROP FUNCTION IF EXISTS process_veto_action(uuid,uuid,text,uuid,text);
DROP FUNCTION IF EXISTS process_veto_action(uuid,uuid,text,uuid,text,boolean);
CREATE OR REPLACE FUNCTION process_veto_action(
    p_match_id UUID,
    p_token UUID,
    p_action TEXT,
    p_map_id UUID DEFAULT NULL,
    p_side_choice TEXT DEFAULT NULL,
    p_is_auto BOOLEAN DEFAULT FALSE,
    p_expected timestamptz DEFAULT NULL,
    p_admin_token uuid DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_link_type TEXT;
    v_match RECORD;
    v_state RECORD;
    v_template JSONB;
    v_current_step_def JSONB;
    v_next_step_def JSONB;
    v_current_step INT;
    v_new_available_maps JSONB;
    v_new_banned_maps JSONB;
    v_new_picked_maps JSONB;
    v_new_results JSONB;
    v_next_step INT;
    v_is_complete BOOLEAN;
    v_next_turn TEXT;
    v_map_number INT;
    v_map_index INT;
    v_decider_id UUID;
    v_decider_map JSONB;
    v_new_state JSONB;
    v_snapshot_id bigint;
    v_log_map uuid;
    v_admin boolean := false;
BEGIN
    -- 1. Validate token and get team identity
    SELECT link_type INTO v_link_type
    FROM match_links
    WHERE match_id = p_match_id AND token = p_token AND (expires_at IS NULL OR expires_at > now() OR p_is_auto OR p_admin_token IS NOT NULL);

    IF v_link_type IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired token';
    END IF;

    IF v_link_type NOT IN ('team_a','team_b') THEN
        RAISE EXCEPTION 'Observers cannot perform actions';
    END IF;

    -- 2. Lock the match_state row for update to prevent races
    SELECT * INTO v_state
    FROM match_state
    WHERE match_id = p_match_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Match state not found';
    END IF;

    IF p_admin_token IS NOT NULL THEN
        SELECT EXISTS(SELECT 1 FROM match_links WHERE match_id=p_match_id AND token=p_admin_token AND link_type='admin' AND (expires_at IS NULL OR expires_at>now())) INTO v_admin;
        IF NOT v_admin THEN RAISE EXCEPTION 'Admin link required'; END IF;
    END IF;
    IF NOT v_admin THEN
        IF v_state.is_paused THEN RAISE EXCEPTION 'Veto is paused'; END IF;
        IF p_is_auto THEN
            IF p_expected IS DISTINCT FROM v_state.turn_started_at OR now() < v_state.turn_started_at+interval '60 seconds' THEN RAISE EXCEPTION 'Timer has not expired or turn changed'; END IF;
        ELSIF now() >= v_state.turn_started_at+interval '60 seconds' THEN
            RAISE EXCEPTION 'Selection deadline has passed';
        END IF;
    END IF;
    -- 3. Get match and template info
    SELECT m.status, COALESCE(m.custom_veto_sequence, vt.sequence) as sequence INTO v_match
    FROM matches m
    JOIN veto_templates vt ON m.veto_template_id = vt.id
    WHERE m.id = p_match_id;

    IF v_match.status != 'in_progress' THEN
        RAISE EXCEPTION 'Match not in progress';
    END IF;

    v_template := v_match.sequence;
    v_current_step := v_state.current_step;
    v_current_step_def := v_template->'steps'->(v_current_step::int);

    IF v_current_step_def IS NULL THEN
        RAISE EXCEPTION 'Veto sequence completed';
    END IF;

    -- 4. Validate turn
    IF v_state.current_turn IS DISTINCT FROM v_link_type THEN
        RAISE EXCEPTION 'Not your turn. Current turn: %', v_state.current_turn;
    END IF;

    -- 5. Validate action type
    IF (v_current_step_def->>'action') != p_action THEN
        RAISE EXCEPTION 'Expected action: %', v_current_step_def->>'action';
    END IF;

    INSERT INTO veto_snapshots(match_id,state,match) SELECT p_match_id,to_jsonb(v_state),to_jsonb(m) FROM matches m WHERE id=p_match_id RETURNING id INTO v_snapshot_id;
    v_log_map := p_map_id;
    -- 6. Initialize state arrays
    v_new_available_maps := v_state.available_maps;
    v_new_banned_maps := v_state.banned_maps;
    v_new_picked_maps := v_state.picked_maps;
    v_new_results := v_state.results;

    -- 7. Process action
    IF p_action IN ('ban', 'pick') THEN
        IF p_map_id IS NULL THEN
            RAISE EXCEPTION 'map_id required for ban/pick';
        END IF;

        -- Check if map is in available maps
        IF NOT (v_new_available_maps @> to_jsonb(p_map_id::text)) THEN
            RAISE EXCEPTION 'Map not available';
        END IF;

        -- Remove map from available maps
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_new_available_maps
        FROM jsonb_array_elements_text(v_new_available_maps) AS elem
        WHERE elem != p_map_id::text;

        IF p_action = 'ban' THEN
            v_new_banned_maps := v_new_banned_maps || jsonb_build_object('map_id', p_map_id, 'banned_by', v_link_type, 'is_auto', p_is_auto);
        ELSE -- pick
            v_map_number := (v_current_step_def->>'map_number')::INT;
            v_new_picked_maps := v_new_picked_maps || jsonb_build_object('map_id', p_map_id, 'picked_by', v_link_type, 'side', null, 'map_number', v_map_number, 'is_auto', p_is_auto);
        END IF;

    ELSIF p_action = 'side' THEN
        IF p_side_choice IS NULL OR p_side_choice NOT IN ('attack','defense') THEN
            RAISE EXCEPTION 'side_choice required for side';
        END IF;

        v_map_number := (v_current_step_def->>'map_number')::INT;
        
        -- Verify map was found
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_state.picked_maps) AS elem WHERE (elem->>'map_number')::INT = v_map_number) THEN
            RAISE EXCEPTION 'Map not found for side selection';
        END IF;

        SELECT (elem->>'map_id')::uuid INTO v_log_map FROM jsonb_array_elements(v_state.picked_maps) elem WHERE (elem->>'map_number')::int=v_map_number;
        -- Find and update the picked map side
        SELECT COALESCE(jsonb_agg(
            CASE 
                WHEN (elem->>'map_number')::INT = v_map_number THEN
                    elem || jsonb_build_object('side', p_side_choice, 'side_picked_by', v_link_type, 'side_is_auto', p_is_auto)
                ELSE elem
            END
        ), '[]'::jsonb) INTO v_new_picked_maps
        FROM jsonb_array_elements(v_new_picked_maps) AS elem;
    END IF;

    -- 8. Advance to next step
    v_next_step := v_current_step + 1;
    v_is_complete := v_next_step >= jsonb_array_length(v_template->'steps');
    v_next_step_def := v_template->'steps'->(v_next_step::int);

    -- Handle auto-decider
    WHILE NOT v_is_complete AND (v_next_step_def->>'action') = 'decider' LOOP
        IF jsonb_array_length(v_new_available_maps)=0 THEN RAISE EXCEPTION 'No decider map available'; END IF;
        v_decider_id := (v_new_available_maps->>0)::UUID;
        
        -- Remove decider from available maps
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_new_available_maps
        FROM jsonb_array_elements_text(v_new_available_maps) AS elem
        WHERE elem != v_decider_id::text;

        v_map_number := (v_next_step_def->>'map_number')::INT;
        v_decider_map := jsonb_build_object('map_id', v_decider_id, 'picked_by', 'system', 'side', null, 'map_number', v_map_number);
        v_new_picked_maps := v_new_picked_maps || v_decider_map;

        INSERT INTO match_logs(match_id,step_number,action_type,actor,map_id,metadata)
        VALUES(p_match_id,v_next_step,'decider','system',v_decider_id,jsonb_build_object('map_number',v_map_number,'snapshot_id',v_snapshot_id,'confirmed_at',now()));
        -- Advance again to next step (usually side selection)
        v_next_step := v_next_step + 1;
        v_is_complete := v_next_step >= jsonb_array_length(v_template->'steps');
        v_next_step_def := v_template->'steps'->(v_next_step::int);
    END LOOP;

    -- 9. Determine next turn using actor_mapping
    v_next_turn := NULL;
    IF NOT v_is_complete AND v_next_step_def ? 'actor' AND (v_next_step_def->>'actor') != 'system' THEN
        IF v_state.actor_mapping IS NOT NULL THEN
            -- Reverse lookup in actor_mapping
            SELECT key INTO v_next_turn
            FROM jsonb_each_text(v_state.actor_mapping)
            WHERE value = (v_next_step_def->>'actor');
            
            IF v_next_turn IS NULL THEN
                v_next_turn := v_next_step_def->>'actor';
            END IF;
        ELSE
            v_next_turn := v_next_step_def->>'actor';
        END IF;
    END IF;

    -- Build final results if complete
    IF v_is_complete THEN
        -- Sort picked maps by map_number into results
        SELECT COALESCE(jsonb_agg(elem ORDER BY (elem->>'map_number')::INT), '[]'::jsonb) INTO v_new_results
        FROM jsonb_array_elements(v_new_picked_maps) AS elem;
    END IF;

    -- 10. Update state
    UPDATE match_state
    SET 
        available_maps = v_new_available_maps,
        banned_maps = v_new_banned_maps,
        picked_maps = v_new_picked_maps,
        results = v_new_results,
        current_step = v_next_step,
        current_turn = v_next_turn,
        is_complete = v_is_complete,
        turn_started_at = NOW(),
        paused_remaining_seconds = CASE WHEN is_paused THEN 60 ELSE NULL END,
        updated_at = NOW()
    WHERE match_id = p_match_id
    RETURNING row_to_json(match_state) INTO v_new_state;

    -- 11. Update match status if complete
    IF v_is_complete THEN
        UPDATE matches
        SET status = 'completed', completed_at = NOW()
        WHERE id = p_match_id;
    END IF;

    -- 12. Insert log
    INSERT INTO match_logs (match_id, step_number, action_type, actor, map_id, side_choice, metadata)
    VALUES (p_match_id, v_current_step, p_action, v_link_type, v_log_map, p_side_choice, jsonb_build_object('is_auto', p_is_auto, 'timeout', p_is_auto AND NOT v_admin, 'admin_override', v_admin, 'map_number', (v_current_step_def->>'map_number')::int, 'confirmed_at', now(), 'snapshot_id', v_snapshot_id));

    RETURN v_new_state;
END;
$$ LANGUAGE plpgsql SET search_path = public;
REVOKE ALL ON FUNCTION process_veto_action(uuid,uuid,text,uuid,text,boolean,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION process_veto_action(uuid,uuid,text,uuid,text,boolean,timestamptz,uuid) TO service_role;


