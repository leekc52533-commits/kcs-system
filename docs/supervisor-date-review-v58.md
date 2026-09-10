# Supervisor date and route review (schema 58)

The previous request card exposed only the requested date and a generic route selector. Review is now expandable in place, with an editable date, date-specific assigned route availability, a reason, and a once/permanent scope (default once). Retaining the source date permits an unvisited stop to move to another unstarted vehicle. Rejection does not depend on target preparation. The planner entry opens the requested date and offers to create that date if missing.

Once-only approval cancels and retains the original stop, creates an assigned replacement and occurrence, and records a schedule exception. The original requested date is retained separately from the supervisor-approved date. A schema 58 review record preserves the selected route through draft regeneration. Customer Schedule displays the change history.

Permanent approval additionally changes the fixed weekday corresponding to the source date, keeps other weekdays and frequency, and sets the fixed route for future collections. Interval/monthly schedules anchor on the approved date (monthly uses its ordinal weekday). Effective date is the source date. A weekday collision or ambiguous/missing active schedule blocks the change until reviewed in Customer Schedule. New Sunday collection needs explicit confirmation.

The branch's generated future plans are reconciled in the same transaction. Unstarted approved plans become reapproval-required. Executed records, running/released days and explicit protected records remain intact; their dates are reported in the result and Customer Schedule history. Unassigned future routes remain in the planner for vehicle assignment. Only the actual approved target must have an eligible assigned unstarted vehicle.

Duplicate branch/date guards, request status, source execution/document protections, target revision and schedule version are rechecked at commit. Review, schedule, occurrences, route rows and audit writes roll back together on failure. Permanent synchronization does not regenerate other customers. Financial records are untouched.

Validation: 39 focused service/UI tests covering three languages, inline decisions, date-specific options, once/permanent synchronization, same-day transfer, duplicates, permissions, execution protection, rollback, regeneration and additive migration. Production build succeeds. Phone interaction remains to be checked after deployment.

Deployment: `scripts/apply-date-review-production.sh`, requires schema 57 and EXPECTED_COMMIT, builds staged frontend, backs up database/UI, restarts API for schema 58 migration, verifies integrity/foreign keys and internal/public health, then switches the frontend entry file.

## Existing scheduled target correction

The production video showed DUPLICATE_BRANCH_SERVICE_DATE: the requested target date already had a generated occurrence for the same customer. Approval now reuses that unstarted same-schedule occurrence, retains its ID and occurrence link, and applies the selected route/vehicle. The source is cancelled only within the successful transaction. Executed/documented/overridden targets, different/manual schedules and pending requests remain protected. Added regression cases cover reuse across routes, duplicate-submit idempotency, executed targets and rollback. Schema remains 58; deploy using apply-date-review-reuse-production.sh.
