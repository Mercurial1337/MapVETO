-- Remove public select access from match_links to prevent token stealing
DROP POLICY IF EXISTS "Match links readable for validation" ON match_links;
