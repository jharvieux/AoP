-- #338: Add indexes on foreign-key columns for query performance.
-- These three columns are used in WHERE clauses (lookup by creator/grantor/reporter)
-- but had no indexes, causing full table scans.

CREATE INDEX idx_matches_created_by ON matches(created_by);
CREATE INDEX idx_match_spectators_granted_by ON match_spectators(granted_by);
CREATE INDEX idx_community_map_reports_reporter_id ON community_map_reports(reporter_id);
