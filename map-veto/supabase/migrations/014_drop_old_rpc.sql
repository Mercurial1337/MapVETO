-- Drop the old 5-parameter function to resolve PostgREST overload ambiguity
DROP FUNCTION IF EXISTS process_veto_action(UUID, UUID, TEXT, UUID, TEXT);
