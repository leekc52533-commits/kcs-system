# KCS Frequency Recurrence Implementation Design

## Scope and schema

Schema v26 is an additive upgrade from v25. It does not populate recurrence parameters, alter the 264 existing weekday assignments, or change historical Dispatch/Stop rows.

`branch_schedules` adds `recurrence_type`, `interval_weeks`, `anchor_date`, `effective_date`, `monthly_occurrence`, `fixed_weekday`, and `next_collection_date`. `schedule_occurrences` records one occurrence for each `schedule_id + planned_date`; its unique constraint is the final duplicate-generation guard.

Supported recurrence types are `weekly`, `interval_weeks`, `monthly`, `on_call`, and `paused`. Frontend labels are normalized to controlled backend values. Free text is rejected by the shared collection-frequency validator.

## Calculation rules

- Every 2 Weeks: fixed weekday plus mandatory Anchor Date, exactly 14-day multiples.
- Every 3 Weeks: fixed weekday plus mandatory Anchor Date, exactly 21-day multiples.
- Monthly: fixed weekday plus First, Second, Third, Fourth, or Last occurrence. A fifth occurrence is deliberately not a valid rule, so a short month cannot silently skip or duplicate a route. “Last” always resolves to the last matching weekday.
- Effective Date can defer generation but never shifts the Anchor cycle.
- On Call and Paused never generate fixed occurrences.
- Existing weekly/multi-weekday and Daily schedules continue to match their controlled weekdays.
- All date-only arithmetic is UTC-based calendar arithmetic for Asia/Kuching business dates; it does not use browser/server UTC timestamps as local dates.

`schedule_exceptions` handles move/cancel/pause-once/add-extra operations. A moved or missed collection cancels only that occurrence; the source Anchor remains unchanged. Generated occurrences and their Dispatch Stop are updated in the same database transaction.

## API and safety

`GET /api/schedules/:id/recurrence` returns normalized recurrence settings. `PATCH /api/schedules/:id/recurrence` requires schedule-management authority, a reason, controlled frequency values, a valid fixed weekday, and required Anchor/monthly fields. Existing weekdays cannot be changed through this endpoint. A new Sunday assignment is limited to the approved exact Customer rules.

The Collection Schedules page now exposes controlled 2 Weeks, 3 Weeks, Monthly, existing weekly values, On Call, and Paused filters and reads Anchor/Next Collection fields. Formal parameter writes remain unapproved; the endpoint exists for the later controlled execution phase.

## Migration and recovery

The migration runs in `BEGIN IMMEDIATE`, checks integrity before starting, and asserts that Branch, Schedule, existing-weekday, Dispatch, and Dispatch Stop counts remain unchanged. A repeated v26 run is a no-op. Production rollback is: stop the service, restore the verified pre-v26 SQLite backup, restore the pre-v26 code commit, then verify schema v25, integrity, counts, and Health. No destructive down-migration is attempted.

## Formal execution prerequisites

Before any parameter import, resolve the six non-unique anchor candidates and the two duplicate-active-Schedule decisions, approve the 13 automatic proposals, and supply missing weight/location evidence for 19 technically blocked rows. No v26 migration or formal data write has been performed in this stage.
