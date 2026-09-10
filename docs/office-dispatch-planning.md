# Office and management dispatch planning

KC confirmed that office staff and management should share dispatch editing and date-request decisions. Driver and crew accounts retain requests (and the previously agreed temporary order trial); they cannot directly approve or change dates/routes. This does not change employee-account, payroll or other unrelated administrative permissions.

- Shared role policy is used by dispatch API gates, direct review services and planner controls. Office accounts enter Overview and may approve date/return-later requests, edit collection schedules, assign existing vehicles/drivers and use the planner.
- Date review always offers current active routes. Missing dates are generated inside the approval transaction, including scheduled customers. Missing/unavailable/started assigned vehicles do not prevent planning: the adjusted stop stays on the chosen route in the unassigned pool. Completed target dates and executed/documented records remain protected.
- Both once/permanent changes preserve their existing Customer Schedule sync and audit behavior. Duplicate eligible target occurrences are reused. Failure rolls back automatic date creation as well as request, source, occurrence and schedule writes.
- Customer cards expose the shared date/route review form directly without requiring an employee request. New direct changes are recorded and decided atomically; an existing pending request is decided in place. The planner date picker loads dates beyond the rolling seven days.
- Driver/crew views include their assigned unapproved plans (today/tomorrow), labelled awaiting departure approval. Start/arrival/completion controls remain unavailable until approved, and server execution checks remain enforced. Unassigned customers are not exposed to arbitrary employees.

Schema remains 58. Deployment script: apply-dispatch-office-planning-production.sh (database/frontend backup, staged build, API restart, integrity and health checks).

Focused validation covers office access, denied driver/crew direct changes, missing-date creation and rollback, unassigned routes, inline direct editing, recurrence sync, duplicate reuse, and unapproved visibility with execution blocked. Legacy weeklyDispatchNavigationUi has three pre-existing source-regex failures reproduced against the parent commit; unrelated navigation assertions were not changed.
