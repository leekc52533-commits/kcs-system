# Dispatch change-log indexes — 23-Oct-26

Production recovery established three indexes after API requests stopped responding while the main thread repeatedly read dispatch_change_logs. The sampled query previously used SCAN and now uses SEARCH with a covering index. Dispatch data and health checks recovered after the manual index addition and service restart. This evidence does not identify every blocked SQL statement or rule out other performance bottlenecks.

server/database.mjs runs schemaSql before serving requests on every startup. The base schema now creates the same three indexes with IF NOT EXISTS, covering new and existing databases without a schema-version bump. Existing recovery indexes are reused; no audit or business rows are rewritten or deleted.

- idx_dispatch_logs_day_type_entity: dispatch_day_id, change_type, entity_id
- idx_dispatch_logs_type_id: change_type, id
- idx_dispatch_logs_entity_type: entity_type, entity_id, change_type

Validation: node --test test/dispatchLogIndexes.test.mjs checks fresh creation, upgrade with preserved history, repeated initialization, stable existing index root pages, and indexed query plans for all three access patterns.

Deployment: git pull --ff-only then restart kcs-api. This is server schema only; no frontend build or dependency installation is required. Production already has these indexes, so startup reuses them. For an unindexed large database, allow a maintenance window and take a SQLite backup before deployment because initial index creation takes time and a write lock. After deployment verify /api/health and use the dispatch planner before repeating the health check.
