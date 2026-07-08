-- #338: Add indexes on foreign-key columns for query performance.
-- These three columns are used in WHERE clauses (lookup by creator/grantor/reporter)
-- but had no indexes, causing full table scans.

create index if not exists matches_created_by_idx on matches(created_by);
create index if not exists match_spectators_granted_by_idx on match_spectators(granted_by);
create index if not exists community_map_reports_reporter_id_idx on community_map_reports(reporter_id);
