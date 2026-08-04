# KCS v26 Duplicate Schedule Execution Plan

## Approved plan (not executed formally)

1. Stop writers and route generation remain stopped.
2. Verify schema v25, integrity `ok`, and take a complete SQLite backup with SHA-256.
3. Run v26 migration. Abort if protected counts change.
4. Run duplicate scan. Formal route generation must remain blocked until every effective Branch/date conflict has an approved resolution.
5. For DCH, retain Schedule 10069 and mark 10330 inactive/superseded. Retain Stops 87/380/674; mark 14/312/601 cancelled/superseded.
6. For SK, retain Schedule 10280 and mark 10317 inactive/superseded. Retain Stops 16/208/401/603; mark 15/205/397/602 cancelled/superseded.
7. Preserve Stop sequences; cancelled rows are excluded from effective route views. Do not rewrite retained source_schedule_id values.
8. Write Stop audit and Schedule master-history rows in the same transaction.
9. Recheck conflicts and integrity. Run the same apply again; all writes must be zero.

## FARLEY approved resolution

Retain Wednesday Schedule 10391 and Stop 193. Mark Schedule 10148 inactive/superseded and mark Stops 42, 144, 240, 343, 426, 514, 572 and 629 cancelled/superseded. This action is permitted only while every Stop remains locked/draft and has no documents, step records, material rows, GPS/location evidence, weight, invoice or completion activity. Any changed condition blocks the whole transaction.

## Rollback

If any assertion, audit insert, conflict count, or integrity check fails, the single transaction rolls back. For a formal deployment failure, stop the service, restore the pre-v26 SQLite backup and rollback commit, restart, then verify schema v25, integrity, counts, and Health. No Stop or Schedule is physically deleted.

## Reconciliation queries

```sql
SELECT branch_id, service_date, COUNT(*)
FROM dispatch_stops
WHERE status <> 'cancelled'
GROUP BY branch_id, service_date
HAVING COUNT(*) > 1;

SELECT jodoo_schedule_id, is_active, superseded_by_schedule_id,
       superseded_reason, superseded_at, superseded_by
FROM branch_schedules
WHERE jodoo_schedule_id IN ('10069','10330','10280','10317');

SELECT id, status, source_schedule_id, service_date,
       superseded_by_stop_id, superseded_reason
FROM dispatch_stops
WHERE id IN (87,14,380,312,674,601,16,15,208,205,401,397,603,602)
ORDER BY service_date,id;
```
